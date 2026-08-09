import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import { resolveWarehouseId } from '../lib/warehouseStock';
import {
  completeManufactureBuild,
  type ComponentTrackingInput,
} from '../lib/manufactureStock';
import { postManufactureCompleted, type PostingTx } from '../lib/ledger/ledgerPosting';
import { explodeBomToLeaves } from '../lib/bomExplode';

type TrackingBody = {
  componentTracking?: Record<string, ComponentTrackingInput>;
  finishedTracking?: ComponentTrackingInput & { lotNumber?: string };
};

export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const where = { ...tenantOrUserScope(req) };
    const [rows, total] = await Promise.all([
      prisma.manufactureOrder.findMany({
        where,
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          bom: {
            select: {
              id: true,
              name: true,
              finishedProduct: { select: { id: true, name: true, code: true } },
            },
          },
          lines: {
            include: { product: { select: { id: true, name: true, code: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.manufactureOrder.count({ where }),
    ]);
    res.json({
      success: true,
      data: {
        orders: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('manufacture list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list manufacture orders' });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const row = await prisma.manufactureOrder.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      include: {
        warehouse: { select: { id: true, name: true, code: true } },
        bom: {
          include: {
            finishedProduct: { select: { id: true, name: true, code: true } },
            lines: {
              include: { componentProduct: { select: { id: true, name: true, code: true } } },
            },
          },
        },
        lines: {
          include: { product: { select: { id: true, name: true, code: true } } },
        },
      },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Manufacture order not found' });
      return;
    }
    res.json({ success: true, data: { order: row } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to fetch manufacture order' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as {
      bomId?: string;
      quantity?: number;
      warehouseId?: string;
      notes?: string;
      completeNow?: boolean;
    } & TrackingBody;

    if (!body.bomId) {
      res.status(400).json({ success: false, message: 'bomId required' });
      return;
    }
    const qty = Number(body.quantity ?? 0);
    if (!(qty > 0)) {
      res.status(400).json({ success: false, message: 'quantity must be positive' });
      return;
    }

    const bom = await prisma.bom.findFirst({
      where: { id: body.bomId, isActive: true, ...tenantOrUserScope(req) },
      include: { lines: true },
    });
    if (!bom || bom.lines.length === 0) {
      res.status(404).json({ success: false, message: 'Active BOM with lines not found' });
      return;
    }

    const order = await prisma.$transaction(async (tx) => {
      const warehouseId = await resolveWarehouseId(tx as never, {
        userId,
        tenantId,
        warehouseId: body.warehouseId ?? null,
      });
      const count = await tx.manufactureOrder.count({ where: { userId } });
      const orderNumber = `MFG-${String(count + 1).padStart(6, '0')}`;

      const created = await tx.manufactureOrder.create({
        data: {
          userId,
          tenantId,
          bomId: bom.id,
          orderNumber,
          warehouseId,
          quantity: new Prisma.Decimal(qty),
          notes: body.notes ?? null,
          status: 'DRAFT',
        },
      });

      if (body.completeNow === true) {
        const { leaves } = await explodeBomToLeaves(tx as never, {
          userId,
          tenantId,
          bomId: bom.id,
        });
        const result = await completeManufactureBuild(tx as never, {
          userId,
          tenantId,
          orderId: created.id,
          orderNumber,
          warehouseId,
          buildQty: qty,
          finishedProductId: bom.finishedProductId,
          components: leaves.map((l) => ({
            productId: l.productId,
            qtyPerBuild: l.qtyPerBuild,
          })),
          componentTracking: body.componentTracking,
          finishedTracking: body.finishedTracking,
        });
        const completedAt = new Date();
        await postManufactureCompleted(tx as unknown as PostingTx, {
          userId,
          manufactureOrderId: created.id,
          date: completedAt,
          cost: result.totalBuildCost.toFixed(4),
        });
        return tx.manufactureOrder.update({
          where: { id: created.id },
          data: {
            status: 'COMPLETED',
            completedAt,
            totalBuildCost: result.totalBuildCost,
          },
          include: {
            warehouse: { select: { id: true, name: true, code: true } },
            bom: {
              select: {
                id: true,
                name: true,
                finishedProduct: { select: { id: true, name: true, code: true } },
              },
            },
            lines: {
              include: { product: { select: { id: true, name: true, code: true } } },
            },
          },
        });
      }

      return tx.manufactureOrder.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          bom: {
            select: {
              id: true,
              name: true,
              finishedProduct: { select: { id: true, name: true, code: true } },
            },
          },
          lines: true,
        },
      });
    });

    res.status(201).json({
      success: true,
      message: order.status === 'COMPLETED' ? 'Build completed' : 'Manufacture order created',
      data: { order },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('manufacture create error:', err);
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to create manufacture order',
    });
  }
}

export async function complete(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.manufactureOrder.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      include: { bom: { include: { lines: true } } },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Manufacture order not found' });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(400).json({ success: false, message: 'Only DRAFT orders can be completed' });
      return;
    }
    if (!existing.bom.isActive || existing.bom.isDeleted) {
      res.status(400).json({ success: false, message: 'BOM is inactive' });
      return;
    }

    const body = (req.body ?? {}) as TrackingBody;

    const order = await prisma.$transaction(async (tx) => {
      const { leaves } = await explodeBomToLeaves(tx as never, {
        userId,
        tenantId,
        bomId: existing.bomId,
      });
      const result = await completeManufactureBuild(tx as never, {
        userId,
        tenantId,
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        warehouseId: existing.warehouseId,
        buildQty: Number(existing.quantity),
        finishedProductId: existing.bom.finishedProductId,
        components: leaves.map((l) => ({
          productId: l.productId,
          qtyPerBuild: l.qtyPerBuild,
        })),
        componentTracking: body.componentTracking,
        finishedTracking: body.finishedTracking,
      });
      const completedAt = new Date();
      await postManufactureCompleted(tx as unknown as PostingTx, {
        userId,
        manufactureOrderId: existing.id,
        date: completedAt,
        cost: result.totalBuildCost.toFixed(4),
      });
      return tx.manufactureOrder.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt,
          totalBuildCost: result.totalBuildCost,
        },
        include: {
          warehouse: { select: { id: true, name: true, code: true } },
          bom: {
            select: {
              id: true,
              name: true,
              finishedProduct: { select: { id: true, name: true, code: true } },
            },
          },
          lines: {
            include: { product: { select: { id: true, name: true, code: true } } },
          },
        },
      });
    });

    res.json({ success: true, message: 'Build completed', data: { order } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('manufacture complete error:', err);
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to complete build',
    });
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.manufactureOrder.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      select: { id: true, status: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Manufacture order not found' });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(400).json({ success: false, message: 'Only DRAFT orders can be cancelled' });
      return;
    }
    const order = await prisma.manufactureOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    res.json({ success: true, message: 'Cancelled', data: { order } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
}

const handlers = { list, getById, create, complete, cancel };
module.exports = handlers;
module.exports.default = handlers;
