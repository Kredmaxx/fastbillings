/**
 * Books helpers for §43B(h) MSME payment-delay screening (IT Act).
 * Uses purchase date as acceptance proxy + default 45-day window — not Form 3CD / MSME portal.
 */

/** Default buyer payment window (no written agreement) under MSME Act / §43B(h) practice. */
export const MSME_43BH_DAYS = 45;

export function addUtcDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function paymentDeadlineFromPurchase(
  purchaseDate: Date,
  daysLimit = MSME_43BH_DAYS,
): Date {
  return addUtcDays(purchaseDate, daysLimit);
}

export function daysPastDeadline(deadline: Date, asOf: Date): number {
  const ms = asOf.getTime() - deadline.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Unpaid balance is putatively disallowable under §43B(h) books screen when
 * the payment deadline has passed as of FY end and a balance remains.
 */
export function putative43BhDisallowance(opts: {
  balanceAmount: number;
  purchaseDate: Date;
  fyEnd: Date;
  daysLimit?: number;
}): number {
  const balance = Number(opts.balanceAmount);
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  if (opts.purchaseDate.getTime() > opts.fyEnd.getTime()) return 0;
  const deadline = paymentDeadlineFromPurchase(opts.purchaseDate, opts.daysLimit);
  if (deadline.getTime() > opts.fyEnd.getTime()) return 0;
  return Math.round(balance * 100) / 100;
}

export function isLatePayment(opts: {
  paymentDate: Date;
  purchaseDate: Date;
  daysLimit?: number;
}): boolean {
  const deadline = paymentDeadlineFromPurchase(opts.purchaseDate, opts.daysLimit);
  return opts.paymentDate.getTime() > deadline.getTime();
}
