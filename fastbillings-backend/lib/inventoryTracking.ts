import { Prisma } from '@prisma/client';

export type TrackingMode = 'NONE' | 'BATCH' | 'SERIAL';

export interface BatchAllocationInput {
  lotNumber?: string;
  batchId?: string;
  qty: number;
  expiryDate?: string | null;
}

export type TrackingTx = {
  product: {
    findUnique: (args: unknown) => Promise<{ trackingMode: string; code: string; item_type: string } | null>;
  };
  inventoryBatch: {
    findFirst: (args: unknown) => Promise<BatchRow | null>;
    findMany: (args: unknown) => Promise<BatchRow[]>;
    create: (args: { data: unknown }) => Promise<BatchRow>;
    update: (args: { where: { id: string }; data: unknown }) => Promise<BatchRow>;
  };
  inventorySerial: {
    findFirst: (args: unknown) => Promise<SerialRow | null>;
    findMany: (args: unknown) => Promise<SerialRow[]>;
    create: (args: { data: unknown }) => Promise<SerialRow>;
    update: (args: { where: { id: string }; data: unknown }) => Promise<SerialRow>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

type BatchRow = {
  id: string;
  lotNumber: string;
  qtyOnHand: Prisma.Decimal | number | string;
  expiryDate: Date | null;
};

type SerialRow = {
  id: string;
  serialNumber: string;
  status: string;
  warehouseId: string | null;
};

export function normalizeTrackingMode(v: unknown): TrackingMode {
  if (v === 'BATCH' || v === 'SERIAL') return v;
  return 'NONE';
}

export function parseBatchAllocations(item: Record<string, unknown> | null | undefined): BatchAllocationInput[] {
  const raw = item?.batchAllocations;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      const row = a as Record<string, unknown>;
      return {
        lotNumber: typeof row.lotNumber === 'string' ? row.lotNumber.trim() : undefined,
        batchId: typeof row.batchId === 'string' ? row.batchId : undefined,
        qty: Number(row.qty ?? 0),
        expiryDate: typeof row.expiryDate === 'string' ? row.expiryDate : null,
      };
    })
    .filter((a) => a.qty > 0);
}

export function parseSerialNumbers(item: Record<string, unknown> | null | undefined): string[] {
  const raw = item?.serialNumbers;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
}

function d(n: number | string | Prisma.Decimal): Prisma.Decimal {
  return n instanceof Prisma.Decimal ? n : new Prisma.Decimal(n);
}

/**
 * Apply batch/serial identity tracking for one document line after qty stock move.
 * NONE → no-op. Throws on validation / insufficient lot or serial stock.
 */
export async function applyLineTracking(
  tx: TrackingTx,
  opts: {
    userId: string;
    tenantId?: string | null;
    productId: string;
    warehouseId: string;
    qty: number;
    direction: 'receive' | 'issue' | 'return';
    item?: Record<string, unknown> | null;
    unitCost?: number;
    sourceType: string;
    sourceId: string;
    defaultLotHint?: string;
  },
): Promise<void> {
  if (!opts.qty || opts.qty <= 0) return;

  // Products are tenant-keyed — never resolve by bare id.
  if (!opts.tenantId) return;
  const product = await tx.product.findFirst({
    where: { id: opts.productId, tenantId: opts.tenantId },
    select: { trackingMode: true, code: true, item_type: true },
  });
  if (!product || product.item_type === 'Service') return;

  const mode = normalizeTrackingMode(product.trackingMode);
  if (mode === 'NONE') return;

  if (mode === 'BATCH') {
    if (opts.direction === 'receive') {
      await receiveBatches(tx, opts, product.code);
    } else if (opts.direction === 'issue') {
      await issueBatches(tx, opts);
    } else {
      await returnBatches(tx, opts, product.code);
    }
    return;
  }

  // SERIAL
  if (opts.direction === 'receive') {
    await receiveSerials(tx, opts);
  } else if (opts.direction === 'issue') {
    await issueSerials(tx, opts);
  } else {
    await returnSerials(tx, opts);
  }
}

