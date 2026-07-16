import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { Invoice, InvoiceStatus } from '@prisma/client';
import { validationResult } from 'express-validator';

// utils/mailer is still JS; static require is fine here.
// eslint-disable-next-line @typescript-eslint/no-require-imports, import/order
const mailerModule: { sendMail: (opts: Record<string, unknown>) => Promise<void> } = require('../../../utils/mailer');

import { prisma } from '../../../lib/prisma';
import {
  tenantEntityScope,
  tenantScope,
  requireTenantId,
  requireUserId,
  UnauthorizedError,
} from '../../../lib/tenantScope';
import { handleLedgerError } from '../../../lib/httpErrors';
import { runRecurringForInvoice } from '../../../lib/recurringInvoiceRunner';
import {
  postInvoiceIssued,
  postInvoicePayment,
  postSaleCogs,
  reverseDocument,
  type PostingTx,
} from '../../../lib/ledger/ledgerPosting';
import { applyIssue } from '../../../lib/ledger/inventoryCost';
import { applyFifoIssue, applyWacIssue } from '../../../lib/ledger/inventoryValuation';
import { ZERO } from '../../../lib/ledger/money';
import { initialApprovalStatus, shouldPostOnCreate } from '../../../lib/ledger/approvals';

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<InvoiceStatus>([
  'DRAFT',
  'UNPAID',
  'SENT',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'PARTIALLY_PAID',
]);

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

interface IncomingItemTax {
  taxRateId?: string;
  name?: string;
  kind?: string | null;
  percent?: number;
  amount?: number;
}

interface IncomingItem {
  id?: string;
  productId?: string;
  name?: string;
  key?: number;
  qty?: number;
  unit?: string;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  amount?: number;
  discount_type?: string;
  discount_value?: number;
  taxes?: IncomingItemTax[];
  totalTax?: number;
}

function normaliseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => ({
    id: item.id ?? item.productId,
    productId: item.productId ?? item.id,
    name: item.name ?? '',
    key: typeof item.key === 'number' ? item.key : 0,
    qty: asNumber(item.qty, 0),
    unit: item.unit,
    rate: asNumber(item.rate, 0),
    discount: asNumber(item.discount, 0),
    tax: asNumber(item.tax, 0),
    tax_group_id: item.tax_group_id,
    amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
    discount_type: item.discount_type,
    discount_value: asNumber(item.discount_value, 0),
    taxes: Array.isArray(item.taxes) ? item.taxes : undefined,
    totalTax: item.totalTax !== undefined ? asNumber(item.totalTax, 0) : undefined,
  }));
}

function calcTotals(items: IncomingItem[]): {
  taxable: number;
  discount: number;
  vat: number;
  total: number;
} {
  const taxable = items.reduce((sum, i) => sum + asNumber(i.rate, 0) * asNumber(i.qty, 0), 0);
  const discount = items.reduce((sum, i) => sum + asNumber(i.discount, 0), 0);
  const vat = items.reduce((sum, i) => sum + asNumber(i.totalTax, asNumber(i.tax, 0)), 0);
  return { taxable, discount, vat, total: taxable + vat - discount };
}

async function generateNextInvoiceNumber(
  tx: Tx,
  tenantId: string,
  invoiceType: 'INVOICE' | 'PROFORMA' = 'INVOICE',
): Promise<string> {
  const settingKey = invoiceType === 'PROFORMA' ? 'proformaPrefix' : 'invoicePrefix';
  const fallbackPrefix = invoiceType === 'PROFORMA' ? 'PRO-' : 'INV-';
  const prefixSetting = await tx.generalSetting.findFirst({ where: { tenantId, key: settingKey } });
  let prefix = fallbackPrefix;
  if (prefixSetting && typeof prefixSetting.value === 'string') prefix = prefixSetting.value;

  const lastInvoice = await tx.invoice.findFirst({
    where: { tenantId, invoiceNumber: { not: null }, invoiceType },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  let lastNumber = 0;
  if (lastInvoice?.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }

  return `${prefix}${String(lastNumber + 1).padStart(6, '0')}`;
}

async function insertCustomFieldValues(
  tx: Tx,
  invoiceId: string,
  userId: string,
  customFieldsRaw: unknown,
  files: Express.Multer.File[],
): Promise<void> {
  let customFields = customFieldsRaw;
  if (typeof customFields === 'string') {
    try {
      customFields = JSON.parse(customFields);
    } catch {
      return;
    }
  }
  if (!Array.isArray(customFields) || customFields.length === 0) return;

  const records: Prisma.CustomFieldValueCreateManyInput[] = customFields.map((field) => {
    const f = field as { fieldId: string; value?: string };
    let value: Prisma.InputJsonValue = f.value ?? '';
    const fileMatch = files.find((file) => file.fieldname === `customField_${f.fieldId}`);
    if (fileMatch) value = fileMatch.path;
    return {
      customFieldId: f.fieldId,
      module: 'invoice',
      recordId: invoiceId,
      value,
      createdBy: userId,
    };
  });

  await tx.customFieldValue.createMany({ data: records });
}

interface CustomerLite {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  gstin?: string | null;
  billingAddress?: Prisma.JsonValue | null;
}

interface UserLite {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  profileImage: string | null;
}

interface BankLite {
  id: string;
  accountHoldername: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  IFSCCode: string;
}

interface SignatureLite {
  id: string;
  signatureName: string;
  signatureImage: string;
}

function formatCustomer(c: CustomerLite | null | undefined, baseUrl: string, withBillingAddress = false) {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name || '',
    email: c.email || null,
    phone: c.phone || null,
    gstin: c.gstin || null,
    image: c.image ? `${baseUrl}${c.image.replace(/\\/g, '/')}` : '',
    ...(withBillingAddress ? { billingAddress: c.billingAddress ?? null } : {}),
  };
}

function formatBillFromUser(u: UserLite | null | undefined, baseUrl: string) {
  if (!u) return null;
  return {
    id: u.id,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    email: u.email || null,
    phone: u.phone || null,
    address: u.address || null,
    image: u.profileImage ? `${baseUrl}${u.profileImage.replace(/\\/g, '/')}` : '',
  };
}

function formatBank(b: BankLite | null | undefined) {
  if (!b) return null;
  return {
    id: b.id,
    accountHoldername: b.accountHoldername || '',
    bankName: b.bankName || '',
    branchName: b.branchName || '',
    accountNumber: b.accountNumber || '',
    IFSCCode: b.IFSCCode || '',
  };
}

function formatSignature(invoice: Invoice & { signature?: SignatureLite | null }, baseUrl: string) {
  if (invoice.sign_type === 'eSignature') {
    return {
      name: invoice.signatureName || null,
      image: invoice.signatureImage
        ? `${baseUrl}${invoice.signatureImage.replace(/\\/g, '/')}`
        : null,
    };
  }
  if (invoice.sign_type === 'digitalSignature' && invoice.signature) {
    return {
      id: invoice.signature.id,
      name: invoice.signature.signatureName || null,
      image: invoice.signature.signatureImage
        ? `${baseUrl}${invoice.signature.signatureImage.replace(/\\/g, '/')}`
        : null,
    };
  }
  return null;
}

function formatDateShort(d: Date | null | undefined): string | null {
  if (!d) return null;
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('default', { month: 'short' });
  return `${day}, ${month} ${d.getFullYear()}`;
}

// =============================================================================
// postInvoiceLedger — shared helper used by createInvoice (when approvalsEnabled=false)
//                     AND approveInvoice (when approvalsEnabled=true).
// Guarantees create/approve posting parity: both paths call this single function.
// =============================================================================

async function postInvoiceLedger(
  tx: Tx,
  invoice: { id: string; invoiceType: string; invoiceDate: Date | null; TotalAmount: Prisma.Decimal; vat: Prisma.Decimal | null; items: Prisma.JsonValue | null; currencyCode?: string | null; exchangeRate?: Prisma.Decimal | null; costCenterId?: string | null; projectId?: string | null },
  userId: string,
  // Pass precomputed totalCogs when already computed by the create path;
  // on the approve path we recompute from the persisted items + current avgCost.
  precomputedCogs?: Prisma.Decimal,
): Promise<void> {
  if (invoice.invoiceType === 'PROFORMA') return;

  const invoiceDate = invoice.invoiceDate ?? new Date();

  // If cogs not precomputed (approve path), recompute from persisted items + current avgCost.
  let totalCogs: Prisma.Decimal;
  if (precomputedCogs !== undefined) {
    totalCogs = precomputedCogs;
  } else {
    totalCogs = ZERO;
    const items = normaliseItems(invoice.items);
    for (const item of items) {
      const productId = item.productId ?? item.id;
      if (!productId || !item.qty) continue;
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { item_type: true },
      });
      if (product?.item_type === 'Service') continue;
      const inv = await tx.inventory.findFirst({
        where: { productId, userId, isDeleted: false },
      });
      if (!inv) continue;
      // Re-read avgCost from current inventory state (same approach as updateInvoice)
      totalCogs = totalCogs.plus(inv.avgCost.times(new Prisma.Decimal(item.qty)));
    }
  }

  // G: pass document currency/rate when present; omitting both falls back to functional path.
  // P3.3: pass dims if present on the document (null/undefined → no-op)
  await postInvoiceIssued(tx as unknown as PostingTx, {
    userId,
    invoiceId: invoice.id,
    date: invoiceDate,
    total: String(invoice.TotalAmount),
    tax: String(invoice.vat ?? 0),
    ...(invoice.currencyCode ? { currencyCode: invoice.currencyCode } : {}),
    ...(invoice.exchangeRate != null ? { exchangeRate: invoice.exchangeRate } : {}),
    ...(invoice.costCenterId !== undefined ? { costCenterId: invoice.costCenterId } : {}),
    ...(invoice.projectId !== undefined ? { projectId: invoice.projectId } : {}),
  });
  // B.4: post COGS (Dr COGS / Cr INVENTORY) — COGS is always functional currency (no FX).
  await postSaleCogs(tx as unknown as PostingTx, {
    userId,
    invoiceId: invoice.id,
    date: invoiceDate,
    cost: totalCogs.toString(),
  });
}

