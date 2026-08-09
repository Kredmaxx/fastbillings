import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import { computeTdsAmount } from '../lib/taxEngine';

function formatRow(r: {
  id: string;
  section: string;
  name: string;
  rate: Prisma.Decimal | number;
  threshold: Prisma.Decimal | number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    section: r.section,
    name: r.name,
    rate: Number(r.rate),
    threshold: r.threshold == null ? null : Number(r.threshold),
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getAllTdsRates(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.TdsRateWhereInput = {
      isDeleted: false,
      AND: [
        { OR: tenantOrUserScope(req).OR },
        ...(search
          ? [
              {
                OR: [
                  { section: { contains: search, mode: 'insensitive' as const } },
                  { name: { contains: search, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
    };

    const [rows, total] = await Promise.all([
      prisma.tdsRate.findMany({
        where,
        orderBy: { section: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tdsRate.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        tdsRates: rows.map(formatRow),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('getAllTdsRates error:', err);
    res.status(500).json({ success: false, message: 'Failed to list TDS rates' });
  }
}

export async function createTdsRate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const section = String(body.section ?? '').trim().toUpperCase();
    const name = String(body.name ?? '').trim();
    const rate = Number(body.rate);
    if (!section || !name || !Number.isFinite(rate)) {
      res.status(400).json({ success: false, message: 'section, name, and rate are required' });
      return;
    }

    const created = await prisma.tdsRate.create({
      data: {
        userId,
        tenantId: optionalTenantId(req),
        section,
        name,
        rate: new Prisma.Decimal(rate),
        threshold:
          body.threshold === undefined || body.threshold === null || body.threshold === ''
            ? null
            : new Prisma.Decimal(Number(body.threshold)),
        isActive: body.isActive === undefined ? true : body.isActive === true || body.isActive === 'true',
      },
    });

    res.status(201).json({
      success: true,
      message: 'TDS rate created',
      data: { tdsRate: formatRow(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createTdsRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to create TDS rate' });
  }
}

export async function updateTdsRate(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const existing = await prisma.tdsRate.findFirst({ where: { id, ...tenantOrUserScope(req) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'TDS rate not found' });
      return;
    }

    const data: Prisma.TdsRateUpdateInput = {};
    if (body.section !== undefined) data.section = String(body.section).trim().toUpperCase();
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.rate !== undefined) data.rate = new Prisma.Decimal(Number(body.rate));
    if (body.threshold !== undefined) {
      data.threshold =
        body.threshold === null || body.threshold === ''
          ? null
          : new Prisma.Decimal(Number(body.threshold));
    }
    if (body.isActive !== undefined) data.isActive = body.isActive === true || body.isActive === 'true';

    const updated = await prisma.tdsRate.update({ where: { id }, data });
    res.json({ success: true, message: 'TDS rate updated', data: { tdsRate: formatRow(updated) } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('updateTdsRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to update TDS rate' });
  }
}

export async function deleteTdsRate(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.tdsRate.findFirst({ where: { id, ...tenantOrUserScope(req) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'TDS rate not found' });
      return;
    }
    await prisma.tdsRate.update({ where: { id }, data: { isDeleted: true } });
    res.json({ success: true, message: 'TDS rate deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteTdsRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete TDS rate' });
  }
}

/**
 * POST /api/admin/tds/compute
 * Body: { taxableBase, tdsRateId? , ratePercent? }
 */
export async function computeTds(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const body = req.body as { taxableBase?: number; tdsRateId?: string; ratePercent?: number };
    const taxableBase = Number(body.taxableBase ?? 0);
    let ratePercent = Number(body.ratePercent ?? 0);

    if (body.tdsRateId) {
      const row = await prisma.tdsRate.findFirst({
        where: { id: body.tdsRateId, ...tenantOrUserScope(req), isActive: true },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'TDS rate not found' });
        return;
      }
      ratePercent = Number(row.rate);
      if (row.threshold != null && taxableBase < Number(row.threshold)) {
        res.json({
          success: true,
          data: {
            tdsAmount: 0,
            ratePercent,
            section: row.section,
            belowThreshold: true,
            threshold: Number(row.threshold),
          },
        });
        return;
      }
      res.json({
        success: true,
        data: {
          tdsAmount: computeTdsAmount(taxableBase, ratePercent),
          ratePercent,
          section: row.section,
          belowThreshold: false,
          threshold: row.threshold == null ? null : Number(row.threshold),
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        tdsAmount: computeTdsAmount(taxableBase, ratePercent),
        ratePercent,
        section: null,
        belowThreshold: false,
        threshold: null,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('computeTds error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute TDS' });
  }
}

const handlers = {
  getAllTdsRates,
  createTdsRate,
  updateTdsRate,
  deleteTdsRate,
  computeTds,
};
module.exports = handlers;
module.exports.default = handlers;
