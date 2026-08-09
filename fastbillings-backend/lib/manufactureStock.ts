import { Prisma } from '@prisma/client';

import { applyWacIssue, applyWacReceipt } from './ledger/inventoryValuation';
import { applyLineTracking, type TrackingTx } from './inventoryTracking';
import { findProductInventory } from './warehouseStock';

type HistoryEntry = {
  type: string;
  quantity: number;
  adjustment?: number;
  notes?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

function readHistory(value: unknown): HistoryEntry[] {
  return Array.isArray(value) ? (value as HistoryEntry[]) : [];
}

export type ManufactureTx = TrackingTx & {
  product: {
    findUnique: (args: unknown) => Promise<{
      id: string;
      item_type: string;
      enable_inventory: boolean;
      trackingMode: string;
      name: string;
      code: string;
    } | null>;
  };
  inventory: {
    findFirst: (args: unknown) => Promise<{
      id: string;
      quantity: number;
      quantityOnHand: Prisma.Decimal;
      avgCost: Prisma.Decimal;
      warehouseId: string | null;
      inventory_history: unknown;
    } | null>;
    create: (args: { data: unknown }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: unknown }) => Promise<unknown>;
  };
  manufactureOrderLine: {
    createMany: (args: { data: unknown[] }) => Promise<unknown>;
  };
};

export type ComponentTrackingInput = {
  batchAllocations?: Array<{ lotNumber?: string; batchId?: string; qty: number; expiryDate?: string | null }>;
  serialNumbers?: string[];
};

/**
 * Consume BOM components and receipt finished goods into one warehouse (WAC).
 * Returns total build cost and per-line snapshot for ManufactureOrderLine.
 */