async function receiveBatches(
  tx: TrackingTx,
  opts: Parameters<typeof applyLineTracking>[1],
  productCode: string,
): Promise<void> {
  let allocations = parseBatchAllocations(opts.item);
  if (allocations.length === 0) {
    const hint = (opts.defaultLotHint || opts.sourceId).slice(0, 12);
    allocations = [
      {
        lotNumber: `LOT-${productCode || 'SKU'}-${hint}`.replace(/\s+/g, '').slice(0, 64),
        qty: opts.qty,
      },
    ];
  }
  const sum = allocations.reduce((s, a) => s + a.qty, 0);
  if (Math.abs(sum - opts.qty) > 0.0001) {
    throw new Error(`Batch allocations qty (${sum}) must equal line qty (${opts.qty})`);
  }

  for (const a of allocations) {
    const lotNumber = (a.lotNumber || '').trim();
    if (!lotNumber) throw new Error('Each batch allocation needs a lotNumber');
    const existing = await tx.inventoryBatch.findFirst({
      where: {
        userId: opts.userId,
        productId: opts.productId,
        warehouseId: opts.warehouseId,
        lotNumber,
      },
    });
    const expiryDate = a.expiryDate ? new Date(a.expiryDate) : null;
    if (existing) {
      await tx.inventoryBatch.update({
        where: { id: existing.id },
        data: {
          qtyOnHand: d(existing.qtyOnHand).plus(a.qty),
          ...(opts.unitCost != null ? { unitCost: new Prisma.Decimal(opts.unitCost) } : {}),
          ...(expiryDate && !existing.expiryDate ? { expiryDate } : {}),
        },
      });
    } else {
      await tx.inventoryBatch.create({
        data: {
          userId: opts.userId,
          tenantId: opts.tenantId ?? null,
          productId: opts.productId,
          warehouseId: opts.warehouseId,
          lotNumber,
          expiryDate,
          qtyOnHand: new Prisma.Decimal(a.qty),
          unitCost: opts.unitCost != null ? new Prisma.Decimal(opts.unitCost) : null,
          sourceType: opts.sourceType,
          sourceId: opts.sourceId,
        },
      });
    }
  }
}

async function issueBatches(
  tx: TrackingTx,
  opts: Parameters<typeof applyLineTracking>[1],
): Promise<void> {
  let allocations = parseBatchAllocations(opts.item);
  if (allocations.length === 0) {
    // FEFO: earliest expiry first, then oldest created
    const lots = await tx.inventoryBatch.findMany({
      where: {
        userId: opts.userId,
        productId: opts.productId,
        warehouseId: opts.warehouseId,
        qtyOnHand: { gt: 0 },
      },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
    });
    let remaining = opts.qty;
    allocations = [];
    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = Number(lot.qtyOnHand);
      const take = Math.min(available, remaining);
      if (take > 0) {
        allocations.push({ batchId: lot.id, lotNumber: lot.lotNumber, qty: take });
        remaining -= take;
      }
    }
    if (remaining > 0.0001) {
      throw new Error(
        `Insufficient batch stock for product (need ${opts.qty}, short ${remaining})`,
      );
    }
  }

  const sum = allocations.reduce((s, a) => s + a.qty, 0);
  if (Math.abs(sum - opts.qty) > 0.0001) {
    throw new Error(`Batch allocations qty (${sum}) must equal line qty (${opts.qty})`);
  }

  for (const a of allocations) {
    const batch = a.batchId
      ? await tx.inventoryBatch.findFirst({
          where: { id: a.batchId, userId: opts.userId, productId: opts.productId },
        })
      : await tx.inventoryBatch.findFirst({
          where: {
            userId: opts.userId,
            productId: opts.productId,
            warehouseId: opts.warehouseId,
            lotNumber: a.lotNumber,
          },
        });
    if (!batch) throw new Error(`Batch lot not found: ${a.lotNumber || a.batchId}`);
    const onHand = d(batch.qtyOnHand);
    if (onHand.lessThan(a.qty)) {
      throw new Error(`Insufficient qty in lot ${batch.lotNumber} (have ${onHand}, need ${a.qty})`);
    }
    await tx.inventoryBatch.update({
      where: { id: batch.id },
      data: { qtyOnHand: onHand.minus(a.qty) },
    });
  }
}

async function returnBatches(
  tx: TrackingTx,
  opts: Parameters<typeof applyLineTracking>[1],
  productCode: string,
): Promise<void> {
  // Prefer explicit allocations; else restock into a return lot
  const allocations = parseBatchAllocations(opts.item);
  if (allocations.length > 0) {
    await receiveBatches(tx, { ...opts, direction: 'receive' }, productCode);
    return;
  }
  await receiveBatches(
    tx,
    {
      ...opts,
      direction: 'receive',
      item: {
        batchAllocations: [
          {
            lotNumber: `RET-${productCode || 'SKU'}-${opts.sourceId.slice(0, 8)}`.slice(0, 64),
            qty: opts.qty,
          },
        ],
      },
    },
    productCode,
  );
}