// =============================================================================
// createInvoice
// =============================================================================

export async function createInvoice(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const body = req.body as Record<string, unknown>;
    const items = normaliseItems(body.items);
    const status = (body.status as string)?.toUpperCase() as InvoiceStatus | undefined;
    const incomingNumber = body.invoiceNumber as string | undefined;
    const invoiceType: 'INVOICE' | 'PROFORMA' = (body.invoiceType === 'PROFORMA') ? 'PROFORMA' : 'INVOICE';

    if (incomingNumber) {
      const dup = await prisma.invoice.findFirst({ where: { tenantId, invoiceNumber: incomingNumber } });
      if (dup) {
        res.status(400).json({
          success: false,
          message: `Invoice number ${incomingNumber} already exists`,
          errors: { invoiceNumber: `Invoice number ${incomingNumber} already exists` },
        });
        return;
      }
    }

    const totals = calcTotals(items);
    const finalTaxable = asNumber(body.subTotal, asNumber(body.taxableAmount, totals.taxable));
    const finalTotal = asNumber(body.grandTotal, asNumber(body.TotalAmount, totals.total));
    const finalVat = asNumber(body.totalTax, asNumber(body.vat, totals.vat));
    const finalDiscount = asNumber(body.totalDiscount, totals.discount);

    // G: document currency — optional. Omitting defaults to functional currency (rate 1).
    const docCurrencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : undefined;
    const docExchangeRate = body.exchangeRate != null ? toDecimal(body.exchangeRate) : undefined;

    // P3.3: optional dimension tagging (null/undefined → omitted from create data → no-op)
    const docCostCenterId = typeof body.costCenterId === 'string' && body.costCenterId ? body.costCenterId : null;
    const docProjectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : null;

    // Signature handling
    const signType = (body.sign_type as string) ?? 'none';
    let signatureImage: string | null = null;
    let signatureId: string | null = null;
    let signatureName: string | null = null;
    if (signType === 'eSignature' && req.file) {
      signatureImage = req.file.path;
      signatureName = (body.signatureName as string) ?? null;
    } else if (signType === 'digitalSignature' && body.signatureId) {
      signatureId = body.signatureId as string;
    }

    // Recurring fields
    const isRecurring = Boolean(body.isRecurring);
    const startOn = safeDate(body.startOn) ?? new Date();
    const nextRecurringDate = isRecurring ? startOn : null;

    const invoice = await prisma.$transaction(async (tx) => {
      // Approval gate: read companySettings for this tenant
      const settings = await tx.companySettings.findFirst({ where: { tenantId } });
      const approvalsEnabled = settings?.approvalsEnabled ?? false;

      const created = await tx.invoice.create({
        data: {
          invoiceNumber: incomingNumber ?? (await generateNextInvoiceNumber(tx, tenantId, invoiceType)),
          invoiceType,
          customerId: body.billTo as string,
          invoiceDate: safeDate(body.invoiceDate) ?? new Date(),
          dueDate: safeDate(body.dueDate),
          referenceNo: (body.referenceNo as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status: status ?? 'DRAFT',
          payment_method: (body.payment_method as string) ?? null,
          taxableAmount: toDecimal(finalTaxable),
          TotalAmount: toDecimal(finalTotal),
          vat: toDecimal(finalVat),
          totalDiscount: toDecimal(finalDiscount),
          roundOff: Boolean(body.roundOff),
          bankId: (body.bank as string) || null,
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          isRecurring,
          repeatEvery: isRecurring ? (body.repeatEvery as Invoice['repeatEvery']) : null,
          customIntervalNumber: isRecurring && body.customIntervalNumber !== undefined
            ? Number(body.customIntervalNumber)
            : null,
          customIntervalType: isRecurring
            ? (body.customIntervalType as Invoice['customIntervalType'])
            : null,
          startOn: isRecurring ? startOn : null,
          endsOn: isRecurring ? safeDate(body.endsOn) : null,
          neverExpire: isRecurring ? Boolean(body.neverExpire) : false,
          stopped: isRecurring ? Boolean(body.stopped) : false,
          nextRecurringDate,
          sign_type: signType as Invoice['sign_type'],
          signatureName,
          signatureImage,
          signatureId,
          billFrom: body.billFrom as string,
          billTo: body.billTo as string,
          userId,
          tenantId,
          approvalStatus: initialApprovalStatus(approvalsEnabled),
          // G: persist document currency/rate (null when absent → functional currency)
          ...(docCurrencyCode ? { currencyCode: docCurrencyCode } : {}),
          ...(docExchangeRate !== undefined ? { exchangeRate: docExchangeRate } : {}),
          // P3.3: persist dimension tags (null when absent → unchanged)
          costCenterId: docCostCenterId,
          projectId: docProjectId,
        },
      });

      // Inventory side-effect (skip for PROFORMA — no stock movement until conversion)
      // B.4: accumulate total COGS across all inventory items for GL posting after the loop.
      // P3.5: FIFO products consume from cost layers; WAC products use existing applyIssue.
      //
      // FIFO + approvals documented v1 behaviour:
      //   Layer consumption happens at CREATE time only. If approvalsEnabled is true,
      //   FIFO layer consumption still occurs here (at create). On approve, the same
      //   totalCogs computed here is re-posted (via postInvoiceLedger) — layers are NOT
      //   re-consumed. This avoids double-consumption. The limitation: if approvals are
      //   enabled and an invoice is rejected then re-created, the layers from the first
      //   create are already consumed. This is a documented v1 limitation.
      let totalCogs = ZERO;
      if (invoiceType !== 'PROFORMA') {
        for (const item of items) {
          const productId = item.productId ?? item.id;
          if (!productId || !item.qty) continue;

          // Belt-and-braces: even if an Inventory row exists, never deduct for Service products.
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { item_type: true, valuationMethod: true },
          });
          if (product?.item_type === 'Service') continue;

          const inventory = await tx.inventory.findFirst({
            where: { productId, userId, isDeleted: false },
          });
          if (!inventory || inventory.quantity < item.qty) continue;
          const previousQuantity = inventory.quantity;
          const historyEntry = {
            unitId: item.unit ?? null,
            quantity: previousQuantity,
            notes: `Stock reduced due to Invoice #${created.referenceNo || created.id}`,
            type: 'stock_out',
            adjustment: -item.qty,
            referenceId: created.id,
            referenceType: 'invoice',
            createdBy: userId,
          };
          const existingHistory = Array.isArray(inventory.inventory_history)
            ? (inventory.inventory_history as unknown[])
            : [];

          const isFifo = product?.valuationMethod === 'FIFO';

          if (isFifo) {
            // P3.5 FIFO path: load layers oldest-first, consume, persist updated qtyRemaining.
            const fifoResult = await applyFifoIssue(
              tx as unknown as Parameters<typeof applyFifoIssue>[0],
              {
                userId,
                productId,
                qty: item.qty,
                currentQtyOnHand: inventory.quantityOnHand,
              },
            );
            totalCogs = totalCogs.plus(fifoResult.cogs);
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                quantity: previousQuantity - item.qty,
                quantityOnHand: fifoResult.newQtyOnHand,
                inventory_history: [...existingHistory, historyEntry] as unknown as Prisma.InputJsonValue,
              },
            });
          } else {
            // WAC path (default) — EXISTING applyIssue path UNCHANGED.
            const issue = applyWacIssue(
              { quantityOnHand: inventory.quantityOnHand, avgCost: inventory.avgCost },
              item.qty,
            );
            totalCogs = totalCogs.plus(issue.cogs);
            await tx.inventory.update({
              where: { id: inventory.id },
              data: {
                quantity: previousQuantity - item.qty,
                quantityOnHand: issue.state.quantityOnHand,
                inventory_history: [...existingHistory, historyEntry] as unknown as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      // Auto-create payment row when invoice ships as PAID
      const effectiveStatus = status ?? 'DRAFT';
      let autoPayment: { id: string; amount: Prisma.Decimal } | null = null;
      if (effectiveStatus === 'PAID' && body.payment_method) {
        autoPayment = await tx.invoicePayment.create({
          data: {
            invoiceId: created.id,
            amount: toDecimal(finalTotal),
            paymentModeId: body.payment_method as string,
            bankId: (body.bank as string) ?? '',
            received_on: safeDate(body.payment_date) ?? new Date(),
            notes: (body.payment_notes as string) ?? 'Full payment received upon invoice creation',
            received_by: userId,
          },
        });
      }

      // GL posting — gated by approval status.
      // When approvals are enabled, posting is deferred until approveInvoice fires.
      if (shouldPostOnCreate(approvalsEnabled)) {
        await postInvoiceLedger(tx, created, userId, totalCogs);
        if (autoPayment && invoiceType !== 'PROFORMA') {
          // Resolve payment mode slug to determine CASH vs BANK
          const pmDoc = await tx.paymentMode.findUnique({
            where: { id: body.payment_method as string },
            select: { slug: true },
          });
          await postInvoicePayment(tx as unknown as PostingTx, {
            userId,
            invoiceId: created.id,
            paymentId: autoPayment.id,
            date: safeDate(body.payment_date) ?? new Date(),
            amount: String(autoPayment.amount),
            paymentModeSlug: pmDoc?.slug ?? null,
          });
        }
      }

      // Custom fields
      const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
      await insertCustomFieldValues(tx, created.id, userId, body.customFields, files);

      return created;
    });

    res.status(201).json({
      message: 'Invoice created successfully and inventory updated',
      data: invoice,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Create invoice error:', err);
    res.status(500).json({
      message: 'Error creating invoice',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateInvoiceStatus
// =============================================================================

export async function updateInvoiceStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { invoiceId, status } = req.body as { invoiceId?: string; status?: string };

    if (!invoiceId || !status) {
      res.status(400).json({ message: 'Invoice ID and new status are required' });
      return;
    }

    const upper = status.toUpperCase() as InvoiceStatus;
    if (!VALID_STATUSES.has(upper)) {
      res.status(400).json({ message: `Invalid status: ${status}` });
      return;
    }

    const existing = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!existing) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: upper },
    });

    res.status(200).json({ message: `Invoice status updated to ${status}`, data: updated });
  } catch (err) {
    console.error('Update invoice status error:', err);
    res.status(500).json({
      message: 'Error updating invoice status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// sendInvoiceEmail (mailer call preserved, status flipped to SENT)
// =============================================================================

export async function sendInvoiceEmail(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { invoiceId, to, cc, subject, htmlContent, sendAttachment = false } = req.body as {
      invoiceId?: string;
      to?: string;
      cc?: string;
      subject?: string;
      htmlContent?: string;
      sendAttachment?: boolean;
    };

    if (!invoiceId || !to || !subject || !htmlContent) {
      res.status(400).json({ message: 'Required fields missing' });
      return;
    }

    const companySettings = await prisma.companySettings.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    const companyName = companySettings?.companyName || 'Dreams Technogoies';

    const { sendMail } = mailerModule;

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
          filename: `Invoice-${invoiceId}.pdf`,
          path: `${process.env.INVOICE_UPLOAD_PATH || './uploads/invoices'}/${invoiceId}.pdf`,
        },
      ];
    }

    await sendMail(mailOptions);

    const existing = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!existing) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'SENT' },
    });

    res.status(200).json({
      success: true,
      message: "Invoice email sent and status updated to 'sent'",
      data: updated,
    });
  } catch (err) {
    console.error('Failed to send invoice email:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to send invoice email',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateInvoice
// =============================================================================

export async function updateInvoice(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const { id: invoiceId } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const items = normaliseItems(body.items);

    const existing = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!existing) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }

    if (existing.convertedAt) {
      res.status(400).json({
        success: false,
        message: 'Cannot edit a proforma that has been converted to an invoice',
      });
      return;
    }

    // C.1: paid-invoice currency lock guard.
    // If the caller is trying to change currencyCode on a PAID invoice or one that has payments, reject.
    const incomingCurrencyCode =
      typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : undefined;
    if (
      incomingCurrencyCode !== undefined &&
      incomingCurrencyCode !== (existing.currencyCode ?? undefined)
    ) {
      // Check if PAID status or has payments
      const isPaid = existing.status === 'PAID';
      let hasPayments = false;
      if (!isPaid) {
        const paymentCount = await prisma.invoicePayment.count({ where: { invoiceId } });
        hasPayments = paymentCount > 0;
      }
      if (isPaid || hasPayments) {
        res.status(409).json({
          success: false,
          message: 'Currency cannot be changed on a paid invoice.',
        });
        return;
      }
    }

    const totals = calcTotals(items);
    const finalTaxable = asNumber(body.subTotal, asNumber(body.taxableAmount, totals.taxable));
    const finalTotal = asNumber(body.grandTotal, asNumber(body.TotalAmount, totals.total));
    const finalVat = asNumber(body.totalTax, asNumber(body.vat, totals.vat));
    const finalDiscount = asNumber(body.totalDiscount, totals.discount);

    // Signature handling
    const signType = (body.sign_type as string) ?? existing.sign_type;
    let signatureImage: string | null = existing.signatureImage;
    let signatureName: string | null = existing.signatureName;
    let signatureId: string | null = existing.signatureId;

    if (signType === 'eSignature') {
      if (req.file) signatureImage = req.file.path;
      signatureName = (body.signatureName as string) ?? existing.signatureName;
      signatureId = null;
    } else if (signType === 'digitalSignature') {
      const sigId = body.signatureId as string | undefined;
      if (sigId) {
        const sig = await prisma.signature.findUnique({ where: { id: sigId } });
        if (!sig) {
          res.status(404).json({ message: 'Digital Signature not found' });
          return;
        }
        signatureId = sigId;
        signatureName = null;
        signatureImage = null;
      }
    }

    // Recurring
    const isRecurring = Boolean(body.isRecurring);
    const safeStartOn = safeDate(body.startOn) ?? existing.startOn;
    const safeEndsOn = safeDate(body.endsOn) ?? existing.endsOn;
    const nextRecurringDate = isRecurring
      ? (safeStartOn ?? new Date())
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          ...(body.invoiceType !== undefined
            ? { invoiceType: body.invoiceType as 'INVOICE' | 'PROFORMA' }
            : {}),
          invoiceDate: safeDate(body.invoiceDate) ?? existing.invoiceDate,
          dueDate: safeDate(body.dueDate) ?? existing.dueDate,
          referenceNo: (body.referenceNo as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status: ((body.status as string)?.toUpperCase() as InvoiceStatus) ?? existing.status,
          payment_method: (body.payment_method as string) ?? existing.payment_method,
          taxableAmount: toDecimal(finalTaxable),
          TotalAmount: toDecimal(finalTotal),
          vat: toDecimal(finalVat),
          totalDiscount: toDecimal(finalDiscount),
          roundOff: Boolean(body.roundOff),
          bankId: (body.bank as string) || null,
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          isRecurring,
          repeatEvery: isRecurring ? (body.repeatEvery as Invoice['repeatEvery']) : null,
          customIntervalNumber: isRecurring && body.customIntervalNumber !== undefined
            ? Number(body.customIntervalNumber)
            : null,
          customIntervalType: isRecurring
            ? (body.customIntervalType as Invoice['customIntervalType'])
            : null,
          startOn: isRecurring ? safeStartOn : null,
          endsOn: isRecurring ? safeEndsOn : null,
          neverExpire: isRecurring ? Boolean(body.neverExpire) : false,
          stopped: isRecurring ? Boolean(body.stopped) : false,
          nextRecurringDate,
          sign_type: signType as Invoice['sign_type'],
          signatureName,
          signatureImage,
          signatureId,
          billFrom: body.billFrom as string,
          billTo: body.billTo as string,
          userId,
          tenantId,
          // C.1: persist updated currencyCode when provided and lock guard passed
          ...(incomingCurrencyCode !== undefined ? { currencyCode: incomingCurrencyCode } : {}),
        },
      });

      // GL: reverse prior issued entry and re-post with new amounts
      // (only for non-PROFORMA; PROFORMA invoices never post)
      const updatedInvoiceType = (body.invoiceType as string | undefined) ?? existing.invoiceType;
      if (updatedInvoiceType !== 'PROFORMA') {
        await reverseDocument(tx as unknown as PostingTx, {
          userId,
          sourceType: 'Invoice',
          sourceId: invoiceId,
          event: 'issued',
        });
        await postInvoiceIssued(tx as unknown as PostingTx, {
          userId,
          invoiceId,
          date: updatedInvoice.invoiceDate ?? new Date(),
          total: String(updatedInvoice.TotalAmount),
          tax: String(updatedInvoice.vat ?? 0),
        });
        // B.4: reverse the old COGS entry and re-compute at current averages.
        // WAC is path-dependent so we cannot perfectly restate; best-effort re-post
        // at current Inventory.avgCost for each updated item (known limitation).
        await reverseDocument(tx as unknown as PostingTx, {
          userId,
          sourceType: 'Invoice',
          sourceId: invoiceId,
          event: 'cogs',
        });
        let updateCogs = ZERO;
        const updatedItems = normaliseItems(body.items);
        for (const item of updatedItems) {
          const productId = item.productId ?? item.id;
          if (!productId || !item.qty) continue;
          const product = await tx.product.findUnique({
            where: { id: productId },
            select: { item_type: true },
          });
          if (product?.item_type === 'Service') continue;
          const inv = await tx.inventory.findFirst({ where: { productId, userId, isDeleted: false } });
          if (!inv) continue;
          // Use current avgCost (post-reversal state) for best-effort re-post
          updateCogs = updateCogs.plus(inv.avgCost.times(new Prisma.Decimal(item.qty)));
        }
        await postSaleCogs(tx as unknown as PostingTx, {
          userId,
          invoiceId,
          date: updatedInvoice.invoiceDate ?? new Date(),
          cost: updateCogs.toString(),
        });
      }

      // Custom fields: delete then reinsert
      await tx.customFieldValue.deleteMany({
        where: { module: 'invoice', recordId: invoiceId },
      });
      const files = Array.isArray(req.files) ? (req.files as Express.Multer.File[]) : [];
      await insertCustomFieldValues(tx, invoiceId, userId, body.customFields, files);

      return updatedInvoice;
    });

    res.status(200).json({ message: 'Invoice updated successfully', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Update invoice error:', err);
    res.status(500).json({
      message: 'Error updating invoice',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getInvoice (used by both /:id and the public /details/:id)
// =============================================================================

export async function getInvoice(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const baseUrl = buildBaseUrl(req);
    const tenantId = req.auth?.tenantId;

    const invoice = await prisma.invoice.findFirst({
      where: { id, ...(tenantId ? { tenantId } : {}) },
      include: {
        customer: {
          select: { id: true, name: true, email: true, phone: true, image: true, billingAddress: true, gstin: true },
        },
        billFromUser: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, profileImage: true },
        },
        billToCustomer: {
          select: { id: true, name: true, email: true, phone: true, billingAddress: true, image: true, gstin: true },
        },
        bank: {
          select: { id: true, accountHoldername: true, bankName: true, branchName: true, accountNumber: true, IFSCCode: true },
        },
        signature: {
          select: { id: true, signatureName: true, signatureImage: true },
        },
      },
    });

    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const invoiceModule = await prisma.module.findFirst({ where: { moduleSlug: 'invoices' } });
    let tableFields: { id: string; fieldSlug: string; labelName: string }[] = [];
    if (invoiceModule) {
      tableFields = await prisma.customField.findMany({
        where: { moduleId: invoiceModule.id, deletedAt: null },
        select: { id: true, fieldSlug: true, labelName: true },
      });
    }
    const customValues = await prisma.customFieldValue.findMany({
      where: { module: 'invoice', recordId: invoice.id },
    });
    const customValueMap: Record<string, Prisma.JsonValue> = {};
    customValues.forEach((v) => {
      customValueMap[v.customFieldId] = v.value;
    });
    const customFieldsObject: Record<string, Prisma.JsonValue | null> = {};
    tableFields.forEach((field) => {
      customFieldsObject[field.fieldSlug] = customValueMap[field.id] ?? null;
    });

    const responseData = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      publicViewToken: invoice.publicViewToken,
      publicViewEnabled: invoice.publicViewEnabled,
      customer: formatCustomer(invoice.customer, baseUrl, true),
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      referenceNo: invoice.referenceNo,
      status: invoice.status,
      payment_method: invoice.payment_method,
      taxableAmount: invoice.taxableAmount,
      totalDiscount: invoice.totalDiscount,
      vat: invoice.vat,
      TotalAmount: invoice.TotalAmount,
      roundOff: invoice.roundOff,
      items: invoice.items,
      itemsCount: Array.isArray(invoice.items) ? invoice.items.length : 0,
      billFrom: formatBillFromUser(invoice.billFromUser, baseUrl),
      billTo: formatCustomer(invoice.billToCustomer, baseUrl, true),
      bank: formatBank(invoice.bank),
      notes: invoice.notes,
      termsAndCondition: invoice.termsAndCondition,
      isRecurring: invoice.isRecurring,
      repeatEvery: invoice.isRecurring ? invoice.repeatEvery : null,
      customIntervalNumber: invoice.isRecurring ? invoice.customIntervalNumber : null,
      customIntervalType: invoice.isRecurring ? invoice.customIntervalType : null,
      startOn: invoice.isRecurring ? invoice.startOn : null,
      endsOn: invoice.isRecurring ? invoice.endsOn : null,
      neverExpire: invoice.isRecurring ? invoice.neverExpire : null,
      stopped: invoice.isRecurring ? invoice.stopped : null,
      nextRecurringDate: invoice.isRecurring ? invoice.nextRecurringDate : null,
      sign_type: invoice.sign_type,
      signature: formatSignature(invoice, baseUrl),
      customFields: customFieldsObject,
      currencyCode: invoice.currencyCode ?? null, // C.1
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Invoice retrieved successfully',
      data: responseData,
    });
  } catch (err) {
    console.error('Get invoice error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoice',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getAllInvoices (parent invoices only)
// =============================================================================

// (No-op placeholder removed in favour of buildInvoiceList below.)

interface ListQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
  payment_method?: string;
}

async function buildInvoiceList(
  req: Request,
  res: Response,
  parentClause: Prisma.InvoiceWhereInput,
): Promise<void> {
  const scope = tenantEntityScope(req);
  const { page = '1', limit = '10', status, search = '', customerId, startDate, endDate, payment_method } =
    req.query as ListQuery;
  const pageN = Number(page);
  const limitN = Number(limit);
  const skip = (pageN - 1) * limitN;

  const where: Prisma.InvoiceWhereInput = {
    ...scope,
    ...parentClause,
  };
  if (status && VALID_STATUSES.has(status as InvoiceStatus)) {
    where.status = status as InvoiceStatus;
  }
  if (customerId) where.customerId = customerId;
  if (payment_method) where.payment_method = payment_method;
  const invoiceTypeFilter = req.query.invoiceType as string | undefined;
  if (invoiceTypeFilter === 'INVOICE' || invoiceTypeFilter === 'PROFORMA') {
    where.invoiceType = invoiceTypeFilter;
  }
  if (startDate || endDate) {
    where.invoiceDate = {};
    if (startDate) (where.invoiceDate as Prisma.DateTimeFilter).gte = new Date(startDate);
    if (endDate) (where.invoiceDate as Prisma.DateTimeFilter).lte = new Date(endDate);
  }
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const baseUrl = buildBaseUrl(req);

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true, image: true } },
        billFromUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, profileImage: true } },
        billToCustomer: { select: { id: true, name: true, email: true, phone: true, billingAddress: true, image: true, gstin: true } },
        bank: { select: { id: true, accountHoldername: true, bankName: true, branchName: true, accountNumber: true, IFSCCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitN,
    }),
  ]);

  const invoiceIds = invoices.map((i) => i.id);

  // Custom field setup
  const invoiceModule = await prisma.module.findFirst({ where: { moduleSlug: 'invoices' } });
  let tableFields: { id: string; fieldSlug: string; labelName: string }[] = [];
  if (invoiceModule) {
    tableFields = await prisma.customField.findMany({
      where: { moduleId: invoiceModule.id, showInTable: true, deletedAt: null },
      select: { id: true, fieldSlug: true, labelName: true },
    });
  }
  const customValues = await prisma.customFieldValue.findMany({
    where: { module: 'invoice', recordId: { in: invoiceIds } },
  });
  const customValueMap: Record<string, Record<string, Prisma.JsonValue>> = {};
  for (const v of customValues) {
    if (!customValueMap[v.recordId]) customValueMap[v.recordId] = {};
    customValueMap[v.recordId][v.customFieldId] = v.value;
  }

  // Payment aggregation
  const paymentGroups =
    invoiceIds.length > 0
      ? await prisma.invoicePayment.groupBy({
          by: ['invoiceId'],
          where: { invoiceId: { in: invoiceIds } },
          _sum: { amount: true },
          _max: { received_on: true },
        })
      : [];
  const paymentMap: Record<string, { totalPaid: number; lastPaymentDate: Date | null }> = {};
  for (const p of paymentGroups) {
    paymentMap[p.invoiceId] = {
      totalPaid: Number(p._sum.amount ?? 0),
      lastPaymentDate: p._max.received_on ?? null,
    };
  }

  // Next invoice number
  const lastInvoice = await prisma.invoice.findFirst({
    where: { tenantId: scope.tenantId, invoiceNumber: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });
  let nextInvoiceNumber = 'INV-000001';
  if (lastInvoice?.invoiceNumber) {
    const m = lastInvoice.invoiceNumber.match(/(\D*)(\d+)$/);
    if (m) {
      nextInvoiceNumber = `${m[1]}${String(parseInt(m[2], 10) + 1).padStart(6, '0')}`;
    }
  }

  const formatted = invoices.map((invoice) => {
    const totalPaidInfo = paymentMap[invoice.id] ?? { totalPaid: 0, lastPaymentDate: null };
    const customFieldsObject: Record<string, Prisma.JsonValue | null> = {};
    const invoiceValues = customValueMap[invoice.id] ?? {};
    tableFields.forEach((f) => {
      customFieldsObject[f.fieldSlug] = invoiceValues[f.id] ?? null;
    });
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      convertedFromId: invoice.convertedFromId,
      convertedAt: invoice.convertedAt ? invoice.convertedAt.toISOString() : null,
      publicViewToken: invoice.publicViewToken,
      publicViewEnabled: invoice.publicViewEnabled,
      customer: formatCustomer(invoice.customer, baseUrl),
      invoiceDate: formatDateShort(invoice.invoiceDate),
      dueDate: formatDateShort(invoice.dueDate),
      referenceNo: invoice.referenceNo,
      status: invoice.status,
      payment_method: invoice.payment_method,
      taxableAmount: invoice.taxableAmount,
      totalDiscount: invoice.totalDiscount,
      vat: invoice.vat,
      TotalAmount: invoice.TotalAmount,
      roundOff: invoice.roundOff,
      totalPaid: totalPaidInfo.totalPaid,
      remainingBalance: Number(invoice.TotalAmount) - totalPaidInfo.totalPaid,
      lastPaymentDate: formatDateShort(totalPaidInfo.lastPaymentDate),
      items: invoice.items,
      itemsCount: Array.isArray(invoice.items) ? invoice.items.length : 0,
      billFrom: formatBillFromUser(invoice.billFromUser, baseUrl),
      billTo: formatCustomer(invoice.billToCustomer, baseUrl, true),
      bank: formatBank(invoice.bank),
      notes: invoice.notes,
      termsAndCondition: invoice.termsAndCondition,
      isRecurring: invoice.isRecurring,
      sign_type: invoice.sign_type,
      signature: invoice.sign_type === 'eSignature'
        ? { name: invoice.signatureName, image: invoice.signatureImage ? `${baseUrl}${invoice.signatureImage.replace(/\\/g, '/')}` : null }
        : null,
      customFields: customFieldsObject,
      currencyCode: invoice.currencyCode ?? null, // C.1
      createdAt: formatDateShort(invoice.createdAt),
      updatedAt: formatDateShort(invoice.updatedAt),
    };
  });

  res.status(200).json({
    success: true,
    message: 'Invoices retrieved successfully',
    data: {
      invoices: formatted,
      nextInvoiceNumber,
      pagination: {
        total,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(total / limitN),
      },
    },
  });
}

