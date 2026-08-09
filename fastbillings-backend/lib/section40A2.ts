/**
 * Books helpers for §40A(2) related-party / specified-person payments.
 * Disclosure & optional FMV-excess tags — not automatic disallowance / Form 3CD.
 */

export function isRelatedPartyFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1;
}

/** Round money to 2 decimals. */
export function roundRelatedPartyAmount(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Payment amount for disclosure rows. Prefer paid/total; fall back to taxable.
 * Not a putative disallowance — AO determines excess over FMV.
 */
export function relatedPartyPaymentAmount(opts: {
  totalAmount?: number | null;
  paidAmount?: number | null;
  taxableAmount?: number | null;
  amount?: number | null;
}): number {
  const candidates = [opts.paidAmount, opts.totalAmount, opts.amount, opts.taxableAmount];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n > 0) return roundRelatedPartyAmount(n);
  }
  return 0;
}

/**
 * Putative §40A(2) excess when auditor tags FMV below payment.
 * Untagged (null FMV) → 0. Not AO / Form 3CD determination.
 */
export function excessOverFmvAmount(opts: {
  paymentAmount: number;
  fairMarketValue: number | null | undefined;
}): number {
  if (opts.fairMarketValue == null || opts.fairMarketValue === undefined) return 0;
  const fmv = Number(opts.fairMarketValue);
  if (!Number.isFinite(fmv) || fmv < 0) return 0;
  const payment = roundRelatedPartyAmount(opts.paymentAmount);
  const excess = roundRelatedPartyAmount(payment - roundRelatedPartyAmount(fmv));
  return excess > 0 ? excess : 0;
}

export function parseFairMarketValueInput(raw: unknown): {
  ok: boolean;
  value: number | null;
  error?: string;
} {
  if (raw == null || raw === '') return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, value: null, error: 'fairMarketValue must be a non-negative number or empty' };
  }
  return { ok: true, value: roundRelatedPartyAmount(n) };
}
