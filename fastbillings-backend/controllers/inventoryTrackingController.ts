import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireUserId, UnauthorizedError, tenantOrUserFilter } from '../lib/tenantScope';

export async function listBatches(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const productId = req.query.productId as string | undefined;
    const warehouseId = req.query.warehouseId as string | undefined;
    const inStockOnly = req.query.inStock !== 'false';

    const where: Prisma.InventoryBatchWhereInput = {
      AND: [
        tenantOrUserFilter(req),
        ...(productId ? [{ productId }] : []),
        ...(warehouseId ? [{ warehouseId }] : []),
        ...(inStockOnly ? [{ qtyOnHand: { gt: 0 } }] : []),
      ],
    };

    const [rows, total] = await Promise.all([
      prisma.inventoryBatch.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, code: true, trackingMode: true } },
          warehouse: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventoryBatch.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        batches: rows.map((r) => ({
          id: r.id,
          lotNumber: r.lotNumber,
          qtyOnHand: Number(r.qtyOnHand),
          unitCost: r.unitCost != null ? Number(r.unitCost) : null,
          expiryDate: r.expiryDate,
          product: r.product,
          warehouse: r.warehouse,
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          createdAt: r.createdAt,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listBatches error:', err);
    res.status(500).json({ success: false, message: 'Failed to list batches' });
  }
}

export async function listSerials(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const productId = req.query.productId as string | undefined;
    const warehouseId = req.query.warehouseId as string | undefined;
    const status = req.query.status as string | undefined;

    const where: Prisma.InventorySerialWhereInput = {
      AND: [
        tenantOrUserFilter(req),
        ...(productId ? [{ productId }] : []),
        ...(warehouseId ? [{ warehouseId }] : []),
        ...(status ? [{ status }] : []),
      ],
    };

    const [rows, total] = await Promise.all([
      prisma.inventorySerial.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, code: true, trackingMode: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          batch: { select: { id: true, lotNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventorySerial.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        serials: rows.map((r) => ({
          id: r.id,
          serialNumber: r.serialNumber,
          status: r.status,
          unitCost: r.unitCost != null ? Number(r.unitCost) : null,
          soldAt: r.soldAt,
          product: r.product,
          warehouse: r.warehouse,
          batch: r.batch,
          createdAt: r.createdAt,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listSerials error:', err);
    res.status(500).json({ success: false, message: 'Failed to list serials' });
  }
}

const handlers = { listBatches, listSerials };
module.exports = handlers;
module.exports.default = handlers;