export async function getAllInvoices(req: Request, res: Response): Promise<void> {
  try {
    await buildInvoiceList(req, res, { parentInvoice: null, isDeleted: false });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List invoices error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getChildInvoices(req: Request, res: Response): Promise<void> {
  try {
    await buildInvoiceList(req, res, { parentInvoice: { not: null }, isDeleted: false });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List child invoices error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getNextInvoiceNumber
// =============================================================================

export async function getNextInvoiceNumber(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const [prefixSetting, typeSetting] = await Promise.all([
      prisma.generalSetting.findFirst({ where: { tenantId, key: 'invoicePrefix' } }),
      prisma.generalSetting.findFirst({ where: { tenantId, key: 'invoiceNumberType' } }),
    ]);

    const invoicePrefix =
      prefixSetting?.value && typeof prefixSetting.value === 'string'
        ? prefixSetting.value
        : 'INV_';
    const invoiceNumberType =
      typeSetting?.value && typeof typeSetting.value === 'string' ? typeSetting.value : 'auto';

    const lastInvoice = await prisma.invoice.findFirst({
      where: { tenantId, invoiceNumber: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    let lastNumber = 0;
    if (lastInvoice?.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/\d+$/);
      if (match) lastNumber = parseInt(match[0], 10);
    }
    const nextInvoiceNumber = `${invoicePrefix}${String(lastNumber + 1).padStart(6, '0')}`;

    res.status(200).json({
      success: true,
      message: 'Next invoice number fetched successfully',
      data: { invoicePrefix, invoiceNumberType, nextInvoiceNumber },
    });
  } catch (err) {
    console.error('Error fetching next invoice number:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching next invoice number',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// listInvoicesMinimal / listInvoicesMinimalWithoutChallan
// =============================================================================

async function buildMinimalList(
  req: Request,
  res: Response,
  excludeIds: string[],
  notFoundMessage: string,
  foundMessage: string,
): Promise<void> {
  const scope = tenantEntityScope(req);
  const { search = '' } = (req.body ?? {}) as { search?: string };

  const where: Prisma.InvoiceWhereInput = {
    ...scope,
    id: excludeIds.length > 0 ? { notIn: excludeIds } : undefined,
  };
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    select: {
      id: true,
      invoiceNumber: true,
      referenceNo: true,
      invoiceDate: true,
      status: true,
      TotalAmount: true,
      customer: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: search ? undefined : 20,
  });

  const ids = invoices.map((i) => i.id);
  const paymentGroups =
    ids.length > 0
      ? await prisma.invoicePayment.groupBy({
          by: ['invoiceId'],
          where: { invoiceId: { in: ids } },
          _sum: { amount: true },
        })
      : [];
  const paymentMap: Record<string, number> = {};
  for (const p of paymentGroups) {
    paymentMap[p.invoiceId] = Number(p._sum.amount ?? 0);
  }

  const formatted = invoices.map((invoice) => {
    const totalPaid = paymentMap[invoice.id] ?? 0;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      referenceNo: invoice.referenceNo,
      invoiceDate: invoice.invoiceDate,
      status: invoice.status,
      totalAmount: invoice.TotalAmount,
      customer: invoice.customer ? { id: invoice.customer.id, name: invoice.customer.name } : null,
      payment: {
        totalPaid,
        remaining: Number(invoice.TotalAmount) - totalPaid,
      },
    };
  });

  res.status(200).json({
    success: true,
    message: search ? foundMessage : notFoundMessage,
    data: formatted,
    meta: { count: invoices.length, isSearchResult: Boolean(search) },
  });
}

export async function listInvoicesMinimal(req: Request, res: Response): Promise<void> {
  try {
    const creditNoteRows = await prisma.creditNote.findMany({
      where: { isDeleted: false },
      select: { invoiceId: true },
    });
    const excludeIds = creditNoteRows.map((r) => r.invoiceId);
    await buildMinimalList(
      req,
      res,
      excludeIds,
      'Last 20 invoices without credit notes retrieved successfully',
      'Search results for invoices without credit notes retrieved successfully',
    );
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List minimal invoices error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listInvoicesMinimalWithoutChallan(req: Request, res: Response): Promise<void> {
  try {
    const challanRows = await prisma.deliveryChallan.findMany({
      where: { isDeleted: false, invoiceId: { not: null } },
      select: { invoiceId: true },
    });
    const excludeIds = challanRows.map((r) => r.invoiceId).filter((v): v is string => Boolean(v));
    await buildMinimalList(
      req,
      res,
      excludeIds,
      'Last 20 invoices without credit notes and challans retrieved successfully',
      'Search results for invoices without credit notes and challans retrieved successfully',
    );
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List invoices without challans error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoices without challans',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getInvoicePaymentDetails
// =============================================================================

export async function getInvoicePaymentDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };

    const invoice = await prisma.invoice.findFirst({
      where: { id, isDeleted: false },
      select: {
        id: true,
        invoiceNumber: true,
        referenceNo: true,
        invoiceDate: true,
        status: true,
        TotalAmount: true,
        customer: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found or has been deleted' });
      return;
    }

    const paymentModes = await prisma.paymentMode.findMany({
      where: { status: true },
      select: { id: true, name: true, slug: true, status: true },
    });

    const paymentAgg = await prisma.invoicePayment.aggregate({
      where: { invoiceId: id },
      _sum: { amount: true },
      _count: { _all: true },
    });
    const totalPaid = Number(paymentAgg._sum.amount ?? 0);
    const paymentCount = paymentAgg._count._all;

    res.status(200).json({
      success: true,
      message: 'Invoice minimal details retrieved successfully',
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        referenceNo: invoice.referenceNo,
        invoiceDate: invoice.invoiceDate,
        status: invoice.status,
        totalAmount: invoice.TotalAmount,
        customer: invoice.customer
          ? {
              id: invoice.customer.id,
              name: invoice.customer.name,
              email: invoice.customer.email || null,
              phone: invoice.customer.phone || null,
            }
          : null,
        payment: {
          totalPaid,
          remaining: Number(invoice.TotalAmount) - totalPaid,
          paymentCount,
          isFullyPaid: totalPaid >= Number(invoice.TotalAmount),
          isPartiallyPaid: totalPaid > 0 && totalPaid < Number(invoice.TotalAmount),
        },
        paymentMethods: paymentModes,
      },
      paymentModes,
    });
  } catch (err) {
    console.error('Get invoice minimal error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching invoice details',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// deleteInvoice (soft)
// =============================================================================

export async function deleteInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ message: 'Invoice not found' });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      // GL: reverse any posted issued entry for this invoice (no-op if none / ledger off)
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'Invoice',
        sourceId: id,
        event: 'issued',
      });
      // B.4: reverse the COGS entry alongside the issued entry.
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'Invoice',
        sourceId: id,
        event: 'cogs',
      });
      return tx.invoice.update({
        where: { id },
        data: { isDeleted: true },
      });
    });
    res.status(200).json({ message: 'Invoice deleted successfully', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Delete invoice error:', err);
    res.status(500).json({
      message: 'Error deleting invoice',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// convertQuotationToInvoice
// =============================================================================

export async function convertQuotationToInvoice(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { quotationId } = req.params as { quotationId: string };

    const invoice = await prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({ where: { id: quotationId } });
      if (!quotation) throw new Error('Quotation not found');
      if (quotation.invoiceId) throw new Error('Quotation already converted to invoice');

      const invoiceNumber = await generateNextInvoiceNumber(tx, tenantId, 'INVOICE');

      // Ledger: DRAFT invoices are not posted to the GL until issued (see createInvoice gate).
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: quotation.customerId ?? quotation.userId,
          invoiceDate: new Date(),
          dueDate: quotation.expiryDate,
          referenceNo: quotation.referenceNo ?? '',
          items: quotation.items ?? Prisma.JsonNull,
          status: 'DRAFT',
          taxableAmount: quotation.taxableAmount,
          TotalAmount: quotation.TotalAmount,
          vat: quotation.vat,
          totalDiscount: quotation.totalDiscount,
          roundOff: quotation.roundOff,
          bankId: quotation.bankId,
          notes: quotation.notes,
          termsAndCondition: quotation.termsAndCondition,
          sign_type: quotation.sign_type,
          signatureName: quotation.sign_type === 'eSignature' ? quotation.signatureName : null,
          signatureImage: quotation.signatureImage,
          signatureId: quotation.sign_type === 'digitalSignature' ? quotation.signatureId : null,
          billFrom: quotation.billFrom,
          billTo: quotation.billTo,
          userId: quotation.userId,
          tenantId,
        },
      });

      await tx.quotation.update({
        where: { id: quotation.id },
        data: { invoiceId: created.id },
      });

      return created;
    });

    res.status(201).json({
      message: 'Quotation converted to invoice successfully',
      data: invoice,
    });
  } catch (err) {
    console.error('Convert quotation error:', err);
    res.status(500).json({
      message: 'Error converting quotation to invoice',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// recordInvoicePayment
// =============================================================================

export async function recordInvoicePayment(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const { amount, payment_method, received_on, invoiceId, notes, bankId } = req.body as {
      amount?: number;
      payment_method?: string;
      received_on?: string;
      invoiceId?: string;
      notes?: string;
      bankId?: string;
    };
    // G: payment-date currency/rate (optional — absent → functional path)
    const body = req.body as Record<string, unknown>;
    const pmtCurrencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : undefined;
    const pmtExchangeRate = body.exchangeRate != null ? toDecimal(body.exchangeRate) : undefined;

    if (!amount || amount <= 0) {
      res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: { amount: 'Invalid payment amount.' },
      });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId } });
      if (!invoice) throw new Error('INVOICE_NOT_FOUND');
      if (invoice.status === 'PAID') throw new Error('INVOICE_ALREADY_PAID');

      const totalPaidAgg = await tx.invoicePayment.aggregate({
        where: { invoiceId: invoice.id },
        _sum: { amount: true },
      });
      const alreadyPaid = Number(totalPaidAgg._sum.amount ?? 0);
      const remainingBalance = Number(invoice.TotalAmount) - alreadyPaid;

      if (amount > remainingBalance) {
        throw new Error(`PAYMENT_EXCEEDS:${remainingBalance}`);
      }

      const bank = await tx.bankDetail.findUnique({ where: { id: bankId } });
      if (!bank) throw new Error('BANK_NOT_FOUND');

      const paymentModeDoc = await tx.paymentMode.findUnique({ where: { id: payment_method } });
      if (!paymentModeDoc) throw new Error('PAYMENT_MODE_NOT_FOUND');

      const transactionType =
        paymentModeDoc.slug?.toLowerCase() === 'cash' ? 'DEPOSIT' : 'TRANSFER_IN';

      const balanceBefore = Number(bank.currentBalance ?? 0);
      const newBalance = balanceBefore + amount;

      await tx.bankDetail.update({
        where: { id: bank.id },
        data: { currentBalance: toDecimal(newBalance), asOnDate: new Date() },
      });

      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          amount: toDecimal(amount),
          paymentModeId: paymentModeDoc.id,
          bankId: bank.id,
          received_on: safeDate(received_on) ?? new Date(),
          notes: notes ?? '',
          received_by: userId,
          // G: persist payment-date currency/rate
          ...(pmtCurrencyCode ? { currencyCode: pmtCurrencyCode } : {}),
          ...(pmtExchangeRate !== undefined ? { exchangeRate: pmtExchangeRate } : {}),
        },
      });

      const bankTransaction = await tx.bankTransaction.create({
        data: {
          bankAccountId: bank.id,
          transactionDate: safeDate(received_on) ?? new Date(),
          type: transactionType,
          amount: toDecimal(amount),
          balanceBefore: toDecimal(balanceBefore),
          balanceAfter: toDecimal(newBalance),
          paymentModeId: paymentModeDoc.id,
          remarks: notes ?? `Invoice Payment - ${invoice.invoiceNumber ?? invoice.id}`,
          relatedType: 'INVOICE_PAYMENT',
          relatedId: payment.id,
        },
      });

      // G: derive documentRate from parent invoice; paymentRate from payment body or document rate.
      // documentRate: the rate at which AR was originally booked (invoice.exchangeRate ?? 1).
      // paymentRate: the rate at which cash settles today (pmtExchangeRate ?? documentRate).
      const documentRate = invoice.exchangeRate ?? new Prisma.Decimal(1);
      const paymentRate = pmtExchangeRate ?? documentRate;

      // GL: post the payment (Dr BANK/CASH, Cr AR) — FX-aware when foreign currency provided.
      await postInvoicePayment(tx as unknown as PostingTx, {
        userId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        date: safeDate(received_on) ?? new Date(),
        amount: String(payment.amount),
        paymentModeSlug: paymentModeDoc.slug ?? null,
        ...(pmtCurrencyCode ? { currencyCode: pmtCurrencyCode, paymentRate, documentRate } : {}),
      });

      const newTotalPaid = alreadyPaid + amount;
      let newStatus: InvoiceStatus = 'UNPAID';
      if (newTotalPaid >= Number(invoice.TotalAmount)) newStatus = 'PAID';
      else if (newTotalPaid > 0) newStatus = 'PARTIALLY_PAID';

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: newStatus },
      });

      return {
        payment,
        bankTransaction,
        invoice_status: updatedInvoice.status,
        remaining_balance: Number(updatedInvoice.TotalAmount) - newTotalPaid,
      };
    });

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment: result.payment,
        bank_transaction: result.bankTransaction,
        invoice_status: result.invoice_status,
        remaining_balance: result.remaining_balance,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    const message = err instanceof Error ? err.message : String(err);
    const friendly: Record<string, { status: number; field: string; msg: string }> = {
      INVOICE_NOT_FOUND: { status: 400, field: 'invoiceId', msg: 'Invoice not found.' },
      INVOICE_ALREADY_PAID: { status: 400, field: 'invoiceId', msg: 'Invoice is already fully paid.' },
      BANK_NOT_FOUND: { status: 400, field: 'bankId', msg: 'Bank account not found.' },
      PAYMENT_MODE_NOT_FOUND: { status: 400, field: 'payment_method', msg: 'Payment mode not found.' },
    };
    if (message.startsWith('PAYMENT_EXCEEDS:')) {
      const remaining = message.split(':')[1];
      res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: { amount: `Payment exceeds remaining balance. Remaining: ${remaining}` },
      });
      return;
    }
    if (friendly[message]) {
      const f = friendly[message];
      res.status(f.status).json({
        success: false,
        message: 'Validation failed.',
        errors: { [f.field]: f.msg },
      });
      return;
    }
    console.error('Record payment error:', err);
    res.status(500).json({
      success: false,
      message: 'Error recording payment',
      error: message,
    });
  }
}

