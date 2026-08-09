// lib/ledger/ledgerPosting.ts
import { post, reverse, type LedgerTx } from './postingEngine';
import { shouldPost } from './postingGate';
import { LedgerError } from './buildLines';
import { toDecimal, sumDecimals } from './money';
import type { LineInstruction } from './types';
import type { DecimalInput } from './money';

/** The slice of Prisma the posting layer needs (superset of LedgerTx). */
export interface PostingTx extends LedgerTx {
  companySettings: {
    findFirst: (args: unknown) => Promise<{
      ledgerInitialized: boolean;
      goLiveDate: Date | null;
      tenantId?: string | null;
    } | null>;
  };
}

const sub = (total: string, tax: string): string => toDecimal(total).minus(toDecimal(tax)).toString();
const isPos = (v: string): boolean => toDecimal(v).greaterThan(0);

/** Fail fast with a domain message when a pre-computed split (e.g. a purchase's
 *  inventory/expense/tax breakdown) does not reconcile to the document total.
 *  Without this, an inconsistent split would surface as an opaque
 *  "unbalanced entry" error from the posting engine. */
function assertSplit(label: string, total: string, parts: string[]): void {
  const partsSum = sumDecimals(parts.map((p) => toDecimal(p)));
  if (!partsSum.equals(toDecimal(total))) {
    throw new LedgerError(
      `${label} split does not reconcile: parts ${partsSum.toFixed(4)} != total ${toDecimal(total).toFixed(4)}`,
    );
  }
}

export function cashRoleFor(p: { paymentModeSlug?: string | null; sourceType?: string | null }): 'BANK' | 'CASH' {
  if (p.sourceType === 'PETTY_CASH') return 'CASH';
  if (p.paymentModeSlug && p.paymentModeSlug.toLowerCase().includes('cash')) return 'CASH';
  return 'BANK';
}

async function gatedPost(
  tx: PostingTx, userId: string, date: Date,
  sourceType: string, sourceId: string, event: string,
  instructions: LineInstruction[], description?: string,
  currencyCode = 'BASE', exchangeRate?: DecimalInput,
  costCenterId?: string | null, projectId?: string | null,
): Promise<void> {
  const settings = await tx.companySettings.findFirst({ where: { userId } });
  if (!shouldPost(settings, date)) return;
  await post(tx, {
    userId,
    tenantId: settings?.tenantId ?? null,
    sourceType,
    sourceId,
    event,
    date,
    currencyCode,
    exchangeRate,
    instructions,
    description,
    costCenterId,
    projectId,
  });
}

export type GstTaxSplit = {
  CGST?: string;
  SGST?: string;
  IGST?: string;
};

/** Sum CGST/SGST/IGST amounts from invoice line `taxes[]` JSON when present. */
export function taxSplitFromInvoiceItems(items: unknown): GstTaxSplit | null {
  if (!Array.isArray(items)) return null;
  let cgst = toDecimal(0);
  let sgst = toDecimal(0);
  let igst = toDecimal(0);
  let saw = false;
  for (const raw of items) {
    const taxes = (raw as { taxes?: unknown })?.taxes;
    if (!Array.isArray(taxes)) continue;
    for (const t of taxes) {
      const kind = String((t as { kind?: string })?.kind ?? '').toUpperCase();
      const amount = toDecimal((t as { amount?: DecimalInput })?.amount ?? 0);
      if (!amount.greaterThan(0)) continue;
      if (kind === 'CGST') {
        cgst = cgst.plus(amount);
        saw = true;
      } else if (kind === 'SGST' || kind === 'UTGST') {
        sgst = sgst.plus(amount);
        saw = true;
      } else if (kind === 'IGST') {
        igst = igst.plus(amount);
        saw = true;
      }
    }
  }
  if (!saw) return null;
  return {
    ...(cgst.greaterThan(0) ? { CGST: cgst.toFixed(4) } : {}),
    ...(sgst.greaterThan(0) ? { SGST: sgst.toFixed(4) } : {}),
    ...(igst.greaterThan(0) ? { IGST: igst.toFixed(4) } : {}),
  };
}

