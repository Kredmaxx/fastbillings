import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { CreditNoteStatus, CreditNoteRefundMethod, CreditNoteReason } from '@prisma/client';
import { validationResult } from 'express-validator';

import { prisma } from '../../../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../../../lib/tenantScope';

// C.1: resolve the company default currency code (ISO string).
async function resolveDefaultCurrencyCode(): Promise<string | null> {
  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true, isDeleted: false },
    select: { code: true },
  });
  return defaultCurrency?.code ?? null;
}
import { handleLedgerError } from '../../../lib/httpErrors';
import {
  matchingGstTaxSplit,
  postCreditNoteIssued,
  postReturnCogs,
  reverseDocument,
  type PostingTx,
} from '../../../lib/ledger/ledgerPosting';
import { applyReceipt } from '../../../lib/ledger/inventoryCost';
import { ZERO } from '../../../lib/ledger/money';
import { findProductInventory, resolveWarehouseId } from '../../../lib/warehouseStock';
import { applyLineTracking } from '../../../lib/inventoryTracking';
import { companyIsComposition, stripGstFromDocumentItems } from '../../../lib/compositionGuard';
import { attachDualUomToItems, lineStockQty } from '../../../lib/dualUom';

// utils/mailer is still JS; static require is fine here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mailerModule: {
  sendMail: (opts: Record<string, unknown>) => Promise<void>;
  hasEnvSmtpCredentials: () => boolean;
  envSmtpFrom: () => string;
} = require('../../../utils/mailer');

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<CreditNoteStatus>(['PENDING', 'PAID', 'CANCELLED']);

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

function formatDateShort(d: Date | null | undefined): string | null {
  if (!d) return null;
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('default', { month: 'short' });
  return `${day}, ${month} ${d.getFullYear()}`;
}

interface IncomingItem {
  id?: string;
  name?: string;
  unit?: string;
  unitKind?: string;
  secondaryToPrimaryQty?: number | null;
  qtyPrimary?: number;
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  amount?: number;
  discount_type?: string;
  discount_value?: number;
  batchAllocations?: unknown;
  serialNumbers?: unknown;
}

function normaliseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => ({
    id: item.id,
    name: item.name ?? '',
    unit: item.unit ?? '',
    unitKind: item.unitKind,
    secondaryToPrimaryQty: item.secondaryToPrimaryQty ?? null,
    qtyPrimary: item.qtyPrimary,
    qty: asNumber(item.qty, 0),
    rate: asNumber(item.rate, 0),
    discount: asNumber(item.discount, 0),
    tax: asNumber(item.tax, 0),
    tax_group_id: item.tax_group_id,
    amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
    discount_type: item.discount_type,
    discount_value: asNumber(item.discount_value, 0),
    batchAllocations: item.batchAllocations,
    serialNumbers: item.serialNumbers,
  }));
}