// =============================================================================
// convertProformaToInvoice
// =============================================================================

export async function convertProformaToInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const newInvoice = await prisma.$transaction(async (tx) => {
      const source = await tx.invoice.findFirst({
        where: { id, tenantId, isDeleted: false },
      });
      if (!source) {
        throw new Error('NOT_FOUND');
      }
      if (source.invoiceType !== 'PROFORMA') {
        throw new Error('NOT_PROFORMA');
      }
      if (source.convertedAt) {
        throw new Error('ALREADY_CONVERTED');
      }

      // Clone the source into a new INVOICE row
      const newNumber = await generateNextInvoiceNumber(tx, tenantId, 'INVOICE');

      // Strip fields that should NOT be cloned (id/timestamps/number)
      const {
        id: _id,
        createdAt: _ca,
        updatedAt: _ua,
        invoiceNumber: _in,
        ...rest
      } = source;

      const created = await tx.invoice.create({
        data: {
          ...rest,
          items: (rest.items ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
          invoiceType: 'INVOICE',
          invoiceNumber: newNumber,
          convertedFromId: source.id,
          convertedAt: null,
          status: 'UNPAID',
        },
      });

      // Mark the source as converted
      await tx.invoice.update({
        where: { id: source.id },
        data: { convertedAt: new Date() },
      });

      // GL: post the new real INVOICE to the general ledger
      await postInvoiceIssued(tx as unknown as PostingTx, {
        userId,
        invoiceId: created.id,
        date: created.invoiceDate ?? new Date(),
        total: String(created.TotalAmount),
        tax: String(created.vat ?? 0),
      });

      // Fire inventory deduction for the new INVOICE's line items
      // B.4: also accumulate COGS at current average cost for GL posting.
      const items = (created.items as unknown as Array<{ productId?: string; id?: string; qty?: number }>) ?? [];
      let convertCogs = ZERO;
      for (const item of items) {
        const productId = item.productId ?? item.id;
        if (!productId || !item.qty) continue;
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { item_type: true },
        });
        if (product?.item_type === 'Service') continue;
        const inventory = await tx.inventory.findFirst({
          where: { productId, userId, isDeleted: false },
        });
        if (!inventory || inventory.quantity < item.qty) continue;
        // B.4: compute COGS at current average and decrement quantityOnHand.
        const issue = applyIssue(
          { quantityOnHand: inventory.quantityOnHand, avgCost: inventory.avgCost },
          String(item.qty),
        );
        convertCogs = convertCogs.plus(issue.cogs);
        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            quantity: { decrement: item.qty },
            quantityOnHand: issue.state.quantityOnHand,
          },
        });
      }
      // B.4: post COGS for the converted invoice.
      await postSaleCogs(tx as unknown as PostingTx, {
        userId,
        invoiceId: created.id,
        date: created.invoiceDate ?? new Date(),
        cost: convertCogs.toString(),
      });

      return created;
    });

    res.status(201).json({
      success: true,
      message: 'Proforma converted to invoice',
      data: { invoice: { ...newInvoice } },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (handleLedgerError(res, err)) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    if (msg === 'NOT_PROFORMA') {
      res.status(400).json({ success: false, message: 'Only proformas can be converted' });
      return;
    }
    if (msg === 'ALREADY_CONVERTED') {
      res.status(400).json({ success: false, message: 'Proforma already converted' });
      return;
    }
    console.error('convertProformaToInvoice error:', err);
    res.status(500).json({ success: false, message: 'Failed to convert proforma' });
  }
}

