import fs from 'fs';
import path from 'path';

import type { Request, Response } from 'express';
import type { Supplier, SupplierBalanceType } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../../../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  supplierTenantOrUserFilter,
  supplierTenantOrUserScope,
  UnauthorizedError,
} from '../../../lib/tenantScope';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// SC.1: resolve the company default currency code (ISO string).
async function resolveDefaultCurrencyCode(): Promise<string | null> {
  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true, isDeleted: false },
    select: { code: true },
  });
  return defaultCurrency?.code ?? null;
}

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

function tryUnlink(filePath: string | undefined | null): void {
  if (!filePath) return;
  try {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn('Could not unlink file', filePath, err);
  }
}

function buildImageUrl(req: Request, image: string | null | undefined): string | null {
  if (!image) return null;
  return `${req.protocol}://${req.get('host')}/${image.replace(/\\/g, '/')}`;
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}


// -----------------------------------------------------------------------------
// createSupplier
// -----------------------------------------------------------------------------

export async function createSupplier(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);

    const {
      supplier_name,
      supplier_email,
      supplier_phone,
      balance,
      balance_type,
      currencyCode: rawCurrencyCode,
    } = req.body as Record<string, unknown>;

    // Sanity: the owning user must exist.
    const owner = await prisma.user.findUnique({ where: { id: userId } });
    if (!owner) {
      tryUnlink(req.file?.path);
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const balanceNum = asNumber(balance, 0);
    const resolvedBalanceType: SupplierBalanceType | null =
      balanceNum === 0
        ? null
        : (((balance_type as string) || 'credit') as SupplierBalanceType);

    // SC.1: use caller-supplied currencyCode or fall back to the company default.
    const supplierCurrencyCode =
      (typeof rawCurrencyCode === 'string' && rawCurrencyCode ? rawCurrencyCode : null) ??
      (await resolveDefaultCurrencyCode());

    // Email uniqueness check (supplier_email is @unique in schema).
    const emailClash = await prisma.supplier.findFirst({
      where: { supplier_email: supplier_email as string },
    });
    if (emailClash) {
      tryUnlink(req.file?.path);
      res.status(409).json({
        success: false,
        message: 'Supplier email already exists',
      });
      return;
    }

    const supplier = await prisma.$transaction(async (tx) => {
      return tx.supplier.create({
        data: {
          user_id: userId,
          tenantId: optionalTenantId(req),
          supplier_name: supplier_name as string,
          supplier_email: supplier_email as string,
          supplier_phone: (supplier_phone as string) ?? '',
          gstin: typeof req.body.gstin === 'string' ? String(req.body.gstin).trim().toUpperCase() || null : null,
          pan:
            typeof req.body.pan === 'string'
              ? String(req.body.pan).trim().toUpperCase() || null
              : null,
          isMsme:
            req.body.isMsme === true ||
            req.body.isMsme === 'true' ||
            req.body.isMsme === '1' ||
            req.body.isMsme === 1,
          isNonResident:
            req.body.isNonResident === true ||
            req.body.isNonResident === 'true' ||
            req.body.isNonResident === '1' ||
            req.body.isNonResident === 1,
          isRelatedParty:
            req.body.isRelatedParty === true ||
            req.body.isRelatedParty === 'true' ||
            req.body.isRelatedParty === '1' ||
            req.body.isRelatedParty === 1,
          msmeUdyam:
            typeof req.body.msmeUdyam === 'string'
              ? String(req.body.msmeUdyam).trim().toUpperCase() || null
              : null,
          balance: balanceNum,
          balance_type: resolvedBalanceType,
          // SC.1: currency the supplier transacts in
          ...(supplierCurrencyCode ? { currencyCode: supplierCurrencyCode } : {}),
        },
      });
    });

    res.status(201).json({
      success: true,
      message: 'Supplier created successfully',
      data: {
        id: supplier.id,
        supplier_name: supplier.supplier_name,
        supplier_email: supplier.supplier_email,
        supplier_phone: supplier.supplier_phone,
        gstin: supplier.gstin ?? null,
        pan: supplier.pan ?? null,
        isMsme: supplier.isMsme,
        isNonResident: supplier.isNonResident,
        isRelatedParty: supplier.isRelatedParty,
        msmeUdyam: supplier.msmeUdyam ?? null,
        balance: Number(supplier.balance ?? 0),
        balance_type: supplier.balance_type,
        currencyCode: supplier.currencyCode ?? null, // SC.1
        profileImage: buildImageUrl(req, req.file?.path ?? null),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    tryUnlink(req.file?.path);
    console.error('Supplier creation error:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating supplier user',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// -----------------------------------------------------------------------------
// listSuppliers
// -----------------------------------------------------------------------------

export async function listSuppliers(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.SupplierWhereInput = {
      isDeleted: false,
      AND: [supplierTenantOrUserFilter(req)],
    };
    if (search) {
      (where.AND as Prisma.SupplierWhereInput[]).push({
        OR: [
          { supplier_name: { contains: search, mode: 'insensitive' } },
          { supplier_email: { contains: search, mode: 'insensitive' } },
          { supplier_phone: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const [total, rows] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const suppliers = rows.map((s: Supplier) => ({
      id: s.id,
      supplier_name: s.supplier_name,
      supplier_email: s.supplier_email,
      supplier_phone: s.supplier_phone,
      gstin: s.gstin ?? null,
      pan: s.pan ?? null,
      isMsme: s.isMsme,
      isNonResident: s.isNonResident,
      isRelatedParty: s.isRelatedParty,
      msmeUdyam: s.msmeUdyam ?? null,
      balance: Number(s.balance ?? 0),
      balance_type: s.balance_type,
      currencyCode: s.currencyCode ?? null, // SC.1
      profileImage: `${req.protocol}://${req.get('host')}/uploads/default-profile.jpg`,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    res.status(200).json({
      message: 'Suppliers fetched successfully',
      data: {
        suppliers,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    res.status(500).json({
      message: 'Error fetching suppliers',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// -----------------------------------------------------------------------------
// updateSupplier
// -----------------------------------------------------------------------------

export async function updateSupplier(req: Request, res: Response): Promise<void> {
  try {
    const scope = supplierTenantOrUserScope(req);
    const { id } = req.params as { id: string };
    const updates = req.body as Record<string, unknown>;

    const existing = await prisma.supplier.findFirst({
      where: { ...scope, id },
    });

    if (!existing) {
      tryUnlink(req.file?.path);
      res.status(404).json({ message: 'Supplier not found' });
      return;
    }

    // Strip restricted fields.
    const restrictedFields = ['user_type', 'email', '_id', 'id', 'password', 'user_id'];
    for (const field of restrictedFields) {
      if (field in updates) delete updates[field];
    }

    const data: Prisma.SupplierUpdateInput = {};

    if (updates.supplier_name !== undefined) {
      data.supplier_name = updates.supplier_name as string;
    }
    if (updates.supplier_phone !== undefined) {
      data.supplier_phone = (updates.supplier_phone as string) ?? '';
    }
    if (updates.gstin !== undefined) {
      const g = String(updates.gstin ?? '').trim().toUpperCase();
      data.gstin = g || null;
    }
    if (updates.pan !== undefined) {
      const p = String(updates.pan ?? '').trim().toUpperCase();
      data.pan = p || null;
    }
    if (updates.isMsme !== undefined) {
      data.isMsme =
        updates.isMsme === true ||
        updates.isMsme === 'true' ||
        updates.isMsme === '1' ||
        updates.isMsme === 1;
    }
    if (updates.isNonResident !== undefined) {
      data.isNonResident =
        updates.isNonResident === true ||
        updates.isNonResident === 'true' ||
        updates.isNonResident === '1' ||
        updates.isNonResident === 1;
    }
    if (updates.isRelatedParty !== undefined) {
      data.isRelatedParty =
        updates.isRelatedParty === true ||
        updates.isRelatedParty === 'true' ||
        updates.isRelatedParty === '1' ||
        updates.isRelatedParty === 1;
    }
    if (updates.msmeUdyam !== undefined) {
      const u = String(updates.msmeUdyam ?? '').trim().toUpperCase();
      data.msmeUdyam = u || null;
    }
    if (updates.balance !== undefined) {
      const balanceNum = asNumber(updates.balance, 0);
      data.balance = balanceNum;
      if (balanceNum === 0) {
        data.balance_type = null;
      } else if (updates.balance_type !== undefined) {
        data.balance_type = ((updates.balance_type as string) ||
          'credit') as SupplierBalanceType;
      }
    } else if (updates.balance_type !== undefined) {
      data.balance_type = updates.balance_type
        ? ((updates.balance_type as string) as SupplierBalanceType)
        : null;
    }

    if (updates.status !== undefined) {
      data.status = Boolean(updates.status);
    }

    // SC.1: allow updating currencyCode (null clears it back to legacy/unset).
    if (updates.currencyCode !== undefined) {
      (data as Record<string, unknown>)['currencyCode'] =
        typeof updates.currencyCode === 'string' && updates.currencyCode
          ? updates.currencyCode
          : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      return tx.supplier.update({
        where: { id: existing.id },
        data,
      });
    });

    res.status(200).json({
      message: 'Supplier updated successfully',
      data: {
        id: updated.id,
        supplier_name: updated.supplier_name,
        supplier_email: updated.supplier_email,
        supplier_phone: updated.supplier_phone,
        gstin: updated.gstin ?? null,
        pan: updated.pan ?? null,
        isMsme: updated.isMsme,
        isNonResident: updated.isNonResident,
        isRelatedParty: updated.isRelatedParty,
        msmeUdyam: updated.msmeUdyam ?? null,
        balance: Number(updated.balance ?? 0),
        balance_type: updated.balance_type,
        currencyCode: updated.currencyCode ?? null, // SC.1
        profileImage: buildImageUrl(req, req.file?.path ?? null),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    tryUnlink(req.file?.path);
    console.error('Supplier update error:', err);
    res.status(500).json({
      message: 'Error updating supplier',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// -----------------------------------------------------------------------------
// getSupplierById — GET /api/admin/suppliers/:id
// -----------------------------------------------------------------------------

export async function getSupplierById(req: Request, res: Response): Promise<void> {
  try {
    const scope = supplierTenantOrUserScope(req);
    const { id } = req.params as { id: string };

    const s = await prisma.supplier.findFirst({
      where: { ...scope, id },
    });

    if (!s) {
      res.status(404).json({ success: false, message: 'Supplier not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Supplier retrieved successfully',
      data: {
        id: s.id,
        supplier_name: s.supplier_name,
        supplier_email: s.supplier_email,
        supplier_phone: s.supplier_phone,
        gstin: s.gstin ?? null,
        pan: s.pan ?? null,
        isMsme: s.isMsme,
        isNonResident: s.isNonResident,
        isRelatedParty: s.isRelatedParty,
        msmeUdyam: s.msmeUdyam ?? null,
        balance: Number(s.balance ?? 0),
        balance_type: s.balance_type,
        currencyCode: s.currencyCode ?? null,
        profileImage: `${req.protocol}://${req.get('host')}/uploads/default-profile.jpg`,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Supplier fetch error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// -----------------------------------------------------------------------------
// deleteSupplier (soft delete — sets isDeleted: true)
// -----------------------------------------------------------------------------

export async function deleteSupplier(req: Request, res: Response): Promise<void> {
  try {
    const scope = supplierTenantOrUserScope(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.supplier.findFirst({
      where: { ...scope, id },
    });

    if (!existing) {
      res.status(404).json({ message: 'Supplier not found' });
      return;
    }

    const updated = await prisma.supplier.update({
      where: { id: existing.id },
      data: { isDeleted: true },
    });

    res.status(200).json({
      message: 'Supplier deleted successfully',
      data: updated,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    res.status(500).json({
      message: 'Error deleting supplier',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes that still use require().
module.exports = {
  createSupplier,
  listSuppliers,
  getSupplierById,
  updateSupplier,
  deleteSupplier,
};
module.exports.createSupplier = createSupplier;
module.exports.listSuppliers = listSuppliers;
module.exports.getSupplierById = getSupplierById;
module.exports.updateSupplier = updateSupplier;
module.exports.deleteSupplier = deleteSupplier;
