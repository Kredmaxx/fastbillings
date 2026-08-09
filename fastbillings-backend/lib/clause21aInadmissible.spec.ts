import { describe, it, expect } from 'vitest';
import { buildClause21aSchedule } from './clause21aInadmissible';

describe('clause21aInadmissible', () => {
  it('builds tagged total and worksheet putative roll-up', () => {
    const s = buildClause21aSchedule({
      taggedByClass: [
        { taxClass: 'DISALLOWABLE', categoryCount: 1, expenseCount: 5, amount: 45700 },
        { taxClass: 'PERSONAL', categoryCount: 1, expenseCount: 1, amount: 8000 },
        { taxClass: 'CAPITAL', categoryCount: 1, expenseCount: 1, amount: 25000 },
      ],
      worksheets: {
        section40A3: 18500,
        section43Bh: 1000,
        section43B: 50000,
        section40A2Excess: 7000,
        section36Va: 9210,
        section40Aia: 27000,
        section40Ai: 95000,
      },
      overlapCashInDisallowable: 24500,
    });
    expect(s.taggedTotal).toBe(78700);
    expect(s.overlapCashInDisallowable).toBe(24500);
    expect(s.worksheetPutativeTotal).toBe(18500 + 1000 + 50000 + 7000 + 9210 + 27000 + 95000);
    expect(s.worksheetLinks).toHaveLength(7);
  });
});