// =============================================================================
// Recurring invoices (slice B.3)
// =============================================================================

/**
 * GET /api/admin/recurring-invoices
 * Paginated list of recurring parent invoices (not children).
 */
export async function getRecurringInvoices(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '10', 10)));
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      isDeleted: false,
      isRecurring: true,
      parentInvoice: null,
      invoiceType: 'INVOICE', // exclude proforma invoices from the recurring list
    };
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          billToCustomer: { select: { id: true, name: true } },
          _count: { select: { children: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    const data = rows.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customer: inv.billToCustomer ? { id: inv.billToCustomer.id, name: inv.billToCustomer.name } : null,
      repeatEvery: inv.repeatEvery,
      customIntervalNumber: inv.customIntervalNumber,
      customIntervalType: inv.customIntervalType,
      startOn: inv.startOn,
      endsOn: inv.endsOn,
      neverExpire: inv.neverExpire,
      stopped: inv.stopped,
      lastRecurringDate: inv.lastRecurringDate,
      nextRecurringDate: inv.nextRecurringDate,
      childrenCount: inv._count.children,
      TotalAmount: inv.TotalAmount,
    }));

    res.json({
      success: true,
      data: {
        recurringInvoices: data,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('getRecurringInvoices error:', err);
    res.status(500).json({ success: false, message: 'Failed to list recurring invoices' });
  }
}

/**
 * GET /api/admin/invoices/:id/children
 * List child invoices generated from a recurring parent.
 * (Named `getInvoiceChildren` to avoid collision with the legacy system-wide
 *  `getChildInvoices` used by /invoices-recurring.)
 */
export async function getInvoiceChildren(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const parent = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: { id: true, isRecurring: true },
    });
    if (!parent) {
      res.status(404).json({ success: false, message: 'Recurring parent not found' });
      return;
    }

    const rows = await prisma.invoice.findMany({
      where: { parentInvoice: id, tenantId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        TotalAmount: true,
      },
    });

    res.json({
      success: true,
      data: {
        children: rows.map((r) => ({ ...r })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('getInvoiceChildren error:', err);
    res.status(500).json({ success: false, message: 'Failed to list child invoices' });
  }
}

/**
 * POST /api/admin/invoices/:id/run-recurring-now
 * Manually trigger one iteration of a recurring parent.
 */
export async function runRecurringNow(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const owned = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false, isRecurring: true, parentInvoice: null },
      select: { id: true, stopped: true },
    });
    if (!owned) {
      res.status(404).json({ success: false, message: 'Recurring parent not found' });
      return;
    }
    if (owned.stopped) {
      res.status(400).json({ success: false, message: 'Recurring schedule is stopped. Resume it first.' });
      return;
    }

    const out = await runRecurringForInvoice(id);
    res.status(201).json({
      success: true,
      message: 'Recurring iteration created',
      data: { newInvoiceId: out.newInvoiceId, newInvoiceNumber: out.newInvoiceNumber },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'SOURCE_NOT_FOUND') {
      res.status(404).json({ success: false, message: 'Recurring parent not found' });
      return;
    }
    if (msg === 'SOURCE_STOPPED') {
      res.status(400).json({ success: false, message: 'Recurring schedule is stopped' });
      return;
    }
    console.error('runRecurringNow error:', err);
    res.status(500).json({ success: false, message: 'Failed to run recurring' });
  }
}

