/**
 * Books helpers for §43B unpaid statutory dues (bonus/PF/ESI/etc.).
 * Category nature tags + expense payment status — not Form 3CD / payroll / CPC.
 */

export const SECTION_43B_NATURES = [
  'NONE',
  'BONUS',
  'PF_EMPLOYER',
  'ESI_EMPLOYER',
  'LEAVE_ENCASHMENT',
  'INTEREST_BANK',
  'TAX_DUTY_CESS',
  'OTHER_43B',
] as const;

export type Section43BNatureCode = (typeof SECTION_43B_NATURES)[number];

export function isSection43BTrackedNature(
  nature: string | null | undefined,
): nature is Exclude<Section43BNatureCode, 'NONE'> {
  if (!nature || nature === 'NONE') return false;
  return (SECTION_43B_NATURES as readonly string[]).includes(nature);
}

/**
 * Default ITR due-date proxy for companies: 31 Oct after FY end calendar year.
 * FY ending 31 Mar 2026 → due 31 Oct 2026. Override via query when needed.
 */
export function defaultSection43BReturnDueDate(fyEnd: Date): Date {
  return new Date(Date.UTC(fyEnd.getUTCFullYear(), 9, 31, 23, 59, 59, 999));
}

/**
 * Unpaid tagged statutory dues accrued on/before FY end → putative disallowance.
 */
export function putative43BUnpaidDisallowance(opts: {
  amount: number;
  paymentStatus: string;
  expenseDate: Date;
  fyEnd: Date;
  nature: string | null | undefined;
}): number {
  if (!isSection43BTrackedNature(opts.nature)) return 0;
  if (String(opts.paymentStatus).toUpperCase() !== 'PENDING') return 0;
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (opts.expenseDate.getTime() > opts.fyEnd.getTime()) return 0;
  return Math.round(amount * 100) / 100;
}

/**
 * Paid after return due-date proxy → review row (deduction may shift to year of payment).
 */
export function isLate43BPayment(opts: {
  paidDate: Date | null | undefined;
  returnDueDate: Date;
  nature: string | null | undefined;
  paymentStatus: string;
}): boolean {
  if (!isSection43BTrackedNature(opts.nature)) return false;
  if (String(opts.paymentStatus).toUpperCase() !== 'PAID') return false;
  if (!opts.paidDate) return false;
  return opts.paidDate.getTime() > opts.returnDueDate.getTime();
}