type TaxLineSide = 'debit' | 'credit';

function pushOutputTaxLines(
  lines: LineInstruction[],
  tax: string,
  split?: GstTaxSplit | null,
  side: TaxLineSide = 'credit',
): void {
  if (!isPos(tax)) return;
  const cgst = split?.CGST;
  const sgst = split?.SGST;
  const igst = split?.IGST;
  const hasSplit = [cgst, sgst, igst].some((v) => v != null && isPos(v));
  if (hasSplit) {
    if (cgst && isPos(cgst)) lines.push({ roleKey: 'OUTPUT_CGST', side, amount: cgst, taxRoleKey: 'OUTPUT_CGST' });
    if (sgst && isPos(sgst)) lines.push({ roleKey: 'OUTPUT_SGST', side, amount: sgst, taxRoleKey: 'OUTPUT_SGST' });
    if (igst && isPos(igst)) lines.push({ roleKey: 'OUTPUT_IGST', side, amount: igst, taxRoleKey: 'OUTPUT_IGST' });
    return;
  }
  lines.push({ roleKey: 'OUTPUT_TAX', side, amount: tax, taxRoleKey: 'OUTPUT_TAX' });
}

function pushInputTaxLines(
  lines: LineInstruction[],
  tax: string,
  split?: GstTaxSplit | null,
  side: TaxLineSide = 'debit',
): void {
  if (!isPos(tax)) return;
  const cgst = split?.CGST;
  const sgst = split?.SGST;
  const igst = split?.IGST;
  const hasSplit = [cgst, sgst, igst].some((v) => v != null && isPos(v));
  if (hasSplit) {
    if (cgst && isPos(cgst)) lines.push({ roleKey: 'INPUT_CGST', side, amount: cgst, taxRoleKey: 'INPUT_CGST' });
    if (sgst && isPos(sgst)) lines.push({ roleKey: 'INPUT_SGST', side, amount: sgst, taxRoleKey: 'INPUT_SGST' });
    if (igst && isPos(igst)) lines.push({ roleKey: 'INPUT_IGST', side, amount: igst, taxRoleKey: 'INPUT_IGST' });
    return;
  }
  lines.push({ roleKey: 'INPUT_TAX', side, amount: tax, taxRoleKey: 'INPUT_TAX' });
}

export function sumGstTaxSplit(split: GstTaxSplit | null | undefined): string {
  if (!split) return '0';
  return sumDecimals([
    toDecimal(split.CGST ?? 0),
    toDecimal(split.SGST ?? 0),
    toDecimal(split.IGST ?? 0),
  ]).toFixed(4);
}

/**
 * Use line CGST/SGST/IGST split only when it reconciles to the document tax total
 * (within 0.05). Otherwise callers should post the rollup INPUT_TAX / OUTPUT_TAX.
 */
export function matchingGstTaxSplit(
  items: unknown,
  taxAmount: DecimalInput,
  tolerance = '0.05',
): GstTaxSplit | null {
  const split = taxSplitFromInvoiceItems(items);
  if (!split) return null;
  const sum = toDecimal(sumGstTaxSplit(split));
  const tax = toDecimal(taxAmount);
  if (!sum.greaterThan(0) || !tax.greaterThan(0)) return null;
  if (sum.minus(tax).abs().greaterThan(toDecimal(tolerance))) return null;
  return split;
}

export async function postInvoiceIssued(
  tx: PostingTx,
  p: {
    userId: string;
    invoiceId: string;
    date: Date;
    total: string;
    tax: string;
    /** TCS collected on top of invoice total (increases AR). */
    tcsAmount?: string | null;
    taxSplit?: GstTaxSplit | null;
    currencyCode?: string;
    exchangeRate?: DecimalInput;
    costCenterId?: string | null;
    projectId?: string | null;
  },
): Promise<void> {
  const tcs = toDecimal(p.tcsAmount ?? 0);
  const ar = toDecimal(p.total).plus(tcs);
  const net = sub(p.total, p.tax);
  const lines: LineInstruction[] = [
    { roleKey: 'AR', side: 'debit', amount: ar.toFixed(4) },
    { roleKey: 'SALES_REVENUE', side: 'credit', amount: net },
  ];
  pushOutputTaxLines(lines, p.tax, p.taxSplit);
  if (tcs.greaterThan(0)) {
    lines.push({ roleKey: 'TCS_PAYABLE', side: 'credit', amount: tcs.toFixed(4) });
  }
  await gatedPost(tx, p.userId, p.date, 'Invoice', p.invoiceId, 'issued', lines, undefined, p.currencyCode ?? 'BASE', p.exchangeRate, p.costCenterId, p.projectId);
}

