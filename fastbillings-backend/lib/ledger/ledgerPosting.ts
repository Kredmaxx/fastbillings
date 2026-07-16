// lib/ledger/ledgerPosting.ts
import { post, reverse, type LedgerTx } from './postingEngine';
import { shouldPost } from './postingGate';
import { LedgerError } from './buildLines';
import { toDecimal, sumDecimals } from './money';
import type { LineInstruction } from './types';
import type { DecimalInput } from './money';

/** The slice of Prisma the posting layer needs (superset of LedgerTx). */
export interface PostingTx extends LedgerTx {
  companySettings: { findFirst: (args: unknown) => Promise<{ ledgerInitialized: boolean; goLiveDate: Date | null } | null> };
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
  await post(tx, { userId, sourceType, sourceId, event, date, currencyCode, exchangeRate, instructions, description, costCenterId, projectId });
}

export async function postInvoiceIssued(
  tx: PostingTx,
  p: { userId: string; invoiceId: string; date: Date; total: string; tax: string; currencyCode?: string; exchangeRate?: DecimalInput; costCenterId?: string | null; projectId?: string | null },
): Promise<void> {
  const net = sub(p.total, p.tax);
  const lines: LineInstruction[] = [
    { roleKey: 'AR', side: 'debit', amount: p.total },
    { roleKey: 'SALES_REVENUE', side: 'credit', amount: net },
  ];
  if (isPos(p.tax)) lines.push({ roleKey: 'OUTPUT_TAX', side: 'credit', amount: p.tax, taxRoleKey: 'OUTPUT_TAX' });
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
  p: { userId: string; purchaseId: string; date: Date; total: string; tax: string; inventoryNet: string; expenseNet: string; currencyCode?: string; exchangeRate?: DecimalInput; costCenterId?: string | null; projectId?: string | null },
): Promise<void> {
  assertSplit('purchase.received', p.total, [p.inventoryNet, p.expenseNet, p.tax]);
  const lines: LineInstruction[] = [];
  if (isPos(p.inventoryNet)) lines.push({ roleKey: 'INVENTORY', side: 'debit', amount: p.inventoryNet });
  if (isPos(p.expenseNet)) lines.push({ roleKey: 'PURCHASES', side: 'debit', amount: p.expenseNet });
  if (isPos(p.tax)) lines.push({ roleKey: 'INPUT_TAX', side: 'debit', amount: p.tax, taxRoleKey: 'INPUT_TAX' });
  lines.push({ roleKey: 'AP', side: 'credit', amount: p.total });
  await gatedPost(tx, p.userId, p.date, 'Purchase', p.purchaseId, 'received', lines, undefined, p.currencyCode ?? 'BASE', p.exchangeRate, p.costCenterId, p.projectId);
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
  p: { userId: string; expenseId: string; date: Date; total: string; tax: string; expenseAccountId: string; sourceType?: string | null; paymentModeSlug?: string | null; costCenterId?: string | null; projectId?: string | null; currencyCode?: string; exchangeRate?: DecimalInput },
): Promise<void> {
  const net = sub(p.total, p.tax);
  const from = cashRoleFor({ sourceType: p.sourceType, paymentModeSlug: p.paymentModeSlug });
  const lines: LineInstruction[] = [{ accountId: p.expenseAccountId, side: 'debit', amount: net }];
  if (isPos(p.tax)) lines.push({ roleKey: 'INPUT_TAX', side: 'debit', amount: p.tax, taxRoleKey: 'INPUT_TAX' });
  lines.push({ roleKey: from, side: 'credit', amount: p.total });
  const effectiveCurrency = p.currencyCode && p.currencyCode !== 'BASE' ? p.currencyCode : 'BASE';
  const effectiveRate = effectiveCurrency !== 'BASE' ? p.exchangeRate : undefined;
  await gatedPost(tx, p.userId, p.date, 'Expense', p.expenseId, 'recorded', lines, undefined, effectiveCurrency, effectiveRate, p.costCenterId, p.projectId);
}

export async function postCreditNoteIssued(
  tx: PostingTx, p: { userId: string; creditNoteId: string; date: Date; total: string; tax: string },
): Promise<void> {
  const net = sub(p.total, p.tax);
  const lines: LineInstruction[] = [{ roleKey: 'SALES_RETURNS', side: 'debit', amount: net }];
  if (isPos(p.tax)) lines.push({ roleKey: 'OUTPUT_TAX', side: 'debit', amount: p.tax, taxRoleKey: 'OUTPUT_TAX' });
  lines.push({ roleKey: 'AR', side: 'credit', amount: p.total });
  await gatedPost(tx, p.userId, p.date, 'CreditNote', p.creditNoteId, 'issued', lines);
}

export async function postDebitNoteIssued(
  tx: PostingTx, p: { userId: string; debitNoteId: string; date: Date; total: string; tax: string; inventoryNet: string; expenseNet: string },
): Promise<void> {
  assertSplit('debitNote.issued', p.total, [p.inventoryNet, p.expenseNet, p.tax]);
  const lines: LineInstruction[] = [{ roleKey: 'AP', side: 'debit', amount: p.total }];
  if (isPos(p.tax)) lines.push({ roleKey: 'INPUT_TAX', side: 'credit', amount: p.tax, taxRoleKey: 'INPUT_TAX' });
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
