/**
 * Books helpers for §40(a)(ia) / §40(a)(i) TDS non-deduction / non-deposit screening.
 * Resident §40(a)(ia) = 30% of taxable; non-resident §40(a)(i) = 100%.
 * Not Form 3CD / CPC due-date engine.
 */

/** Resident disallowance fraction under §40(a)(ia) (post-Finance Act 2014). */
export const SECTION_40A_IA_DISALLOW_RATE = 0.3;

/** Non-resident disallowance fraction under §40(a)(i). */
export const SECTION_40A_I_DISALLOW_RATE = 1;

export type Section40AiaIssue = 'NON_DEDUCTION' | 'NON_DEPOSIT';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function putative40AiaDisallowance(
  taxableAmount: number,
  rate = SECTION_40A_IA_DISALLOW_RATE,
): number {
  if (!Number.isFinite(taxableAmount) || taxableAmount <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return roundMoney(taxableAmount * rate);
}

export function putative40AiDisallowance(taxableAmount: number): number {
  return putative40AiaDisallowance(taxableAmount, SECTION_40A_I_DISALLOW_RATE);
}

/** Shared TDS deduction/deposit issue classifier (clause-agnostic). */
export function classifyTdsDepositIssue(opts: {
  tdsSection?: string | null;
  tdsAmount: number;
  challanAllocated: number;
  epsilon?: number;
}): Section40AiaIssue | null {
  const section = (opts.tdsSection || '').trim();
  const tds = Number(opts.tdsAmount) || 0;
  const allocated = Number(opts.challanAllocated) || 0;
  const eps = opts.epsilon ?? 0.01;

  if (section && tds <= eps) return 'NON_DEDUCTION';
  if (tds > eps && allocated + eps < tds) return 'NON_DEPOSIT';
  return null;
}

/**
 * §40(a)(ia) — residents only.
 * - NON_DEDUCTION: TDS section present but deducted TDS ≤ 0
 * - NON_DEPOSIT: TDS deducted but challan allocation shortfall > epsilon
 */
export function classify40AiaPurchase(opts: {
  tdsSection?: string | null;
  tdsAmount: number;
  challanAllocated: number;
  isNonResident?: boolean;
  epsilon?: number;
}): Section40AiaIssue | null {
  if (opts.isNonResident) return null;
  return classifyTdsDepositIssue(opts);
}

/**
 * §40(a)(i) — non-residents only (full disallowance of expenditure).
 */
export function classify40AiPurchase(opts: {
  tdsSection?: string | null;
  tdsAmount: number;
  challanAllocated: number;
  isNonResident?: boolean;
  epsilon?: number;
}): Section40AiaIssue | null {
  if (!opts.isNonResident) return null;
  return classifyTdsDepositIssue(opts);
}