export async function postInvoicePayment(
  tx: PostingTx,
  p: {
    userId: string;
    invoiceId: string;
    paymentId: string;
    date: Date;
    amount: string;
    paymentModeSlug?: string | null;
    /** FX settlement: foreign currencyCode, rate at payment date, rate at document date */
    currencyCode?: string;
    paymentRate?: DecimalInput;
    documentRate?: DecimalInput;
  },
): Promise<void> {
  const into = cashRoleFor({ paymentModeSlug: p.paymentModeSlug });
  const isForeign = !!p.currencyCode && p.currencyCode !== 'BASE';
  const payRate = isForeign && p.paymentRate != null ? toDecimal(p.paymentRate) : null;
  const docRate = isForeign && p.documentRate != null ? toDecimal(p.documentRate) : null;
  const hasFxDiff = payRate != null && docRate != null && !payRate.equals(docRate);

  if (isForeign && hasFxDiff && payRate != null && docRate != null) {
    const amount = toDecimal(p.amount);
    // Bank: cash in at payment rate
    const bankBase = amount.times(payRate).toFixed(4);
    // AR: relieved at document rate (original posting rate)
    const arBase = amount.times(docRate).toFixed(4);
    // FX residual: |bankBase - arBase| — computed from already-rounded legs so
    // the three base amounts balance by construction (avoids repeating-decimal drift)
    const fxBase = toDecimal(bankBase).minus(toDecimal(arBase)).abs().toFixed(4);
    // paymentRate > documentRate → gain (credit FX); paymentRate < documentRate → loss (debit FX)
    const fxSide = payRate.greaterThan(docRate) ? 'credit' : 'debit';

    const lines: LineInstruction[] = [
      { roleKey: into, side: 'debit', amount: p.amount, baseAmount: bankBase },
      { roleKey: 'AR', side: 'credit', amount: p.amount, baseAmount: arBase },
      { roleKey: 'FX_GAIN_LOSS', side: fxSide, amount: '0', baseAmount: fxBase },
    ];
    await gatedPost(tx, p.userId, p.date, 'InvoicePayment', p.paymentId, 'payment', lines, undefined, p.currencyCode!, payRate);
  } else {
    // Functional currency path or equal rates — no FX leg
    await gatedPost(tx, p.userId, p.date, 'InvoicePayment', p.paymentId, 'payment', [
      { roleKey: into, side: 'debit', amount: p.amount },
      { roleKey: 'AR', side: 'credit', amount: p.amount },
    ], undefined, p.currencyCode ?? 'BASE', p.paymentRate);
  }
}

