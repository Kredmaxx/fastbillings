// controllers/Admin/Purchases/debitNoteController.ts
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { DebitNoteStatus, SignType } from '@prisma/client';
import { validationResult } from 'express-validator';

import { prisma } from '../../../lib/prisma';
import { tenantScope, requireUserId, UnauthorizedError } from '../../../lib/tenantScope';

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
  postDebitNoteIssued,
  reverseDocument,
  type PostingTx,
} from '../../../lib/ledger/ledgerPosting';

// utils/mailer is still JS; static require is fine here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mailerModule: { sendMail: (opts: Record<string, unknown>) => Promise<void> } = require('../../../utils/mailer');

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<DebitNoteStatus>([
  'new',
  'pending',
  'completed',
  'cancelled',
  'partially_paid',
  'paid',
]);

const VALID_SIGN_TYPES = new Set<SignType>(['none', 'digitalSignature', 'eSignature']);

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

function formatDateShort(d: Date | null | undefined): string | null {
  if (!d) return null;
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('default', { month: 'short' });
  return `${day}, ${month} ${d.getFullYear()}`;
}

interface IncomingItem {
  id?: string;
  productId?: string;
  name?: string;
  unit?: string;
  qty?: number;
  quantity?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  amount?: number;
  discount_type?: string;
  discount_value?: number;
  reason?: string;
}

interface StoredItem {
  productId?: string;
  name: string;
  unit: string;
  quantity: number;
  rate: number;
  discount: number;
  tax: number;
  tax_group_id?: string;
  discount_type?: string;
  discount_value: number;
  amount: number;
  reason?: string;
}

function normaliseItems(raw: unknown): StoredItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => {
    const quantity = asNumber(item.qty ?? item.quantity, 0);
    const rate = asNumber(item.rate, 0);
    return {
      productId: item.id ?? item.productId,
      name: item.name ?? '',
      unit: item.unit ?? '',
      quantity,
      rate,
      discount: asNumber(item.discount, 0),
      tax: asNumber(item.tax, 0),
      tax_group_id: item.tax_group_id,
      discount_type: item.discount_type,
      discount_value: asNumber(item.discount_value, 0),
      amount: asNumber(item.amount, rate * quantity),
      reason: item.reason,
    };
  });
}

