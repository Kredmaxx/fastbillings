import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../../../lib/prisma';
import {
  tenantOrUserFilter,
  tenantOrUserScope,
  optionalTenantId,
  requireUserId,
  UnauthorizedError,
} from '../../../lib/tenantScope';
import { findProductInventory, resolveWarehouseId } from '../../../lib/warehouseStock';
import {
  applyFifoIssue,
  applyFifoReceipt,
  applyWacIssue,
  applyWacReceipt,
} from '../../../lib/ledger/inventoryValuation';

type Tx = Prisma.TransactionClient;

type StockUpdateType = 'stock_in' | 'stock_out' | 'adjustment';
const VALID_STOCK_TYPES: ReadonlySet<StockUpdateType> = new Set<StockUpdateType>([
  'stock_in',
  'stock_out',
  'adjustment',
]);

interface InventoryHistoryEntry {
  _id?: string;
  unitId?: string | null;
  quantity?: number;
  notes?: string | null;
  type?: string;
  adjustment?: number;
  referenceId?: string | null;
  referenceType?: string | null;
  createdBy?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

function readHistoryArray(value: Prisma.JsonValue | null | undefined): InventoryHistoryEntry[] {
  if (Array.isArray(value)) {
    return value as unknown as InventoryHistoryEntry[];
  }
  return [];
}

// =============================================================================
// listInventory
// =============================================================================

export async function listInventory(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const {
      search = '',
      page = '1',
      limit = '10',
      warehouseId,
    } = req.query as { search?: string; page?: string; limit?: string; warehouseId?: string };

    const pageN = parseInt(String(page), 10) || 1;
    const limitN = parseInt(String(limit), 10) || 10;
    const skip = (pageN - 1) * limitN;

    const where: Prisma.InventoryWhereInput = {
      isDeleted: false,
      AND: [tenantOrUserFilter(req)],
    };
    if (warehouseId) where.warehouseId = warehouseId;

    if (search) {
      const tenantId = req.auth?.tenantId;
      const matchingProducts = await prisma.product.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      where.productId = { in: matchingProducts.map((p) => p.id) };
    }

    const [totalCount, inventories] = await Promise.all([
      prisma.inventory.count({ where }),
      prisma.inventory.findMany({
        where,
        include: {
          product: {
            include: {
              unit: { select: { unit_name: true, short_name: true } },
            },
          },
          warehouse: { select: { id: true, name: true, code: true, isDefault: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const inventoryList = inventories.map((inv) => ({
      id: inv.id,
      productId: inv.productId,
      warehouseId: inv.warehouseId,
      warehouse: inv.warehouse,
      quantity: inv.quantity,
      quantityOnHand: Number(inv.quantityOnHand ?? inv.quantity ?? 0),
      createdAt: inv.createdAt,
      productDetails: inv.product
        ? {
            id: inv.product.id,
            item_type: inv.product.item_type,
            name: inv.product.name,
            code: inv.product.code,
            selling_price: Number(inv.product.selling_price),
            purchase_price: Number(inv.product.purchase_price),
            alert_quantity: inv.product.alert_quantity,
            product_image: inv.product.product_image
              ? `${baseUrl}${inv.product.product_image}`
              : null,
            unit_name: inv.product.unit?.short_name ?? null,
            status: inv.product.status,
            currencyCode: inv.product.currencyCode ?? null,
          }
        : null,
    }));

    res.status(200).json({
      success: true,
      message: 'Inventory list fetched successfully',
      data: inventoryList,
      pagination: {
        total: totalCount,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(totalCount / limitN),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching inventory list:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching inventory list',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getInventoryHistory
// =============================================================================

export async function getInventoryHistory(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };

    const inventory = await prisma.inventory.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      include: {
        product: {
          include: {
            unit: { select: { unit_name: true } },
          },
        },
      },
    });

    if (!inventory || inventory.isDeleted) {
      res.status(404).json({
        success: false,
        message: 'Inventory not found',
      });
      return;
    }

    const defaultUnitName = inventory.product?.unit?.unit_name ?? null;

    const historyEntries = readHistoryArray(inventory.inventory_history);

    // Collect creator IDs and per-entry unit IDs for batch lookups
    const createdByIds = Array.from(
      new Set(
        historyEntries
          .map((h) => h.createdBy)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    );
    const unitIds = Array.from(
      new Set(
        historyEntries
          .map((h) => h.unitId)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    );

    const [users, units] = await Promise.all([
      createdByIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: createdByIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve([] as { id: string; firstName: string; lastName: string | null; email: string }[]),
      unitIds.length > 0
        ? prisma.unit.findMany({
            where: { id: { in: unitIds } },
            select: { id: true, unit_name: true },
          })
        : Promise.resolve([] as { id: string; unit_name: string }[]),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const unitMap = new Map(units.map((u) => [u.id, u]));

    const historyData = historyEntries.map((history) => {
      let unitName: string | null = defaultUnitName;
      if (history.unitId && unitMap.has(history.unitId)) {
        unitName = unitMap.get(history.unitId)?.unit_name ?? unitName;
      }

      const creator = history.createdBy ? userMap.get(history.createdBy) : null;

      return {
        _id: history._id,
        unitId: history.unitId,
        unitName,
        quantity: history.quantity,
        notes: history.notes,
        type: history.type,
        adjustment: history.adjustment,
        referenceId: history.referenceId,
        referenceType: history.referenceType,
        createdBy: creator
          ? {
              id: creator.id,
              name: `${creator.firstName ?? ''} ${creator.lastName ?? ''}`.trim(),
              email: creator.email,
            }
          : null,
        createdAt: history.createdAt,
        updatedAt: history.updatedAt,
      };
    });

    historyData.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    res.status(200).json({
      success: true,
      message: 'Inventory history fetched successfully',
      data: {
        inventoryId: inventory.id,
        productId: inventory.product
          ? {
              id: inventory.product.id,
              name: inventory.product.name,
              code: inventory.product.code,
              unitName: defaultUnitName,
            }
          : null,
        currentQuantity: inventory.quantity,
        history: historyData,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching inventory history:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching inventory history',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateStock
// =============================================================================

export async function updateStock(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { productId, quantity, type, notes, warehouseId: bodyWarehouseId } = req.body as {
      productId?: string;
      quantity?: number;
      type?: string;
      notes?: string;
      warehouseId?: string;
    };

    if (!productId || typeof productId !== 'string') {
      res.status(400).json({ success: false, message: 'Invalid productId' });
      return;
    }

    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
      return;
    }

    if (!type || !VALID_STOCK_TYPES.has(type as StockUpdateType)) {
      res.status(400).json({ success: false, message: 'Invalid stock update type' });
      return;
    }
    const stockType = type as StockUpdateType;

    // Products are tenant-keyed — refuse unscoped id lookup when JWT has no workspace.
    const tenantId = optionalTenantId(req);
    if (!tenantId) {
      res.status(400).json({ success: false, message: 'Workspace context required' });
      return;
    }

    const result = await prisma.$transaction(async (tx: Tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId },
      });
      if (!product) {
        return { error: { status: 404, body: { success: false, message: 'Product not found' } } } as const;
      }

      const warehouseId = await resolveWarehouseId(tx as never, {
        userId,
        tenantId: tenantId ?? null,
        warehouseId: bodyWarehouseId ?? null,
      });
      const existing = await findProductInventory(tx as never, {
        productId,
        userId,
        warehouseId,
      });

      const previousQuantity = existing?.quantity ?? 0;
      const isFifo = product.valuationMethod === 'FIFO';
      const unitCost = Number(product.purchase_price ?? 0);
      const qtyOnHand = (existing?.quantityOnHand as Prisma.Decimal | undefined)
        ?? new Prisma.Decimal(previousQuantity);
      const avgCost = (existing?.avgCost as Prisma.Decimal | undefined) ?? new Prisma.Decimal(0);

      // stock_out removes; stock_in / adjustment add (adjustment can be negative via signed qty later — keep legacy +qty)
      const isIssue = stockType === 'stock_out';
      if (isIssue && previousQuantity < qty) {
        return {
          error: {
            status: 400,
            body: {
              success: false,
              message: 'Not enough stock to remove',
              currentStock: previousQuantity,
              requested: qty,
            },
          },
        } as const;
      }

      let newQuantity = previousQuantity;
      let adjustmentValue = qty;
      let nextQtyOnHand: Prisma.Decimal = qtyOnHand;
      let nextAvgCost: Prisma.Decimal = avgCost;

      if (isIssue) {
        newQuantity = previousQuantity - qty;
        adjustmentValue = -qty;
        if (isFifo) {
          const fifo = await applyFifoIssue(tx as never, {
            userId,
            tenantId: tenantId ?? null,
            productId,
            qty,
            currentQtyOnHand: qtyOnHand,
          });
          nextQtyOnHand = fifo.newQtyOnHand;
        } else {
          const issue = applyWacIssue({ quantityOnHand: qtyOnHand, avgCost }, qty);
          nextQtyOnHand = issue.state.quantityOnHand;
          nextAvgCost = issue.state.avgCost;
        }
      } else {
        newQuantity = previousQuantity + qty;
        if (isFifo) {
          nextQtyOnHand = await applyFifoReceipt(tx as never, {
            userId,
            tenantId: tenantId ?? null,
            productId,
            qty,
            landedUnitCost: unitCost,
            purchaseDate: new Date(),
            purchaseId: existing?.id ?? `manual-${productId}`,
            currentQtyOnHand: qtyOnHand,
          });
        } else {
          const wac = applyWacReceipt({ quantityOnHand: qtyOnHand, avgCost }, qty, unitCost);
          nextQtyOnHand = wac.quantityOnHand;
          nextAvgCost = wac.avgCost;
        }
      }

      const historyEntry: InventoryHistoryEntry = {
        unitId: product.unitId ?? null,
        quantity: previousQuantity,
        notes: notes || `${stockType.replace('_', ' ').toUpperCase()} performed`,
        type: stockType,
        adjustment: adjustmentValue,
        referenceId: null,
        referenceType: 'adjustment',
        createdBy: userId,
      };

      let inventoryRow;
      let isNew = false;

      if (!existing) {
        isNew = true;
        inventoryRow = await tx.inventory.create({
          data: {
            productId,
            quantity: newQuantity,
            quantityOnHand: nextQtyOnHand,
            avgCost: nextAvgCost,
            userId,
            tenantId: tenantId ?? product.tenantId ?? undefined,
            warehouseId,
            inventory_history: [historyEntry] as unknown as Prisma.InputJsonValue,
            notes: '',
          },
        });
      } else {
        const existingHistory = readHistoryArray(existing.inventory_history);
        inventoryRow = await tx.inventory.update({
          where: { id: existing.id },
          data: {
            quantity: newQuantity,
            quantityOnHand: nextQtyOnHand,
            ...(isFifo ? {} : { avgCost: nextAvgCost }),
            ...(tenantId && !existing.tenantId ? { tenantId } : {}),
            ...(existing.warehouseId == null ? { warehouseId } : {}),
            inventory_history: [...existingHistory, historyEntry] as unknown as Prisma.InputJsonValue,
          },
        });
      }

      return {
        ok: {
          inventory: inventoryRow,
          previousQuantity,
          newQuantity,
          adjustmentValue,
          isNew,
        },
      } as const;
    });

    if ('error' in result && result.error) {
      res.status(result.error.status).json(result.error.body);
      return;
    }

    if (!('ok' in result) || !result.ok) {
      res.status(500).json({ success: false, message: 'Error updating stock' });
      return;
    }

    const { inventory, previousQuantity, newQuantity, adjustmentValue, isNew } = result.ok;

    res.status(200).json({
      success: true,
      message: isNew
        ? 'Inventory created and stock added successfully'
        : 'Stock updated successfully',
      data: {
        id: inventory.id,
        productId: inventory.productId,
        previousQuantity,
        newQuantity,
        adjustment: adjustmentValue,
        type: stockType,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error updating stock:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating stock',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  listInventory,
  getInventoryHistory,
  updateStock,
};
module.exports.listInventory = listInventory;
module.exports.getInventoryHistory = getInventoryHistory;
module.exports.updateStock = updateStock;