export async function postPurchaseReceived(
  tx: PostingTx,
  p: {
    userId: string;
    purchaseId: string;
    date: Date;
    total: string;
    tax: string;
    inventoryNet: string;
    expenseNet: string;
    /** When set and reconciled to `tax`, posts INPUT_CGST/SGST/IGST instead of rollup. */
    taxSplit?: GstTaxSplit | null;
    /** TDS withheld — reduces vendor AP; Cr TDS_PAYABLE. */
    tdsAmount?: string | null;
    currencyCode?: string;
    exchangeRate?: DecimalInput;
    costCenterId?: string | null;
    projectId?: string | null;
  },
): Promise<void> {
  assertSplit('purchase.received', p.total, [p.inventoryNet, p.expenseNet, p.tax]);
  const tdsRaw = toDecimal(p.tdsAmount ?? 0);
  const totalDec = toDecimal(p.total);
  const tds = tdsRaw.greaterThan(totalDec) ? totalDec : tdsRaw;
  const ap = totalDec.minus(tds);
  const lines: LineInstruction[] = [];
  if (isPos(p.inventoryNet)) lines.push({ roleKey: 'INVENTORY', side: 'debit', amount: p.inventoryNet });
  if (isPos(p.expenseNet)) lines.push({ roleKey: 'PURCHASES', side: 'debit', amount: p.expenseNet });
  pushInputTaxLines(lines, p.tax, p.taxSplit);
  if (ap.greaterThan(0) || !tds.greaterThan(0)) {
    lines.push({ roleKey: 'AP', side: 'credit', amount: ap.toFixed(4) });
  }
  if (tds.greaterThan(0)) {
    lines.push({ roleKey: 'TDS_PAYABLE', side: 'credit', amount: tds.toFixed(4) });
  }
  await gatedPost(tx, p.userId, p.date, 'Purchase', p.purchaseId, 'received', lines, undefined, p.currencyCode ?? 'BASE', p.exchangeRate, p.costCenterId, p.projectId);
}

/**
 * RCM self-invoice: Dr INPUT_* / Cr OUTPUT_* for GST liability + ITC.
 * Vendor AP must not include this tax (post purchase.received with tax=0).
 */
export async function postPurchaseRcmSelfInvoice(
  tx: PostingTx,
  p: {
    userId: string;
    purchaseId: string;
    date: Date;
    tax: string;
    taxSplit?: GstTaxSplit | null;
    currencyCode?: string;
    exchangeRate?: DecimalInput;
    costCenterId?: string | null;
    projectId?: string | null;
  },
): Promise<void> {
  if (!isPos(p.tax)) return;
  const lines: LineInstruction[] = [];
  pushInputTaxLines(lines, p.tax, p.taxSplit);
  pushOutputTaxLines(lines, p.tax, p.taxSplit);
  if (lines.length === 0) return;
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'Purchase',
    p.purchaseId,
    'rcm',
    lines,
    'RCM self-invoice (ITC + output liability)',
    p.currencyCode ?? 'BASE',
    p.exchangeRate,
    p.costCenterId,
    p.projectId,
  );
}

export async function postSupplierPayment(
  tx: PostingTx,
  p: {
    userId: string;
    purchaseId: string;
    paymentId: string;
    date: Date;
    amount: string;
    sourceType?: string | null;
    paymentModeSlug?: string | null;
    /** FX settlement: foreign currencyCode, rate at payment date, rate at document date */
    currencyCode?: string;
    paymentRate?: DecimalInput;
    documentRate?: DecimalInput;
  },
): Promise<void> {
  const from = cashRoleFor({ sourceType: p.sourceType, paymentModeSlug: p.paymentModeSlug });
  const isForeign = !!p.currencyCode && p.currencyCode !== 'BASE';
  const payRate = isForeign && p.paymentRate != null ? toDecimal(p.paymentRate) : null;
  const docRate = isForeign && p.documentRate != null ? toDecimal(p.documentRate) : null;
  const hasFxDiff = payRate != null && docRate != null && !payRate.equals(docRate);

  if (isForeign && hasFxDiff && payRate != null && docRate != null) {
    const amount = toDecimal(p.amount);
    // AP: settled at document rate (original posting rate)
    const apBase = amount.times(docRate).toFixed(4);
    // Bank/Cash: paid out at payment rate
    const cashBase = amount.times(payRate).toFixed(4);
    // FX residual: |cashBase - apBase| — computed from already-rounded legs so
    // the three base amounts balance by construction (avoids repeating-decimal drift)
    const fxBase = toDecimal(cashBase).minus(toDecimal(apBase)).abs().toFixed(4);
    // paymentRate > documentRate → we paid MORE base → FX loss (debit)
    // paymentRate < documentRate → we paid LESS base → FX gain (credit)
    // Verify balance: Dr AP (apBase) + Dr/Cr FX = Cr Cash (cashBase)
    // paymentRate > docRate: Dr AP (apBase) + Dr FX (fxBase) = Cr CASH (cashBase)
    //   e.g. apBase=80000 + fxBase=3000 = cashBase=83000 ✓
    // paymentRate < docRate: Dr AP (apBase) = Cr CASH (cashBase) + Cr FX (fxBase)
    //   e.g. apBase=80000 = cashBase=79000 + fxBase=1000 ✓
    const fxSide = payRate.greaterThan(docRate) ? 'debit' : 'credit';

    const lines: LineInstruction[] = [
      { roleKey: 'AP', side: 'debit', amount: p.amount, baseAmount: apBase },
      { roleKey: from, side: 'credit', amount: p.amount, baseAmount: cashBase },
      { roleKey: 'FX_GAIN_LOSS', side: fxSide, amount: '0', baseAmount: fxBase },
    ];
    await gatedPost(tx, p.userId, p.date, 'SupplierPayment', p.paymentId, 'payment', lines, undefined, p.currencyCode!, payRate);
  } else {
    // Functional currency path or equal rates — no FX leg
    await gatedPost(tx, p.userId, p.date, 'SupplierPayment', p.paymentId, 'payment', [
      { roleKey: 'AP', side: 'debit', amount: p.amount },
      { roleKey: from, side: 'credit', amount: p.amount },
    ], undefined, p.currencyCode ?? 'BASE', p.paymentRate);
  }
}

