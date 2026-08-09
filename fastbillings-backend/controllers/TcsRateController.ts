import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import { computeTcsAmount } from '../lib/taxEngine';

function formatRow(r: {
  id: string;
  section: string;
  name: string;
  rate: Prisma.Decimal | number;
  threshold: Prisma.Decimal | number | null;
  onTaxInclusive: boolean;
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
    onTaxInclusive: r.onTaxInclusive,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getAllTcsRates(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '50', 10)));
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.TcsRateWhereInput = {
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
      prisma.tcsRate.findMany({
        where,
        orderBy: { section: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tcsRate.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        tcsRates: rows.map(formatRow),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('getAllTcsRates error:', err);
    res.status(500).json({ success: false, message: 'Failed to list TCS rates' });
  }
}

export async function createTcsRate(req: Request, res: Response): Promise<void> {
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

    const created = await prisma.tcsRate.create({
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
        onTaxInclusive:
          body.onTaxInclusive === undefined
            ? true
            : body.onTaxInclusive === true || body.onTaxInclusive === 'true',
        isActive: body.isActive === undefined ? true : body.isActive === true || body.isActive === 'true',
      },
    });

    res.status(201).json({
      success: true,
      message: 'TCS rate created',
      data: { tcsRate: formatRow(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createTcsRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to create TCS rate' });
  }
}

export async function updateTcsRate(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const existing = await prisma.tcsRate.findFirst({ where: { id, ...tenantOrUserScope(req) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'TCS rate not found' });
      return;
    }

    const data: Prisma.TcsRateUpdateInput = {};
    if (body.section !== undefined) data.section = String(body.section).trim().toUpperCase();
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.rate !== undefined) data.rate = new Prisma.Decimal(Number(body.rate));
    if (body.threshold !== undefined) {
      data.threshold =
        body.threshold === null || body.threshold === ''
          ? null
          : new Prisma.Decimal(Number(body.threshold));
    }
    if (body.onTaxInclusive !== undefined) {
      data.onTaxInclusive = body.onTaxInclusive === true || body.onTaxInclusive === 'true';
    }
    if (body.isActive !== undefined) data.isActive = body.isActive === true || body.isActive === 'true';

    const updated = await prisma.tcsRate.update({ where: { id }, data });
    res.json({ success: true, message: 'TCS rate updated', data: { tcsRate: formatRow(updated) } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('updateTcsRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to update TCS rate' });
  }
}

export async function deleteTcsRate(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.tcsRate.findFirst({ where: { id, ...tenantOrUserScope(req) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'TCS rate not found' });
      return;
    }
    await prisma.tcsRate.update({ where: { id }, data: { isDeleted: true } });
    res.json({ success: true, message: 'TCS rate deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteTcsRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete TCS rate' });
  }
}

/**
 * POST /api/admin/tcs/compute
 * Body: { taxableBase, taxAmount?, tcsRateId?, ratePercent? }
 * Uses tax-inclusive base when the rate's onTaxInclusive flag is set.
 */
export async function computeTcs(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const body = req.body as {
      taxableBase?: number;
      taxAmount?: number;
      tcsRateId?: string;
      ratePercent?: number;
      onTaxInclusive?: boolean;
    };
    const taxableBase = Number(body.taxableBase ?? 0);
    const taxAmount = Number(body.taxAmount ?? 0);
    let ratePercent = Number(body.ratePercent ?? 0);
    let onTaxInclusive = body.onTaxInclusive !== false;
    let section: string | null = null;
    let threshold: number | null = null;

    if (body.tcsRateId) {
      const row = await prisma.tcsRate.findFirst({
        where: { id: body.tcsRateId, ...tenantOrUserScope(req), isActive: true },
      });
      if (!row) {
        res.status(404).json({ success: false, message: 'TCS rate not found' });
        return;
      }
      ratePercent = Number(row.rate);
      onTaxInclusive = row.onTaxInclusive;
      section = row.section;
      threshold = row.threshold == null ? null : Number(row.threshold);
    }

    const base = onTaxInclusive ? taxableBase + taxAmount : taxableBase;
    if (threshold != null && base < threshold) {
      res.json({
        success: true,
        data: {
          tcsAmount: 0,
          ratePercent,
          section,
          base,
          onTaxInclusive,
          belowThreshold: true,
          threshold,
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        tcsAmount: computeTcsAmount(base, ratePercent),
        ratePercent,
        section,
        base,
        onTaxInclusive,
        belowThreshold: false,
        threshold,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('computeTcs error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute TCS' });
  }
}

const handlers = {
  getAllTcsRates,
  createTcsRate,
  updateTcsRate,
  deleteTcsRate,
  computeTcs,
};
module.exports = handlers;
module.exports.default = handlers;
