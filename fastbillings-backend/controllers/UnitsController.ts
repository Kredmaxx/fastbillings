import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireTenantId, UnauthorizedError } from '../lib/tenantScope';

function handleAuth(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ message: err.message });
    return true;
  }
  return false;
}

export async function getUnits(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.UnitWhereInput = { tenantId };
    if (search) {
      where.OR = [
        { unit_name: { contains: search, mode: 'insensitive' } },
        { short_name: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, units] = await Promise.all([
      prisma.unit.count({ where }),
      prisma.unit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.status(200).json({
      message: 'Units fetched successfully',
      data: {
        units,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({
      message: 'Failed to fetch units',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function createUnit(req: Request, res: Response): Promise<void> {
  const { unit_name, short_name, status } = req.body as {
    unit_name?: string;
    short_name?: string;
    status?: boolean | string;
  };

  try {
    const tenantId = requireTenantId(req);
    const unit = await prisma.unit.create({
      data: {
        tenantId,
        unit_name: unit_name as string,
        short_name: short_name as string,
        status: typeof status === 'string' ? status === 'true' : (status ?? true),
      },
    });
    res.status(201).json(unit);
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(400).json({ message: 'Failed to create unit' });
  }
}

export async function getUnitById(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const unit = await prisma.unit.findFirst({ where: { id, tenantId } });

    if (!unit) {
      res.status(404).json({ message: 'Unit not found' });
      return;
    }

    res.json(unit);
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ message: 'Failed to fetch unit' });
  }
}

export async function updateUnit(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };

  if (!id) {
    res.status(400).json({ message: 'Invalid unit ID' });
    return;
  }

  try {
    const tenantId = requireTenantId(req);
    const existing = await prisma.unit.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ message: 'Unit not found' });
      return;
    }

    const body = req.body as {
      unit_name?: string;
      short_name?: string;
      status?: boolean | string;
    };

    const data: Prisma.UnitUpdateInput = {};
    if (body.unit_name !== undefined) data.unit_name = body.unit_name;
    if (body.short_name !== undefined) data.short_name = body.short_name;
    if (body.status !== undefined) {
      data.status = typeof body.status === 'string' ? body.status === 'true' : body.status;
    }

    const unit = await prisma.unit.update({
      where: { id: existing.id },
      data,
    });

    res.json({
      message: 'Unit updated successfully',
      data: unit,
    });
  } catch (err) {
    if (handleAuth(res, err)) return;
    console.error('Update error:', err);
    res.status(500).json({ message: 'Failed to update unit' });
  }
}

export async function deleteUnit(req: Request, res: Response): Promise<void> {
  const { id } = req.params as { id: string };

  try {
    const tenantId = requireTenantId(req);
    const existing = await prisma.unit.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ message: 'Unit not found' });
      return;
    }

    await prisma.unit.delete({ where: { id: existing.id } });

    res.json({ message: 'Unit deleted successfully' });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(400).json({ message: 'Failed to delete unit' });
  }
}

module.exports = {
  getUnits,
  createUnit,
  getUnitById,
  updateUnit,
  deleteUnit,
};
module.exports.getUnits = getUnits;
module.exports.createUnit = createUnit;
module.exports.getUnitById = getUnitById;
module.exports.updateUnit = updateUnit;
module.exports.deleteUnit = deleteUnit;