async function generateNextCreditNoteNumber(tx: Tx): Promise<string> {
  const last = await tx.creditNote.findFirst({
    where: { creditNoteNumber: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { creditNoteNumber: true },
  });
  let lastNumber = 0;
  if (last?.creditNoteNumber) {
    const match = last.creditNoteNumber.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `CN-${String(lastNumber + 1).padStart(6, '0')}`;
}

// =============================================================================
// createCreditNote
// =============================================================================

export async function createCreditNote(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    let items = normaliseItems(body.items);

    const invoiceId = body.invoiceId as string;
    const billFromId = body.billFrom as string;
    const billToId = body.billTo as string;

    const ownership = tenantOrUserFilter(req);
    const [invoice, billFromUser, billToCustomer] = await Promise.all([
      prisma.invoice.findFirst({ where: { id: invoiceId, isDeleted: false, ...ownership } }),
      prisma.user.findUnique({ where: { id: billFromId } }),
      prisma.customer.findFirst({ where: { id: billToId, isDeleted: false, ...ownership } }),
    ]);

    if (!invoice) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }
    if (!billFromUser) {
      res.status(404).json({ message: 'Bill From user not found' });
      return;
    }
    if (!billToCustomer) {
      res.status(404).json({ message: 'Bill To customer not found' });
      return;
    }

    const signType = (body.sign_type as string) ?? 'none';
    let signatureImage: string | null = null;
    let signatureId: string | null = null;
    if (signType === 'eSignature' && req.file) signatureImage = req.file.path;
    if (signType === 'digitalSignature' && body.signatureId) {
      const sig = await prisma.signature.findFirst({
        where: { id: body.signatureId as string, ...tenantOrUserScope(req) },
      });
      if (!sig) {
        res.status(404).json({ message: 'Digital Signature not found' });
        return;
      }
      signatureId = sig.id;
    }
    const bankId = (body.bank as string) || null;
    if (bankId) {
      const bank = await prisma.bankDetail.findFirst({
        where: { id: bankId, ...tenantOrUserScope(req) },
      });
      if (!bank) {
        res.status(404).json({ message: 'Bank account not found' });
        return;
      }
    }

    const status = ((body.status as string) ?? 'PENDING') as CreditNoteStatus;
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ message: `Invalid status: ${status}` });
      return;
    }

    // C.1: credit note defaults to the related invoice's currency (per spec), then company default.
    const docCurrencyCode =
      (typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null) ??
      invoice.currencyCode ??
      (await resolveDefaultCurrencyCode());

    const tenantId = optionalTenantId(req);
    const isComposition = await companyIsComposition({ userId, tenantId });
    if (isComposition) {
      items = stripGstFromDocumentItems(items);
    }
    items = await attachDualUomToItems(tenantId, items);
    const taxableAmount = asNumber(body.subTotal, asNumber(body.taxableAmount, 0));
    const totalDiscount = asNumber(body.totalDiscount, 0);
    const vat = isComposition ? 0 : asNumber(body.totalTax, asNumber(body.vat, 0));
    const totalAmount = isComposition
      ? Math.max(0, taxableAmount - totalDiscount)
      : asNumber(body.grandTotal, asNumber(body.totalAmount, 0));

    const creditNote = await prisma.$transaction(async (tx) => {
      const creditNoteNumber = await generateNextCreditNoteNumber(tx);
      const created = await tx.creditNote.create({
        data: {
          creditNoteNumber,
          invoiceId,
          customerId: invoice.customerId,
          creditNoteDate: safeDate(body.creditNoteDate) ?? new Date(),
          referenceNo: (body.referenceNo as string) ?? '',
          reason: ((body.reason as string) ?? 'OTHER') as CreditNoteReason,
          description: (body.description as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status,
          refund_method: ((body.refund_method as string) ?? 'CREDIT_TO_ACCOUNT') as CreditNoteRefundMethod,
          taxableAmount: toDecimal(taxableAmount),
          totalAmount: toDecimal(totalAmount),
          vat: toDecimal(vat),
          totalDiscount: toDecimal(totalDiscount),
          roundOff: Boolean(body.roundOff),
          bankId,
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          sign_type: signType as 'none' | 'digitalSignature' | 'eSignature',
          signatureName: signType === 'eSignature' ? ((body.signatureName as string) ?? null) : null,
          signatureImage,
          signatureId,
          billFrom: billFromId,
          billTo: billToId,
          userId,
          tenantId,
          // C.1: persist document currency
          ...(docCurrencyCode ? { currencyCode: docCurrencyCode } : {}),
        },
      });

      // B.4: restock inventory at book cost (current avgCost) and accumulate return COGS.
      // Credit note items use item.id as the product identifier.
      let totalReturnCost = ZERO;
      const warehouseId = await resolveWarehouseId(tx as never, {
        userId,
        tenantId: optionalTenantId(req),
        warehouseId: null,
      });
      for (const item of items) {
        const productId = item.id;
        if (!productId || !item.qty) continue;
        const stockQty = lineStockQty(item);
        const product = tenantId
          ? await tx.product.findFirst({
              where: { id: productId, tenantId },
              select: { item_type: true },
            })
          : null;
        if (!product || product.item_type === 'Service') continue;
        const inv = await findProductInventory(tx as never, { productId, userId, warehouseId });
        if (!inv) continue; // no Inventory row — skip WAC for this item
        // Restock at current average (return comes back at book cost)
        const wac = applyReceipt(
          {
            quantityOnHand: inv.quantityOnHand as Prisma.Decimal,
            avgCost: inv.avgCost as Prisma.Decimal,
          },
          String(stockQty),
          String(inv.avgCost),
        );
        const returnCost = new Prisma.Decimal(String(inv.avgCost)).times(new Prisma.Decimal(stockQty));
        totalReturnCost = totalReturnCost.plus(returnCost);
        await tx.inventory.update({
          where: { id: inv.id },
          data: {
            quantityOnHand: wac.quantityOnHand,
            ...(inv.warehouseId == null ? { warehouseId } : {}),
          },
        });

        await applyLineTracking(tx as never, {
          userId,
          tenantId: optionalTenantId(req),
          productId,
          warehouseId,
          qty: stockQty,
          direction: 'return',
          item: item as unknown as Record<string, unknown>,
          sourceType: 'credit_note',
          sourceId: created.id,
        });
      }

      // GL posting (gated — no-op if ledger not initialised or doc is pre-cutover)
      await postCreditNoteIssued(tx as unknown as PostingTx, {
        userId,
        creditNoteId: created.id,
        date: created.creditNoteDate ?? new Date(),
        total: String(created.totalAmount),
        tax: String(created.vat ?? 0),
        taxSplit: matchingGstTaxSplit(created.items, String(created.vat ?? 0)),
      });
      // B.4: reverse COGS for returned inventory items (Dr INVENTORY / Cr COGS).
      await postReturnCogs(tx as unknown as PostingTx, {
        userId,
        creditNoteId: created.id,
        date: created.creditNoteDate ?? new Date(),
        cost: totalReturnCost.toString(),
      });

      return created;
    });

    res.status(201).json({ message: 'Credit note created successfully', data: creditNote });

    // Optional email (best-effort)
    if (billToCustomer.email && mailerModule.hasEnvSmtpCredentials()) {
      try {
        const fromName = `${billFromUser.firstName ?? ''} ${billFromUser.lastName ?? ''}`.trim() || 'Your Company';
        await mailerModule.sendMail({
          from: `"${fromName}" <${mailerModule.envSmtpFrom()}>`,
          to: billToCustomer.email,
          subject: `Credit Note Issued (Ref: ${creditNote.creditNoteNumber})`,
          html: `
            <h3>Hello ${billToCustomer.name},</h3>
            <p>A new credit note has been issued.</p>
            <p><strong>Credit Note:</strong> ${creditNote.creditNoteNumber}</p>
            <p><strong>Total Amount:</strong> ${creditNote.totalAmount}</p>
            <p><strong>Reason:</strong> ${creditNote.reason}</p>
            <p><strong>Status:</strong> ${creditNote.status}</p>
          `,
          tenantId: creditNote.tenantId ?? optionalTenantId(req),
          userId: creditNote.userId,
        });
      } catch (emailErr) {
        console.error('Credit note email send failed:', emailErr);
      }
    }
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Create credit note error:', err);
    res.status(500).json({ message: 'Error creating credit note', error: err instanceof Error ? err.message : String(err) });
  }
}