export async function completeManufactureBuild(
  tx: ManufactureTx,
  opts: {
    userId: string;
    tenantId?: string | null;
    orderId: string;
    orderNumber?: string | null;
    warehouseId: string;
    buildQty: number;
    finishedProductId: string;
    components: Array<{ productId: string; qtyPerBuild: number }>;
    /** Optional per-component lot/serial overrides (else FEFO / oldest serial). */
    componentTracking?: Record<string, ComponentTrackingInput>;
    /** Optional FG lot/serials (BATCH auto-lots; SERIAL requires serialNumbers). */
    finishedTracking?: ComponentTrackingInput & { lotNumber?: string };
  },
): Promise<{
  totalBuildCost: Prisma.Decimal;
  lines: Array<{ productId: string; role: string; quantity: number; unitCost: number }>;
}> {
  if (opts.buildQty <= 0) throw new Error('Build quantity must be positive');
  if (!opts.components.length) throw new Error('BOM has no component lines');

  // Products are tenant-keyed — never resolve by bare id.
  if (!opts.tenantId) {
    throw new Error('Workspace context required');
  }
  const fg = await tx.product.findFirst({
    where: { id: opts.finishedProductId, tenantId: opts.tenantId },
    select: {
      id: true,
      item_type: true,
      enable_inventory: true,
      trackingMode: true,
      name: true,
      code: true,
    },
  });
  if (!fg || fg.item_type === 'Service' || !fg.enable_inventory) {
    throw new Error('Finished product must be an inventory-tracked Product');
  }

  let totalCost = new Prisma.Decimal(0);
  const snapshot: Array<{ productId: string; role: string; quantity: number; unitCost: number }> =
    [];

  for (const c of opts.components) {
    if (c.productId === opts.finishedProductId) {
      throw new Error('Component cannot be the finished product');
    }
    const need = Number(c.qtyPerBuild) * opts.buildQty;
    if (need <= 0) continue;

    const product = await tx.product.findFirst({
      where: { id: c.productId, tenantId: opts.tenantId },
      select: {
        id: true,
        item_type: true,
        enable_inventory: true,
        trackingMode: true,
        name: true,
        code: true,
      },
    });
    if (!product || product.item_type === 'Service' || !product.enable_inventory) {
      throw new Error(`Component ${product?.name ?? c.productId} must be inventory-tracked`);
    }

    const inv = await findProductInventory(tx as never, {
      userId: opts.userId,
      productId: c.productId,
      warehouseId: opts.warehouseId,
    });
    if (!inv) {
      throw new Error(`No stock for component ${product.name} (${product.code}) in warehouse`);
    }
    const onHand = Number(inv.quantityOnHand ?? inv.quantity ?? 0);
    if (onHand + 1e-9 < need) {
      throw new Error(
        `Insufficient stock for ${product.name}: need ${need}, have ${onHand}`,
      );
    }

    const issue = applyWacIssue(
      {
        quantityOnHand: inv.quantityOnHand as Prisma.Decimal,
        avgCost: inv.avgCost as Prisma.Decimal,
      },
      need,
    );
    totalCost = totalCost.plus(issue.cogs);
    const unitCost = Number(inv.avgCost);
    const history = readHistory(inv.inventory_history);
    history.push({
      type: 'stock_out',
      quantity: Number(inv.quantity),
      adjustment: -need,
      notes: `Consumed by manufacture ${opts.orderId.slice(0, 8)}`,
      referenceId: opts.orderId,
      referenceType: 'ManufactureOrder',
      createdBy: opts.userId,
      createdAt: new Date().toISOString(),
    });

    await tx.inventory.update({
      where: { id: inv.id },
      data: {
        quantity: Math.max(0, Math.round(Number(inv.quantity) - need)),
        quantityOnHand: issue.state.quantityOnHand,
        inventory_history: history as unknown as Prisma.InputJsonValue,
        ...(inv.warehouseId == null ? { warehouseId: opts.warehouseId } : {}),
      },
    });

    const tracking = opts.componentTracking?.[c.productId];
    await applyLineTracking(tx, {
      userId: opts.userId,
      tenantId: opts.tenantId,
      productId: c.productId,
      warehouseId: opts.warehouseId,
      qty: need,
      direction: 'issue',
      item: tracking
        ? {
            batchAllocations: tracking.batchAllocations,
            serialNumbers: tracking.serialNumbers,
          }
        : null,
      unitCost,
      sourceType: 'ManufactureOrder',
      sourceId: opts.orderId,
    });

    snapshot.push({
      productId: c.productId,
      role: 'COMPONENT',
      quantity: need,
      unitCost,
    });
  }

  const fgUnitCost = Number(totalCost.dividedBy(opts.buildQty));
  const fgInv = await findProductInventory(tx as never, {
    userId: opts.userId,
    productId: opts.finishedProductId,
    warehouseId: opts.warehouseId,
  });

  const receiptHistory: HistoryEntry = {
    type: 'stock_in',
    quantity: fgInv ? Number(fgInv.quantity) : 0,
    adjustment: opts.buildQty,
    notes: `Built via manufacture ${opts.orderId.slice(0, 8)}`,
    referenceId: opts.orderId,
    referenceType: 'ManufactureOrder',
    createdBy: opts.userId,
    createdAt: new Date().toISOString(),
  };

  if (fgInv) {
    const wac = applyWacReceipt(
      {
        quantityOnHand: fgInv.quantityOnHand as Prisma.Decimal,
        avgCost: fgInv.avgCost as Prisma.Decimal,
      },
      opts.buildQty,
      fgUnitCost,
    );
    const history = readHistory(fgInv.inventory_history);
    history.push(receiptHistory);
    await tx.inventory.update({
      where: { id: fgInv.id },
      data: {
        quantity: Number(fgInv.quantity) + Math.round(opts.buildQty),
        quantityOnHand: wac.quantityOnHand,
        avgCost: wac.avgCost,
        inventory_history: history as unknown as Prisma.InputJsonValue,
        ...(fgInv.warehouseId == null ? { warehouseId: opts.warehouseId } : {}),
      },
    });
  } else {
    const wac = applyWacReceipt(
      { quantityOnHand: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
      opts.buildQty,
      fgUnitCost,
    );
    await tx.inventory.create({
      data: {
        productId: opts.finishedProductId,
        userId: opts.userId,
        tenantId: opts.tenantId ?? null,
        warehouseId: opts.warehouseId,
        quantity: Math.round(opts.buildQty),
        quantityOnHand: wac.quantityOnHand,
        avgCost: wac.avgCost,
        inventory_history: [receiptHistory] as unknown as Prisma.InputJsonValue,
      },
    });
  }

  const ft = opts.finishedTracking;
  const fgLot =
    ft?.lotNumber ||
    (ft?.batchAllocations?.[0]?.lotNumber) ||
    `MFG-${opts.orderNumber || opts.orderId.slice(0, 8)}`;
  const fgItem: Record<string, unknown> = {};
  if (fg.trackingMode === 'SERIAL') {
    fgItem.serialNumbers = ft?.serialNumbers ?? [];
  } else if (fg.trackingMode === 'BATCH') {
    fgItem.batchAllocations = ft?.batchAllocations?.length
      ? ft.batchAllocations
      : [{ lotNumber: fgLot, qty: opts.buildQty }];
  }

  await applyLineTracking(tx, {
    userId: opts.userId,
    tenantId: opts.tenantId,
    productId: opts.finishedProductId,
    warehouseId: opts.warehouseId,
    qty: opts.buildQty,
    direction: 'receive',
    item: fgItem,
    unitCost: fgUnitCost,
    sourceType: 'ManufactureOrder',
    sourceId: opts.orderId,
    defaultLotHint: fgLot,
  });

  snapshot.push({
    productId: opts.finishedProductId,
    role: 'FINISHED',
    quantity: opts.buildQty,
    unitCost: fgUnitCost,
  });

  await tx.manufactureOrderLine.createMany({
    data: snapshot.map((l) => ({
      orderId: opts.orderId,
      productId: l.productId,
      role: l.role,
      quantity: new Prisma.Decimal(l.quantity),
      unitCost: new Prisma.Decimal(l.unitCost),
    })),
  });

  return { totalBuildCost: totalCost, lines: snapshot };
}