async function receiveSerials(
  tx: TrackingTx,
  opts: Parameters<typeof applyLineTracking>[1],
): Promise<void> {
  const serials = parseSerialNumbers(opts.item);
  if (serials.length !== opts.qty) {
    throw new Error(
      `SERIAL product requires ${opts.qty} serial number(s); got ${serials.length}`,
    );
  }
  const unique = new Set(serials.map((s) => s.toUpperCase()));
  if (unique.size !== serials.length) {
    throw new Error('Duplicate serial numbers on the same line');
  }
  for (const serialNumber of serials) {
    const existing = await tx.inventorySerial.findFirst({
      where: { userId: opts.userId, productId: opts.productId, serialNumber },
    });
    if (existing) {
      if (existing.status === 'AVAILABLE') {
        throw new Error(`Serial already in stock: ${serialNumber}`);
      }
      await tx.inventorySerial.update({
        where: { id: existing.id },
        data: {
          status: 'AVAILABLE',
          warehouseId: opts.warehouseId,
          unitCost: opts.unitCost != null ? new Prisma.Decimal(opts.unitCost) : undefined,
          sourceType: opts.sourceType,
          sourceId: opts.sourceId,
          soldAt: null,
        },
      });
    } else {
      await tx.inventorySerial.create({
        data: {
          userId: opts.userId,
          tenantId: opts.tenantId ?? null,
          productId: opts.productId,
          warehouseId: opts.warehouseId,
          serialNumber,
          status: 'AVAILABLE',
          unitCost: opts.unitCost != null ? new Prisma.Decimal(opts.unitCost) : null,
          sourceType: opts.sourceType,
          sourceId: opts.sourceId,
        },
      });
    }
  }
}

async function issueSerials(
  tx: TrackingTx,
  opts: Parameters<typeof applyLineTracking>[1],
): Promise<void> {
  let serials = parseSerialNumbers(opts.item);
  if (serials.length === 0) {
    // Auto-pick oldest available serials at warehouse
    const available = await tx.inventorySerial.findMany({
      where: {
        userId: opts.userId,
        productId: opts.productId,
        warehouseId: opts.warehouseId,
        status: 'AVAILABLE',
      },
      orderBy: { createdAt: 'asc' },
      take: opts.qty,
    });
    if (available.length < opts.qty) {
      throw new Error(
        `Insufficient serial stock (need ${opts.qty}, have ${available.length})`,
      );
    }
    serials = available.map((s) => s.serialNumber);
  }
  if (serials.length !== opts.qty) {
    throw new Error(
      `SERIAL issue requires ${opts.qty} serial number(s); got ${serials.length}`,
    );
  }
  for (const serialNumber of serials) {
    const row = await tx.inventorySerial.findFirst({
      where: {
        userId: opts.userId,
        productId: opts.productId,
        serialNumber,
        status: 'AVAILABLE',
      },
    });
    if (!row) throw new Error(`Serial not available: ${serialNumber}`);
    if (row.warehouseId && row.warehouseId !== opts.warehouseId) {
      throw new Error(`Serial ${serialNumber} is in another warehouse`);
    }
    await tx.inventorySerial.update({
      where: { id: row.id },
      data: {
        status: 'SOLD',
        soldAt: new Date(),
        sourceType: opts.sourceType,
        sourceId: opts.sourceId,
      },
    });
  }
}

async function returnSerials(
  tx: TrackingTx,
  opts: Parameters<typeof applyLineTracking>[1],
): Promise<void> {
  let serials = parseSerialNumbers(opts.item);
  if (serials.length === 0) {
    // Prefer serials last sold against this source if we stored sourceId on issue
    const sold = await tx.inventorySerial.findMany({
      where: {
        userId: opts.userId,
        productId: opts.productId,
        status: 'SOLD',
      },
      orderBy: { soldAt: 'desc' },
      take: opts.qty,
    });
    if (sold.length < opts.qty) {
      throw new Error(
        `SERIAL return needs ${opts.qty} serial number(s) (or previously sold units)`,
      );
    }
    serials = sold.map((s) => s.serialNumber);
  }
  if (serials.length !== opts.qty) {
    throw new Error(`SERIAL return requires ${opts.qty} serial number(s)`);
  }
  for (const serialNumber of serials) {
    const row = await tx.inventorySerial.findFirst({
      where: { userId: opts.userId, productId: opts.productId, serialNumber },
    });
    if (!row) throw new Error(`Serial not found: ${serialNumber}`);
    await tx.inventorySerial.update({
      where: { id: row.id },
      data: {
        status: 'AVAILABLE',
        warehouseId: opts.warehouseId,
        soldAt: null,
        sourceType: opts.sourceType,
        sourceId: opts.sourceId,
      },
    });
  }
}