export async function postExpense(
  tx: PostingTx,
  p: {
    userId: string;
    expenseId: string;
    date: Date;
    total: string;
    tax: string;
    expenseAccountId: string;
    /** When reconciled to `tax`, posts INPUT_CGST/SGST/IGST instead of rollup. */
    taxSplit?: GstTaxSplit | null;
    sourceType?: string | null;
    paymentModeSlug?: string | null;
    costCenterId?: string | null;
    projectId?: string | null;
    currencyCode?: string;
    exchangeRate?: DecimalInput;
  },
): Promise<void> {
  const net = sub(p.total, p.tax);
  const from = cashRoleFor({ sourceType: p.sourceType, paymentModeSlug: p.paymentModeSlug });
  const lines: LineInstruction[] = [{ accountId: p.expenseAccountId, side: 'debit', amount: net }];
  pushInputTaxLines(lines, p.tax, p.taxSplit);
  lines.push({ roleKey: from, side: 'credit', amount: p.total });
  const effectiveCurrency = p.currencyCode && p.currencyCode !== 'BASE' ? p.currencyCode : 'BASE';
  const effectiveRate = effectiveCurrency !== 'BASE' ? p.exchangeRate : undefined;
  await gatedPost(tx, p.userId, p.date, 'Expense', p.expenseId, 'recorded', lines, undefined, effectiveCurrency, effectiveRate, p.costCenterId, p.projectId);
}

export async function postCreditNoteIssued(
  tx: PostingTx,
  p: {
    userId: string;
    creditNoteId: string;
    date: Date;
    total: string;
    tax: string;
    /** When reconciled to `tax`, reverses OUTPUT_CGST/SGST/IGST instead of rollup. */
    taxSplit?: GstTaxSplit | null;
  },
): Promise<void> {
  const net = sub(p.total, p.tax);
  const lines: LineInstruction[] = [{ roleKey: 'SALES_RETURNS', side: 'debit', amount: net }];
  pushOutputTaxLines(lines, p.tax, p.taxSplit, 'debit');
  lines.push({ roleKey: 'AR', side: 'credit', amount: p.total });
  await gatedPost(tx, p.userId, p.date, 'CreditNote', p.creditNoteId, 'issued', lines);
}

