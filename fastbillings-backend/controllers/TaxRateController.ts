import type { Request, Response } from 'express';
import type { TaxRate, TaxRegime } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { tenantScope, requireUserId, UnauthorizedError } from '../lib/tenantScope';

import { suggestTaxesForLine } from '../lib/taxEngine';

interface TaxRateResponse {
  id: string;
  name: string;
  rate: number;
  regime: TaxRegime;
  taxKind: TaxRate['taxKind'];
  countryId: string | null;
  stateId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function formatTaxRate(r: TaxRate): TaxRateResponse {
  return {
    id: r.id,
    name: r.name,
    rate: Number(r.rate),
    regime: r.regime,
    taxKind: r.taxKind,
    countryId: r.countryId,
    stateId: r.stateId,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export async function getAllTaxRates(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10)));
    const search = ((req.query.search as string) ?? '').trim();
    const regimeFilter = req.query.regime as string | undefined;
    const activeFilter = req.query.isActive as string | undefined;

    const where: Prisma.TaxRateWhereInput = { ...tenantScope(req) };
    if (regimeFilter && ['GST_INDIA', 'VAT_GENERIC', 'US_SALES_TAX', 'NONE'].includes(regimeFilter)) {
      where.regime = regimeFilter as TaxRegime;
    }
    if (activeFilter === 'true' || activeFilter === 'false') {
      where.isActive = activeFilter === 'true';
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      prisma.taxRate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.taxRate.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        taxRates: rows.map(formatTaxRate),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('getAllTaxRates error:', err);
    res.status(500).json({ success: false, message: 'Failed to list tax rates' });
  }
}

export async function getTaxRateById(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const row = await prisma.taxRate.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Tax rate not found' });
      return;
    }
    res.json({ success: true, data: { taxRate: { ...formatTaxRate(row) } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('getTaxRateById error:', err);
    res.status(500).json({ success: false, message: 'Failed to load tax rate' });
  }
}

export async function createTaxRate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;

    const created = await prisma.taxRate.create({
      data: {
        name: body.name as string,
        rate: new Prisma.Decimal(Number(body.rate)),
        regime: body.regime as TaxRegime,
        taxKind: (body.taxKind as TaxRate['taxKind']) ?? null,
        countryId: (body.countryId as string | null) ?? null,
        stateId: (body.stateId as string | null) ?? null,
        isActive: body.isActive === undefined ? true : body.isActive === true || body.isActive === 'true',
        userId,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Tax rate created',
      data: { taxRate: { ...formatTaxRate(created) } },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createTaxRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to create tax rate' });
  }
}

export async function updateTaxRate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.taxRate.findFirst({ where: { id, userId, isDeleted: false } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Tax rate not found' });
      return;
    }

    const data: Prisma.TaxRateUpdateInput = {};
    if (body.name !== undefined) data.name = body.name as string;
    if (body.rate !== undefined) data.rate = new Prisma.Decimal(Number(body.rate));
    if (body.regime !== undefined) data.regime = body.regime as TaxRegime;
    if (body.taxKind !== undefined) data.taxKind = (body.taxKind as TaxRate['taxKind']) ?? null;
    if (body.countryId !== undefined) {
      data.country = body.countryId ? { connect: { id: body.countryId as string } } : { disconnect: true };
    }
    if (body.stateId !== undefined) {
      data.state = body.stateId ? { connect: { id: body.stateId as string } } : { disconnect: true };
    }
    if (body.isActive !== undefined) data.isActive = body.isActive === true || body.isActive === 'true';

    const updated = await prisma.taxRate.update({ where: { id }, data });
    res.json({
      success: true,
      message: 'Tax rate updated',
      data: { taxRate: { ...formatTaxRate(updated) } },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('updateTaxRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to update tax rate' });
  }
}

export async function deleteTaxRate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.taxRate.findFirst({ where: { id, userId, isDeleted: false } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Tax rate not found' });
      return;
    }
    await prisma.taxRate.update({ where: { id }, data: { isDeleted: true } });
    res.json({ success: true, message: 'Tax rate deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteTaxRate error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete tax rate' });
  }
}

/**
 * POST /api/admin/tax-engine/suggest-for-line
 * Body: { customerId?: string }
 * Returns the TaxRate rows the engine would auto-apply on a line for this customer.
 */
export async function suggestForLine(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as { customerId?: string };

    const company = await prisma.companySettings.findUnique({ where: { userId } });
    if (!company) {
      res.status(400).json({ success: false, message: 'Company settings not configured. Set tax regime first.' });
      return;
    }

    let customerCountryId: string | null = null;
    let customerStateId: string | null = null;
    if (body.customerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: body.customerId, userId, isDeleted: false },
        select: { billingAddress: true, shippingAddress: true },
      });
      // billingAddress is a JSON blob; defensively pull stateId/countryId if present
      const addr = (customer?.billingAddress as { countryId?: string; stateId?: string } | null) ?? null;
      customerCountryId = addr?.countryId ?? null;
      customerStateId = addr?.stateId ?? null;
    }

    const library = await prisma.taxRate.findMany({
      where: { userId, isDeleted: false, isActive: true, regime: company.taxRegime },
    });

    const suggested = suggestTaxesForLine({
      regime: company.taxRegime,
      companyCountryId: company.countryId ?? null,
      companyStateId: null, // CompanySettings has no stateId today; could be added later
      customerCountryId,
      customerStateId,
      libraryRates: library,
    });

    res.json({
      success: true,
      data: { taxRates: suggested.map(formatTaxRate) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('suggestForLine error:', err);
    res.status(500).json({ success: false, message: 'Failed to suggest taxes' });
  }
}

// CommonJS interop for adminRoutes.js
const handlers = {
  getAllTaxRates,
  getTaxRateById,
  createTaxRate,
  updateTaxRate,
  deleteTaxRate,
  suggestForLine,
};
module.exports = handlers;
module.exports.default = handlers;
