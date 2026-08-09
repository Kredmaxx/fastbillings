import { describe, it, expect } from 'vitest';
import {
  buildClause34Line,
  clause34FormForPurchase,
  indiaFyQuarterLabel,
  mergeClause34bBuckets,
  rollupClause34ByFormQuarter,
  summarizeClause34,
} from './clause34Tds';

describe('clause34Tds', () => {
  it('maps India FY quarters', () => {
    expect(indiaFyQuarterLabel(new Date(2026, 3, 15))).toBe('Q1');
    expect(indiaFyQuarterLabel(new Date(2026, 7, 1))).toBe('Q2');
    expect(indiaFyQuarterLabel(new Date(2026, 10, 1))).toBe('Q3');
    expect(indiaFyQuarterLabel(new Date(2027, 1, 1))).toBe('Q4');
  });

  it('routes purchases to 26Q / 27Q', () => {
    expect(clause34FormForPurchase(false)).toBe('26Q');
    expect(clause34FormForPurchase(true)).toBe('27Q');
  });

  it('computes shortfall and form×quarter rollup', () => {
    const lines = [
      buildClause34Line({
        form: '26Q',
        sourceType: 'PURCHASE',
        sourceId: 'p1',
        docNumber: 'PUR-1',
        date: new Date(2026, 6, 10),
        section: '194C',
        partyName: 'TechSource',
        deducted: 500,
        deposited: 0,
      }),
      buildClause34Line({
        form: '27Q',
        sourceType: 'PURCHASE',
        sourceId: 'p2',
        docNumber: 'PUR-2',
        date: new Date(2026, 6, 12),
        section: '195',
        partyName: 'Pinnacle',
        deducted: 6000,
        deposited: 0,
      }),
      buildClause34Line({
        form: '24Q',
        sourceType: 'SALARY',
        sourceId: 's1',
        docNumber: null,
        date: new Date(2026, 5, 30),
        section: '192',
        partyName: 'Employee',
        deducted: 6500,
        deposited: 6500,
      }),
    ];
    expect(lines[0].shortfall).toBe(500);
    expect(lines[1].shortfall).toBe(6000);
    expect(lines[2].shortfall).toBe(0);

    const summary = summarizeClause34(lines);
    expect(summary.totalShortfall).toBe(6500);
    expect(summary.shortfallLineCount).toBe(2);

    const buckets = rollupClause34ByFormQuarter(lines);
    expect(buckets.find((b) => b.form === '26Q' && b.quarter === 'Q2')?.shortfall).toBe(500);
    expect(buckets.find((b) => b.form === '27Q' && b.quarter === 'Q2')?.shortfall).toBe(6000);

    const clause34b = mergeClause34bBuckets(buckets, [
      {
        id: 'f1',
        form: '24Q',
        quarter: 'Q1',
        isFiled: true,
        filedDate: '2026-07-15',
        acknowledgementNo: 'ACK-24Q',
        notes: null,
      },
      {
        id: 'f2',
        form: '27Q',
        quarter: 'Q2',
        isFiled: true,
        filedDate: '2026-08-01',
        acknowledgementNo: 'ACK-27Q',
        notes: null,
      },
    ]);
    expect(clause34b.applicableCount).toBe(3);
    expect(clause34b.filedCount).toBe(2);
    expect(clause34b.unfiledCount).toBe(1);
    expect(
      clause34b.buckets.find((b) => b.form === '26Q' && b.quarter === 'Q2')?.filingStatus,
    ).toBe('UNFILED');
  });
});