/** Outward sales debit note: Dr AR / Cr SALES_REVENUE + OUTPUT_* (invoice-like increase). */
export async function postSalesDebitNoteIssued(
  tx: PostingTx,
  p: {
    userId: string;
    salesDebitNoteId: string;
    date: Date;
    total: string;
    tax: string;
    /** When reconciled to `tax`, credits OUTPUT_CGST/SGST/IGST instead of rollup. */
    taxSplit?: GstTaxSplit | null;
  },
): Promise<void> {
  const net = sub(p.total, p.tax);
  const lines: LineInstruction[] = [
    { roleKey: 'AR', side: 'debit', amount: p.total },
    { roleKey: 'SALES_REVENUE', side: 'credit', amount: net },
  ];
  pushOutputTaxLines(lines, p.tax, p.taxSplit, 'credit');
  await gatedPost(tx, p.userId, p.date, 'SalesDebitNote', p.salesDebitNoteId, 'issued', lines);
}

export async function postDebitNoteIssued(
  tx: PostingTx,
  p: {
    userId: string;
    debitNoteId: string;
    date: Date;
    total: string;
    tax: string;
    inventoryNet: string;
    expenseNet: string;
    /** When reconciled to `tax`, reverses INPUT_CGST/SGST/IGST instead of rollup. */
    taxSplit?: GstTaxSplit | null;
  },
): Promise<void> {
  assertSplit('debitNote.issued', p.total, [p.inventoryNet, p.expenseNet, p.tax]);
  const lines: LineInstruction[] = [{ roleKey: 'AP', side: 'debit', amount: p.total }];
  pushInputTaxLines(lines, p.tax, p.taxSplit, 'credit');
  if (isPos(p.inventoryNet)) lines.push({ roleKey: 'INVENTORY', side: 'credit', amount: p.inventoryNet });
  if (isPos(p.expenseNet)) lines.push({ roleKey: 'PURCHASES', side: 'credit', amount: p.expenseNet });
  await gatedPost(tx, p.userId, p.date, 'DebitNote', p.debitNoteId, 'issued', lines);
}

/** Recognize COGS on a sale: Dr COGS / Cr INVENTORY at cost. event 'cogs'. No-op if cost <= 0. */
export async function postSaleCogs(
  tx: PostingTx, p: { userId: string; invoiceId: string; date: Date; cost: string },
): Promise<void> {
  if (!isPos(p.cost)) return;
  await gatedPost(tx, p.userId, p.date, 'Invoice', p.invoiceId, 'cogs', [
    { roleKey: 'COGS', side: 'debit', amount: p.cost },
    { roleKey: 'INVENTORY', side: 'credit', amount: p.cost },
  ]);
}

/** Reverse a sales return's COGS (restock): Dr INVENTORY / Cr COGS. event 'cogs' on the CreditNote. */
export async function postReturnCogs(
  tx: PostingTx, p: { userId: string; creditNoteId: string; date: Date; cost: string },
): Promise<void> {
  if (!isPos(p.cost)) return;
  await gatedPost(tx, p.userId, p.date, 'CreditNote', p.creditNoteId, 'cogs', [
    { roleKey: 'INVENTORY', side: 'debit', amount: p.cost },
    { roleKey: 'COGS', side: 'credit', amount: p.cost },
  ]);
}

/**
 * Post a straight-line depreciation charge:
 *   Dr DEPRECIATION_EXPENSE / Cr ACCUMULATED_DEPRECIATION
 *
 * Gated (no-op when ledger not live). Idempotent per asset + period via
 * event key `depr.<period>` (e.g. 'depr.2026-06').
 */
export async function postDepreciation(
  tx: PostingTx,
  p: { userId: string; assetId: string; date: Date; amount: string; period: string },
): Promise<void> {
  await gatedPost(tx, p.userId, p.date, 'FixedAsset', p.assetId, `depr.${p.period}`, [
    { roleKey: 'DEPRECIATION_EXPENSE', side: 'debit', amount: p.amount },
    { roleKey: 'ACCUMULATED_DEPRECIATION', side: 'credit', amount: p.amount },
  ]);
}

/**
 * Post an asset acquisition (opt-in):
 *   Dr FIXED_ASSET / Cr BANK at cost.
 *
 * Defaults to false on asset creation to avoid double-counting a purchase
 * already recorded elsewhere in the ledger. Only call when the acquisition
 * has NOT been posted by any other document (invoice, purchase, etc.).
 *
 * Gated (no-op when ledger not live).
 */
