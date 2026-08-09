/**
 * Sales (outward) debit notes — CRUD + ledger post (invoice-like).
 * Increases outward tax/receivable vs an invoice; feeds GSTR-1 CDNR as noteType 'D'.
 */
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { CreditNoteStatus, CreditNoteReason } from '@prisma/client';

import { prisma } from '../../../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../../../lib/tenantScope';
import { handleLedgerError } from '../../../lib/httpErrors';
import {
  matchingGstTaxSplit,
  postSalesDebitNoteIssued,
  reverseDocument,
  type PostingTx,
} from '../../../lib/ledger/ledgerPosting';
import { companyIsComposition, stripGstFromDocumentItems } from '../../../lib/compositionGuard';

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<CreditNoteStatus>(['PENDING', 'PAID', 'CANCELLED']);

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

interface IncomingItem {
  id?: string;
  name?: string;
  unit?: string;
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  amount?: number;
  taxes?: unknown;
}

function normaliseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => ({
    id: item.id,
    name: item.name ?? '',
    unit: item.unit ?? '',
    qty: asNumber(item.qty, 0),
    rate: asNumber(item.rate, 0),
    discount: asNumber(item.discount, 0),
    tax: asNumber(item.tax, 0),
    tax_group_id: item.tax_group_id,
    amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
    taxes: item.taxes,
  }));
}