/**
 * PATCH /api/admin/invoices/:id/recurring-status
 * Toggle the `stopped` flag on a recurring parent invoice.
 * Body: { stopped: boolean }
 */
export async function setRecurringStatus(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { stopped?: boolean };
    if (typeof body.stopped !== 'boolean') {
      res.status(400).json({ success: false, message: 'Body must include { stopped: boolean }' });
      return;
    }

    const existing = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false, isRecurring: true, parentInvoice: null },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Recurring parent not found' });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { stopped: body.stopped },
      select: { id: true, stopped: true },
    });

    res.json({ success: true, message: 'Recurring status updated', data: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('setRecurringStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to update recurring status' });
  }
}

function generatePublicToken(): string {
  return randomBytes(32).toString('hex'); // 64-char hex string
}

/**
 * POST /api/admin/invoices/:id/enable-public-link
 * Generates publicViewToken if absent, sets publicViewEnabled=true.
 */
export async function enablePublicLink(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: { id: true, publicViewToken: true, publicViewEnabled: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const token = existing.publicViewToken ?? generatePublicToken();
    const updated = await prisma.invoice.update({
      where: { id },
      data: { publicViewToken: token, publicViewEnabled: true },
      select: { id: true, publicViewToken: true, publicViewEnabled: true },
    });
    res.json({ success: true, message: 'Public link enabled', data: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('enablePublicLink error:', err);
    res.status(500).json({ success: false, message: 'Failed to enable public link' });
  }
}

export async function disablePublicLink(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { publicViewEnabled: false },
      select: { id: true, publicViewToken: true, publicViewEnabled: true },
    });
    res.json({ success: true, message: 'Public link disabled', data: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('disablePublicLink error:', err);
    res.status(500).json({ success: false, message: 'Failed to disable public link' });
  }
}

export async function rotatePublicLink(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: { publicViewToken: generatePublicToken(), publicViewEnabled: true },
      select: { id: true, publicViewToken: true, publicViewEnabled: true },
    });
    res.json({ success: true, message: 'Public link rotated', data: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('rotatePublicLink error:', err);
    res.status(500).json({ success: false, message: 'Failed to rotate public link' });
  }
}