export async function postAssetAcquisition(
  tx: PostingTx,
  p: { userId: string; assetId: string; date: Date; cost: string },
): Promise<void> {
  await gatedPost(tx, p.userId, p.date, 'FixedAsset', p.assetId, 'acquisition', [
    { roleKey: 'FIXED_ASSET', side: 'debit', amount: p.cost },
    { roleKey: 'BANK', side: 'credit', amount: p.cost },
  ]);
}

/**
 * Manufacture build complete (value-neutral through WIP):
 *   1) Dr WIP / Cr INVENTORY  — issue components into WIP
 *   2) Dr INVENTORY / Cr WIP  — capitalize finished goods from WIP
 *
 * Net inventory + WIP unchanged; journal provides an audit trail of the build.
 * Gated (no-op when ledger not live). No-op if cost <= 0.
 */
export async function postManufactureCompleted(
  tx: PostingTx,
  p: { userId: string; manufactureOrderId: string; date: Date; cost: string },
): Promise<void> {
  if (!isPos(p.cost)) return;
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'ManufactureOrder',
    p.manufactureOrderId,
    'completed',
    [
      { roleKey: 'WIP', side: 'debit', amount: p.cost },
      { roleKey: 'INVENTORY', side: 'credit', amount: p.cost },
      { roleKey: 'INVENTORY', side: 'debit', amount: p.cost },
      { roleKey: 'WIP', side: 'credit', amount: p.cost },
    ],
    'Manufacture build (components → WIP → finished goods)',
  );
}

/**
 * Settle a TDS/TCS deposit challan against the tax payable liability:
 *   Dr TDS_PAYABLE | TCS_PAYABLE / Cr BANK
 *
 * Books settlement only — not OLTAS / TRACES. Gated (no-op when ledger not live).
 */
export async function postTaxDepositChallan(
  tx: PostingTx,
  p: {
    userId: string;
    challanId: string;
    date: Date;
    amount: string;
    kind: 'TDS' | 'TCS';
    challanNo?: string | null;
  },
): Promise<void> {
  if (!isPos(p.amount)) return;
  const payableRole = p.kind === 'TCS' ? 'TCS_PAYABLE' : 'TDS_PAYABLE';
  const label = p.challanNo?.trim()
    ? `${p.kind} deposit challan ${p.challanNo.trim()}`
    : `${p.kind} deposit challan`;
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'TaxDepositChallan',
    p.challanId,
    'deposit',
    [
      { roleKey: payableRole, side: 'debit', amount: p.amount },
      { roleKey: 'BANK', side: 'credit', amount: p.amount },
    ],
    label,
  );
}

/**
 * Record an advance-tax instalment payment:
 *   Dr ADVANCE_TAX / Cr BANK
 *
 * Books only — not OLTAS / Form 26AS. Gated (no-op when ledger not live).
 */
export async function postAdvanceTaxPayment(
  tx: PostingTx,
  p: {
    userId: string;
    paymentId: string;
    date: Date;
    amount: string;
    installment?: string | null;
    challanNo?: string | null;
  },
): Promise<void> {
  if (!isPos(p.amount)) return;
  const parts = ['Advance tax'];
  if (p.installment?.trim()) parts.push(p.installment.trim());
  if (p.challanNo?.trim()) parts.push(p.challanNo.trim());
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'AdvanceTaxPayment',
    p.paymentId,
    'payment',
    [
      { roleKey: 'ADVANCE_TAX', side: 'debit', amount: p.amount },
      { roleKey: 'BANK', side: 'credit', amount: p.amount },
    ],
    parts.join(' '),
  );
}

/**
 * Year-end income-tax provision (books):
 *   Dr INCOME_TAX_EXPENSE / Cr TAX_PAYABLE
 *
 * Not ITR computation / OLTAS. Gated (no-op when ledger not live).
 */
