// lib/ledger/cutover.ts
import { toDecimal, ZERO } from './money';
import { post } from './postingEngine';
import { LedgerError } from './buildLines';
import type { LineInstruction } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpeningSummary {
  bank: string;
  cash: string;
  ar: string;
  inventory: string;
  ap: string;
}

export interface CutoverTx {
  companySettings: {
    findFirst: (args: unknown) => Promise<{ id: string; ledgerInitialized: boolean; functionalCurrency: string | null; goLiveDate: Date | null } | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  bankDetail: { findMany: (args: unknown) => Promise<{ currentBalance: unknown; accountType?: string | null }[]> };
  /** PettyCash has no userId in the schema — queried as a singleton findFirst. */
  pettyCash: { findFirst: (args: unknown) => Promise<{ currentBalance: unknown } | null> };
  invoice: { findMany: (args: unknown) => Promise<{ TotalAmount: unknown; payments: { amount: unknown }[] }[]> };
  purchase: { findMany: (args: unknown) => Promise<{ totalAmount: unknown; paidAmount: unknown }[]> };
  inventory: { findMany: (args: unknown) => Promise<{ quantityOnHand: unknown; avgCost: unknown }[]> };
  ledgerAccountMapping: { findMany: (args: unknown) => Promise<{ roleKey: string; accountId: string }[]> };
  accountingPeriod: { findFirst: (args: unknown) => Promise<unknown> };
  journalEntry: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: { data: unknown }) => Promise<{ id: string }>;
  };
}

export interface CutoverPreview {
  summary: OpeningSummary;
  lines: LineInstruction[];
  balanced: boolean;
  asOf: string;
}

// ---------------------------------------------------------------------------
// Pure builder
// ---------------------------------------------------------------------------

const isPos = (v: string): boolean => toDecimal(v).greaterThan(0);

/** Build a balanced opening journal: assets debit, liabilities credit,
 *  residual equity to OPENING_BALANCE_EQUITY. Zero lines omitted. */
