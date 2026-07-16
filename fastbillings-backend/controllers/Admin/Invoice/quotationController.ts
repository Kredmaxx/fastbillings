import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { Quotation, QuotationStatus, Customer } from '@prisma/client';

import { prisma } from '../../../lib/prisma';
import { tenantScope, requireUserId, UnauthorizedError } from '../../../lib/tenantScope';

// C.1: resolve the company default currency code (ISO string).
// Returns null when no default currency is configured (no-op; column stays null).
async function resolveDefaultCurrencyCode(): Promise<string | null> {
  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true, isDeleted: false },
    select: { code: true },
  });
  return defaultCurrency?.code ?? null;
}

// utils/mailer is still JS; static require is fine here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mailerModule: { sendMail: (opts: Record<string, unknown>) => Promise<void> } = require('../../../utils/mailer');

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<QuotationStatus>(['draft', 'sent', 'accepted', 'declined']);

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDecimal(value: unknown, fallback = 0): Prisma.Decimal {
  return new Prisma.Decimal(typeof value === 'number' || typeof value === 'string' ? value : fallback);
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}/`;
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
  discount_type?: string;
  discount_value?: number;
  amount?: number;
}

function normaliseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => ({
    id: item.id,
    name: item.name ?? '',
    unit: item.unit,
    qty: asNumber(item.qty, 0),
    rate: asNumber(item.rate, 0),
    discount: asNumber(item.discount, 0),
    tax: asNumber(item.tax, 0),
    tax_group_id: item.tax_group_id,
    discount_type: item.discount_type,
    discount_value: asNumber(item.discount_value, 0),
    amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
  }));
}

function calcTotals(items: IncomingItem[]): {
  taxable: number;
  discount: number;
  vat: number;
  total: number;
} {
  const taxable = items.reduce((sum, i) => sum + asNumber(i.amount, asNumber(i.rate, 0) * asNumber(i.qty, 0)), 0);
  const discount = items.reduce((sum, i) => sum + asNumber(i.discount, 0), 0);
  const vat = items.reduce((sum, i) => sum + asNumber(i.tax, 0), 0);
  return { taxable, discount, vat, total: taxable };
}

async function generateNextQuotationId(tx: Tx, prefix = 'QT-'): Promise<string> {
  const last = await tx.quotation.findFirst({
    where: { quotationId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { quotationId: true },
  });
  let lastNumber = 0;
  if (last?.quotationId) {
    const match = last.quotationId.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `${prefix}${String(lastNumber + 1).padStart(6, '0')}`;
}

function formatDateLong(date: Date | null | undefined): string | null {
  if (!date) return null;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatDateShort(date: Date | null | undefined): string | null {
  if (!date) return null;
  const day = date.getDate().toString().padStart(2, '0');
  const month = date.toLocaleString('default', { month: 'short' });
  return `${day}, ${month} ${date.getFullYear()}`;
}

// =============================================================================
// createQuotation
// =============================================================================

export async function createQuotation(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const items = normaliseItems(body.items);

    const billFromId = body.billFrom as string;
    const billToId = body.billTo as string;

    const [user, billFrom, billTo] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.user.findUnique({ where: { id: billFromId } }),
      prisma.customer.findUnique({ where: { id: billToId } }),
    ]);

    if (!user) throw new Error('Invalid user ID');
    if (!billFrom || !billTo) throw new Error('Invalid bill from or bill to user ID');

    const signType = (body.sign_type as string) ?? 'none';
    if (!['none', 'digitalSignature', 'eSignature'].includes(signType)) {
      throw new Error('Invalid signature type');
    }
    if (signType === 'eSignature') {
      if (!req.file) throw new Error('Signature image is required for eSignature');
      if (!body.signatureName) throw new Error('Signature name is required for eSignature');
    }

    const totals = calcTotals(items);

    const status = ((body.status as string) ?? 'draft') as QuotationStatus;
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    // C.1: per-document currency — use caller-supplied code or fall back to company default.
    const docCurrencyCode =
      (typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null) ??
      (await resolveDefaultCurrencyCode());

    const quotation = await prisma.$transaction(async (tx) => {
      const quotationId = await generateNextQuotationId(tx);
      return tx.quotation.create({
        data: {
          quotationId,
          customerId: (body.customerId as string) ?? billToId,
          quotationDate: safeDate(body.quotationDate) ?? new Date(),
          expiryDate: safeDate(body.expiryDate),
          referenceNo: (body.referenceNo as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status,
          paymentTerms: (body.paymentTerms as string) ?? '',
          taxableAmount: toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, totals.taxable))),
          totalDiscount: toDecimal(asNumber(body.totalDiscount, totals.discount)),
          vat: toDecimal(asNumber(body.totalTax, asNumber(body.vat, totals.vat))),
          roundOff: Boolean(body.roundOff),
          TotalAmount: toDecimal(asNumber(body.grandTotal, asNumber(body.TotalAmount, totals.total))),
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          sign_type: signType as Quotation['sign_type'],
          signatureId: signType === 'digitalSignature' ? ((body.signatureId as string) || null) : null,
          signatureImage: signType === 'eSignature' && req.file ? req.file.path : null,
          signatureName: signType === 'eSignature' ? ((body.signatureName as string) ?? null) : null,
          userId,
          // FK to User — empty string from the form must become null, not '' (FK violation).
          salesPerson: (body.salesPerson as string) || null,
          billFrom: billFromId,
          billTo: billToId,
          bankId: (body.bank as string) || null,
          convert_type: ((body.convert_type as string) ?? 'quotation') as Quotation['convert_type'],
          // C.1: persist document currency
          ...(docCurrencyCode ? { currencyCode: docCurrencyCode } : {}),
        },
      });
    });

    // Optional email if status is 'sent'
    if (quotation.status === 'sent' && billTo.email && process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      try {
        const fromName = `${billFrom.firstName ?? ''} ${billFrom.lastName ?? ''}`.trim() || 'Your Company';
        await mailerModule.sendMail({
          from: `"${fromName}" <${process.env.SMTP_EMAIL}>`,
          to: billTo.email,
          subject: 'New Quotation Sent',
          html: `
            <h3>Hello ${billTo.name},</h3>
            <p>A new quotation has been sent to you.</p>
            <p><strong>Reference No:</strong> ${quotation.referenceNo}</p>
            <p><strong>Total Amount:</strong> ${quotation.TotalAmount}</p>
            <p><strong>Status:</strong> ${quotation.status}</p>
            <p><strong>Quotation Date:</strong> ${new Date(quotation.quotationDate).toLocaleDateString()}</p>
            <p><strong>Expiry Date:</strong> ${quotation.expiryDate ? new Date(quotation.expiryDate).toLocaleDateString() : ''}</p>
            <br>
            <p>Best Regards,<br>${fromName}</p>
          `,
        });
      } catch (emailErr) {
        console.error('Failed to send quotation email:', emailErr instanceof Error ? emailErr.message : emailErr);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Quotation created successfully',
      data: quotation,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Create quotation error:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating quotation',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getQuotationById
// =============================================================================

export async function getQuotationById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const baseUrl = buildBaseUrl(req);

    const quotation = await prisma.quotation.findFirst({
      where: { id, isDeleted: false },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true, image: true, billingAddress: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true, address: true } },
        billFromUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true, address: true, user_type: true } },
        billToCustomer: { select: { id: true, name: true, email: true, phone: true, image: true, billingAddress: true } },
        signature: { select: { id: true, signatureName: true, signatureImage: true } },
        bank: { select: { id: true, accountHoldername: true, bankName: true, branchName: true, accountNumber: true, IFSCCode: true } },
      },
    });

    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found or unauthorized' });
      return;
    }

    const customer = quotation.customer
      ? {
          id: quotation.customer.id,
          name: quotation.customer.name || '',
          email: quotation.customer.email || null,
          phone: quotation.customer.phone || null,
          image: quotation.customer.image ? `${baseUrl}${quotation.customer.image.replace(/\\/g, '/')}` : '',
          billingAddress: quotation.customer.billingAddress || null,
        }
      : null;

    const billFrom = quotation.billFromUser
      ? {
          id: quotation.billFromUser.id,
          name: `${quotation.billFromUser.firstName || ''} ${quotation.billFromUser.lastName || ''}`.trim(),
          email: quotation.billFromUser.email || null,
          phone: quotation.billFromUser.phone || null,
          profileImage: quotation.billFromUser.profileImage
            ? `${baseUrl}${quotation.billFromUser.profileImage.replace(/\\/g, '/')}`
            : '',
          address: quotation.billFromUser.address || null,
          user_type: quotation.billFromUser.user_type || 1,
        }
      : null;

    const billTo = quotation.billToCustomer
      ? {
          id: quotation.billToCustomer.id,
          name: quotation.billToCustomer.name || '',
          email: quotation.billToCustomer.email || null,
          phone: quotation.billToCustomer.phone || null,
          image: quotation.billToCustomer.image
            ? `${baseUrl}${quotation.billToCustomer.image.replace(/\\/g, '/')}`
            : '',
          billingAddress: quotation.billToCustomer.billingAddress || null,
        }
      : null;

    const bank = quotation.bank
      ? {
          id: quotation.bank.id,
          accountHoldername: quotation.bank.accountHoldername || '',
          bankName: quotation.bank.bankName || '',
          branchName: quotation.bank.branchName || '',
          accountNumber: quotation.bank.accountNumber || '',
          IFSCCode: quotation.bank.IFSCCode || '',
        }
      : null;

    const signatureImage = quotation.signatureImage
      ? `${baseUrl}${quotation.signatureImage.replace(/\\/g, '/')}`
      : null;

    let signature: Record<string, unknown> | null = null;
    if (quotation.sign_type === 'eSignature') {
      signature = { name: quotation.signatureName || null, image: signatureImage };
    } else if (quotation.signature) {
      signature = {
        id: quotation.signature.id,
        name: quotation.signature.signatureName || null,
        image: quotation.signature.signatureImage
          ? `${baseUrl}${quotation.signature.signatureImage.replace(/\\/g, '/')}`
          : null,
      };
    }

    const items = Array.isArray(quotation.items) ? (quotation.items as unknown as (IncomingItem & { productId?: string; productName?: string; totalTax?: number; lineTotal?: number })[]) : [];
    const formattedItems = items.map((item) => ({
      id: item.id ?? item.productId ?? null,
      productId: item.id ?? item.productId ?? null,
      name: item.name || item.productName || '',
      unit: item.unit || '',
      qty: asNumber(item.qty, 0),
      rate: asNumber(item.rate, 0),
      discount: asNumber(item.discount, 0),
      tax: asNumber(item.tax ?? item.totalTax, 0),
      tax_group_id: item.tax_group_id || null,
      discount_type: item.discount_type || 'Fixed',
      discount_value: asNumber(item.discount_value, 0),
      amount: asNumber(item.amount ?? item.lineTotal, 0),
    }));

    res.status(200).json({
      success: true,
      message: 'Quotation retrieved successfully',
      data: {
        id: quotation.id,
        quotationId: quotation.quotationId,
        salesPerson: quotation.salesPerson,
        customer,
        quotationDate: quotation.quotationDate,
        expiryDate: quotation.expiryDate,
        referenceNo: quotation.referenceNo,
        status: quotation.status,
        paymentTerms: quotation.paymentTerms,
        taxableAmount: quotation.taxableAmount,
        totalDiscount: quotation.totalDiscount,
        vat: quotation.vat,
        roundOff: quotation.roundOff,
        TotalAmount: quotation.TotalAmount,
        items: formattedItems,
        billFrom,
        billTo,
        bank,
        notes: quotation.notes,
        termsAndCondition: quotation.termsAndCondition,
        sign_type: quotation.sign_type,
        signature,
        convert_type: quotation.convert_type,
        currencyCode: quotation.currencyCode ?? null, // C.1
        createdAt: formatDateLong(quotation.createdAt),
        updatedAt: formatDateLong(quotation.updatedAt),
      },
    });
  } catch (err) {
    console.error('Get quotation by ID error:', err);
    res.status(500).json({
      success: false,
      message: 'Error retrieving quotation',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateQuotation
// =============================================================================

export async function updateQuotation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: 'Quotation not found' });
      return;
    }

    const data: Prisma.QuotationUpdateInput = {};

    if (body.quotationDate !== undefined) data.quotationDate = safeDate(body.quotationDate) ?? existing.quotationDate;
    if (body.salesPerson !== undefined) {
      if (body.salesPerson) data.salesPersonUser = { connect: { id: body.salesPerson as string } };
      else data.salesPersonUser = { disconnect: true };
    }
    if (body.expiryDate !== undefined) data.expiryDate = safeDate(body.expiryDate);
    if (body.referenceNo !== undefined) data.referenceNo = (body.referenceNo as string) ?? '';
    if (body.status !== undefined) {
      const next = body.status as QuotationStatus;
      if (!VALID_STATUSES.has(next)) {
        res.status(400).json({ message: `Invalid status: ${next}` });
        return;
      }
      data.status = next;
    }
    if (body.paymentTerms !== undefined) data.paymentTerms = (body.paymentTerms as string) ?? '';
    if (body.notes !== undefined) data.notes = (body.notes as string) ?? '';
    if (body.termsAndCondition !== undefined) data.termsAndCondition = (body.termsAndCondition as string) ?? '';
    if (body.sign_type !== undefined) data.sign_type = (body.sign_type as Quotation['sign_type']) ?? 'none';
    if (body.signatureId !== undefined) {
      if (body.signatureId) data.signature = { connect: { id: body.signatureId as string } };
      else data.signature = { disconnect: true };
    }
    if (body.convert_type !== undefined) data.convert_type = (body.convert_type as Quotation['convert_type']) ?? 'quotation';
    if (body.bank !== undefined) {
      if (body.bank) data.bank = { connect: { id: body.bank as string } };
      else data.bank = { disconnect: true };
    }

    if (body.sign_type === 'eSignature' && req.file) {
      data.signatureImage = req.file.path;
      data.signatureName = (body.signatureName as string) ?? null;
    }

    if (body.items !== undefined) {
      const items = normaliseItems(body.items);
      data.items = items as unknown as Prisma.InputJsonValue;
      const totals = calcTotals(items);
      data.taxableAmount = toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, totals.taxable)));
      data.totalDiscount = toDecimal(asNumber(body.totalDiscount, totals.discount));
      data.vat = toDecimal(asNumber(body.totalTax, asNumber(body.vat, totals.vat)));
      data.TotalAmount = toDecimal(asNumber(body.grandTotal, asNumber(body.TotalAmount, totals.total)));
    }

    // C.1: update currencyCode if provided (freely editable on quotations)
    if (body.currencyCode !== undefined) {
      data.currencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null;
    }

    const updated = await prisma.quotation.update({ where: { id }, data });

    res.status(200).json({ message: 'Quotation updated successfully', data: updated });
  } catch (err) {
    console.error('Update quotation error:', err);
    res.status(500).json({ message: 'Error updating quotation', error: err instanceof Error ? err.message : String(err) });
  }
}

// =============================================================================
// deleteQuotation (soft)
// =============================================================================

export async function deleteQuotation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ message: 'Quotation not found' });
      return;
    }
    const updated = await prisma.quotation.update({
      where: { id },
      data: { isDeleted: true },
    });
    res.status(200).json({ message: 'Quotation deleted successfully', data: updated });
  } catch (err) {
    console.error('Delete quotation error:', err);
    res.status(500).json({ message: 'Error deleting quotation', error: err instanceof Error ? err.message : String(err) });
  }
}

// =============================================================================
// listQuotations
// =============================================================================

interface ListQuotationsQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
}

export async function listQuotations(req: Request, res: Response): Promise<void> {
  try {
    const scope = tenantScope(req);
    const { page = '1', limit = '10', status, search = '', customerId, startDate, endDate } =
      req.query as ListQuotationsQuery;
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const where: Prisma.QuotationWhereInput = { ...scope };
    if (status && VALID_STATUSES.has(status as QuotationStatus)) {
      where.status = status as QuotationStatus;
    }
    if (customerId) where.customerId = customerId;
    if (startDate || endDate) {
      where.quotationDate = {};
      if (startDate) (where.quotationDate as Prisma.DateTimeFilter).gte = new Date(startDate);
      if (endDate) (where.quotationDate as Prisma.DateTimeFilter).lte = new Date(endDate);
    }
    if (search) {
      where.OR = [
        { quotationId: { contains: search, mode: 'insensitive' } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const baseUrl = buildBaseUrl(req);

    const [total, rows] = await Promise.all([
      prisma.quotation.count({ where }),
      prisma.quotation.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true, image: true } },
          billToCustomer: { select: { id: true, name: true, email: true, phone: true, image: true, billingAddress: true } },
          signature: { select: { id: true, signatureName: true } },
          bank: { select: { id: true, accountHoldername: true, bankName: true, branchName: true, accountNumber: true, IFSCCode: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    // Next quotationId
    const lastQuotation = await prisma.quotation.findFirst({
      where: { quotationId: { not: null } },
      orderBy: { quotationId: 'desc' },
      select: { quotationId: true },
    });
    let nextQuotationId = 'QT-000001';
    if (lastQuotation?.quotationId) {
      const m = lastQuotation.quotationId.match(/(\D*)(\d+)$/);
      if (m) {
        nextQuotationId = `${m[1]}${String(parseInt(m[2], 10) + 1).padStart(6, '0')}`;
      }
    }

    const formatted = rows.map((quotation) => {
      const customer = quotation.customer
        ? {
            id: quotation.customer.id,
            name: quotation.customer.name || '',
            email: quotation.customer.email || null,
            phone: quotation.customer.phone || null,
            image: quotation.customer.image
              ? `${baseUrl}${quotation.customer.image.replace(/\\/g, '/')}`
              : '',
          }
        : null;
      const billTo = quotation.billToCustomer
        ? {
            id: quotation.billToCustomer.id,
            name: quotation.billToCustomer.name || '',
            email: quotation.billToCustomer.email || null,
            phone: quotation.billToCustomer.phone || null,
            image: quotation.billToCustomer.image
              ? `${baseUrl}${quotation.billToCustomer.image.replace(/\\/g, '/')}`
              : '',
            billingAddress: quotation.billToCustomer.billingAddress || null,
          }
        : null;
      const bank = quotation.bank
        ? {
            accountHoldername: quotation.bank.accountHoldername || '',
            bankName: quotation.bank.bankName || '',
            branchName: quotation.bank.branchName || '',
            accountNumber: quotation.bank.accountNumber || '',
            IFSCCode: quotation.bank.IFSCCode || '',
          }
        : null;
      const signatureImage = quotation.signatureImage
        ? `${baseUrl}${quotation.signatureImage.replace(/\\/g, '/')}`
        : null;
      let signature: Record<string, unknown> | null = null;
      if (quotation.sign_type === 'eSignature') {
        signature = { name: quotation.signatureName || null, image: signatureImage };
      } else if (quotation.signature) {
        signature = { id: quotation.signature.id, name: quotation.signature.signatureName || null };
      }
      const itemsCount = Array.isArray(quotation.items) ? quotation.items.length : 0;
      return {
        id: quotation.id,
        quotationId: quotation.quotationId,
        customer,
        quotationDate: formatDateShort(quotation.quotationDate),
        expiryDate: formatDateShort(quotation.expiryDate),
        referenceNo: quotation.referenceNo,
        status: quotation.status,
        paymentTerms: quotation.paymentTerms,
        taxableAmount: quotation.taxableAmount,
        totalDiscount: quotation.totalDiscount,
        vat: quotation.vat,
        TotalAmount: quotation.TotalAmount,
        itemsCount,
        billFrom: quotation.billFrom,
        billTo,
        bank,
        notes: quotation.notes,
        sign_type: quotation.sign_type,
        signature,
        convert_type: quotation.convert_type,
        invoiceId: quotation.invoiceId ?? null,
        currencyCode: quotation.currencyCode ?? null, // C.1
        createdAt: formatDateShort(quotation.createdAt),
        updatedAt: formatDateShort(quotation.updatedAt),
      };
    });

    res.status(200).json({
      success: true,
      message: 'Quotations retrieved successfully',
      data: {
        quotations: formatted,
        nextQuotationId,
        pagination: {
          total,
          page: pageN,
          limit: limitN,
          totalPages: Math.ceil(total / limitN),
        },
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List quotations error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching quotations',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// listQuotationsMinimal
// =============================================================================

export async function listQuotationsMinimal(req: Request, res: Response): Promise<void> {
  try {
    const scope = tenantScope(req);
    const { search = '' } = req.query as { search?: string };

    const where: Prisma.QuotationWhereInput = { ...scope };
    if (search) {
      where.OR = [
        { quotationId: { contains: search, mode: 'insensitive' } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const quotations = await prisma.quotation.findMany({
      where,
      select: {
        id: true,
        quotationId: true,
        referenceNo: true,
        quotationDate: true,
        status: true,
        TotalAmount: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { quotationDate: 'desc' },
      take: search ? undefined : 20,
    });

    const formatted = quotations.map((q) => ({
      id: q.id,
      quotationId: q.quotationId,
      referenceNo: q.referenceNo,
      quotationDate: q.quotationDate,
      status: q.status,
      totalAmount: q.TotalAmount,
      customer: q.customer ? { id: q.customer.id, name: q.customer.name } : null,
    }));

    res.status(200).json({
      success: true,
      message: search
        ? 'Search results for quotations retrieved successfully'
        : 'Last 20 quotations retrieved successfully',
      data: formatted,
      meta: { count: quotations.length, isSearchResult: Boolean(search) },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List minimal quotations error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching quotations',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getAllCustomers (mounted at /customers-all and /quotations-minimal)
// =============================================================================

interface AllCustomersQuery {
  search?: string;
  status?: string;
}

function formatCustomerSummary(customer: Customer, baseUrl: string) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    status: customer.status,
    image: customer.image ? `${baseUrl}${customer.image.replace(/\\/g, '/')}` : null,
    billingAddress: customer.billingAddress,
    shippingAddress: customer.shippingAddress,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

export async function getAllCustomers(req: Request, res: Response): Promise<void> {
  try {
    const { search = '', status } = req.query as AllCustomersQuery;
    const baseUrl = buildBaseUrl(req);

    const where: Prisma.CustomerWhereInput = { isDeleted: false };
    if (status === 'Active' || status === 'Inactive') where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      message: 'Customers fetched successfully',
      data: {
        customers: customers.map((c) => formatCustomerSummary(c, baseUrl)),
        count: customers.length,
      },
    });
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateQuotationStatus (accepted / declined)
// =============================================================================

export async function updateQuotationStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status?: string };

    if (status !== 'accepted' && status !== 'declined') {
      res.status(400).json({
        success: false,
        message: "Invalid status. Allowed values: 'accepted' or 'declined'.",
      });
      return;
    }

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Quotation not found.' });
      return;
    }

    const updated = await prisma.quotation.update({ where: { id }, data: { status } });

    res.status(200).json({
      success: true,
      message: `Quotation has been ${status}.`,
      data: updated,
    });
  } catch (err) {
    console.error('Error updating quotation status:', err);
    res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// sendQuotationEmailAndUpdateStatus (sets status, sends email)
// =============================================================================

export async function sendQuotationEmailAndUpdateStatus(req: Request, res: Response): Promise<void> {
  try {
    const {
      quotationId,
      to,
      cc,
      subject,
      htmlContent,
      status,
      sendAttachment = false,
    } = req.body as {
      quotationId?: string;
      to?: string;
      cc?: string;
      subject?: string;
      htmlContent?: string;
      status?: string;
      sendAttachment?: boolean;
    };

    if (!quotationId || !to || !subject || !htmlContent || !status) {
      res.status(400).json({ message: 'Required fields missing' });
      return;
    }
    if (status !== 'sent') {
      res.status(400).json({ message: "Invalid status. Allowed values: 'sent'." });
      return;
    }

    const existing = await prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!existing) {
      res.status(404).json({ message: 'Quotation not found' });
      return;
    }

    const updated = await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: 'sent' },
    });

    const companySettings = await prisma.companySettings.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const companyName = companySettings?.companyName || 'Dreams Technogoies';

    const mailOptions: Record<string, unknown> = {
      from: `"${companyName}" <${process.env.SMTP_EMAIL ?? ''}>`,
      to,
      cc: cc || undefined,
      subject,
      html: htmlContent,
    };

    if (sendAttachment) {
      mailOptions.attachments = [
        {
          filename: `Quotation-${quotationId}.pdf`,
          path: `${process.env.QUOTATION_UPLOAD_PATH || './uploads/quotations'}/${quotationId}.pdf`,
        },
      ];
    }

    await mailerModule.sendMail(mailOptions);

    res.status(200).json({
      success: true,
      message: `Quotation ${status} and email sent successfully`,
      data: updated,
    });
  } catch (err) {
    console.error('Failed to send quotation email:', err instanceof Error ? err.message : err);
    res.status(500).json({
      success: false,
      message: 'Failed to send quotation email or update status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  createQuotation,
  getQuotationById,
  updateQuotation,
  deleteQuotation,
  listQuotations,
  listQuotationsMinimal,
  getAllCustomers,
  updateQuotationStatus,
  sendQuotationEmailAndUpdateStatus,
};
module.exports.createQuotation = createQuotation;
module.exports.getQuotationById = getQuotationById;
module.exports.updateQuotation = updateQuotation;
module.exports.deleteQuotation = deleteQuotation;
module.exports.listQuotations = listQuotations;
module.exports.listQuotationsMinimal = listQuotationsMinimal;
module.exports.getAllCustomers = getAllCustomers;
module.exports.updateQuotationStatus = updateQuotationStatus;
module.exports.sendQuotationEmailAndUpdateStatus = sendQuotationEmailAndUpdateStatus;
