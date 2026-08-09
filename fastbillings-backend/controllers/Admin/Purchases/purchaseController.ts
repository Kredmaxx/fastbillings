import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type {
  Purchase,
  PurchaseStatus,
  PurchaseSignType,
  PurchaseOrderStatus,
} from '@prisma/client';
import { validationResult } from 'express-validator';

// utils/mailer is still JS; static require is fine here.
// eslint-disable-next-line @typescript-eslint/no-require-imports, import/order
const mailerModule: {
  sendMail: (opts: Record<string, unknown>) => Promise<void>;
  hasEnvSmtpCredentials: () => boolean;
  envSmtpFrom: () => string;
} = require('../../../utils/mailer');

import { prisma } from '../../../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  customFieldScope,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../../../lib/tenantScope';
import { handleLedgerError } from '../../../lib/httpErrors';
import {
  matchingGstTaxSplit,
  postPurchaseReceived,
  postPurchaseRcmSelfInvoice,
  reverseDocument,
  sumGstTaxSplit,
  taxSplitFromInvoiceItems,
  type GstTaxSplit,
  type PostingTx,
} from '../../../lib/ledger/ledgerPosting';
import { applyReceipt } from '../../../lib/ledger/inventoryCost';
import { computeLandedAdditions, applyFifoReceipt, applyWacReceipt } from '../../../lib/ledger/inventoryValuation';
import { initialApprovalStatus, shouldPostOnCreate } from '../../../lib/ledger/approvals';
import { findProductInventory, resolveWarehouseId } from '../../../lib/warehouseStock';
import { applyLineTracking } from '../../../lib/inventoryTracking';
import {
  computeTaxSplitFromRates,
  pickDefaultIndiaGstRates,
} from '../../../lib/taxEngine';

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<PurchaseStatus>([
  'new',
  'pending',
  'completed',
  'cancelled',
  'partially_paid',
  'paid',
]);

const VALID_SIGN_TYPES = new Set<PurchaseSignType>([
  'none',
  'digitalSignature',
  'eSignature',
]);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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
  return new Prisma.Decimal(
    typeof value === 'number' || typeof value === 'string' ? value : fallback,
  );
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
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
  unit?: string;
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  discount_type?: string;
  discount_value?: number;
  amount?: number;
  taxes?: IncomingItemTax[];
  totalTax?: number;
  hsnSac?: string | null;
  hsn?: string | null;
  gstSupplyType?: string | null;
  batchAllocations?: unknown;
  serialNumbers?: unknown;
}

function normaliseGstSupplyType(raw: unknown): 'TAXABLE' | 'NIL_RATED' | 'EXEMPT' | 'NON_GST' {
  const v = String(raw ?? 'TAXABLE').toUpperCase().replace(/[\s-]+/g, '_');
  if (v === 'NIL_RATED' || v === 'NIL' || v === 'NILRATED') return 'NIL_RATED';
  if (v === 'EXEMPT' || v === 'EXEMPTED') return 'EXEMPT';
  if (v === 'NON_GST' || v === 'NONGST') return 'NON_GST';
  return 'TAXABLE';
}

function normaliseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => {
    const qty = asNumber(item.qty, 0);
    const rate = asNumber(item.rate, 0);
    const discount = asNumber(item.discount, 0);
    const gstSupplyType = normaliseGstSupplyType(item.gstSupplyType);
    const nonTaxable = gstSupplyType !== 'TAXABLE';
    const base = Math.max(0, qty * rate - discount);
    const hsn =
      typeof item.hsnSac === 'string' && item.hsnSac.trim()
        ? item.hsnSac.trim()
        : typeof item.hsn === 'string' && item.hsn.trim()
          ? item.hsn.trim()
          : null;
    return {
      id: item.id ?? item.productId,
      productId: item.productId ?? item.id,
      name: item.name ?? '',
      unit: item.unit,
      qty,
      rate,
      discount,
      tax: nonTaxable ? 0 : asNumber(item.tax, 0),
      tax_group_id: item.tax_group_id,
      discount_type: item.discount_type,
      discount_value: asNumber(item.discount_value, 0),
      amount: nonTaxable ? base : asNumber(item.amount, qty * rate),
      taxes: nonTaxable ? [] : Array.isArray(item.taxes) ? item.taxes : undefined,
      totalTax: nonTaxable ? 0 : item.totalTax !== undefined ? asNumber(item.totalTax, 0) : undefined,
      hsnSac: hsn,
      gstSupplyType,
      batchAllocations: item.batchAllocations,
      serialNumbers: item.serialNumbers,
    };
  });
}

