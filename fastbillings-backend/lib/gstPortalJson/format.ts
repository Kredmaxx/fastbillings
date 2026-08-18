/** Round to 2 decimal places for GST amounts. */
export function roundGst(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/** Portal invoice date: DD-MM-YYYY */
export function portalDate(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * GST return filing period from range start: MMYYYY (e.g. April 2026 → "042026").
 * Uses the month of `fromDate` when the range is a single calendar month.
 */
export function filingPeriodFromRange(fromDate: Date, toDate: Date): string {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  // If range spans multiple months, use the month containing most days or from-month
  const mm = String(from.getMonth() + 1).padStart(2, '0');
  const yyyy = from.getFullYear();
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return `${mm}${yyyy}`;
  }
  return `${mm}${yyyy}`;
}

/** Sanitize invoice / note number for portal (max 16 chars, no leading spaces). */
export function portalDocNumber(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .slice(0, 16);
}
