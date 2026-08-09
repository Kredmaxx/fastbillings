import { describe, it, expect } from 'vitest';
import {
  estimateInterest234,
  inclusiveMonthCount,
  months234C,
  assessmentYearStart,
  default234BAsOf,
} from './interest234';

describe('interest234 helpers', () => {
  it('234C months: Q1–Q3 = 3, Q4 = 1', () => {
    expect(months234C('Q1')).toBe(3);
    expect(months234C('Q2')).toBe(3);
    expect(months234C('Q3')).toBe(3);
    expect(months234C('Q4')).toBe(1);
  });

  it('inclusiveMonthCount Apr–Jul = 4', () => {
    expect(
      inclusiveMonthCount(new Date('2027-04-01T00:00:00.000Z'), new Date('2027-07-31T00:00:00.000Z')),
    ).toBe(4);
  });

  it('assessment year start / default as-of from fyLabel', () => {
    expect(assessmentYearStart('2026-27')?.toISOString().slice(0, 10)).toBe('2027-04-01');
    expect(default234BAsOf('2026-27')?.toISOString().slice(0, 10)).toBe('2027-07-31');
  });
});

describe('estimateInterest234', () => {
  const schedule = [
    {
      installment: 'Q1' as const,
      cumulativePct: 0.15,
      cumulativeTarget: 30000,
      paidThrough: 0,
      shortfall: 30000,
    },
    {
      installment: 'Q2' as const,
      cumulativePct: 0.45,
      cumulativeTarget: 90000,
      paidThrough: 45000,
      shortfall: 45000,
    },
    {
      installment: 'Q3' as const,
      cumulativePct: 0.75,
      cumulativeTarget: 150000,
      paidThrough: 135000,
      shortfall: 15000,
    },
    {
      installment: 'Q4' as const,
      cumulativePct: 1,
      cumulativeTarget: 200000,
      paidThrough: 135000,
      shortfall: 65000,
    },
  ];

  it('computes 234C from shortfalls and 234B when advance < 90%', () => {
    const est = estimateInterest234({
      fyLabel: '2026-27',
      estimatedLiability: 200000,
      advanceTaxPaid: 135000,
      schedule,
    });
    // 30000*3% + 45000*3% + 15000*3% + 65000*1% = 900 + 1350 + 450 + 650 = 3350
    expect(est.section234C.total).toBe(3350);
    expect(est.section234B.applies).toBe(true); // 135k < 180k
    expect(est.section234B.unpaid).toBe(65000);
    expect(est.section234B.months).toBe(4);
    expect(est.section234B.interest).toBe(2600); // 65000 * 1% * 4
    expect(est.totalInterest).toBe(5950);
  });

  it('skips 234B when advance tax >= 90%', () => {
    const est = estimateInterest234({
      fyLabel: '2026-27',
      estimatedLiability: 100000,
      advanceTaxPaid: 90000,
      schedule: [
        {
          installment: 'Q4',
          cumulativePct: 1,
          cumulativeTarget: 100000,
          paidThrough: 90000,
          shortfall: 10000,
        },
      ],
    });
    expect(est.section234B.applies).toBe(false);
    expect(est.section234B.interest).toBe(0);
    expect(est.section234C.total).toBe(100); // 10000 * 1% * 1
  });

  it('returns zeros when estimated liability is 0', () => {
    const est = estimateInterest234({
      fyLabel: '2026-27',
      estimatedLiability: 0,
      advanceTaxPaid: 0,
      schedule: [],
    });
    expect(est.totalInterest).toBe(0);
    expect(est.section234B.applies).toBe(false);
  });
});