export function buildOpeningInstructions(s: OpeningSummary): LineInstruction[] {
  const lines: LineInstruction[] = [];
  if (isPos(s.bank)) lines.push({ roleKey: 'BANK', side: 'debit', amount: s.bank });
  if (isPos(s.cash)) lines.push({ roleKey: 'CASH', side: 'debit', amount: s.cash });
  if (isPos(s.ar)) lines.push({ roleKey: 'AR', side: 'debit', amount: s.ar });
  if (isPos(s.inventory)) lines.push({ roleKey: 'INVENTORY', side: 'debit', amount: s.inventory });
  if (isPos(s.ap)) lines.push({ roleKey: 'AP', side: 'credit', amount: s.ap });

  const assets = toDecimal(s.bank).plus(s.cash).plus(s.ar).plus(s.inventory);
  const equity = assets.minus(toDecimal(s.ap)); // net worth brought forward
  if (equity.greaterThan(0)) {
    lines.push({ roleKey: 'OPENING_BALANCE_EQUITY', side: 'credit', amount: equity.toString() });
  } else if (equity.lessThan(0)) {
    lines.push({ roleKey: 'OPENING_BALANCE_EQUITY', side: 'debit', amount: equity.abs().toString() });
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dec = (v: unknown): import('@prisma/client').Prisma.Decimal => toDecimal((v ?? 0) as never);

function priorDay(d: Date): Date { return new Date(d.getTime() - 24 * 60 * 60 * 1000); }

async function loadSettings(tx: CutoverTx, userId: string) {
  const s = await tx.companySettings.findFirst({ where: { userId } });
  if (!s || !s.goLiveDate) throw new LedgerError('ledger not configured (run country setup first)');
  return s;
}

// ---------------------------------------------------------------------------
// computeOpeningSummary
// ---------------------------------------------------------------------------

export async function computeOpeningSummary(tx: CutoverTx, userId: string, asOf: Date): Promise<OpeningSummary> {
  const banks = await tx.bankDetail.findMany({ where: { userId, isDeleted: false } });

  // PettyCash has no userId in schema — treat as singleton (one per installation)
  const petty = await tx.pettyCash.findFirst({ where: {} });

  const invoices = await tx.invoice.findMany({
    where: { userId, isDeleted: false, invoiceType: 'INVOICE', invoiceDate: { lte: asOf } },
    select: { TotalAmount: true, payments: { select: { amount: true } } },
  });

  const purchases = await tx.purchase.findMany({
    where: { userId, isDeleted: false, purchaseDate: { lte: asOf } },
    select: { totalAmount: true, paidAmount: true },
  });

  const inv = await tx.inventory.findMany({
    where: { userId, isDeleted: false },
    select: { quantityOnHand: true, avgCost: true },
  });

  const bank = banks.reduce((a, b) => a.plus(dec(b.currentBalance)), ZERO);
  const cash = petty ? dec(petty.currentBalance) : ZERO;

  const ar = invoices.reduce((a, i) => {
    const paid = i.payments.reduce((p, x) => p.plus(dec(x.amount)), ZERO);
    const bal = dec(i.TotalAmount).minus(paid);
    return bal.greaterThan(0) ? a.plus(bal) : a;
  }, ZERO);

  const ap = purchases.reduce((a, p) => {
    const bal = dec(p.totalAmount).minus(dec(p.paidAmount));
    return bal.greaterThan(0) ? a.plus(bal) : a;
  }, ZERO);

  const inventory = inv.reduce((a, r) => a.plus(dec(r.quantityOnHand).times(dec(r.avgCost))), ZERO);

  return {
    bank: bank.toString(),
    cash: cash.toString(),
    ar: ar.toString(),
    inventory: inventory.toString(),
    ap: ap.toString(),
  };
}

// ---------------------------------------------------------------------------
// previewCutover
// ---------------------------------------------------------------------------

export async function previewCutover(tx: CutoverTx, userId: string): Promise<CutoverPreview> {
  const s = await loadSettings(tx, userId);
  const asOf = priorDay(s.goLiveDate!);
  const summary = await computeOpeningSummary(tx, userId, asOf);
  const lines = buildOpeningInstructions(summary);
  return { summary, lines, balanced: true, asOf: asOf.toISOString() };
}

// ---------------------------------------------------------------------------
// commitCutover
// ---------------------------------------------------------------------------

export async function commitCutover(tx: CutoverTx, userId: string): Promise<{ id: string } | null> {
  const s = await loadSettings(tx, userId);

  // Idempotency: one opening entry per tenant. Ensure ledgerInitialized is set
  // true on EVERY commit call (even the early-return path) so a prior partial
  // failure that left the flag false can be repaired by re-running commit.
  const existing = await tx.journalEntry.findFirst({
    where: { userId, sourceType: 'Cutover', event: 'opening', isDeleted: false },
  });
  if (existing) {
    await tx.companySettings.update({ where: { id: s.id }, data: { ledgerInitialized: true } });
    return existing;
  }

  const asOf = priorDay(s.goLiveDate!);
  const summary = await computeOpeningSummary(tx, userId, asOf);
  const instructions = buildOpeningInstructions(summary);

  let entry: { id: string } | null = null;
  if (instructions.length > 0) {
    // post() directly — bypasses the cutover gate intentionally (opening entry
    // predates go-live by design; the gate checks ledgerInitialized, not date).
    entry = await post(tx as never, {
      userId,
      sourceType: 'Cutover',
      sourceId: userId,
      event: 'opening',
      date: asOf,
      currencyCode: s.functionalCurrency ?? 'BASE',
      description: 'Opening balances (cutover)',
      isOpeningBalance: true,
      instructions,
    });
  }

  await tx.companySettings.update({ where: { id: s.id }, data: { ledgerInitialized: true } });
  return entry;
}