// =============================================================================
// approveInvoice — Spec D maker-checker
// =============================================================================

export async function approveInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    if (existing.approvalStatus !== 'PENDING') {
      res.status(409).json({
        success: false,
        message: 'Not pending approval',
        current: existing.approvalStatus,
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const approved = await tx.invoice.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date(),
        },
      });
      // Post the ledger entries exactly as create would have (shared helper guarantees parity).
      // COGS is recomputed from persisted items + current avgCost (same as updateInvoice approach).
      await postInvoiceLedger(tx, approved, userId);
      return approved;
    });

    res.status(200).json({ success: true, message: 'Invoice approved', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('approveInvoice error:', err);
    res.status(500).json({
      success: false,
      message: 'Error approving invoice',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// rejectInvoice — Spec D maker-checker
// =============================================================================

export async function rejectInvoice(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };

    const existing = await prisma.invoice.findFirst({
      where: { id, tenantId, isDeleted: false },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    if (existing.approvalStatus !== 'PENDING') {
      res.status(409).json({
        success: false,
        message: 'Not pending approval',
        current: existing.approvalStatus,
      });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason: reason ?? null,
      },
    });

    // No GL effect on rejection. The invoice never posted (was PENDING), so no reversal needed.
    // Operational side-effects (stock deductions at create time) are NOT reversed in v1 — documented limitation.
    void userId; // referenced for future audit-log use

    res.status(200).json({ success: true, message: 'Invoice rejected', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('rejectInvoice error:', err);
    res.status(500).json({
      success: false,
      message: 'Error rejecting invoice',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// markInvoiceSent — move a DRAFT invoice to SENT without emailing it.
// For when the user downloads the PDF and sends it manually. Mirrors the
// status flip done by sendInvoiceEmail (no email, no extra ledger side-effects;
// GL posting already happens at create time). Guarded to the DRAFT->SENT step.
// =============================================================================
export async function markInvoiceSent(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const id = req.params.id as string;
    const existing = await prisma.invoice.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    if (existing.status !== 'DRAFT') {
      res.status(400).json({
        success: false,
        message: `Only draft invoices can be marked as sent (current status: ${existing.status})`,
      });
      return;
    }
    const updated = await prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
    });
    res.status(200).json({ success: true, message: 'Invoice marked as sent', data: updated });
  } catch (err) {
    console.error('markInvoiceSent error:', err);
    res.status(500).json({
      success: false,
      message: 'Error marking invoice as sent',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  createInvoice,
  updateInvoiceStatus,
  markInvoiceSent,
  sendInvoiceEmail,
  updateInvoice,
  getInvoice,
  getAllInvoices,
  getChildInvoices,
  listInvoicesMinimal,
  getInvoicePaymentDetails,
  convertQuotationToInvoice,
  convertProformaToInvoice,
  recordInvoicePayment,
  listInvoicesMinimalWithoutChallan,
  getNextInvoiceNumber,
  deleteInvoice,
  getRecurringInvoices,
  getInvoiceChildren,
  runRecurringNow,
  setRecurringStatus,
  enablePublicLink,
  disablePublicLink,
  rotatePublicLink,
  approveInvoice,
  rejectInvoice,
};
module.exports.createInvoice = createInvoice;
module.exports.updateInvoiceStatus = updateInvoiceStatus;
module.exports.markInvoiceSent = markInvoiceSent;
module.exports.sendInvoiceEmail = sendInvoiceEmail;
module.exports.updateInvoice = updateInvoice;
module.exports.getInvoice = getInvoice;
module.exports.getAllInvoices = getAllInvoices;
module.exports.getChildInvoices = getChildInvoices;
module.exports.listInvoicesMinimal = listInvoicesMinimal;
module.exports.getInvoicePaymentDetails = getInvoicePaymentDetails;
module.exports.convertQuotationToInvoice = convertQuotationToInvoice;
module.exports.convertProformaToInvoice = convertProformaToInvoice;
module.exports.recordInvoicePayment = recordInvoicePayment;
module.exports.listInvoicesMinimalWithoutChallan = listInvoicesMinimalWithoutChallan;
module.exports.getNextInvoiceNumber = getNextInvoiceNumber;
module.exports.deleteInvoice = deleteInvoice;
module.exports.getRecurringInvoices = getRecurringInvoices;
module.exports.getInvoiceChildren = getInvoiceChildren;
module.exports.runRecurringNow = runRecurringNow;
module.exports.setRecurringStatus = setRecurringStatus;
module.exports.enablePublicLink = enablePublicLink;
module.exports.disablePublicLink = disablePublicLink;
module.exports.rotatePublicLink = rotatePublicLink;
module.exports.approveInvoice = approveInvoice;
module.exports.rejectInvoice = rejectInvoice;
