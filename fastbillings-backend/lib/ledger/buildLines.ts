// lib/ledger/buildLines.ts
import { toDecimal, sumDecimals, ZERO } from './money';
import type { BuiltLine, LineInstruction, PostingInput } from './types';

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerError';
  }
}

export class PeriodLockedError extends LedgerError {
  constructor(message: string) {
    super(message);
    this.name = 'PeriodLockedError';
  }
}

export type AccountResolver = (roleKey?: string, accountId?: string) => string;

const fmt = (d: ReturnType<typeof toDecimal>): string => d.toFixed(4);

export function buildLines(input: PostingInput, resolve: AccountResolver): BuiltLine[] {
  if (!input.instructions.length) {
    throw new LedgerError('posting has no instructions');
  }
  const rate = toDecimal(input.exchangeRate ?? 1);

  const lines: BuiltLine[] = input.instructions.map((ins: LineInstruction) => {
    if (!ins.roleKey && !ins.accountId) {
      throw new LedgerError('instruction needs roleKey or accountId');
    }
    if (ins.roleKey && ins.accountId) {
      throw new LedgerError('instruction has both roleKey and accountId');
    }
    const amount = toDecimal(ins.amount);
    if (amount.isNegative()) {
      throw new LedgerError('instruction amount must be >= 0');
    }
    // baseAmount override: when supplied, use it directly as the functional-
    // currency value for this leg (required for FX settlement legs where
    // AR/AP are relieved at the original document rate and cash at the payment
    // rate). A leg with amount=0 and a nonzero baseAmount is valid (FX adj leg).
    const baseAmt =
      ins.baseAmount != null ? toDecimal(ins.baseAmount) : amount.times(rate);
    if (baseAmt.isNegative()) {
      throw new LedgerError('instruction baseAmount must be >= 0');
    }
    // Stored per-line exchangeRate: reconstruct from base/foreign ratio.
    // When foreign amount is 0 (FX adjustment leg), fall back to the entry rate.
    const lineRate = amount.greaterThan(ZERO) ? baseAmt.dividedBy(amount) : rate;
    const isDebit = ins.side === 'debit';
    return {
      accountId: resolve(ins.roleKey, ins.accountId),
      debit: fmt(isDebit ? amount : ZERO),
      credit: fmt(isDebit ? ZERO : amount),
      currencyCode: input.currencyCode,
      exchangeRate: lineRate.toFixed(8),
      baseDebit: fmt(isDebit ? baseAmt : ZERO),
      baseCredit: fmt(isDebit ? ZERO : baseAmt),
      taxRoleKey: ins.taxRoleKey ?? null,
      description: ins.description ?? null,
    };
  });

  const totalDebit = sumDecimals(lines.map((l) => toDecimal(l.baseDebit)));
  const totalCredit = sumDecimals(lines.map((l) => toDecimal(l.baseCredit)));
  if (!totalDebit.equals(totalCredit)) {
    throw new LedgerError(
      `unbalanced entry: baseDebit ${totalDebit.toFixed(4)} != baseCredit ${totalCredit.toFixed(4)}`,
    );
  }
  return lines;
}
