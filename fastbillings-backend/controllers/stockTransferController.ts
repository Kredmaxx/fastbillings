import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';

type HistoryEntry = {
  type: string;
  quantity: number;
  notes?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  createdBy?: string | null;
  createdAt: string;
};

function readHistory(value: Prisma.JsonValue | null | undefined): HistoryEntry[] {
  return Array.isArray(value) ? (value as unknown as HistoryEntry[]) : [];
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
    const where = { ...tenantOrUserScope(req) };
    const [rows, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        include: {
          fromWarehouse: { select: { id: true, name: true, code: true } },
          toWarehouse: { select: { id: true, name: true, code: true } },
          lines: { include: { product: { select: { id: true, name: true, code: true } } } },
        },
        orderBy: { transferDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockTransfer.count({ where }),
    ]);
    res.json({
      success: true,
      data: {
        transfers: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('stockTransfer list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list stock transfers' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as {
      fromWarehouseId?: string;
      toWarehouseId?: string;
      transferDate?: string;
      notes?: string;
      lines?: Array<{ productId: string; quantity: number }>;
    };

    if (!body.fromWarehouseId || !body.toWarehouseId) {
      res.status(400).json({ success: false, message: 'fromWarehouseId and toWarehouseId required' });
      return;
    }
    if (body.fromWarehouseId === body.toWarehouseId) {
      res.status(400).json({ success: false, message: 'Source and destination warehouses must differ' });
      return;
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      res.status(400).json({ success: false, message: 'At least one line is required' });
      return;
    }

    const [fromWh, toWh] = await Promise.all([
      prisma.warehouse.findFirst({ where: { id: body.fromWarehouseId, ...tenantOrUserScope(req) } }),
      prisma.warehouse.findFirst({ where: { id: body.toWarehouseId, ...tenantOrUserScope(req) } }),
    ]);
    if (!fromWh || !toWh) {
      res.status(404).json({ success: false, message: 'Warehouse not found' });
      return;
    }

    const transfer = await prisma.$transaction(async (tx) => {
      const count = await tx.stockTransfer.count({ where: { userId } });
      const transferNumber = `ST-${String(count + 1).padStart(6, '0')}`;
      const transferDate = body.transferDate ? new Date(body.transferDate) : new Date();

      const created = await tx.stockTransfer.create({
        data: {
          transferNumber,
          userId,
          tenantId,
          fromWarehouseId: body.fromWarehouseId!,
          toWarehouseId: body.toWarehouseId!,
          transferDate,
          notes: body.notes ?? null,
          status: 'COMPLETED',
          lines: {
            create: body.lines!.map((l) => ({
              productId: l.productId,
              quantity: new Prisma.Decimal(Number(l.quantity)),
              unitCost: new Prisma.Decimal(0),
            })),
          },
        },
        include: { lines: true },
      });

      for (const line of body.lines!) {
        const qty = Number(line.quantity);
        if (!(qty > 0)) throw new Error('Line quantity must be positive');

        const fromInv = await tx.inventory.findFirst({
          where: {
            productId: line.productId,
            warehouseId: body.fromWarehouseId,
            userId,
            isDeleted: false,
          },
        });
        const onHand = Number(fromInv?.quantityOnHand ?? fromInv?.quantity ?? 0);
        if (!fromInv || onHand < qty) {
          throw new Error(`Insufficient stock for product ${line.productId}`);
        }

        const unitCost = fromInv.avgCost;
        const newFromQty = onHand - qty;
        const fromHistory = readHistory(fromInv.inventory_history);
        fromHistory.push({
          type: 'transfer_out',
          quantity: qty,
          notes: body.notes ?? null,
          referenceId: created.id,
          referenceType: 'StockTransfer',
          createdBy: userId,
          createdAt: new Date().toISOString(),
        });
        await tx.inventory.update({
          where: { id: fromInv.id },
          data: {
            quantityOnHand: new Prisma.Decimal(newFromQty),
            quantity: Math.round(newFromQty),
            inventory_history: fromHistory as unknown as Prisma.InputJsonValue,
          },
        });

        let toInv = await tx.inventory.findFirst({
          where: {
            productId: line.productId,
            warehouseId: body.toWarehouseId,
            userId,
            isDeleted: false,
          },
        });
        if (!toInv) {
          toInv = await tx.inventory.create({
            data: {
              productId: line.productId,
              warehouseId: body.toWarehouseId,
              userId,
              tenantId: tenantId ?? fromInv.tenantId,
              quantity: 0,
              quantityOnHand: new Prisma.Decimal(0),
              avgCost: unitCost,
              inventory_history: [],
            },
          });
        }

        const toOnHand = Number(toInv.quantityOnHand ?? toInv.quantity ?? 0);
        const newToQty = toOnHand + qty;
        // Weighted average when destination already has stock
        const newAvg =
          newToQty > 0
            ? (toOnHand * Number(toInv.avgCost) + qty * Number(unitCost)) / newToQty
            : Number(unitCost);
        const toHistory = readHistory(toInv.inventory_history);
        toHistory.push({
          type: 'transfer_in',
          quantity: qty,
          notes: body.notes ?? null,
          referenceId: created.id,
          referenceType: 'StockTransfer',
          createdBy: userId,
          createdAt: new Date().toISOString(),
        });
        await tx.inventory.update({
          where: { id: toInv.id },
          data: {
            quantityOnHand: new Prisma.Decimal(newToQty),
            quantity: Math.round(newToQty),
            avgCost: new Prisma.Decimal(newAvg),
            inventory_history: toHistory as unknown as Prisma.InputJsonValue,
          },
        });

        await tx.stockTransferLine.updateMany({
          where: { transferId: created.id, productId: line.productId },
          data: { unitCost },
        });
      }

      return tx.stockTransfer.findUnique({
        where: { id: created.id },
        include: {
          fromWarehouse: { select: { id: true, name: true } },
          toWarehouse: { select: { id: true, name: true } },
          lines: { include: { product: { select: { id: true, name: true, code: true } } } },
        },
      });
    });

    res.status(201).json({ success: true, message: 'Stock transfer completed', data: { transfer } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create stock transfer';
    if (message.startsWith('Insufficient') || message.includes('quantity')) {
      res.status(400).json({ success: false, message });
      return;
    }
    console.error('stockTransfer create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create stock transfer' });
  }
}

const handlers = { list, create };
module.exports = handlers;
module.exports.default = handlers;