// =============================================================================
// getAllCreditNotes
// =============================================================================

interface ListQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  customerId?: string;
  invoiceId?: string;
  startDate?: string;
  endDate?: string;
  refund_method?: string;
}

export async function getAllCreditNotes(req: Request, res: Response): Promise<void> {
  try {
    const { page = '1', limit = '10', status, search = '', customerId, invoiceId, startDate, endDate, refund_method } =
      req.query as ListQuery;
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const where: Prisma.CreditNoteWhereInput = {
      isDeleted: false,
      AND: [tenantOrUserFilter(req)],
    };
    if (status && VALID_STATUSES.has(status as CreditNoteStatus)) where.status = status as CreditNoteStatus;
    if (customerId) where.customerId = customerId;
    if (invoiceId) where.invoiceId = invoiceId;
    if (refund_method) where.refund_method = refund_method as CreditNoteRefundMethod;
    if (startDate || endDate) {
      where.creditNoteDate = {};
      if (startDate) (where.creditNoteDate as Prisma.DateTimeFilter).gte = new Date(startDate);
      if (endDate) (where.creditNoteDate as Prisma.DateTimeFilter).lte = new Date(endDate);
    }
    if (search) {
      (where.AND as Prisma.CreditNoteWhereInput[]).push({
        OR: [
          { creditNoteNumber: { contains: search, mode: 'insensitive' } },
          { referenceNo: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }

    const baseUrl = buildBaseUrl(req);

    const [total, rows] = await Promise.all([
      prisma.creditNote.count({ where }),
      prisma.creditNote.findMany({
        where,
        include: {
          invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, TotalAmount: true, status: true } },
          customer: { select: { id: true, name: true, email: true, phone: true, image: true, billingAddress: true } },
          billFromUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true, address: true } },
          billToCustomer: { select: { id: true, name: true, email: true, phone: true, billingAddress: true, shippingAddress: true, image: true } },
          appliedToInvoiceRel: { select: { id: true, invoiceNumber: true, invoiceDate: true } },
          bank: { select: { id: true, accountHoldername: true, bankName: true, branchName: true, accountNumber: true, IFSCCode: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    // Next credit note number
    const last = await prisma.creditNote.findFirst({
      where: { creditNoteNumber: { not: null } },
      orderBy: { creditNoteNumber: 'desc' },
      select: { creditNoteNumber: true },
    });
    let nextCreditNoteNumber = 'CN-000001';
    if (last?.creditNoteNumber) {
      const m = last.creditNoteNumber.match(/(\D*)(\d+)$/);
      if (m) nextCreditNoteNumber = `${m[1]}${String(parseInt(m[2], 10) + 1).padStart(6, '0')}`;
    }

    const formatted = rows.map((note) => {
      const customer = note.customer
        ? {
            id: note.customer.id,
            name: note.customer.name || '',
            email: note.customer.email || null,
            phone: note.customer.phone || null,
            billingAddress: note.customer.billingAddress || null,
            image: note.customer.image ? `${baseUrl}${note.customer.image.replace(/\\/g, '/')}` : '',
          }
        : null;
      const billFrom = note.billFromUser
        ? {
            id: note.billFromUser.id,
            name: `${note.billFromUser.firstName || ''} ${note.billFromUser.lastName || ''}`.trim(),
            email: note.billFromUser.email || null,
            phone: note.billFromUser.phone || null,
            address: note.billFromUser.address || null,
            image: note.billFromUser.profileImage ? `${baseUrl}${note.billFromUser.profileImage.replace(/\\/g, '/')}` : '',
          }
        : null;
      const billTo = note.billToCustomer
        ? {
            id: note.billToCustomer.id,
            name: note.billToCustomer.name || '',
            email: note.billToCustomer.email || null,
            phone: note.billToCustomer.phone || null,
            billingAddress: note.billToCustomer.billingAddress || null,
            shippingAddress: note.billToCustomer.shippingAddress || null,
            image: note.billToCustomer.image ? `${baseUrl}${note.billToCustomer.image.replace(/\\/g, '/')}` : '',
          }
        : null;
      const invoice = note.invoice
        ? {
            id: note.invoice.id,
            invoiceNumber: note.invoice.invoiceNumber,
            invoiceDate: formatDateShort(note.invoice.invoiceDate),
            totalAmount: note.invoice.TotalAmount,
            status: note.invoice.status,
          }
        : null;
      const appliedToInvoice = note.appliedToInvoiceRel
        ? {
            id: note.appliedToInvoiceRel.id,
            invoiceNumber: note.appliedToInvoiceRel.invoiceNumber,
            invoiceDate: formatDateShort(note.appliedToInvoiceRel.invoiceDate),
          }
        : null;
      const bank = note.bank
        ? {
            accountHoldername: note.bank.accountHoldername || '',
            bankName: note.bank.bankName || '',
            branchName: note.bank.branchName || '',
            accountNumber: note.bank.accountNumber || '',
            IFSCCode: note.bank.IFSCCode || '',
          }
        : null;
      let signature: Record<string, unknown> | null = null;
      if (note.sign_type === 'eSignature') {
        signature = {
          name: note.signatureName || null,
          image: note.signatureImage ? `${baseUrl}${note.signatureImage.replace(/\\/g, '/')}` : null,
        };
      } else if (note.sign_type === 'digitalSignature') {
        signature = { signatureId: note.signatureId || null };
      }
      const itemsCount = Array.isArray(note.items) ? note.items.length : 0;
      return {
        id: note.id,
        creditNoteNumber: note.creditNoteNumber,
        referenceNo: note.referenceNo,
        reason: note.reason,
        description: note.description,
        creditNoteDate: formatDateShort(note.creditNoteDate),
        status: note.status,
        refund_method: note.refund_method,
        taxableAmount: note.taxableAmount,
        totalDiscount: note.totalDiscount,
        vat: note.vat,
        totalAmount: note.totalAmount,
        roundOff: note.roundOff,
        items: note.items,
        itemsCount,
        customer,
        invoice,
        billFrom,
        billTo,
        appliedToInvoice,
        appliedDate: formatDateShort(note.appliedDate),
        bank,
        notes: note.notes,
        termsAndCondition: note.termsAndCondition,
        sign_type: note.sign_type,
        signature,
        currencyCode: note.currencyCode ?? null, // C.1
        createdAt: formatDateShort(note.createdAt),
        updatedAt: formatDateShort(note.updatedAt),
      };
    });

    res.status(200).json({
      success: true,
      message: 'Credit notes retrieved successfully',
      data: {
        creditNotes: formatted,
        nextCreditNoteNumber,
        pagination: {
          total,
          page: pageN,
          limit: limitN,
          totalPages: Math.ceil(total / limitN),
        },
      },
    });
  } catch (err) {
    console.error('List credit notes error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching credit notes',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getCreditNoteById
// =============================================================================

export async function getCreditNoteById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const baseUrl = buildBaseUrl(req);

    const note = await prisma.creditNote.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserFilter(req) },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            invoiceDate: true,
            dueDate: true,
            TotalAmount: true,
            taxableAmount: true,
            vat: true,
            totalDiscount: true,
            items: true,
            status: true,
          },
        },
        customer: { select: { id: true, name: true, email: true, phone: true, billingAddress: true, shippingAddress: true, image: true } },
        billFromUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true, address: true } },
        billToCustomer: { select: { id: true, name: true, email: true, phone: true, billingAddress: true, shippingAddress: true, image: true } },
        appliedToInvoiceRel: { select: { id: true, invoiceNumber: true, invoiceDate: true, TotalAmount: true } },
        bank: { select: { id: true, accountHoldername: true, bankName: true, branchName: true, accountNumber: true, IFSCCode: true } },
        signature: { select: { id: true, signatureName: true, signatureImage: true, createdAt: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    if (!note) {
      res.status(404).json({ success: false, message: 'Credit note not found' });
      return;
    }

    let signature: Record<string, unknown> | null = null;
    if (note.sign_type === 'eSignature') {
      signature = {
        name: note.signatureName || null,
        image: note.signatureImage ? `${baseUrl}${note.signatureImage.replace(/\\/g, '/')}` : null,
      };
    } else if (note.sign_type === 'digitalSignature' && note.signature) {
      signature = {
        id: note.signature.id,
        name: note.signature.signatureName || null,
        image: note.signature.signatureImage ? `${baseUrl}${note.signature.signatureImage.replace(/\\/g, '/')}` : null,
        createdAt: formatDateShort(note.signature.createdAt),
      };
    }

    const response = {
      id: note.id,
      creditNoteNumber: note.creditNoteNumber,
      referenceNo: note.referenceNo,
      reason: note.reason,
      description: note.description,
      creditNoteDate: note.creditNoteDate,
      status: note.status,
      refund_method: note.refund_method,
      taxableAmount: note.taxableAmount,
      totalDiscount: note.totalDiscount,
      vat: note.vat,
      totalAmount: note.totalAmount,
      roundOff: note.roundOff,
      items: note.items,
      itemsCount: Array.isArray(note.items) ? note.items.length : 0,
      customer: note.customer,
      invoice: note.invoice,
      billFrom: note.billFromUser,
      billTo: note.billToCustomer,
      appliedToInvoice: note.appliedToInvoiceRel,
      appliedDate: note.appliedDate,
      bank: note.bank,
      notes: note.notes,
      termsAndCondition: note.termsAndCondition,
      sign_type: note.sign_type,
      signature,
      currencyCode: note.currencyCode ?? null, // C.1
      createdBy: note.user,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };

    res.status(200).json({ success: true, message: 'Credit note retrieved successfully', data: response });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Get credit note by ID error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching credit note details',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateCreditNote
// =============================================================================

export async function updateCreditNote(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const ownership = tenantOrUserFilter(req);
    const existing = await prisma.creditNote.findFirst({
      where: { id, isDeleted: false, ...ownership },
    });
    if (!existing) {
      res.status(404).json({ message: 'Credit Note not found' });
      return;
    }

    if (body.billFrom) {
      const billFromUser = await prisma.user.findUnique({ where: { id: body.billFrom as string } });
      if (!billFromUser) {
        res.status(404).json({ message: 'Bill From user not found' });
        return;
      }
    }
    if (body.billTo) {
      const billToCustomer = await prisma.customer.findFirst({
        where: { id: body.billTo as string, isDeleted: false, ...ownership },
      });
      if (!billToCustomer) {
        res.status(404).json({ message: 'Bill To customer not found' });
        return;
      }
    }

    const data: Prisma.CreditNoteUpdateInput = { user: { connect: { id: userId } } };

    if (body.creditNoteDate !== undefined) data.creditNoteDate = safeDate(body.creditNoteDate) ?? existing.creditNoteDate;
    if (body.referenceNo !== undefined) data.referenceNo = (body.referenceNo as string) ?? existing.referenceNo;
    if (body.reason !== undefined) data.reason = body.reason as CreditNoteReason;
    if (body.description !== undefined) data.description = (body.description as string) ?? existing.description;
    const isComposition = await companyIsComposition({
      userId,
      tenantId: optionalTenantId(req),
    });
    if (body.items !== undefined) {
      let items = normaliseItems(body.items);
      if (isComposition) items = stripGstFromDocumentItems(items);
      items = await attachDualUomToItems(optionalTenantId(req), items);
      data.items = items as unknown as Prisma.InputJsonValue;
    }
    if (body.refund_method !== undefined) data.refund_method = body.refund_method as CreditNoteRefundMethod;
    if (body.subTotal !== undefined || body.taxableAmount !== undefined) {
      data.taxableAmount = toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, 0)));
    }
    if (body.totalDiscount !== undefined) data.totalDiscount = toDecimal(asNumber(body.totalDiscount, 0));
    if (isComposition) {
      data.vat = toDecimal(0);
      if (body.subTotal !== undefined || body.taxableAmount !== undefined || body.totalDiscount !== undefined) {
        const taxable = asNumber(
          body.subTotal,
          asNumber(body.taxableAmount, Number(existing.taxableAmount ?? 0)),
        );
        const discount = asNumber(body.totalDiscount, Number(existing.totalDiscount ?? 0));
        data.totalAmount = toDecimal(Math.max(0, taxable - discount));
      }
    } else {
      if (body.grandTotal !== undefined || body.totalAmount !== undefined) {
        data.totalAmount = toDecimal(asNumber(body.grandTotal, asNumber(body.totalAmount, 0)));
      }
      if (body.totalTax !== undefined || body.vat !== undefined) {
        data.vat = toDecimal(asNumber(body.totalTax, asNumber(body.vat, 0)));
      }
    }
    if (body.roundOff !== undefined) data.roundOff = Boolean(body.roundOff);
    if (body.bank !== undefined) {
      if (body.bank) {
        const bank = await prisma.bankDetail.findFirst({
          where: { id: body.bank as string, ...tenantOrUserScope(req) },
        });
        if (!bank) {
          res.status(404).json({ message: 'Bank account not found' });
          return;
        }
        data.bank = { connect: { id: bank.id } };
      } else {
        data.bank = { disconnect: true };
      }
    }
    if (body.notes !== undefined) data.notes = (body.notes as string) ?? '';
    if (body.termsAndCondition !== undefined) data.termsAndCondition = (body.termsAndCondition as string) ?? '';
    if (body.sign_type !== undefined) data.sign_type = body.sign_type as 'none' | 'digitalSignature' | 'eSignature';
    if (body.billFrom !== undefined) data.billFromUser = { connect: { id: body.billFrom as string } };
    if (body.billTo !== undefined) data.billToCustomer = { connect: { id: body.billTo as string } };
    if (body.status !== undefined) {
      const next = body.status as CreditNoteStatus;
      if (VALID_STATUSES.has(next)) data.status = next;
    }

    if (body.sign_type === 'eSignature' && req.file) {
      data.signatureImage = req.file.path;
      data.signatureName = (body.signatureName as string) ?? null;
      data.signature = { disconnect: true };
    } else if (body.sign_type === 'digitalSignature' && body.signatureId) {
      const sig = await prisma.signature.findFirst({
        where: { id: body.signatureId as string, ...tenantOrUserScope(req) },
      });
      if (!sig) {
        res.status(404).json({ message: 'Digital Signature not found' });
        return;
      }
      data.signature = { connect: { id: sig.id } };
      data.signatureImage = null;
      data.signatureName = null;
    }

    // C.1: update currencyCode if provided (freely editable on credit notes)
    if (body.currencyCode !== undefined) {
      data.currencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.creditNote.update({ where: { id }, data });

      // GL: reverse the prior issued entry then re-post with updated amounts
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'CreditNote',
        sourceId: id,
        event: 'issued',
      });
      await postCreditNoteIssued(tx as unknown as PostingTx, {
        userId,
        creditNoteId: id,
        date: upd.creditNoteDate ?? new Date(),
        total: String(upd.totalAmount),
        tax: String(upd.vat ?? 0),
        taxSplit: matchingGstTaxSplit(upd.items, String(upd.vat ?? 0)),
      });
      // B.4: reverse the prior COGS entry alongside the issued reversal.
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'CreditNote',
        sourceId: id,
        event: 'cogs',
      });
      // B.4: re-post return COGS at current average cost (best-effort; qty not re-adjusted on edit).
      {
        const updatedItems = await attachDualUomToItems(optionalTenantId(req), normaliseItems(upd.items));
        let returnCost = new Prisma.Decimal(0);
        const warehouseId = await resolveWarehouseId(tx as never, {
          userId,
          tenantId: optionalTenantId(req),
          warehouseId: null,
        });
        for (const item of updatedItems) {
          const productId = item.id;
          if (!productId || !item.qty) continue;
          const cnTenantId = optionalTenantId(req);
          const product = cnTenantId
            ? await tx.product.findFirst({
                where: { id: productId, tenantId: cnTenantId },
                select: { item_type: true },
              })
            : null;
          if (!product || product.item_type === 'Service') continue;
          const inv = await findProductInventory(tx as never, { productId, userId, warehouseId });
          if (!inv) continue;
          returnCost = returnCost.plus(
            new Prisma.Decimal(String(inv.avgCost)).times(new Prisma.Decimal(lineStockQty(item))),
          );
        }
        await postReturnCogs(tx as unknown as PostingTx, {
          userId,
          creditNoteId: id,
          date: upd.creditNoteDate ?? new Date(),
          cost: returnCost.toString(),
        });
      }

      return upd;
    });
    res.status(200).json({ message: 'Credit note updated successfully', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Update credit note error:', err);
    res.status(500).json({
      message: 'Error updating credit note',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// deleteCreditNote (HARD delete — matches the JS original)
// =============================================================================

export async function deleteCreditNote(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.creditNote.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserFilter(req) },
    });
    if (!existing) {
      res.status(404).json({ message: 'Credit Note not found' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      // GL: reverse the posted issued entry before hard-deleting
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'CreditNote',
        sourceId: id,
        event: 'issued',
      });
      // B.4: reverse the COGS entry alongside the issued reversal.
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'CreditNote',
        sourceId: id,
        event: 'cogs',
      });
      await tx.creditNote.delete({ where: { id } });
    });
    res.status(200).json({ message: 'Credit note deleted successfully', id });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Delete credit note error:', err);
    res.status(500).json({
      message: 'Error deleting credit note',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  createCreditNote,
  getAllCreditNotes,
  getCreditNoteById,
  updateCreditNote,
  deleteCreditNote,
};
module.exports.createCreditNote = createCreditNote;
module.exports.getAllCreditNotes = getAllCreditNotes;
module.exports.getCreditNoteById = getCreditNoteById;
module.exports.updateCreditNote = updateCreditNote;
module.exports.deleteCreditNote = deleteCreditNote;