async function generateNextNumber(tx: Tx, tenantId: string | null, userId: string): Promise<string> {
  const last = await tx.salesDebitNote.findFirst({
    where: {
      debitNoteNumber: { not: null },
      ...(tenantId ? { OR: [{ tenantId }, { userId }] } : { userId }),
    },
    orderBy: { createdAt: 'desc' },
    select: { debitNoteNumber: true },
  });
  let lastNumber = 0;
  if (last?.debitNoteNumber) {
    const match = last.debitNoteNumber.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `SDN-${String(lastNumber + 1).padStart(6, '0')}`;
}

export async function createSalesDebitNote(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    let items = normaliseItems(body.items);

    const invoiceId = body.invoiceId as string;
    if (!invoiceId) {
      res.status(400).json({ success: false, message: 'invoiceId is required' });
      return;
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...tenantOrUserScope(req) },
    });
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const billFrom = (body.billFrom as string) || userId;
    const billTo = (body.billTo as string) || invoice.billTo;
    const customerId = (body.customerId as string) || billTo;

    const customer = await prisma.customer.findFirst({
      where: { id: customerId, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer not found' });
      return;
    }

    const status = ((body.status as string) ?? 'PENDING') as CreditNoteStatus;
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ success: false, message: `Invalid status: ${status}` });
      return;
    }

    const isComposition = await companyIsComposition({ userId, tenantId });
    if (isComposition) {
      items = stripGstFromDocumentItems(items);
    }

    const taxableAmount = asNumber(body.subTotal, asNumber(body.taxableAmount, 0));
    const totalDiscount = asNumber(body.totalDiscount, 0);
    const vat = isComposition ? 0 : asNumber(body.totalTax, asNumber(body.vat, 0));
    const totalAmount = isComposition
      ? Math.max(0, taxableAmount - totalDiscount)
      : asNumber(body.grandTotal, asNumber(body.totalAmount, taxableAmount + vat - totalDiscount));

    const created = await prisma.$transaction(async (tx) => {
      const debitNoteNumber = await generateNextNumber(tx, tenantId, userId);
      const row = await tx.salesDebitNote.create({
        data: {
          debitNoteNumber,
          invoiceId,
          customerId,
          debitNoteDate: safeDate(body.debitNoteDate) ?? new Date(),
          referenceNo: (body.referenceNo as string) ?? '',
          reason: ((body.reason as CreditNoteReason) ?? 'OTHER'),
          description: (body.description as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status,
          taxableAmount: new Prisma.Decimal(taxableAmount),
          totalAmount: new Prisma.Decimal(totalAmount),
          vat: new Prisma.Decimal(vat),
          totalDiscount: new Prisma.Decimal(totalDiscount),
          currencyCode:
            (typeof body.currencyCode === 'string' && body.currencyCode
              ? body.currencyCode
              : null) ?? invoice.currencyCode,
          notes: (body.notes as string) ?? null,
          userId,
          billFrom,
          billTo,
          tenantId,
        },
        include: {
          invoice: { select: { id: true, invoiceNumber: true } },
          billToCustomer: { select: { id: true, name: true, gstin: true } },
        },
      });

      await postSalesDebitNoteIssued(tx as unknown as PostingTx, {
        userId,
        salesDebitNoteId: row.id,
        date: row.debitNoteDate ?? new Date(),
        total: String(row.totalAmount),
        tax: String(row.vat ?? 0),
        taxSplit: matchingGstTaxSplit(row.items, String(row.vat ?? 0)),
      });

      return row;
    });

    res.status(201).json({
      success: true,
      message: 'Sales debit note created',
      data: created,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('createSalesDebitNote error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create sales debit note',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listSalesDebitNotes(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.SalesDebitNoteWhereInput = {
      isDeleted: false,
      ...tenantOrUserScope(req),
    };
    if (req.query.status) {
      where.status = String(req.query.status) as CreditNoteStatus;
    }
    if (req.query.invoiceId) {
      where.invoiceId = String(req.query.invoiceId);
    }
    const search = String(req.query.search ?? '').trim();
    if (search) {
      where.OR = [
        { debitNoteNumber: { contains: search, mode: 'insensitive' } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
        { billToCustomer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.salesDebitNote.count({ where }),
      prisma.salesDebitNote.findMany({
        where,
        include: {
          invoice: { select: { id: true, invoiceNumber: true } },
          billToCustomer: { select: { id: true, name: true, gstin: true } },
        },
        orderBy: { debitNoteDate: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: {
        salesDebitNotes: rows,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('listSalesDebitNotes error:', err);
    res.status(500).json({ success: false, message: 'Failed to list sales debit notes' });
  }
}

export async function getSalesDebitNoteById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const row = await prisma.salesDebitNote.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true } },
        billToCustomer: {
          select: { id: true, name: true, gstin: true, billingAddress: true, email: true },
        },
      },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Sales debit note not found' });
      return;
    }
    res.json({ success: true, data: row });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('getSalesDebitNoteById error:', err);
    res.status(500).json({ success: false, message: 'Failed to load sales debit note' });
  }
}

export async function cancelSalesDebitNote(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.salesDebitNote.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Sales debit note not found' });
      return;
    }
    if (existing.status === 'CANCELLED') {
      res.status(400).json({ success: false, message: 'Already cancelled' });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'SalesDebitNote',
        sourceId: id,
        event: 'issued',
      });
      return tx.salesDebitNote.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });
    });
    res.json({ success: true, message: 'Sales debit note cancelled', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('cancelSalesDebitNote error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel sales debit note' });
  }
}

export async function deleteSalesDebitNote(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.salesDebitNote.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Sales debit note not found' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'SalesDebitNote',
        sourceId: id,
        event: 'issued',
      });
      await tx.salesDebitNote.update({
        where: { id },
        data: { isDeleted: true, status: 'CANCELLED' },
      });
    });
    res.json({ success: true, message: 'Sales debit note deleted' });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('deleteSalesDebitNote error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete sales debit note' });
  }
}

module.exports = {
  createSalesDebitNote,
  listSalesDebitNotes,
  getSalesDebitNoteById,
  cancelSalesDebitNote,
  deleteSalesDebitNote,
};
module.exports.createSalesDebitNote = createSalesDebitNote;
module.exports.listSalesDebitNotes = listSalesDebitNotes;
module.exports.getSalesDebitNoteById = getSalesDebitNoteById;
module.exports.cancelSalesDebitNote = cancelSalesDebitNote;
module.exports.deleteSalesDebitNote = deleteSalesDebitNote;
