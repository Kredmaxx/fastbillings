import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const rows = await prisma.warehouse.findMany({
      where: { ...tenantOrUserScope(req) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: { warehouses: rows } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('warehouse list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list warehouses' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as { name?: string; code?: string; isDefault?: boolean };
    if (!body.name?.trim()) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }

    const tenantId = optionalTenantId(req);
    if (body.isDefault) {
      await prisma.warehouse.updateMany({
        where: { ...tenantOrUserFilter(req), isDefault: true, isDeleted: false },
        data: { isDefault: false },
      });
    }

    const created = await prisma.warehouse.create({
      data: {
        userId,
        tenantId,
        name: body.name.trim(),
        code: body.code?.trim() || null,
        isDefault: Boolean(body.isDefault),
      },
    });
    res.status(201).json({ success: true, message: 'Warehouse created', data: { warehouse: created } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('warehouse create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create warehouse' });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; code?: string; isDefault?: boolean };
    const existing = await prisma.warehouse.findFirst({ where: { id, ...tenantOrUserScope(req) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Warehouse not found' });
      return;
    }

    if (body.isDefault) {
      await prisma.warehouse.updateMany({
        where: { ...tenantOrUserFilter(req), isDefault: true, isDeleted: false, NOT: { id } },
        data: { isDefault: false },
      });
    }

    const data: Prisma.WarehouseUpdateInput = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.code !== undefined) data.code = body.code?.trim() || null;
    if (body.isDefault !== undefined) data.isDefault = Boolean(body.isDefault);

    const updated = await prisma.warehouse.update({ where: { id }, data });
    res.json({ success: true, message: 'Warehouse updated', data: { warehouse: updated } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('warehouse update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update warehouse' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.warehouse.findFirst({ where: { id, ...tenantOrUserScope(req) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Warehouse not found' });
      return;
    }
    if (existing.isDefault) {
      res.status(400).json({ success: false, message: 'Cannot delete the default warehouse' });
      return;
    }
    const stock = await prisma.inventory.count({
      where: { warehouseId: id, isDeleted: false, quantityOnHand: { gt: 0 } },
    });
    if (stock > 0) {
      res.status(400).json({ success: false, message: 'Warehouse still has stock; transfer out first' });
      return;
    }
    await prisma.warehouse.update({ where: { id }, data: { isDeleted: true } });
    res.json({ success: true, message: 'Warehouse deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('warehouse delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete warehouse' });
  }
}

/** Ensure a default warehouse exists for the current tenant/user; return it. */
export async function ensureDefaultWarehouse(req: Request): Promise<{ id: string }> {
  const userId = requireUserId(req);
  const tenantId = optionalTenantId(req);
  const existing = await prisma.warehouse.findFirst({
    where: {
      isDeleted: false,
      isDefault: true,
      ...(tenantId ? { OR: [{ tenantId }, { userId }] } : { userId }),
    },
    select: { id: true },
  });
  if (existing) return existing;
  return prisma.warehouse.create({
    data: {
      userId,
      tenantId,
      name: 'Main Warehouse',
      code: 'MAIN',
      isDefault: true,
    },
    select: { id: true },
  });
}

const handlers = { list, create, update, remove };
module.exports = handlers;
module.exports.default = handlers;