/** Fill gstSupplyType / HSN from Product when the client omitted them (before normalise). */
async function attachProductDefaults(
  tx: { product: { findMany: Tx['product']['findMany'] } },
  raw: unknown,
): Promise<unknown> {
  if (!Array.isArray(raw)) return raw;
  const ids = [
    ...new Set(
      raw
        .map((row) => {
          const r = row as { productId?: string; id?: string };
          return r.productId ?? r.id;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return raw;
  const products = await tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, gstSupplyType: true, hsnSac: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    const pid = (r.productId ?? r.id) as string | undefined;
    const p = pid ? byId.get(pid) : undefined;
    if (!p) return row;
    const hasSupply = r.gstSupplyType != null && String(r.gstSupplyType).trim() !== '';
    const hasHsn =
      (typeof r.hsnSac === 'string' && r.hsnSac.trim()) ||
      (typeof r.hsn === 'string' && r.hsn.trim());
    return {
      ...r,
      gstSupplyType: hasSupply ? r.gstSupplyType : p.gstSupplyType,
      hsnSac: hasHsn ? (r.hsnSac ?? r.hsn) : p.hsnSac ?? null,
    };
  });
}

function calcTotals(items: IncomingItem[]): {
  taxable: number;
  discount: number;
  tax: number;
  total: number;
} {
  const taxable = items.reduce(
    (sum, i) => sum + asNumber(i.rate, 0) * asNumber(i.qty, 0),
    0,
  );
  const discount = items.reduce((sum, i) => sum + asNumber(i.discount, 0), 0);
  const tax = items.reduce(
    (sum, i) => sum + asNumber(i.totalTax, asNumber(i.tax, 0)),
    0,
  );
  return { taxable, discount, tax, total: taxable + tax - discount };
}

async function generateNextPurchaseId(tx: Tx): Promise<string> {
  const last = await tx.purchase.findFirst({
    where: { purchaseId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { purchaseId: true },
  });
  let n = 0;
  if (last?.purchaseId) {
    const m = last.purchaseId.match(/\d+$/);
    if (m) n = parseInt(m[0], 10);
  }
  return `PUR-${String(n + 1).padStart(6, '0')}`;
}

async function insertCustomFieldValues(
  tx: Tx,
  purchaseId: string,
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

  const records: Prisma.CustomFieldValueCreateManyInput[] = customFields.map(
    (field) => {
      const f = field as { fieldId: string; value?: string };
      let value: Prisma.InputJsonValue = f.value ?? '';
      const fileMatch = files.find(
        (file) => file.fieldname === `customField_${f.fieldId}`,
      );
      if (fileMatch) value = fileMatch.path;
      return {
        customFieldId: f.fieldId,
        module: 'purchase',
        recordId: purchaseId,
        value,
        createdBy: userId,
      };
    },
  );

  await tx.customFieldValue.createMany({ data: records });
}

interface UserLite {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  address?: string | null;
  profileImage?: string | null;
}

function formatUser(u: UserLite | null | undefined): {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
} | null {
  if (!u) return null;
  return {
    id: u.id,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    email: u.email || null,
    phone: u.phone || null,
  };
}

function formatPartyDetails(
  u: UserLite | null | undefined,
  baseUrl: string,
  withAddress = false,
): {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  profileImage: string;
} | null {
  if (!u) return null;
  return {
    id: u.id,
    name: `${u.firstName || ''} ${u.lastName || ''}`.trim(),
    email: u.email || null,
    phone: u.phone || null,
    ...(withAddress ? { address: u.address ?? null } : {}),
    profileImage: u.profileImage
      ? `${baseUrl}${u.profileImage.replace(/\\/g, '/')}`
      : '',
  };
}

interface BankLite {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHoldername: string;
  IFSCCode: string;
  branchName?: string;
}

function formatBank(
  b: BankLite | null | undefined,
  withBranch = false,
): {
  id: string;
  name: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  ifscCode: string | null;
  branchName?: string | null;
} | null {
  if (!b) return null;
  return {
    id: b.id,
    name: b.bankName || null,
    accountNumber: b.accountNumber || null,
    accountHolderName: b.accountHoldername || null,
    ifscCode: b.IFSCCode || null,
    ...(withBranch ? { branchName: b.branchName ?? null } : {}),
  };
}

interface PaymentModeLite {
  id: string;
  name: string;
  slug: string;
  status: boolean | null;
}

function formatPaymentMode(p: PaymentModeLite | null | undefined) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name || null,
    slug: p.slug || null,
    status: p.status ?? null,
  };
}

// =============================================================================
// postPurchaseLedger — shared helper used by createPurchase (approvalsEnabled=false)
//                      AND approvePurchase (approvalsEnabled=true).
// Computes the inventory/expense split from the purchase's items + current state,
// then posts. Called with re-read items from the persisted purchase to guarantee parity.
// =============================================================================

async function resolveRcmLiability(
  tx: Tx,
  purchase: {
    items: Prisma.JsonValue | null;
    totalTax: Prisma.Decimal | null;
    taxableAmount?: Prisma.Decimal | null;
  },
  opts: { userId: string; tenantId?: string | null },
): Promise<{ tax: string; split: GstTaxSplit | null } | null> {
  const fromLines = taxSplitFromInvoiceItems(purchase.items);
  if (fromLines) {
    const tax = sumGstTaxSplit(fromLines);
    if (new Prisma.Decimal(tax).greaterThan(0)) return { tax, split: fromLines };
  }
  const storedTax = new Prisma.Decimal(String(purchase.totalTax ?? 0));
  if (storedTax.greaterThan(0)) {
    return { tax: storedTax.toFixed(4), split: null };
  }

  const taxableBase = Number(purchase.taxableAmount ?? 0);
  if (!(taxableBase > 0)) return null;

  const library = await tx.taxRate.findMany({
    where: {
      isActive: true,
      isDeleted: false,
      regime: 'GST_INDIA',
      OR: [
        { userId: opts.userId },
        ...(opts.tenantId ? [{ tenantId: opts.tenantId }] : []),
      ],
    },
  });
  const rates = pickDefaultIndiaGstRates(library as never);
  const computed = computeTaxSplitFromRates(
    taxableBase,
    rates.map((r) => ({ taxKind: r.taxKind, rate: Number(r.rate) })),
  );
  if (!computed) return null;
  return { tax: computed.total.toFixed(4), split: computed.split };
}

async function postPurchaseLedger(
  tx: Tx,
  purchase: {
    id: string;
    purchaseDate: Date | null;
    totalAmount: Prisma.Decimal;
    totalTax: Prisma.Decimal | null;
    taxableAmount?: Prisma.Decimal | null;
    isReverseCharge?: boolean;
    tdsAmount?: Prisma.Decimal | null;
    items: Prisma.JsonValue | null;
    userId: string;
    currencyCode?: string | null;
    exchangeRate?: Prisma.Decimal | null;
    costCenterId?: string | null;
    projectId?: string | null;
  },
  userId: string,
  tenantId?: string | null,
): Promise<void> {
  const items = normaliseItems(purchase.items);
  const isRcm = Boolean(purchase.isReverseCharge);
  const totalDec = new Prisma.Decimal(String(purchase.totalAmount ?? 0));
  const taxDec = new Prisma.Decimal(String(purchase.totalTax ?? 0));
  const tdsDec = new Prisma.Decimal(String(purchase.tdsAmount ?? 0));

  // RCM: vendor AP excludes GST; liability posts separately as self-invoice.
  const receivedTax = isRcm ? new Prisma.Decimal(0) : taxDec;
  const receivedTotal =
    isRcm && taxDec.greaterThan(0) ? totalDec.minus(taxDec) : totalDec;
  if (receivedTotal.lessThan(0)) {
    throw new Error('RCM purchase total/tax split is invalid');
  }

  let inventoryNet = new Prisma.Decimal(0);
  for (const item of items) {
    const productId = item.productId ?? item.id;
    if (!productId) continue;
    // Products are tenant-keyed — never resolve by bare id.
    const product = tenantId
      ? await tx.product.findFirst({
          where: { id: productId, tenantId },
          select: { item_type: true },
        })
      : null;
    if (product && product.item_type !== 'Service') {
      inventoryNet = inventoryNet.plus(new Prisma.Decimal(asNumber(item.amount, 0)));
    }
  }
  const maxNet = receivedTotal.minus(receivedTax);
  const clampedInv = inventoryNet.greaterThan(maxNet) ? maxNet : inventoryNet;
  const expenseNet = maxNet.minus(clampedInv);
  const currencyOpts = {
    ...(purchase.currencyCode ? { currencyCode: purchase.currencyCode } : {}),
    ...(purchase.exchangeRate != null ? { exchangeRate: purchase.exchangeRate } : {}),
    ...(purchase.costCenterId !== undefined ? { costCenterId: purchase.costCenterId } : {}),
    ...(purchase.projectId !== undefined ? { projectId: purchase.projectId } : {}),
  };

  const inputTaxSplit = !isRcm
    ? matchingGstTaxSplit(purchase.items, receivedTax.toFixed(4))
    : null;

  // TDS is withheld from vendor AP (cannot exceed document total posted).
  const tdsForPost = tdsDec.greaterThan(receivedTotal) ? receivedTotal : tdsDec;

  await postPurchaseReceived(tx as unknown as PostingTx, {
    userId,
    purchaseId: purchase.id,
    date: purchase.purchaseDate ?? new Date(),
    total: receivedTotal.toFixed(4),
    tax: receivedTax.toFixed(4),
    inventoryNet: clampedInv.toString(),
    expenseNet: expenseNet.toString(),
    taxSplit: inputTaxSplit,
    tdsAmount: tdsForPost.toFixed(4),
    ...currencyOpts,
  });

  if (isRcm) {
    const liability = await resolveRcmLiability(tx, purchase, { userId, tenantId });
    if (liability) {
      await postPurchaseRcmSelfInvoice(tx as unknown as PostingTx, {
        userId,
        purchaseId: purchase.id,
        date: purchase.purchaseDate ?? new Date(),
        tax: liability.tax,
        taxSplit: liability.split,
        ...currencyOpts,
      });
    }
  }
}

// =============================================================================
// createPurchase
// =============================================================================

export async function createPurchase(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const authUserId = requireUserId(req);
    const body = req.body as Record<string, unknown>;

    const purchaseOrderId = body.purchaseOrderId as string | undefined;
    // Never trust body.userId — ownership is always the authenticated caller.
    const userId = authUserId;
    const billFrom = body.billFrom as string;
    const billTo = body.billTo as string;
    const referenceNo = (body.referenceNo as string) ?? '';
    const purchaseDate = safeDate(body.purchaseDate) ?? new Date();
    const items = normaliseItems(await attachProductDefaults(prisma, body.items));
    const notes = (body.notes as string) ?? '';
    const termsAndCondition = (body.termsAndCondition as string) ?? '';
    const paymentMode = body.paymentMode as string | undefined;
    const subTotal = body.subTotal as number | undefined;
    const totalTax = body.totalTax as number | undefined;
    const totalDiscount = body.totalDiscount as number | undefined;
    const grandTotal = body.grandTotal as number | undefined;
    const signType = (body.sign_type as PurchaseSignType) ?? 'none';
    const signatureIdInput = body.signatureId as string | undefined;
    const signatureName = body.signatureName as string | undefined;
    const checkNumber = body.checkNumber as string | undefined;
    const bank = body.bank as string | undefined;
    const sp_amount = body.sp_amount as number | undefined;
    const sp_paid_amount = body.sp_paid_amount as number | undefined;
    // G: document currency — optional. Omitting defaults to functional currency (rate 1).
    const docCurrencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode as string : undefined;
    const docExchangeRate = body.exchangeRate != null ? toDecimal(body.exchangeRate) : undefined;

    // P3.3: optional dimension tagging
    const docCostCenterId = typeof body.costCenterId === 'string' && body.costCenterId ? body.costCenterId : null;
    const docProjectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : null;

    // P3.5: optional landed cost (freight/duties) to fold into inventory unit cost.
    const docLandedCost = body.landedCost != null && body.landedCost !== '' ? asNumber(body.landedCost, 0) : null;

    // Validate bill from / to users
    const [billFromUser, billToUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: billFrom } }),
      prisma.user.findUnique({ where: { id: billTo } }),
    ]);
    if (!billFromUser || !billToUser) {
      res.status(422).json({ message: 'Invalid bill from or bill to user ID' });
      return;
    }

    // Validate signature type
    if (signType && !VALID_SIGN_TYPES.has(signType)) {
      res.status(400).json({ message: 'Invalid signature type' });
      return;
    }
    if (signType === 'eSignature') {
      if (!req.file) {
        res.status(400).json({
          message: 'Signature image is required for eSignature',
        });
        return;
      }
      if (!signatureName) {
        res.status(400).json({
          message: 'Signature name is required for eSignature',
        });
        return;
      }
    }

    let signatureIdFinal: string | null = null;
    if (signType === 'digitalSignature' && signatureIdInput) {
      const sig = await prisma.signature.findFirst({
        where: { id: signatureIdInput, ...tenantOrUserScope(req) },
      });
      if (!sig) {
        res.status(404).json({ message: 'Digital Signature not found' });
        return;
      }
      signatureIdFinal = sig.id;
    }
    if (bank) {
      const bankRow = await prisma.bankDetail.findFirst({
        where: { id: bank, ...tenantOrUserScope(req) },
      });
      if (!bankRow) {
        res.status(404).json({ message: 'Bank account not found' });
        return;
      }
    }

    const totals = calcTotals(items);
    const calculatedSubTotal = asNumber(subTotal, totals.taxable);
    const calculatedTotalDiscount = asNumber(totalDiscount, totals.discount);
    const calculatedTotalTax = asNumber(totalTax, totals.tax);
    const calculatedGrandTotal = asNumber(grandTotal, totals.total);
    const calculatedTds = Math.max(0, asNumber(body.tdsAmount, 0));
    // Vendor due = invoice total − TDS withheld
    const netPayable = Math.max(0, calculatedGrandTotal - calculatedTds);

    // Status & payment derivation
    let status: PurchaseStatus =
      ((body.status as PurchaseStatus) ?? 'pending');
    let paidAmount = 0;
    let balanceAmount = netPayable;
    if (sp_amount && sp_paid_amount && status === 'paid') {
      if (sp_paid_amount === sp_amount) {
        status = 'paid';
        paidAmount = sp_paid_amount;
        balanceAmount = 0;
      } else {
        status = 'partially_paid';
        paidAmount = sp_paid_amount;
        balanceAmount = Math.max(0, sp_amount - sp_paid_amount);
      }
    }

    const signatureImage =
      signType === 'eSignature' && req.file ? req.file.path : null;
    const signatureNameFinal = signType === 'eSignature' ? signatureName ?? null : null;

    const purchase = await prisma.$transaction(async (tx) => {
      // Approval gate: read companySettings for this tenant
      const settings = await tx.companySettings.findFirst({ where: { userId } });
      const approvalsEnabled = settings?.approvalsEnabled ?? false;

      const purchaseIdString =
        (body.purchaseId as string) ?? (await generateNextPurchaseId(tx));

      const tenantId = optionalTenantId(req);
      const warehouseId = await resolveWarehouseId(tx as never, {
        userId,
        tenantId,
        warehouseId: typeof body.warehouseId === 'string' ? body.warehouseId : null,
      });

      const created = await tx.purchase.create({
        data: {
          purchaseId: purchaseIdString,
          purchaseOrderId: purchaseOrderId ?? null,
          vendorId: billTo,
          purchaseDate,
          dueDate: purchaseDate,
          referenceNo,
          items: items as unknown as Prisma.InputJsonValue,
          status,
          paymentModeId: paymentMode ?? null,
          taxableAmount: toDecimal(calculatedSubTotal),
          totalDiscount: toDecimal(calculatedTotalDiscount),
          totalTax: toDecimal(calculatedTotalTax),
          roundOff: Boolean(body.roundOff),
          totalAmount: toDecimal(calculatedGrandTotal),
          paidAmount: toDecimal(paidAmount),
          balanceAmount: toDecimal(balanceAmount),
          bankId: bank ?? null,
          notes,
          termsAndCondition,
          sign_type: signType,
          signatureId: signatureIdFinal,
          signatureImage,
          signatureName: signatureNameFinal,
          checkNumber: checkNumber ?? null,
          userId,
          tenantId,
          warehouseId,
          isReverseCharge:
            body.isReverseCharge === true ||
            body.isReverseCharge === 'true' ||
            body.reverseCharge === true ||
            body.reverseCharge === 'true',
          tdsSection: typeof body.tdsSection === 'string' ? body.tdsSection.trim() || null : null,
          tdsRatePercent:
            body.tdsRatePercent !== undefined && body.tdsRatePercent !== null && body.tdsRatePercent !== ''
              ? toDecimal(asNumber(body.tdsRatePercent, 0))
              : null,
          tdsAmount:
            body.tdsAmount !== undefined && body.tdsAmount !== null && body.tdsAmount !== ''
              ? toDecimal(asNumber(body.tdsAmount, 0))
              : toDecimal(0),
          billFrom,
          billTo,
          approvalStatus: initialApprovalStatus(approvalsEnabled),
          // G: persist document currency/rate (omitted when absent → functional currency)
          ...(docCurrencyCode ? { currencyCode: docCurrencyCode } : {}),
          ...(docExchangeRate !== undefined ? { exchangeRate: docExchangeRate } : {}),
          // P3.3: persist dimension tags
          costCenterId: docCostCenterId,
          projectId: docProjectId,
          // P3.5: persist landed cost (null when absent)
          ...(docLandedCost != null && docLandedCost > 0 ? { landedCost: toDecimal(docLandedCost) } : {}),
        },
      });

      // Update related PurchaseOrder status if linked
      if (purchaseOrderId) {
        const poStatus: PurchaseOrderStatus =
          status === 'paid'
            ? 'completed'
            : status === 'cancelled'
              ? 'cancelled'
              : 'pending';
        await tx.purchaseOrder.updateMany({
          where: { id: purchaseOrderId },
          data: { status: poStatus },
        });
      }

      // SupplierPayment row when (partially) paid
      if (status === 'paid' || status === 'partially_paid') {
        await tx.supplierPayment.create({
          data: {
            purchaseId: created.id,
            supplierId: billTo,
            tenantId,
            referenceNumber: (body.sp_referenceNumber as string) ?? '',
            paymentDate: safeDate(body.sp_paymentDate) ?? new Date(),
            paymentModeId: (body.sp_paymentMode as string) ?? null,
            sourceType: 'BANK',
            amount: asNumber(body.sp_amount, 0),
            paidAmount: asNumber(body.sp_amount, 0),
            dueAmount: asNumber(body.sp_due_amount, 0),
            notes: (body.sp_notes as string) ?? '',
            createdBy: userId,
          },
        });
      }

      // Inventory increment when payment recorded
      // P3.5: compute landed-cost per-unit additions for all inventory lines.
      if (status === 'paid' || status === 'partially_paid') {
        // Build the inventory-item list for landed-cost allocation.
        const inventoryLineParams = items.map((item) => ({
          amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
          qty: asNumber(item.qty, 0),
        }));
        const landedAdditions = computeLandedAdditions(inventoryLineParams, docLandedCost);

        for (let itemIdx = 0; itemIdx < items.length; itemIdx++) {
          const item = items[itemIdx]!;
          const productId = item.productId ?? item.id;
          if (!productId) continue;
          const existing = await findProductInventory(tx as never, {
            productId,
            userId,
            warehouseId,
          });
          const qty = asNumber(item.qty, 0);
          const baseUnitCost = asNumber(item.rate, 0);
          // P3.5: landed-inclusive unit cost = base rate + landed addition per unit.
          const landedUnitCost = baseUnitCost + (landedAdditions[itemIdx] ?? 0);
          const previousQuantity = existing?.quantity ?? 0;
          const historyEntry = {
            unitId: item.unit ?? null,
            quantity: previousQuantity,
            notes: `Stock in from purchase ${created.purchaseId ?? created.id}`,
            type: 'stock_in',
            adjustment: qty,
            referenceId: created.id,
            referenceType: 'purchase',
            createdBy: userId,
          };
          const existingHistory = Array.isArray(existing?.inventory_history)
            ? (existing!.inventory_history as unknown[])
            : [];

          // P3.5: gate on product valuationMethod (tenant-scoped catalog).
          const product = tenantId
            ? await tx.product.findFirst({
                where: { id: productId, tenantId },
                select: { valuationMethod: true },
              })
            : null;
          if (!product) continue;
          const isFifo = product.valuationMethod === 'FIFO';
          const claimWarehouse =
            existing && existing.warehouseId == null ? { warehouseId } : {};

          if (isFifo) {
            // FIFO path: create cost layer + update quantityOnHand only.
            // avgCost is left unchanged for FIFO products.
            const currentQtyOnHand =
              (existing?.quantityOnHand as Prisma.Decimal | undefined) ?? new Prisma.Decimal(0);
            const newQtyOnHand = await applyFifoReceipt(
              tx as unknown as Parameters<typeof applyFifoReceipt>[0],
              {
                userId,
                tenantId,
                productId,
                qty,
                landedUnitCost,
                purchaseDate: purchaseDate,
                purchaseId: created.id,
                currentQtyOnHand,
              },
            );
            if (existing) {
              await tx.inventory.update({
                where: { id: existing.id },
                data: {
                  quantity: previousQuantity + qty,
                  quantityOnHand: newQtyOnHand,
                  // avgCost intentionally NOT updated for FIFO products.
                  inventory_history: [
                    ...existingHistory,
                    historyEntry,
                  ] as unknown as Prisma.InputJsonValue,
                  ...claimWarehouse,
                },
              });
            } else {
              await tx.inventory.create({
                data: {
                  productId,
                  userId,
                  tenantId,
                  warehouseId,
                  quantity: qty,
                  quantityOnHand: newQtyOnHand,
                  // avgCost stays at default (0) for FIFO products.
                  inventory_history: [historyEntry] as unknown as Prisma.InputJsonValue,
                },
              });
            }
          } else {
            // WAC path (default): EXISTING applyReceipt path UNCHANGED.
            // Pass landed-inclusive unit cost to include freight in WAC average.
            if (existing) {
              const wac = applyWacReceipt(
                {
                  quantityOnHand: existing.quantityOnHand as Prisma.Decimal,
                  avgCost: existing.avgCost as Prisma.Decimal,
                },
                qty,
                landedUnitCost,
              );
              await tx.inventory.update({
                where: { id: existing.id },
                data: {
                  quantity: previousQuantity + qty,
                  quantityOnHand: wac.quantityOnHand,
                  avgCost: wac.avgCost,
                  inventory_history: [
                    ...existingHistory,
                    historyEntry,
                  ] as unknown as Prisma.InputJsonValue,
                  ...claimWarehouse,
                },
              });
            } else {
              const wac = applyWacReceipt(
                { quantityOnHand: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
                qty,
                landedUnitCost,
              );
              await tx.inventory.create({
                data: {
                  productId,
                  userId,
                  tenantId,
                  warehouseId,
                  quantity: qty,
                  quantityOnHand: wac.quantityOnHand,
                  avgCost: wac.avgCost,
                  inventory_history: [historyEntry] as unknown as Prisma.InputJsonValue,
                },
              });
            }
          }

          await applyLineTracking(tx as never, {
            userId,
            tenantId,
            productId,
            warehouseId,
            qty,
            direction: 'receive',
            item: item as unknown as Record<string, unknown>,
            unitCost: landedUnitCost,
            sourceType: 'purchase',
            sourceId: created.id,
            defaultLotHint: created.purchaseId ?? created.id,
          });
        }
      }

      // GL posting — gated by approval status.
      // When approvals are enabled, posting is deferred to approvePurchase.
      // The shared postPurchaseLedger helper computes the same split used at create time.
      if (shouldPostOnCreate(approvalsEnabled)) {
        await postPurchaseLedger(tx, created, userId, tenantId);
      }

      // Custom field values
      const files = Array.isArray(req.files)
        ? (req.files as Express.Multer.File[])
        : [];
      await insertCustomFieldValues(tx, created.id, userId, body.customFields, files);

      return created;
    });

    res.status(201).json({
      message: 'Purchase created successfully',
      data: { purchase },
    });

    // Fire-and-forget email
    if (billToUser?.email && mailerModule.hasEnvSmtpCredentials?.()) {
      try {
        await mailerModule.sendMail({
          from: `"Your Company" <${mailerModule.envSmtpFrom()}>`,
          to: billToUser.email,
          subject: 'New Purchase Created',
          html: `
            <h3>Hello ${billToUser.firstName ?? ''} ${billToUser.lastName ?? ''},</h3>
            <p>A new purchase has been created for you.</p>
            <p><strong>Reference No:</strong> ${purchase.referenceNo ?? ''}</p>
            <p><strong>Total Amount:</strong> ${Number(purchase.totalAmount)}</p>
            <p>Purchase Date: ${new Date(purchase.purchaseDate).toLocaleDateString()}</p>
            <br>
            <p>Best Regards,<br>Your Company</p>
          `,
          tenantId: purchase.tenantId ?? optionalTenantId(req),
          userId: purchase.userId,
        });
      } catch (emailErr) {
        console.error(
          'Failed to send purchase email:',
          emailErr instanceof Error ? emailErr.message : String(emailErr),
        );
      }
    }
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error creating purchase',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// createPurchaseFromPO
// =============================================================================

export async function createPurchaseFromPO(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const ownership = tenantOrUserFilter(req);
    const { purchaseOrderId } = req.body as { purchaseOrderId?: string };

    if (!purchaseOrderId) {
      res.status(400).json({ message: 'Purchase Order ID is required' });
      return;
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findFirst({
        where: { id: purchaseOrderId, isDeleted: false, ...ownership },
      });
      if (!purchaseOrder) {
        throw new Error('Purchase Order not found');
      }

      const existing = await tx.purchase.findFirst({
        where: { purchaseOrderId: purchaseOrder.id, isDeleted: false, ...ownership },
      });
      if (existing) {
        throw new Error('Purchase Order already converted to Purchase');
      }

      const nextPurchaseId = await generateNextPurchaseId(tx);

      // Translate the PO status onto purchase enum domain. If the PO is
      // already `completed`, the produced purchase should still start at
      // `pending` (matches legacy JS behaviour).
      const poStatus = purchaseOrder.status as PurchaseOrderStatus;
      const purchaseStatus: PurchaseStatus =
        poStatus === 'completed'
          ? 'pending'
          : poStatus === 'cancelled'
            ? 'cancelled'
            : poStatus === 'new'
              ? 'new'
              : 'pending';

      const created = await tx.purchase.create({
        data: {
          purchaseId: nextPurchaseId,
          purchaseOrderId: purchaseOrder.id,
          vendorId: purchaseOrder.vendorId ?? null,
          purchaseDate: new Date(),
          dueDate: purchaseOrder.dueDate,
          referenceNo: purchaseOrder.referenceNo ?? '',
          items: (purchaseOrder.items ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          status: purchaseStatus,
          paymentModeId: null, // PurchaseOrder.paymentMode is a different enum domain
          taxableAmount: purchaseOrder.taxableAmount,
          totalDiscount: purchaseOrder.totalDiscount,
          totalTax: purchaseOrder.vat,
          roundOff: purchaseOrder.roundOff,
          totalAmount: purchaseOrder.TotalAmount,
          bankId: purchaseOrder.bankId,
          notes: purchaseOrder.notes,
          termsAndCondition: purchaseOrder.termsAndCondition,
          sign_type: purchaseOrder.sign_type as unknown as PurchaseSignType,
          signatureId: purchaseOrder.signatureId,
          signatureImage: purchaseOrder.signatureImage,
          signatureName: purchaseOrder.signatureName,
          userId,
          tenantId: tenantId ?? purchaseOrder.tenantId ?? null,
          billFrom: purchaseOrder.billFrom,
          billTo: purchaseOrder.billTo,
        },
      });

      await tx.purchaseOrder.update({
        where: { id: purchaseOrder.id },
        data: { status: 'completed' },
      });

      return created;
    });

    res.status(201).json({
      message: 'Purchase Order converted to Purchase successfully',
      data: purchase,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error converting Purchase Order to Purchase',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updatePurchase
// =============================================================================

export async function updatePurchase(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const authUserId = requireUserId(req);
    const body = req.body as Record<string, unknown>;

    const purchasePk = (body.id ?? body._id) as string | undefined;
    if (!purchasePk) {
      res.status(400).json({ message: 'Purchase ID is required' });
      return;
    }

    const existingPurchase = await prisma.purchase.findFirst({
      where: { id: purchasePk, ...tenantOrUserScope(req) },
    });
    if (!existingPurchase) {
      res.status(404).json({ message: 'Purchase not found' });
      return;
    }

    // Never trust body.userId — ownership is always the authenticated caller.
    const userId = authUserId;
    const billFrom = body.billFrom as string;
    const billTo = body.billTo as string;
    const referenceNo = body.referenceNo as string | undefined;
    const purchaseDate = safeDate(body.purchaseDate) ?? existingPurchase.purchaseDate;
    const items = normaliseItems(await attachProductDefaults(prisma, body.items));
    const notes = body.notes as string | undefined;
    const termsAndCondition = body.termsAndCondition as string | undefined;
    const paymentMode = body.paymentMode as string | undefined;
    const subTotal = body.subTotal as number | undefined;
    const totalTax = body.totalTax as number | undefined;
    const totalDiscount = body.totalDiscount as number | undefined;
    const grandTotal = body.grandTotal as number | undefined;
    const signType = (body.sign_type as PurchaseSignType) ?? existingPurchase.sign_type;
    const signatureIdInput = body.signatureId as string | undefined;
    const signatureName = body.signatureName as string | undefined;
    const checkNumber = body.checkNumber as string | undefined;
    const bank = body.bank as string | undefined;
    const sp_amount = body.sp_amount as number | undefined;
    const sp_paid_amount = body.sp_paid_amount as number | undefined;
    const reqStatus = body.status as PurchaseStatus | undefined;

    // Validate users
    const [billFromUser, billToUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: billFrom } }),
      prisma.user.findUnique({ where: { id: billTo } }),
    ]);
    if (!billFromUser || !billToUser) {
      res.status(422).json({ message: 'Invalid bill from or bill to user ID' });
      return;
    }

    // Validate signature
    if (signType && !VALID_SIGN_TYPES.has(signType)) {
      res.status(400).json({ message: 'Invalid signature type' });
      return;
    }
    if (signType === 'eSignature') {
      if (!req.file && !existingPurchase.signatureImage) {
        res.status(400).json({ message: 'Signature image is required for eSignature' });
        return;
      }
      if (!signatureName && !existingPurchase.signatureName) {
        res.status(400).json({ message: 'Signature name is required for eSignature' });
        return;
      }
    }

    let newSignatureId: string | null = null;
    if (signType === 'digitalSignature') {
      const candidate = signatureIdInput ?? existingPurchase.signatureId;
      if (candidate) {
        const sig = await prisma.signature.findFirst({
          where: { id: candidate, ...tenantOrUserScope(req) },
        });
        if (!sig) {
          res.status(404).json({ message: 'Digital Signature not found' });
          return;
        }
        newSignatureId = sig.id;
      }
    }
    if (bank) {
      const bankRow = await prisma.bankDetail.findFirst({
        where: { id: bank, ...tenantOrUserScope(req) },
      });
      if (!bankRow) {
        res.status(404).json({ message: 'Bank account not found' });
        return;
      }
    }

    const totals = calcTotals(items);
    const calculatedSubTotal = asNumber(subTotal, totals.taxable);
    const calculatedTotalDiscount = asNumber(totalDiscount, totals.discount);
    const calculatedTotalTax = asNumber(totalTax, totals.tax);
    const calculatedGrandTotal = asNumber(grandTotal, totals.total);
    const calculatedTds =
      body.tdsAmount !== undefined && body.tdsAmount !== null && body.tdsAmount !== ''
        ? Math.max(0, asNumber(body.tdsAmount, 0))
        : Math.max(0, Number(existingPurchase.tdsAmount ?? 0));
    const netPayable = Math.max(0, calculatedGrandTotal - calculatedTds);

    let status: PurchaseStatus = reqStatus ?? existingPurchase.status ?? 'pending';
    let paidAmount = 0;
    let balanceAmount = netPayable;
    if (sp_amount && sp_paid_amount) {
      if (sp_paid_amount === sp_amount) {
        status = 'paid';
        paidAmount = sp_paid_amount;
        balanceAmount = 0;
      } else {
        status = 'partially_paid';
        paidAmount = sp_paid_amount;
        balanceAmount = Math.max(0, sp_amount - sp_paid_amount);
      }
    }

    const existingItems = Array.isArray(existingPurchase.items)
      ? (existingPurchase.items as unknown as IncomingItem[])
      : [];

    const newSignatureImage =
      signType === 'eSignature'
        ? req.file?.path ?? existingPurchase.signatureImage
        : null;
    const newSignatureName =
      signType === 'eSignature'
        ? signatureName ?? existingPurchase.signatureName
        : null;

    const updated = await prisma.$transaction(async (tx) => {
      const warehouseId = await resolveWarehouseId(tx as never, {
        userId,
        tenantId: optionalTenantId(req),
        warehouseId:
          typeof body.warehouseId === 'string'
            ? body.warehouseId
            : (existingPurchase as { warehouseId?: string | null }).warehouseId ?? null,
      });

      // Revert prior inventory increments if previously (partially) paid
      if (
        existingPurchase.status === 'paid' ||
        existingPurchase.status === 'partially_paid'
      ) {
        for (const item of existingItems) {
          const productId = item.productId ?? item.id;
          if (!productId) continue;
          const inv = await findProductInventory(tx as never, {
            productId,
            userId,
            warehouseId:
              (existingPurchase as { warehouseId?: string | null }).warehouseId ?? warehouseId,
          });
          if (!inv) continue;
          const qty = asNumber(item.qty, 0);
          const newQty = inv.quantity - qty;
          const history = {
            unitId: item.unit ?? null,
            quantity: newQty + qty,
            notes: `Stock reverted from purchase update ${existingPurchase.purchaseId ?? existingPurchase.id}`,
            type: 'stock_out',
            adjustment: -qty,
            referenceId: existingPurchase.id,
            referenceType: 'purchase',
            createdBy: userId,
          };
          const histArr = Array.isArray(inv.inventory_history)
            ? (inv.inventory_history as unknown[])
            : [];
          // B.4: decrement quantityOnHand to match quantity reversal.
          // avgCost is NOT retro-un-blended (WAC is path-dependent; known limitation).
          const newQtyOnHand = inv.quantityOnHand.minus(new Prisma.Decimal(qty));
          await tx.inventory.update({
            where: { id: inv.id },
            data: {
              quantity: newQty,
              quantityOnHand: newQtyOnHand,
              inventory_history: [...histArr, history] as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }

      // C.1: update currencyCode if provided (freely editable on purchases)
      const updCurrencyCode = typeof body.currencyCode === 'string' && body.currencyCode
        ? body.currencyCode
        : undefined;

      const upd = await tx.purchase.update({
        where: { id: existingPurchase.id },
        data: {
          vendorId: billTo,
          purchaseDate,
          referenceNo: referenceNo ?? existingPurchase.referenceNo,
          items: items as unknown as Prisma.InputJsonValue,
          status,
          paymentModeId: paymentMode ?? existingPurchase.paymentModeId,
          taxableAmount: toDecimal(calculatedSubTotal),
          totalDiscount: toDecimal(calculatedTotalDiscount),
          totalTax: toDecimal(calculatedTotalTax),
          totalAmount: toDecimal(calculatedGrandTotal),
          paidAmount: toDecimal(paidAmount),
          balanceAmount: toDecimal(balanceAmount),
          notes: notes ?? existingPurchase.notes,
          termsAndCondition: termsAndCondition ?? existingPurchase.termsAndCondition,
          sign_type: signType,
          signatureId: newSignatureId,
          signatureImage: newSignatureImage,
          signatureName: newSignatureName,
          checkNumber: checkNumber ?? existingPurchase.checkNumber,
          bankId: bank ?? existingPurchase.bankId,
          userId,
          billFrom,
          billTo,
          warehouseId,
          ...(body.isReverseCharge !== undefined || body.reverseCharge !== undefined
            ? {
                isReverseCharge:
                  body.isReverseCharge === true ||
                  body.isReverseCharge === 'true' ||
                  body.reverseCharge === true ||
                  body.reverseCharge === 'true',
              }
            : {}),
          ...(body.tdsSection !== undefined
            ? { tdsSection: typeof body.tdsSection === 'string' ? body.tdsSection.trim() || null : null }
            : {}),
          ...(body.tdsRatePercent !== undefined
            ? {
                tdsRatePercent:
                  body.tdsRatePercent === null || body.tdsRatePercent === ''
                    ? null
                    : toDecimal(asNumber(body.tdsRatePercent, 0)),
              }
            : {}),
          ...(body.tdsAmount !== undefined
            ? {
                tdsAmount:
                  body.tdsAmount === null || body.tdsAmount === ''
                    ? toDecimal(0)
                    : toDecimal(asNumber(body.tdsAmount, 0)),
              }
            : {}),
          ...(updCurrencyCode !== undefined ? { currencyCode: updCurrencyCode } : {}),
        },
      });

      // Re-apply inventory increments if newly (partially) paid
      if (status === 'paid' || status === 'partially_paid') {
        for (const item of items) {
          const productId = item.productId ?? item.id;
          if (!productId) continue;
          const existing = await findProductInventory(tx as never, {
            productId,
            userId,
            warehouseId,
          });
          const qty = asNumber(item.qty, 0);
          const previousQuantity = existing?.quantity ?? 0;
          const historyEntry = {
            unitId: item.unit ?? null,
            quantity: previousQuantity,
            notes: `Stock in from updated purchase ${upd.purchaseId ?? upd.id}`,
            type: 'stock_in',
            adjustment: qty,
            referenceId: upd.id,
            referenceType: 'purchase',
            createdBy: userId,
          };
          const histArr = Array.isArray(existing?.inventory_history)
            ? (existing!.inventory_history as unknown[])
            : [];
          if (existing) {
            // B.4: apply new receipt qty to WAC. avgCost is NOT retro-adjusted for the old
            // receipt that was reverted above — WAC is path-dependent and full restatement
            // is out of scope (known limitation; quantity is corrected, avgCost left as-is
            // from prior state, then blended with the new receipt).
            const wac = applyReceipt(
              {
                quantityOnHand: existing.quantityOnHand as Prisma.Decimal,
                avgCost: existing.avgCost as Prisma.Decimal,
              },
              String(qty),
              String(item.rate ?? 0),
            );
            await tx.inventory.update({
              where: { id: existing.id },
              data: {
                quantity: previousQuantity + qty,
                quantityOnHand: wac.quantityOnHand,
                avgCost: wac.avgCost,
                inventory_history: [
                  ...histArr,
                  historyEntry,
                ] as unknown as Prisma.InputJsonValue,
                ...(existing.warehouseId == null ? { warehouseId } : {}),
              },
            });
          } else {
            const wac = applyReceipt(
              { quantityOnHand: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
              String(qty),
              String(item.rate ?? 0),
            );
            await tx.inventory.create({
              data: {
                productId,
                userId,
                tenantId: optionalTenantId(req),
                warehouseId,
                quantity: qty,
                quantityOnHand: wac.quantityOnHand,
                avgCost: wac.avgCost,
                inventory_history: [historyEntry] as unknown as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      // Refresh supplier payment row
      await tx.supplierPayment.deleteMany({
        where: { purchaseId: upd.id },
      });
      if (status === 'paid' || status === 'partially_paid') {
        await tx.supplierPayment.create({
          data: {
            purchaseId: upd.id,
            supplierId: billTo,
            tenantId: optionalTenantId(req) ?? upd.tenantId ?? null,
            referenceNumber: (body.sp_referenceNumber as string) ?? '',
            paymentDate: safeDate(body.sp_paymentDate) ?? new Date(),
            paymentModeId: (body.sp_paymentMode as string) ?? null,
            sourceType: 'BANK',
            amount: asNumber(body.sp_amount, 0),
            paidAmount: asNumber(body.sp_amount, 0),
            dueAmount: asNumber(body.sp_due_amount, 0),
            notes: (body.sp_notes as string) ?? '',
            createdBy: userId,
          },
        });
      }

      // GL: reverse prior received (+ RCM) entries then re-post via shared helper
      {
        await reverseDocument(tx as unknown as PostingTx, {
          userId,
          sourceType: 'Purchase',
          sourceId: upd.id,
          event: 'received',
        });
        await reverseDocument(tx as unknown as PostingTx, {
          userId,
          sourceType: 'Purchase',
          sourceId: upd.id,
          event: 'rcm',
        });
        await postPurchaseLedger(tx, upd, userId, optionalTenantId(req));
      }

      // Custom field values - reset
      await tx.customFieldValue.deleteMany({
        where: { module: 'purchase', recordId: upd.id },
      });
      const files = Array.isArray(req.files)
        ? (req.files as Express.Multer.File[])
        : [];
      await insertCustomFieldValues(tx, upd.id, userId, body.customFields, files);

      return upd;
    });

    res.status(200).json({
      message: 'Purchase updated successfully',
      data: { purchase: updated },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error updating purchase',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getAllPurchases
// =============================================================================

interface ListQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  vendorId?: string;
  startDate?: string;
  endDate?: string;
  paymentMode?: string;
}

export async function getAllPurchases(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      status,
      search = '',
      vendorId,
      startDate,
      endDate,
      paymentMode,
    } = req.query as ListQuery;

    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const where: Prisma.PurchaseWhereInput = {
      isDeleted: false,
      AND: [tenantOrUserFilter(req)],
    };
    if (
      status &&
      VALID_STATUSES.has(status as PurchaseStatus) &&
      status !== 'new'
    ) {
      where.status = status as PurchaseStatus;
    }
    if (vendorId) where.vendorId = vendorId;
    if (paymentMode) where.paymentModeId = paymentMode;
    if (startDate || endDate) {
      where.purchaseDate = {};
      if (startDate)
        (where.purchaseDate as Prisma.DateTimeFilter).gte = new Date(startDate);
      if (endDate)
        (where.purchaseDate as Prisma.DateTimeFilter).lte = new Date(endDate);
    }
    if (search) {
      (where.AND as Prisma.PurchaseWhereInput[]).push({
        OR: [
          { purchaseId: { contains: search, mode: 'insensitive' } },
          { purchaseOrderId: { contains: search, mode: 'insensitive' } },
          { referenceNo: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const [total, purchases] = await Promise.all([
      prisma.purchase.count({ where }),
      prisma.purchase.findMany({
        where,
        include: {
          vendor: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          billFromUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true,
            },
          },
          billToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true,
            },
          },
          bank: {
            select: {
              id: true,
              bankName: true,
              accountNumber: true,
              accountHoldername: true,
              IFSCCode: true,
            },
          },
          paymentMode: {
            select: { id: true, name: true, slug: true, status: true },
          },
          signature: {
            select: { id: true, signatureName: true, signatureImage: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    // Module + custom field setup
    const purchaseModule = await prisma.module.findFirst({
      where: { moduleSlug: 'purchases' },
    });
    let tableFields: { id: string; fieldSlug: string; labelName: string }[] = [];
    if (purchaseModule) {
      tableFields = await prisma.customField.findMany({
        where: { moduleId: purchaseModule.id, showInTable: true, ...customFieldScope(req) },
        select: { id: true, fieldSlug: true, labelName: true },
      });
    }
    const purchaseIds = purchases.map((p) => p.id);
    const customValues =
      purchaseIds.length > 0
        ? await prisma.customFieldValue.findMany({
            where: { module: 'purchase', recordId: { in: purchaseIds } },
          })
        : [];
    const customValueMap: Record<string, Record<string, Prisma.JsonValue>> = {};
    for (const v of customValues) {
      if (!customValueMap[v.recordId]) customValueMap[v.recordId] = {};
      customValueMap[v.recordId][v.customFieldId] = v.value;
    }

    const baseUrl = buildBaseUrl(req);

    const formattedPurchases = purchases.map((purchase) => {
      const signatureImageUrl = purchase.signatureImage
        ? `${baseUrl}${purchase.signatureImage.replace(/\\/g, '/')}`
        : null;

      const signatureDetails =
        purchase.sign_type === 'eSignature'
          ? { name: purchase.signatureName || null, image: signatureImageUrl }
          : purchase.signature
            ? {
                id: purchase.signature.id,
                name: purchase.signature.signatureName || null,
              }
            : null;

      const customFieldsObject: Record<string, Prisma.JsonValue | null> = {};
      const purchaseValues = customValueMap[purchase.id] ?? {};
      tableFields.forEach((field) => {
        customFieldsObject[field.fieldSlug] = purchaseValues[field.id] ?? null;
      });

      const itemsArr = Array.isArray(purchase.items)
        ? (purchase.items as unknown[])
        : [];

      return {
        id: purchase.id,
        purchaseId: purchase.purchaseId,
        purchaseOrderId: purchase.purchaseOrderId,
        vendor: formatUser(purchase.vendor),
        user: formatUser(purchase.user),
        purchaseDate: formatDateShort(purchase.purchaseDate),
        dueDate: formatDateShort(purchase.dueDate),
        referenceNo: purchase.referenceNo,
        status: purchase.status,
        paymentMode: formatPaymentMode(purchase.paymentMode),
        taxableAmount: Number(purchase.taxableAmount),
        totalDiscount: Number(purchase.totalDiscount ?? 0),
        totalTax: Number(purchase.totalTax ?? 0),
        totalAmount: Number(purchase.totalAmount),
        paidAmount: Number(purchase.paidAmount ?? 0),
        balanceAmount: Number(purchase.balanceAmount ?? 0),
        itemsCount: itemsArr.length,
        billFrom: formatPartyDetails(purchase.billFromUser, baseUrl),
        billTo: formatPartyDetails(purchase.billToUser, baseUrl),
        notes: purchase.notes,
        termsAndCondition: purchase.termsAndCondition,
        sign_type: purchase.sign_type,
        signature: signatureDetails,
        bank: formatBank(purchase.bank),
        checkNumber: purchase.checkNumber,

        customFields: customFieldsObject,
        currencyCode: purchase.currencyCode ?? null, // C.1

        createdAt: formatDateShort(purchase.createdAt),
        updatedAt: formatDateShort(purchase.updatedAt),
      };
    });

    res.status(200).json({
      success: true,
      message: 'Purchases retrieved successfully',
      data: {
        purchases: formattedPurchases,
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
    console.error('Get all purchases error:', err);
    res.status(500).json({
      message: 'Error fetching purchases',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// listPurchasesMinimal (last 20 paid purchases or search)
// =============================================================================

export async function listPurchasesMinimal(req: Request, res: Response): Promise<void> {
  try {
    const scope = tenantOrUserScope(req);
    const { search = '' } = req.query as { search?: string };

    const where: Prisma.PurchaseWhereInput = {
      ...scope,
      status: 'paid',
    };
    if (search) {
      where.OR = [
        { purchaseId: { contains: search, mode: 'insensitive' } },
        { purchaseOrderId: { contains: search, mode: 'insensitive' } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const purchases = await prisma.purchase.findMany({
      where,
      select: {
        id: true,
        purchaseId: true,
        referenceNo: true,
        purchaseDate: true,
        status: true,
        totalAmount: true,
        currencyCode: true,
        vendor: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: search ? undefined : 20,
    });

    // Payment details lookup
    const purchaseIds = purchases.map((p) => p.id);
    const payments =
      purchaseIds.length > 0
        ? await prisma.supplierPayment.findMany({
            where: { purchaseId: { in: purchaseIds }, isDeleted: false },
            select: {
              purchaseId: true,
              amount: true,
              paidAmount: true,
              dueAmount: true,
              paymentDate: true,
            },
          })
        : [];
    const paymentMap: Record<
      string,
      { amount: number; paidAmount: number; dueAmount: number; paymentDate: Date | null }
    > = {};
    for (const p of payments) {
      paymentMap[p.purchaseId] = {
        amount: Number(p.amount),
        paidAmount: Number(p.paidAmount),
        dueAmount: Number(p.dueAmount),
        paymentDate: p.paymentDate,
      };
    }

    const formatted = purchases.map((purchase) => {
      const paymentInfo = paymentMap[purchase.id] ?? null;
      const vendorName = purchase.vendor
        ? `${purchase.vendor.firstName || ''} ${purchase.vendor.lastName || ''}`.trim()
        : null;
      return {
        id: purchase.id,
        purchaseId: purchase.purchaseId,
        referenceNo: purchase.referenceNo,
        purchaseDate: purchase.purchaseDate,
        status: purchase.status,
        totalAmount: Number(purchase.totalAmount),
        currencyCode: purchase.currencyCode ?? null,
        vendor: purchase.vendor
          ? { id: purchase.vendor.id, name: vendorName }
          : null,
        payment: paymentInfo
          ? {
              amount: paymentInfo.amount,
              paidAmount: paymentInfo.paidAmount,
              dueAmount: paymentInfo.dueAmount,
              paymentDate: paymentInfo.paymentDate,
            }
          : null,
      };
    });

    res.status(200).json({
      success: true,
      message: search
        ? 'Search results for paid purchases retrieved successfully'
        : 'Last 20 paid purchases retrieved successfully',
      data: formatted,
      meta: {
        count: purchases.length,
        isSearchResult: Boolean(search),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List minimal purchases error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchases',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// listPurchasesPending
// =============================================================================

export async function listPurchasesPending(req: Request, res: Response): Promise<void> {
  try {
    const scope = tenantOrUserScope(req);
    const { search = '' } = req.query as { search?: string };
    const trimmed = search.trim();

    const where: Prisma.PurchaseWhereInput = { ...scope };
    if (trimmed) {
      where.OR = [
        { purchaseId: { contains: trimmed, mode: 'insensitive' } },
        { referenceNo: { contains: trimmed, mode: 'insensitive' } },
      ];
    }

    const purchases = await prisma.purchase.findMany({
      where,
      select: {
        id: true,
        purchaseId: true,
        referenceNo: true,
        purchaseDate: true,
        status: true,
        totalAmount: true,
        billToUser: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: trimmed ? undefined : 20,
    });

    if (purchases.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No pending purchases found',
        data: [],
        meta: {
          count: 0,
          isSearchResult: Boolean(trimmed),
        },
      });
      return;
    }

    const purchaseIds = purchases.map((p) => p.id);
    const payments = await prisma.supplierPayment.findMany({
      where: { purchaseId: { in: purchaseIds }, isDeleted: false },
      select: {
        purchaseId: true,
        amount: true,
        paidAmount: true,
        dueAmount: true,
      },
    });

    const aggregation: Record<
      string,
      { amount: number; paidAmount: number; dueAmount: number }
    > = {};
    for (const p of payments) {
      if (!aggregation[p.purchaseId]) {
        aggregation[p.purchaseId] = { amount: 0, paidAmount: 0, dueAmount: 0 };
      }
      aggregation[p.purchaseId].amount += Number(p.amount) || 0;
      aggregation[p.purchaseId].paidAmount += Number(p.paidAmount) || 0;
      aggregation[p.purchaseId].dueAmount += Number(p.dueAmount) || 0;
    }

    const formatted = purchases.reduce<Record<string, unknown>[]>((acc, purchase) => {
      const paymentInfo = aggregation[purchase.id];
      const totalAmountNum = Number(purchase.totalAmount);
      const calculatedDueAmount = totalAmountNum - (paymentInfo?.paidAmount ?? 0);

      if (calculatedDueAmount <= 0) return acc;

      const vendorName = purchase.billToUser
        ? `${purchase.billToUser.firstName || ''} ${purchase.billToUser.lastName || ''}`.trim()
        : null;

      acc.push({
        id: purchase.id,
        purchaseId: purchase.purchaseId,
        referenceNo: purchase.referenceNo,
        purchaseDate: purchase.purchaseDate,
        status: purchase.status,
        totalAmount: Number(purchase.totalAmount),
        vendor: purchase.billToUser
          ? { id: purchase.billToUser.id, name: vendorName }
          : null,
        payment: paymentInfo
          ? {
              amount: paymentInfo.amount,
              paidAmount: paymentInfo.paidAmount,
              dueAmount: calculatedDueAmount,
              paymentDate: null,
            }
          : {
              amount: 0,
              paidAmount: 0,
              dueAmount: totalAmountNum,
              paymentDate: null,
            },
      });
      return acc;
    }, []);

    res.status(200).json({
      success: true,
      message: trimmed
        ? 'Search results for pending purchases retrieved successfully'
        : 'Pending purchases retrieved successfully',
      data: formatted,
      meta: {
        count: formatted.length,
        isSearchResult: Boolean(trimmed),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List pending purchases error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending purchases',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getPurchaseById
// =============================================================================

export async function getPurchaseById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const baseUrl = buildBaseUrl(req);

    const purchase = await prisma.purchase.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      include: {
        vendor: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        billFromUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            profileImage: true,
          },
        },
        billToUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            profileImage: true,
          },
        },
        bank: {
          select: {
            id: true,
            bankName: true,
            accountNumber: true,
            accountHoldername: true,
            IFSCCode: true,
            branchName: true,
          },
        },
        paymentMode: {
          select: { id: true, name: true, slug: true, status: true },
        },
        signature: {
          select: { id: true, signatureName: true, signatureImage: true, createdAt: true },
        },
      },
    });

    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase not found' });
      return;
    }

    // Custom field values
    const purchaseModule = await prisma.module.findFirst({
      where: { moduleSlug: 'purchases' },
    });
    const customFieldsObject: Record<string, Prisma.JsonValue | null> = {};
    if (purchaseModule) {
      const fields = await prisma.customField.findMany({
        where: { moduleId: purchaseModule.id, ...customFieldScope(req) },
        select: { id: true, fieldSlug: true, labelName: true },
      });
      const values = await prisma.customFieldValue.findMany({
        where: { module: 'purchase', recordId: purchase.id },
      });
      const valueMap: Record<string, Prisma.JsonValue> = {};
      values.forEach((v) => {
        valueMap[v.customFieldId] = v.value;
      });
      fields.forEach((field) => {
        customFieldsObject[field.fieldSlug] = valueMap[field.id] ?? null;
      });
    }

    // Items + tax group enrichment
    const rawItems = Array.isArray(purchase.items)
      ? (purchase.items as unknown as IncomingItem[])
      : [];
    const taxGroupIds = Array.from(
      new Set(
        rawItems
          .map((i) => i.tax_group_id)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    );
    const taxGroups =
      taxGroupIds.length > 0
        ? await prisma.taxGroup.findMany({
            where: { id: { in: taxGroupIds } },
            select: { id: true, tax_name: true },
          })
        : [];
    const taxGroupMap: Record<string, { id: string; name: string }> = {};
    for (const g of taxGroups) {
      taxGroupMap[g.id] = { id: g.id, name: g.tax_name };
    }

    const formattedItems = rawItems.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      rate: item.rate,
      discount: item.discount,
      tax: item.tax,
      tax_group: item.tax_group_id && taxGroupMap[item.tax_group_id]
        ? taxGroupMap[item.tax_group_id]
        : null,
      discount_type: item.discount_type,
      discount_value: item.discount_value,
      amount: item.amount,
    }));

    let signatureDetails: Record<string, unknown> | null = null;
    if (purchase.sign_type === 'eSignature') {
      signatureDetails = {
        name: purchase.signatureName || null,
        image: purchase.signatureImage
          ? `${baseUrl}${purchase.signatureImage.replace(/\\/g, '/')}`
          : null,
        type: 'eSignature',
      };
    } else if (purchase.signature) {
      signatureDetails = {
        id: purchase.signature.id,
        name: purchase.signature.signatureName || null,
        image: purchase.signature.signatureImage
          ? `${baseUrl}${purchase.signature.signatureImage.replace(/\\/g, '/')}`
          : null,
        createdAt: purchase.signature.createdAt,
        type: 'digitalSignature',
      };
    }

    const responseData = {
      id: purchase.id,
      purchaseId: purchase.purchaseId,
      purchaseOrderId: purchase.purchaseOrderId,
      vendor: formatUser(purchase.vendor),
      user: formatUser(purchase.user),
      purchaseDate: purchase.purchaseDate,
      dueDate: purchase.dueDate,
      referenceNo: purchase.referenceNo,
      status: purchase.status,
      paymentMode: formatPaymentMode(purchase.paymentMode),
      taxableAmount: Number(purchase.taxableAmount),
      totalDiscount: Number(purchase.totalDiscount ?? 0),
      totalTax: Number(purchase.totalTax ?? 0),
      totalAmount: Number(purchase.totalAmount),
      paidAmount: Number(purchase.paidAmount ?? 0),
      balanceAmount: Number(purchase.balanceAmount ?? 0),
      items: formattedItems,
      billFrom: formatPartyDetails(purchase.billFromUser, baseUrl, true),
      billTo: formatPartyDetails(purchase.billToUser, baseUrl, true),
      notes: purchase.notes,
      termsAndCondition: purchase.termsAndCondition,
      sign_type: purchase.sign_type,
      signature: signatureDetails,
      bank: formatBank(purchase.bank, true),
      checkNumber: purchase.checkNumber,
      roundOff: purchase.roundOff,

      customFields: customFieldsObject,
      currencyCode: purchase.currencyCode ?? null, // C.1

      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Purchase retrieved successfully',
      data: responseData,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleUnauthorized(res, err)) return;
    console.error('Get purchase by ID error:', err);
    res.status(500).json({
      success: false,
      message: 'Error retrieving purchase',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updatePurchaseStatus
// =============================================================================

export async function updatePurchaseStatus(req: Request, res: Response): Promise<void> {
  try {
    const authUserId = requireUserId(req);
    const {
      status,
      sp_amount,
      sp_paid_amount,
      sp_referenceNumber,
      sp_paymentDate,
      sp_paymentMode,
      sp_notes,
    } = req.body as {
      status?: string;
      sp_amount?: number;
      sp_paid_amount?: number;
      sp_referenceNumber?: string;
      sp_paymentDate?: string;
      sp_paymentMode?: string;
      sp_notes?: string;
    };

    const { id } = req.params as { id: string };

    if (!status || !VALID_STATUSES.has(status as PurchaseStatus)) {
      res.status(400).json({ success: false, message: 'Invalid status value' });
      return;
    }
    const newStatus = status as PurchaseStatus;

    const existing = await prisma.purchase.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Purchase not found' });
      return;
    }

    let paidAmount = Number(existing.paidAmount);
    let balanceAmount = Number(existing.balanceAmount);

    if (newStatus === 'paid' || newStatus === 'partially_paid') {
      if (sp_amount && sp_paid_amount) {
        if (sp_paid_amount === sp_amount) {
          paidAmount = sp_paid_amount;
          balanceAmount = 0;
        } else {
          paidAmount = sp_paid_amount;
          balanceAmount = sp_amount - sp_paid_amount;
        }
      } else if (newStatus === 'paid') {
        paidAmount = Number(existing.totalAmount);
        balanceAmount = 0;
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const upd = await tx.purchase.update({
        where: { id: existing.id },
        data: {
          status: newStatus,
          paidAmount: toDecimal(paidAmount),
          balanceAmount: toDecimal(balanceAmount),
        },
        include: {
          vendor: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          billFromUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true,
            },
          },
          billToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true,
            },
          },
          bank: {
            select: {
              id: true,
              bankName: true,
              accountNumber: true,
              accountHoldername: true,
              IFSCCode: true,
            },
          },
        },
      });

      // Cascade status to linked PurchaseOrder
      if (upd.purchaseOrderId) {
        const poStatus: PurchaseOrderStatus =
          newStatus === 'paid'
            ? 'completed'
            : newStatus === 'cancelled'
              ? 'cancelled'
              : 'pending';
        await tx.purchaseOrder.updateMany({
          where: { id: upd.purchaseOrderId },
          data: { status: poStatus },
        });
      }

      // Supplier payment upsert (one row per purchase, legacy contract)
      if (newStatus === 'paid' || newStatus === 'partially_paid') {
        const existingSP = await tx.supplierPayment.findFirst({
          where: { purchaseId: upd.id },
        });
        if (existingSP) {
          await tx.supplierPayment.update({
            where: { id: existingSP.id },
            data: {
              referenceNumber: sp_referenceNumber ?? existingSP.referenceNumber,
              paymentDate: safeDate(sp_paymentDate) ?? existingSP.paymentDate,
              paymentModeId: sp_paymentMode ?? existingSP.paymentModeId,
              amount: asNumber(sp_amount, Number(upd.totalAmount)),
              paidAmount: asNumber(sp_paid_amount, paidAmount),
              dueAmount: balanceAmount,
              notes: sp_notes ?? existingSP.notes,
            },
          });
        } else {
          await tx.supplierPayment.create({
            data: {
              purchaseId: upd.id,
              supplierId: upd.billTo,
              tenantId: upd.tenantId ?? optionalTenantId(req) ?? null,
              referenceNumber: sp_referenceNumber ?? '',
              paymentDate: safeDate(sp_paymentDate) ?? new Date(),
              paymentModeId: sp_paymentMode ?? upd.paymentModeId,
              sourceType: 'BANK',
              amount: asNumber(sp_amount, Number(upd.totalAmount)),
              paidAmount: asNumber(sp_paid_amount, paidAmount),
              dueAmount: balanceAmount,
              notes: sp_notes ?? '',
              createdBy: authUserId,
            },
          });
        }
      }

      // Inventory effect only on full paid
      if (newStatus === 'paid') {
        const items = Array.isArray(upd.items)
          ? (upd.items as unknown as IncomingItem[])
          : [];
        const warehouseId = await resolveWarehouseId(tx as never, {
          userId: upd.userId,
          tenantId: upd.tenantId,
          warehouseId: upd.warehouseId,
        });
        for (const item of items) {
          const productId = item.productId ?? item.id;
          if (!productId) continue;
          const inv = await findProductInventory(tx as never, {
            productId,
            userId: upd.userId,
            warehouseId,
          });
          const qty = asNumber(item.qty, 0);
          const previousQuantity = inv?.quantity ?? 0;
          const historyEntry = {
            unitId: item.unit ?? null,
            quantity: previousQuantity + qty,
            notes: `Stock in from purchase ${upd.purchaseId ?? upd.id}`,
            type: 'stock_in',
            adjustment: qty,
            referenceId: upd.id,
            referenceType: 'purchase',
            createdBy: authUserId,
          };
          const histArr = Array.isArray(inv?.inventory_history)
            ? (inv!.inventory_history as unknown[])
            : [];
          if (inv) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: {
                quantity: previousQuantity + qty,
                ...(inv.warehouseId == null ? { warehouseId } : {}),
                inventory_history: [
                  ...histArr,
                  historyEntry,
                ] as unknown as Prisma.InputJsonValue,
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                productId,
                userId: upd.userId,
                tenantId: upd.tenantId,
                warehouseId,
                quantity: qty,
                quantityOnHand: qty,
                inventory_history: [historyEntry] as unknown as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      return upd;
    });

    const items = Array.isArray(updated.items)
      ? (updated.items as unknown as IncomingItem[])
      : [];

    // Hydrate product details for response
    const productIds = Array.from(
      new Set(
        items
          .map((i) => i.productId ?? i.id)
          .filter((v): v is string => typeof v === 'string' && v.length > 0),
      ),
    );
    const products =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, code: true, description: true },
          })
        : [];
    const productMap: Record<
      string,
      { id: string; name: string; code: string; description: string }
    > = {};
    for (const p of products) productMap[p.id] = p;

    const responseData = {
      id: updated.id,
      purchaseId: updated.purchaseId,
      purchaseOrderId: updated.purchaseOrderId,
      purchaseDate: formatDateShort(updated.purchaseDate),
      dueDate: formatDateShort(updated.dueDate),
      referenceNo: updated.referenceNo,
      status: updated.status,
      paymentMode: updated.paymentModeId,
      taxableAmount: Number(updated.taxableAmount),
      totalDiscount: Number(updated.totalDiscount ?? 0),
      totalTax: Number(updated.totalTax ?? 0),
      totalAmount: Number(updated.totalAmount),
      paidAmount: Number(updated.paidAmount ?? 0),
      balanceAmount: Number(updated.balanceAmount ?? 0),
      items: items.map((item) => {
        const pid = item.productId ?? item.id;
        const prod = pid ? productMap[pid] : undefined;
        return {
          id: prod?.id ?? null,
          product: prod
            ? {
                id: prod.id,
                name: prod.name,
                sku: prod.code,
                description: prod.description,
              }
            : null,
          name: item.name,
          unit: item.unit,
          qty: item.qty,
          rate: item.rate,
          discount: item.discount,
          tax: item.tax,
          discount_type: item.discount_type,
          discount_value: item.discount_value,
          amount: item.amount,
        };
      }),
      notes: updated.notes,
      termsAndCondition: updated.termsAndCondition,
      sign_type: updated.sign_type,
      checkNumber: updated.checkNumber,
      createdAt: formatDateShort(updated.createdAt),
      updatedAt: formatDateShort(updated.updatedAt),
    };

    res.status(200).json({
      success: true,
      message: 'Purchase status updated successfully',
      data: responseData,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Update purchase status error:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating purchase status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// deletePurchase (soft)
// =============================================================================

export async function deletePurchase(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.purchase.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ message: 'Purchase not found' });
      return;
    }
    const purchase = await prisma.$transaction(async (tx) => {
      // GL: reverse the posted received entry before soft-deleting
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'Purchase',
        sourceId: id,
        event: 'received',
      });

      return tx.purchase.update({
        where: { id },
        data: { isDeleted: true },
      });
    });
    res.status(200).json({
      message: 'Purchase deleted successfully',
      data: purchase,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error deleting purchase',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// createSupplierPayment
// =============================================================================

export async function createSupplierPayment(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const authUserId = requireUserId(req);
    const ownership = tenantOrUserFilter(req);
    const {
      purchaseId,
      amount,
      paymentDate,
      paymentMode,
      referenceNumber,
      notes,
      bankId,
    } = req.body as {
      purchaseId?: string;
      amount?: number;
      paymentDate?: string;
      paymentMode?: string;
      referenceNumber?: string;
      notes?: string;
      bankId?: string;
    };

    if (!purchaseId || amount === undefined) {
      res.status(400).json({ message: 'Required fields missing' });
      return;
    }

    const purchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, ...tenantOrUserScope(req) },
    });
    if (!purchase) {
      res.status(404).json({ message: 'Purchase not found' });
      return;
    }

    const userId = authUserId;
    const paymentAmount = asNumber(amount, 0);

    const result = await prisma.$transaction(async (tx) => {
      // Optional bank-balance side effect, mirroring the invoice pattern,
      // when a bankId is supplied.
      let bankTransaction: { id: string } | null = null;
      if (bankId && paymentMode) {
        const bank = await tx.bankDetail.findFirst({
          where: { id: bankId, isDeleted: false, ...ownership },
        });
        const paymentModeDoc = await tx.paymentMode.findUnique({
          where: { id: paymentMode },
        });
        if (bank && paymentModeDoc) {
          const transactionType =
            paymentModeDoc.slug?.toLowerCase() === 'cash'
              ? 'WITHDRAWAL'
              : 'TRANSFER_OUT';
          const balanceBefore = Number(bank.currentBalance ?? 0);
          const newBalance = balanceBefore - paymentAmount;
          await tx.bankDetail.update({
            where: { id: bank.id },
            data: {
              currentBalance: toDecimal(newBalance),
              asOnDate: new Date(),
            },
          });
          bankTransaction = await tx.bankTransaction.create({
            data: {
              bankAccountId: bank.id,
              tenantId: optionalTenantId(req) ?? bank.tenantId ?? purchase.tenantId ?? null,
              transactionDate: safeDate(paymentDate) ?? new Date(),
              type: transactionType,
              amount: toDecimal(paymentAmount),
              balanceBefore: toDecimal(balanceBefore),
              balanceAfter: toDecimal(newBalance),
              paymentModeId: paymentModeDoc.id,
              remarks:
                notes ?? `Supplier Payment - ${purchase.purchaseId ?? purchase.id}`,
              relatedType: 'SUPPLIER_PAYMENT',
            },
          });
        }
      }

      const supplierPayment = await tx.supplierPayment.create({
        data: {
          purchaseId: purchase.id,
          supplierId: purchase.vendorId ?? purchase.billTo,
          tenantId: optionalTenantId(req) ?? purchase.tenantId ?? null,
          paymentDate: safeDate(paymentDate) ?? new Date(),
          paymentModeId: paymentMode ?? null,
          sourceType: bankId ? 'BANK' : 'PETTY_CASH',
          bankId: bankId ?? null,
          amount: paymentAmount,
          paidAmount: paymentAmount,
          dueAmount: 0,
          referenceNumber: referenceNumber ?? null,
          notes: notes ?? null,
          createdBy: userId,
        },
      });

      // Update purchase totals + status
      const newPaidAmount = Number(purchase.paidAmount) + paymentAmount;
      const newBalanceAmount = Number(purchase.totalAmount) - newPaidAmount;
      let nextStatus: PurchaseStatus = purchase.status;
      if (newBalanceAmount <= 0) nextStatus = 'paid';
      else if (newPaidAmount > 0) nextStatus = 'partially_paid';

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          paidAmount: toDecimal(newPaidAmount),
          balanceAmount: toDecimal(newBalanceAmount),
          status: nextStatus,
        },
      });

      // Attach bank-transaction relatedId now that we have payment.id
      if (bankTransaction) {
        await tx.bankTransaction.update({
          where: { id: bankTransaction.id },
          data: { relatedId: supplierPayment.id },
        });
      }

      return supplierPayment;
    });

    res.status(201).json({
      message: 'Supplier payment created successfully',
      data: result,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error creating supplier payment',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getSupplierPayments (for a given purchase)
// =============================================================================

export async function getSupplierPayments(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { purchaseId } = req.params as { purchaseId: string };

    const purchase = await prisma.purchase.findFirst({
      where: { id: purchaseId, ...tenantOrUserScope(req) },
      select: { id: true },
    });
    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase not found' });
      return;
    }

    const payments = await prisma.supplierPayment.findMany({
      where: { purchaseId, isDeleted: false },
      include: {
        supplier: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        createdByUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { paymentDate: 'desc' },
    });

    res.status(200).json({
      message: 'Supplier payments retrieved successfully',
      data: payments,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error retrieving supplier payments',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// -----------------------------------------------------------------------------
// Type hint: keep `Purchase` referenced so type-only imports don't get pruned
// -----------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _PurchaseExport = Purchase;

// =============================================================================
// approvePurchase — Spec D maker-checker
// =============================================================================

export async function approvePurchase(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.purchase.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Purchase not found' });
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
      const approved = await tx.purchase.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          approvedById: userId,
          approvedAt: new Date(),
        },
      });
      // Post ledger entries exactly as create would have (shared helper guarantees parity).
      // Split math is recomputed from the persisted items + current product types.
      await postPurchaseLedger(tx, approved, userId, optionalTenantId(req));
      return approved;
    });

    res.status(200).json({ success: true, message: 'Purchase approved', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('approvePurchase error:', err);
    res.status(500).json({
      success: false,
      message: 'Error approving purchase',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// rejectPurchase — Spec D maker-checker
// =============================================================================

export async function rejectPurchase(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };

    const existing = await prisma.purchase.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Purchase not found' });
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

    const updated = await prisma.purchase.update({
      where: { id },
      data: {
        approvalStatus: 'REJECTED',
        rejectionReason: reason ?? null,
      },
    });

    void userId; // referenced for future audit-log use
    res.status(200).json({ success: true, message: 'Purchase rejected', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('rejectPurchase error:', err);
    res.status(500).json({
      success: false,
      message: 'Error rejecting purchase',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  createPurchase,
  createPurchaseFromPO,
  updatePurchase,
  getAllPurchases,
  listPurchasesMinimal,
  listPurchasesPending,
  getPurchaseById,
  updatePurchaseStatus,
  deletePurchase,
  createSupplierPayment,
  getSupplierPayments,
  approvePurchase,
  rejectPurchase,
};
module.exports.createPurchase = createPurchase;
module.exports.createPurchaseFromPO = createPurchaseFromPO;
module.exports.updatePurchase = updatePurchase;
module.exports.getAllPurchases = getAllPurchases;
module.exports.listPurchasesMinimal = listPurchasesMinimal;
module.exports.listPurchasesPending = listPurchasesPending;
module.exports.getPurchaseById = getPurchaseById;
module.exports.updatePurchaseStatus = updatePurchaseStatus;
module.exports.deletePurchase = deletePurchase;
module.exports.createSupplierPayment = createSupplierPayment;
module.exports.getSupplierPayments = getSupplierPayments;
module.exports.approvePurchase = approvePurchase;
module.exports.rejectPurchase = rejectPurchase;
