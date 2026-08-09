import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  requireUserId,
  optionalTenantId,
  tenantOrUserFilter,
  UnauthorizedError,
} from '../lib/tenantScope';

/** Tenant/user groups plus legacy unowned rows (null tenant + null user). */
function taxGroupVisibility(req: Request): Prisma.TaxGroupWhereInput {
  return {
    OR: [...tenantOrUserFilter(req).OR, { tenantId: null, userId: null }],
  };
}

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

async function assertTaxRatesInScope(
  req: Request,
  taxRateIds: string[],
): Promise<string | null> {
  if (taxRateIds.length === 0) return null;
  const owned = await prisma.taxRate.findMany({
    where: {
      id: { in: taxRateIds },
      isDeleted: false,
      OR: [
        ...tenantOrUserFilter(req).OR,
        { tenantId: null },
      ],
    },
    select: { id: true },
  });
  if (owned.length !== taxRateIds.length) {
    return 'One or more tax rates are not available in this workspace';
  }
  return null;
}

// Get all tax groups (paginated, search, populated with tax_rates)
export async function getAllTaxGroups(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();
    const skip = (page - 1) * limit;

    const where: Prisma.TaxGroupWhereInput = {
      AND: [taxGroupVisibility(req)],
    };
    if (search) {
      where.tax_name = { contains: search, mode: 'insensitive' };
    }

    const [total, taxGroups] = await Promise.all([
      prisma.taxGroup.count({ where }),
      prisma.taxGroup.findMany({
        where,
        include: { tax_rates: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const result = taxGroups.map((taxGroup) => {
      const totalTaxRate = taxGroup.tax_rates.reduce<Prisma.Decimal>(
        (sum, rate) => sum.add(rate.rate ?? new Prisma.Decimal(0)),
        new Prisma.Decimal(0),
      );

      return {
        ...taxGroup,
        total_tax_rate: totalTaxRate,
      };
    });

    res.status(200).json({
      data: result,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    res.status(500).json({
      message: 'Failed to fetch tax groups',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Create new tax group
export async function createTaxGroup(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { tax_name, tax_rate_ids } = req.body as {
      tax_name?: string;
      tax_rate?: unknown;
      tax_rate_ids?: string[];
    };

    if (!tax_name || typeof tax_name !== 'string' || !tax_name.trim()) {
      res.status(400).json({
        success: false,
        message: 'tax_name is required',
      });
      return;
    }

    const rateIds = Array.isArray(tax_rate_ids) ? tax_rate_ids : [];
    const rateErr = await assertTaxRatesInScope(req, rateIds);
    if (rateErr) {
      res.status(400).json({ success: false, message: rateErr });
      return;
    }

    const newGroup = await prisma.taxGroup.create({
      data: {
        tax_name: tax_name.trim(),
        userId,
        tenantId,
        ...(rateIds.length > 0
          ? { tax_rates: { connect: rateIds.map((id) => ({ id })) } }
          : {}),
      },
      include: { tax_rates: true },
    });

    res.status(201).json({
      success: true,
      message: 'Tax group created successfully',
      data: newGroup,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Tax group creation error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create tax group',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Get a single tax group by id
export async function getTaxGroupById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const group = await prisma.taxGroup.findFirst({
      where: { id, AND: [taxGroupVisibility(req)] },
      include: { tax_rates: true },
    });

    if (!group) {
      res.status(404).json({ message: 'Tax group not found' });
      return;
    }

    res.status(200).json(group);
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    res.status(500).json({
      message: 'Failed to fetch tax group',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Update tax group
export async function updateTaxGroup(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      tax_name?: string;
      tax_rate_ids?: string[];
      status?: boolean | string;
    };

    const existing = await prisma.taxGroup.findFirst({
      where: { id, AND: [taxGroupVisibility(req)] },
    });
    if (!existing) {
      res.status(404).json({
        success: false,
        message: 'Tax group not found',
      });
      return;
    }

    if (Array.isArray(body.tax_rate_ids)) {
      const rateErr = await assertTaxRatesInScope(req, body.tax_rate_ids);
      if (rateErr) {
        res.status(400).json({ success: false, message: rateErr });
        return;
      }
    }

    const data: Prisma.TaxGroupUpdateInput = {};
    if (body.tax_name !== undefined) data.tax_name = body.tax_name;
    if (body.status !== undefined) {
      data.status = typeof body.status === 'string' ? body.status === 'true' : body.status;
    }
    if (Array.isArray(body.tax_rate_ids)) {
      data.tax_rates = { set: body.tax_rate_ids.map((rid) => ({ id: rid })) };
    }
    // Claim legacy unowned rows on first edit under a tenant session
    if (!existing.userId || !existing.tenantId) {
      data.user = { connect: { id: requireUserId(req) } };
      const tid = optionalTenantId(req);
      if (tid) data.tenant = { connect: { id: tid } };
    }

    const updated = await prisma.taxGroup.update({
      where: { id: existing.id },
      data,
      include: { tax_rates: true },
    });

    res.status(200).json({
      success: true,
      message: 'Tax group updated successfully',
      data: updated,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Tax group update error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update tax group',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Delete tax group
export async function deleteTaxGroup(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.taxGroup.findFirst({
      where: { id, AND: [taxGroupVisibility(req)] },
    });
    if (!existing) {
      res.status(404).json({ message: 'Tax group not found' });
      return;
    }

    await prisma.taxGroup.delete({ where: { id: existing.id } });
    res.status(200).json({ message: 'Tax group deleted successfully' });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    res.status(500).json({
      message: 'Failed to delete tax group',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes that still use module-alias requires.
module.exports = {
  getAllTaxGroups,
  createTaxGroup,
  getTaxGroupById,
  updateTaxGroup,
  deleteTaxGroup,
};
module.exports.getAllTaxGroups = getAllTaxGroups;
module.exports.createTaxGroup = createTaxGroup;
module.exports.getTaxGroupById = getTaxGroupById;
module.exports.updateTaxGroup = updateTaxGroup;
module.exports.deleteTaxGroup = deleteTaxGroup;
