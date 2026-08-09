/**
 * Books-only estimate of interest u/s 234B / 234C (IT Act).
 * Uses estimated assessed tax + advance-tax instalment schedule — not CPC / ITR computation.
 */

export type InstallmentKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface ScheduleRowInput {
  installment: InstallmentKey;
  cumulativePct: number;
  cumulativeTarget: number;
  paidThrough: number;
  shortfall: number;
}

export interface Interest234CLine {
  installment: InstallmentKey;
  shortfall: number;
  months: number;
  ratePercentPerMonth: number;
  interest: number;
}

export interface Interest234Estimate {
  notes: string;
  estimatedLiability: number;
  advanceTaxPaid: number;
  section234C: {
    lines: Interest234CLine[];
    total: number;
  };
  section234B: {
    applies: boolean;
    threshold90: number;
    unpaid: number;
    months: number;
    ratePercentPerMonth: number;
    interest: number;
    asOfDate: string | null;
  };
  totalInterest: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Months charged under 234C for each instalment shortfall (non-corporate schedule). */
export function months234C(installment: InstallmentKey): number {
  return installment === 'Q4' ? 1 : 3;
}

/**
 * Inclusive calendar months from fromDate to toDate (both at day granularity).
 * Cap at 0..36 for books estimate safety.
 */
export function inclusiveMonthCount(fromDate: Date, toDate: Date): number {
  const a = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
  const b = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
  if (b < a) return 0;
  const months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(0, Math.min(36, months));
}

/** Assessment year start = 1 Apr after FY start year. fyLabel e.g. 2026-27 → 2027-04-01. */
export function assessmentYearStart(fyLabel: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(fyLabel.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]) + 1, 3, 1)); // Apr = month 3
}

/** Default 234B end date = 31 Jul of assessment year (individual ITR due — books assumption). */
export function default234BAsOf(fyLabel: string): Date | null {
  const m = /^(\d{4})-(\d{2})$/.exec(fyLabel.trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]) + 1, 6, 31)); // Jul 31
}

export function estimateInterest234(input: {
  fyLabel: string;
  estimatedLiability: number;
  advanceTaxPaid: number;
  schedule: ScheduleRowInput[];
  /** Optional as-of for 234B months (e.g. self-assessment paid date). */
  asOfDate?: Date | null;
}): Interest234Estimate {
  const estimatedLiability = Math.max(0, round2(input.estimatedLiability));
  const advanceTaxPaid = Math.max(0, round2(input.advanceTaxPaid));

  const lines234C: Interest234CLine[] = [];
  if (estimatedLiability > 0) {
    for (const row of input.schedule) {
      const months = months234C(row.installment);
      const shortfall = Math.max(0, round2(row.shortfall));
      const interest = round2(shortfall * 0.01 * months);
      lines234C.push({
        installment: row.installment,
        shortfall,
        months,
        ratePercentPerMonth: 1,
        interest,
      });
    }
  }
  const total234C = round2(lines234C.reduce((s, l) => s + l.interest, 0));

  const threshold90 = round2(estimatedLiability * 0.9);
  const unpaid = Math.max(0, round2(estimatedLiability - advanceTaxPaid));
  const applies = estimatedLiability > 0 && advanceTaxPaid < threshold90 - 0.001 && unpaid > 0;

  const ayStart = assessmentYearStart(input.fyLabel);
  const asOf =
    input.asOfDate ??
    default234BAsOf(input.fyLabel) ??
    (ayStart ? new Date(Date.UTC(ayStart.getUTCFullYear(), 6, 31)) : null);
  const months234B =
    applies && ayStart && asOf ? inclusiveMonthCount(ayStart, asOf) : 0;
  const interest234B = applies ? round2(unpaid * 0.01 * months234B) : 0;

  return {
    notes:
      'Books estimate only: 234C = shortfall × 1%/month × 3 (Q1–Q3) or 1 (Q4); 234B = if advance tax < 90% of estimated liability, unpaid × 1%/month from 1 Apr AY to as-of (default 31 Jul). Ignores TDS/TCS credit, ₹1,000 de minimis, and CPC rounding. Not ITR / OLTAS.',
    estimatedLiability,
    advanceTaxPaid,
    section234C: { lines: lines234C, total: total234C },
    section234B: {
      applies,
      threshold90,
      unpaid: applies ? unpaid : 0,
      months: months234B,
      ratePercentPerMonth: 1,
      interest: interest234B,
      asOfDate: asOf ? asOf.toISOString().slice(0, 10) : null,
    },
    totalInterest: round2(total234C + interest234B),
  };
}
