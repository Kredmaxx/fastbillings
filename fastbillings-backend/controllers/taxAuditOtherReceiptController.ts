import type { Request, Response } from 'express';
import { IncomeTaxClass, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';

const TAX_CLASSES = new Set<string>(Object.values(IncomeTaxClass));

function money(n: Prisma.Decimal | number): number {
  return Math.round(Number(n) * 100) / 100;
}

function formatRow(r: {
  id: string;
  receiptDate: Date;
  description: string;
  amount: Prisma.Decimal | number;
  taxClass: IncomeTaxClass;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    receiptDate: r.receiptDate.toISOString().slice(0, 10),
    description: r.description,
    amount: money(r.amount),
    taxClass: r.taxClass,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

export async function listTaxAuditOtherReceipts(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const from = req.query.from ? String(req.query.from).slice(0, 10) : null;
    const to = req.query.to ? String(req.query.to).slice(0, 10) : null;

    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
      dateFilter.gte = new Date(`${from}T00:00:00.000Z`);
    }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
      dateFilter.lte = new Date(`${to}T23:59:59.999Z`);
    }

    const rows = await prisma.taxAuditOtherReceipt.findMany({
      where: {
        isDeleted: false,
        ...tenantOrUserScope(req),
        ...(Object.keys(dateFilter).length ? { receiptDate: dateFilter } : {}),
      },
      orderBy: [{ receiptDate: 'asc' }, { createdAt: 'asc' }],
    });

    const total = rows.reduce((s, r) => s + money(r.amount), 0);
    res.json({
      success: true,
      data: {
        notes:
          'Manual other receipts for tax-audit income books worksheet. Not Form 3CD / ITR schedules.',
        summary: { count: rows.length, totalAmount: Math.round(total * 100) / 100 },
        receipts: rows.map(formatRow),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listTaxAuditOtherReceipts error:', err);
    res.status(500).json({ success: false, message: 'Failed to list other receipts' });
  }
}

export async function createTaxAuditOtherReceipt(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const description = String(body.description ?? '').trim();
    if (!description) {
      res.status(400).json({ success: false, message: 'description is required' });
      return;
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ success: false, message: 'amount must be greater than 0' });
      return;
    }
    const receiptDateStr = String(body.receiptDate ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDateStr)) {
      res.status(400).json({ success: false, message: 'receiptDate must be YYYY-MM-DD' });
      return;
    }
    const taxClassRaw = String(body.taxClass ?? 'OTHER').trim().toUpperCase();
    if (!TAX_CLASSES.has(taxClassRaw)) {
      res.status(400).json({
        success: false,
        message: 'taxClass must be BUSINESS, EXEMPT, CAPITAL, OTHER, or UNCLASSIFIED',
      });
      return;
    }

    const created = await prisma.taxAuditOtherReceipt.create({
      data: {
        userId,
        tenantId: optionalTenantId(req),
        receiptDate: new Date(`${receiptDateStr}T00:00:00.000Z`),
        description,
        amount: new Prisma.Decimal(Math.round(amount * 100) / 100),
        taxClass: taxClassRaw as IncomeTaxClass,
        notes: body.notes != null ? String(body.notes).trim() || null : null,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Other receipt recorded',
      data: { receipt: formatRow(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createTaxAuditOtherReceipt error:', err);
    res.status(500).json({ success: false, message: 'Failed to create other receipt' });
  }
}

export async function deleteTaxAuditOtherReceipt(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.taxAuditOtherReceipt.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Receipt not found' });
      return;
    }
    await prisma.taxAuditOtherReceipt.update({
      where: { id },
      data: { isDeleted: true },
    });
    res.json({ success: true, message: 'Receipt deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteTaxAuditOtherReceipt error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete receipt' });
  }
}

const handlers = {
  listTaxAuditOtherReceipts,
  createTaxAuditOtherReceipt,
  deleteTaxAuditOtherReceipt,
};
module.exports = handlers;
module.exports.default = handlers;