async function generateNextDebitNoteNumber(tx: Tx): Promise<string> {
  const last = await tx.debitNote.findFirst({
    where: { debitNoteId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { debitNoteId: true },
  });
  let lastNumber = 0;
  if (last?.debitNoteId) {
    const match = last.debitNoteId.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `DN-${String(lastNumber + 1).padStart(6, '0')}`;
}

// =============================================================================
// createDebitNote
// =============================================================================

export async function createDebitNote(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;

    const purchaseId = body.purchaseId as string;
    const billFromId = body.billFrom as string;
    const billToId = body.billTo as string;
    const createdById = (body.createdBy as string) || userId;

    // Validate purchase exists
    const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) {
      res.status(404).json({ message: 'Purchase not found' });
      return;
    }

    // Vendor must exist (the schema declares vendorId as FK to User)
    if (!purchase.vendorId) {
      res.status(422).json({ message: 'Invalid vendor ID from purchase' });
      return;
    }
    const vendor = await prisma.user.findUnique({ where: { id: purchase.vendorId } });
    if (!vendor) {
      res.status(422).json({ message: 'Invalid vendor ID from purchase' });
      return;
    }

    // Validate bill from / bill to users
    const [billFromUser, billToUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: billFromId } }),
      prisma.user.findUnique({ where: { id: billToId } }),
    ]);
    if (!billFromUser || !billToUser) {
      res.status(422).json({ message: 'Invalid bill from or bill to user ID' });
      return;
    }

    // Validate signature type
    const signType = ((body.sign_type as string) ?? 'none') as SignType;
    if (!VALID_SIGN_TYPES.has(signType)) {
      res.status(400).json({ message: 'Invalid signature type' });
      return;
    }
    if (signType === 'eSignature') {
      if (!req.file) {
        res.status(400).json({ message: 'Signature image is required for eSignature' });
        return;
      }
      if (!body.signatureName) {
        res.status(400).json({ message: 'Signature name is required for eSignature' });
        return;
      }
    }

    // Status
    const status = ((body.status as string) ?? 'new') as DebitNoteStatus;
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ message: 'Invalid status' });
      return;
    }

    // Items + amounts
    const items = normaliseItems(body.items);
    const taxableAmount = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
    const totalDiscount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
    const totalTax = items.reduce((sum, item) => sum + (item.tax || 0), 0);
    const totalAmount = taxableAmount + totalTax - totalDiscount;
    const paidAmount = asNumber(body.paidAmount, 0);

    // Final stored amounts (use body overrides if provided)
    const finalTaxable = asNumber(body.subTotal, taxableAmount);
    const finalDiscount = asNumber(body.totalDiscount, totalDiscount);
    const finalTax = asNumber(body.totalTax, totalTax);
    const finalTotal = asNumber(body.grandTotal, totalAmount);

    // C.1: per-document currency — use caller-supplied code or fall back to company default.
    const docCurrencyCode =
      (typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null) ??
      (await resolveDefaultCurrencyCode());

    // Signature image / id
    const signatureImage = signType === 'eSignature' && req.file ? req.file.path : null;
    const signatureName = signType === 'eSignature' ? ((body.signatureName as string) ?? null) : null;
    const signatureId = (body.signatureId as string) || null;

    const debitNote = await prisma.$transaction(async (tx) => {
      const debitNoteNumber = await generateNextDebitNoteNumber(tx);
      const debitNoteDate = safeDate(body.debitNoteDate) ?? new Date();
      const created = await tx.debitNote.create({
        data: {
          debitNoteId: debitNoteNumber,
          purchase: { connect: { id: purchaseId } },
          vendor: { connect: { id: purchase.vendorId as string } },
          debitNoteDate,
          dueDate: debitNoteDate,
          referenceNo: (body.referenceNo as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status,
          paymentMode: body.paymentMode
            ? { connect: { id: body.paymentMode as string } }
            : undefined,
          taxableAmount: toDecimal(finalTaxable),
          totalDiscount: toDecimal(finalDiscount),
          totalTax: toDecimal(finalTax),
          totalAmount: toDecimal(finalTotal),
          paidAmount: toDecimal(paidAmount),
          balanceAmount: toDecimal(0),
          bank: body.bank ? { connect: { id: body.bank as string } } : undefined,
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          sign_type: signType,
          signature: signatureId ? { connect: { id: signatureId } } : undefined,
          signatureImage,
          signatureName,
          checkNumber: (body.checkNumber as string) || null,
          user: { connect: { id: userId } },
          createdByUser: { connect: { id: createdById } },
          billFromUser: { connect: { id: billFromId } },
          billToUser: { connect: { id: billToId } },
          // C.1: persist document currency
          ...(docCurrencyCode ? { currencyCode: docCurrencyCode } : {}),
        },
      });

      // GL posting: compute inventory/expense split from items.
      // Strategy matches purchase controller: inventory-tracked (item_type !== 'Service')
      // → inventoryNet; derive expenseNet = total - tax - inventoryNet as residual so
      // the assertSplit in postDebitNoteIssued always reconciles.
      {
        const total = String(created.totalAmount);
        const tax = String(created.totalTax ?? 0);
        let inventoryNet = new Prisma.Decimal(0);
        for (const item of items) {
          const productId = item.productId;
          if (!productId) continue;
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { item_type: true },
          });
          if (product && product.item_type !== 'Service') {
            inventoryNet = inventoryNet.plus(new Prisma.Decimal(asNumber(item.amount, 0)));
          }
        }
        const totalDec = new Prisma.Decimal(String(created.totalAmount ?? 0));
        const taxDec = new Prisma.Decimal(String(created.totalTax ?? 0));
        const maxNet = totalDec.minus(taxDec);
        const clampedInv = inventoryNet.greaterThan(maxNet) ? maxNet : inventoryNet;
        const expenseNet = maxNet.minus(clampedInv);
        await postDebitNoteIssued(tx as unknown as PostingTx, {
          userId,
          debitNoteId: created.id,
          date: created.debitNoteDate ?? new Date(),
          total,
          tax,
          inventoryNet: clampedInv.toString(),
          expenseNet: expenseNet.toString(),
        });
      }

      return created;
    });

    res.status(201).json({
      message: 'Debit note created successfully',
      data: { debitNote },
    });

    // Optional email (best-effort)
    if (billToUser.email && process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD) {
      try {
        const toName = `${billToUser.firstName ?? ''} ${billToUser.lastName ?? ''}`.trim();
        await mailerModule.sendMail({
          from: `"Your Company" <${process.env.SMTP_EMAIL}>`,
          to: billToUser.email,
          subject: 'New Debit Note Created',
          html: `
            <h3>Hello ${toName},</h3>
            <p>A new debit note has been created for you.</p>
            <p><strong>Reference No:</strong> ${debitNote.referenceNo ?? ''}</p>
            <p><strong>Total Amount:</strong> ${debitNote.totalAmount}</p>
            <p>Debit Note Date: ${new Date(debitNote.debitNoteDate).toLocaleDateString()}</p>
            <br>
            <p>Best Regards,<br>Your Company</p>
          `,
        });
      } catch (emailErr) {
        console.error('Failed to send debit note email:', emailErr instanceof Error ? emailErr.message : emailErr);
      }
    }
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Create debit note error:', err);
    res.status(500).json({
      message: 'Error creating debit note',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getAllDebitNotes
// =============================================================================

interface ListQuery {
  page?: string;
  limit?: string;
  status?: string;
  vendorId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export async function getAllDebitNotes(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      status,
      vendorId,
      startDate,
      endDate,
      search = '',
    } = req.query as ListQuery;

    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const where: Prisma.DebitNoteWhereInput = { isDeleted: false };
    if (status && VALID_STATUSES.has(status as DebitNoteStatus)) {
      where.status = status as DebitNoteStatus;
    }
    if (vendorId) where.vendorId = vendorId;
    if (startDate || endDate) {
      where.debitNoteDate = {};
      if (startDate) (where.debitNoteDate as Prisma.DateTimeFilter).gte = new Date(startDate);
      if (endDate) (where.debitNoteDate as Prisma.DateTimeFilter).lte = new Date(endDate);
    }
    if (search) {
      where.OR = [
        { debitNoteId: { contains: search, mode: 'insensitive' } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { signatureName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.debitNote.count({ where }),
      prisma.debitNote.findMany({
        where,
        include: {
          vendor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true,
            },
          },
          purchase: { select: { id: true, purchaseId: true, purchaseDate: true, totalAmount: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
          approvedByUser: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
          paymentMode: { select: { id: true, name: true, slug: true, status: true } },
        },
        orderBy: { debitNoteDate: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const baseUrl = process.env.BASE_URL || '';

    const formattedDebitNotes = rows.map((note) => {
      const vendor = note.vendor
        ? {
            id: note.vendor.id,
            name: `${note.vendor.firstName || ''} ${note.vendor.lastName || ''}`.trim(),
            email: note.vendor.email || null,
            phone: note.vendor.phone || null,
            profileImage: note.vendor.profileImage ? `${baseUrl}/${note.vendor.profileImage}` : '',
          }
        : null;

      const purchase = note.purchase
        ? {
            id: note.purchase.id,
            purchaseId: note.purchase.purchaseId || null,
            purchaseDate: formatDateShort(note.purchase.purchaseDate),
            totalAmount: Number(note.purchase.totalAmount) || 0,
          }
        : null;

      const createdBy = note.createdByUser
        ? {
            id: note.createdByUser.id,
            name: `${note.createdByUser.firstName || ''} ${note.createdByUser.lastName || ''}`.trim(),
            profileImage: note.createdByUser.profileImage ? `${baseUrl}${note.createdByUser.profileImage}` : null,
          }
        : null;

      const approvedBy = note.approvedByUser
        ? {
            id: note.approvedByUser.id,
            name: `${note.approvedByUser.firstName || ''} ${note.approvedByUser.lastName || ''}`.trim(),
            profileImage: note.approvedByUser.profileImage ? `${baseUrl}${note.approvedByUser.profileImage}` : null,
          }
        : null;

      const paymentMode = note.paymentMode
        ? {
            id: note.paymentMode.id,
            name: note.paymentMode.name,
            slug: note.paymentMode.slug,
            status: note.paymentMode.status,
          }
        : null;

      return {
        id: note.id,
        debitNoteId: note.debitNoteId,
        referenceNo: note.referenceNo || null,
        vendor,
        purchase,
        debitNoteDate: formatDateShort(note.debitNoteDate),
        status: note.status,
        totalAmount: Number(note.totalAmount),
        paidAmount: Number(note.paidAmount ?? 0),
        balanceAmount: Number(note.balanceAmount ?? 0),
        paymentMode,
        sign_type: note.sign_type || 'none',
        signatureName: note.signatureName || null,
        signatureImage: note.signatureImage ? `${baseUrl}${note.signatureImage}` : null,
        notes: note.notes || null,
        currencyCode: note.currencyCode ?? null, // C.1
        createdBy,
        approvedBy,
        createdAt: formatDateShort(note.createdAt),
        updatedAt: formatDateShort(note.updatedAt),
      };
    });

    res.status(200).json({
      success: true,
      message: 'Debit notes retrieved successfully',
      data: {
        debitNotes: formattedDebitNotes,
        pagination: {
          total,
          page: pageN,
          limit: limitN,
          totalPages: Math.ceil(total / limitN),
        },
      },
    });
  } catch (err) {
    console.error('Get all debit notes error:', err);
    res.status(500).json({
      success: false,
      message: 'Error retrieving debit notes',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getDebitNoteById
// =============================================================================

export async function getDebitNoteById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };

    const debitNote = await prisma.debitNote.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        purchase: { select: { id: true, purchaseId: true, purchaseDate: true, totalAmount: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true } },
        approvedByUser: { select: { id: true, firstName: true, lastName: true } },
        bank: { select: { id: true, bankName: true, accountNumber: true, branchName: true } },
        paymentMode: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    if (!debitNote || debitNote.isDeleted) {
      res.status(404).json({ success: false, message: 'Debit note not found' });
      return;
    }

    const baseUrl = process.env.BASE_URL || '';

    const vendor = debitNote.vendor
      ? {
          id: debitNote.vendor.id,
          name: `${debitNote.vendor.firstName || ''} ${debitNote.vendor.lastName || ''}`.trim(),
          email: debitNote.vendor.email || null,
          phone: debitNote.vendor.phone || null,
          address: debitNote.vendor.address || null,
        }
      : null;

    const purchase = debitNote.purchase
      ? {
          id: debitNote.purchase.id,
          purchaseId: debitNote.purchase.purchaseId || null,
          purchaseDate: formatDateShort(debitNote.purchase.purchaseDate),
          totalAmount: Number(debitNote.purchase.totalAmount) || 0,
        }
      : null;

    const bank = debitNote.bank
      ? {
          id: debitNote.bank.id,
          bankName: debitNote.bank.bankName || null,
          accountNumber: debitNote.bank.accountNumber || null,
          branch: debitNote.bank.branchName || null,
        }
      : null;

    const paymentMode = debitNote.paymentMode
      ? {
          id: debitNote.paymentMode.id,
          name: debitNote.paymentMode.name,
          slug: debitNote.paymentMode.slug,
          status: debitNote.paymentMode.status,
        }
      : null;

    const createdBy = debitNote.createdByUser
      ? {
          id: debitNote.createdByUser.id,
          name: `${debitNote.createdByUser.firstName || ''} ${debitNote.createdByUser.lastName || ''}`.trim(),
        }
      : null;

    const approvedBy = debitNote.approvedByUser
      ? {
          id: debitNote.approvedByUser.id,
          name: `${debitNote.approvedByUser.firstName || ''} ${debitNote.approvedByUser.lastName || ''}`.trim(),
        }
      : null;

    const rawItems = Array.isArray(debitNote.items) ? (debitNote.items as unknown as StoredItem[]) : [];
    const items = rawItems.map((item) => ({
      product: item.productId
        ? {
            id: item.productId,
            name: item.name || null,
            sku: null,
            barcode: null,
          }
        : null,
      quantity: item.quantity || 0,
      rate: item.rate || 0,
      discount: item.discount || 0,
      discount_type: item.discount_type || 'Fixed',
      discount_value: item.discount_value || 0,
      tax: item.tax || 0,
      amount: item.amount || 0,
      reason: item.reason || null,
      taxGroup: item.tax_group_id
        ? {
            id: item.tax_group_id,
            name: null,
            rate: 0,
          }
        : null,
    }));

    const formattedDebitNote = {
      id: debitNote.id,
      debitNoteId: debitNote.debitNoteId,
      referenceNo: debitNote.referenceNo || null,
      vendor,
      purchase,
      debitNoteDate: formatDateShort(debitNote.debitNoteDate),
      dueDate: formatDateShort(debitNote.dueDate),
      status: debitNote.status || null,
      taxableAmount: Number(debitNote.taxableAmount) || 0,
      totalDiscount: Number(debitNote.totalDiscount ?? 0),
      totalTax: Number(debitNote.totalTax ?? 0),
      totalAmount: Number(debitNote.totalAmount) || 0,
      paidAmount: Number(debitNote.paidAmount ?? 0),
      balanceAmount: Number(debitNote.balanceAmount ?? 0),
      paymentMode,
      bank,
      notes: debitNote.notes || null,
      termsAndCondition: debitNote.termsAndCondition || null,
      sign_type: debitNote.sign_type || 'none',
      signatureId: debitNote.signatureId || null,
      signatureImage: debitNote.signatureImage ? `${baseUrl}${debitNote.signatureImage}` : null,
      signatureName: debitNote.signatureName || null,
      checkNumber: debitNote.checkNumber || null,
      currencyCode: debitNote.currencyCode ?? null, // C.1
      items,
      createdBy,
      approvedBy,
      createdAt: formatDateShort(debitNote.createdAt),
      updatedAt: formatDateShort(debitNote.updatedAt),
    };

    res.status(200).json({
      success: true,
      message: 'Debit note retrieved successfully',
      data: formattedDebitNote,
    });
  } catch (err) {
    console.error('Get debit note by ID error:', err);
    res.status(500).json({
      success: false,
      message: 'Error retrieving debit note',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateDebitNoteStatus
// =============================================================================

export async function updateDebitNoteStatus(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.debitNote.findUnique({ where: { id } });
    if (!existing || existing.isDeleted) {
      res.status(404).json({ success: false, message: 'Debit note not found' });
      return;
    }

    const status = body.status as DebitNoteStatus;
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    const signType = body.sign_type as SignType | undefined;
    if (signType && !VALID_SIGN_TYPES.has(signType)) {
      res.status(400).json({ success: false, message: 'Invalid signature type' });
      return;
    }

    if (signType === 'eSignature') {
      if (!req.file && !existing.signatureImage) {
        res.status(400).json({ success: false, message: 'Signature image is required for eSignature' });
        return;
      }
      if (!body.signatureName) {
        res.status(400).json({ success: false, message: 'Signature name is required for eSignature' });
        return;
      }
    }

    // Validate approver if requested
    let approvedByConnect: string | undefined;
    if (body.approvedBy || status === ('approved' as unknown as DebitNoteStatus)) {
      const approverId = (body.approvedBy as string) || userId;
      const approver = await prisma.user.findUnique({ where: { id: approverId } });
      if (!approver) {
        res.status(422).json({ success: false, message: 'Invalid approved by user ID' });
        return;
      }
      approvedByConnect = approverId;
    }

    const data: Prisma.DebitNoteUpdateInput = { status };

    if (signType) data.sign_type = signType;
    if (body.signatureName) data.signatureName = body.signatureName as string;
    if (body.signatureId) data.signature = { connect: { id: body.signatureId as string } };
    if (req.file) data.signatureImage = req.file.path;
    if (approvedByConnect) data.approvedByUser = { connect: { id: approvedByConnect } };

    const paidAmount = asNumber(body.paidAmount, 0);
    if (status === 'partially_paid' || status === 'paid') {
      data.paidAmount = toDecimal(paidAmount);
      const total = Number(existing.totalAmount);
      data.balanceAmount = toDecimal(total - paidAmount);
    }

    // C.1: update currencyCode if provided (freely editable on debit notes)
    if (body.currencyCode !== undefined) {
      data.currencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      return tx.debitNote.update({
        where: { id },
        data,
        include: {
          approvedByUser: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });

    const responseData = {
      id: updated.id,
      debitNoteId: updated.debitNoteId,
      status: updated.status,
      approvedBy: updated.approvedByUser
        ? {
            id: updated.approvedByUser.id,
            name: `${updated.approvedByUser.firstName || ''} ${updated.approvedByUser.lastName || ''}`.trim(),
          }
        : null,
      sign_type: updated.sign_type,
      signatureName: updated.signatureName,
      signatureImage: updated.signatureImage
        ? `${process.env.BASE_URL || 'http://127.0.0.1:5000'}/${updated.signatureImage.replace(/\\/g, '/')}`
        : null,
      updatedAt: updated.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Debit note status updated successfully',
      data: responseData,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error updating debit note status:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating debit note status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// deleteDebitNote (soft delete)
// =============================================================================

export async function deleteDebitNote(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.debitNote.findFirst({
      where: { id, userId, isDeleted: false },
    });

    if (!existing) {
      res.status(404).json({ message: 'Debit note not found' });
      return;
    }

    const debitNote = await prisma.$transaction(async (tx) => {
      // GL: reverse the posted issued entry before soft-deleting
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'DebitNote',
        sourceId: id,
        event: 'issued',
      });
      return tx.debitNote.update({
        where: { id },
        data: { isDeleted: true },
      });
    });

    res.status(200).json({
      message: 'Debit note deleted successfully',
      data: debitNote,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Delete debit note error:', err);
    res.status(500).json({
      message: 'Error deleting debit note',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

void tenantScope; // not used directly in this controller; suppresses unused-import warning if any

// CommonJS interop for legacy JS routes
module.exports = {
  createDebitNote,
  getAllDebitNotes,
  getDebitNoteById,
  updateDebitNoteStatus,
  deleteDebitNote,
};
module.exports.createDebitNote = createDebitNote;
module.exports.getAllDebitNotes = getAllDebitNotes;
module.exports.getDebitNoteById = getDebitNoteById;
module.exports.updateDebitNoteStatus = updateDebitNoteStatus;
module.exports.deleteDebitNote = deleteDebitNote;