export async function postAdvanceTaxProvision(
  tx: PostingTx,
  p: {
    userId: string;
    setoffId: string;
    date: Date;
    amount: string;
    fyLabel?: string | null;
  },
): Promise<void> {
  if (!isPos(p.amount)) return;
  const label = p.fyLabel?.trim()
    ? `Income-tax provision FY ${p.fyLabel.trim()}`
    : 'Income-tax provision';
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'AdvanceTaxSetoff',
    p.setoffId,
    'provision',
    [
      { roleKey: 'INCOME_TAX_EXPENSE', side: 'debit', amount: p.amount },
      { roleKey: 'TAX_PAYABLE', side: 'credit', amount: p.amount },
    ],
    label,
  );
}

/**
 * Apply advance tax against tax payable (year-end setoff):
 *   Dr TAX_PAYABLE / Cr ADVANCE_TAX
 *
 * Books only — not ITR / OLTAS. Gated (no-op when ledger not live).
 */
export async function postAdvanceTaxSetoff(
  tx: PostingTx,
  p: {
    userId: string;
    setoffId: string;
    date: Date;
    amount: string;
    fyLabel?: string | null;
  },
): Promise<void> {
  if (!isPos(p.amount)) return;
  const label = p.fyLabel?.trim()
    ? `Advance tax setoff FY ${p.fyLabel.trim()}`
    : 'Advance tax setoff';
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'AdvanceTaxSetoff',
    p.setoffId,
    'setoff',
    [
      { roleKey: 'TAX_PAYABLE', side: 'debit', amount: p.amount },
      { roleKey: 'ADVANCE_TAX', side: 'credit', amount: p.amount },
    ],
    label,
  );
}

/**
 * Books provision for interest u/s 234B/C:
 *   Dr INCOME_TAX_EXPENSE / Cr TAX_PAYABLE
 *
 * Not CPC / ITR / OLTAS. Gated (no-op when ledger not live).
 */
export async function postInterest234Provision(
  tx: PostingTx,
  p: {
    userId: string;
    provisionId: string;
    date: Date;
    amount: string;
    fyLabel?: string | null;
  },
): Promise<void> {
  if (!isPos(p.amount)) return;
  const label = p.fyLabel?.trim()
    ? `Interest u/s 234B/C provision FY ${p.fyLabel.trim()}`
    : 'Interest u/s 234B/C provision';
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'Interest234Provision',
    p.provisionId,
    'provision',
    [
      { roleKey: 'INCOME_TAX_EXPENSE', side: 'debit', amount: p.amount },
      { roleKey: 'TAX_PAYABLE', side: 'credit', amount: p.amount },
    ],
    label,
  );
}

/**
 * Pay self-assessment tax against remaining income-tax liability:
 *   Dr TAX_PAYABLE / Cr BANK
 *
 * Books only — not OLTAS / ITR e-pay. Gated (no-op when ledger not live).
 */
export async function postSelfAssessmentTaxPayment(
  tx: PostingTx,
  p: {
    userId: string;
    paymentId: string;
    date: Date;
    amount: string;
    fyLabel?: string | null;
    challanNo?: string | null;
  },
): Promise<void> {
  if (!isPos(p.amount)) return;
  const parts = ['Self-assessment tax'];
  if (p.fyLabel?.trim()) parts.push(`FY ${p.fyLabel.trim()}`);
  if (p.challanNo?.trim()) parts.push(p.challanNo.trim());
  await gatedPost(
    tx,
    p.userId,
    p.date,
    'SelfAssessmentTaxPayment',
    p.paymentId,
    'payment',
    [
      { roleKey: 'TAX_PAYABLE', side: 'debit', amount: p.amount },
      { roleKey: 'BANK', side: 'credit', amount: p.amount },
    ],
    parts.join(' '),
  );
}

/** Reverse a previously-posted document entry (for edit/void). No-op if none. */
export async function reverseDocument(
  tx: PostingTx, p: { userId: string; sourceType: string; sourceId: string; event: string },
): Promise<void> {
  const existing = await tx.journalEntry.findFirst({
    where: { userId: p.userId, sourceType: p.sourceType, sourceId: p.sourceId, event: p.event, isDeleted: false },
  });
  if (!existing) return;
  await reverse(tx, existing.id);
}
