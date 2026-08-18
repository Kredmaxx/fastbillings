import { describe, it, expect } from 'vitest';
import { buildTaxAuditPackClauses, summarizeTaxAuditPack } from './taxAuditPack';

describe('taxAuditPack', () => {
  it('builds clause index with putative disallowance sum', () => {
    const clauses = buildTaxAuditPackClauses({
      expenseInadmissibleTagged: 78700,
      section40A3: 18500,
      section40A3Excepted: 1,
      section269ST: 480000,
      section43Bh: 175855.4,
      section43B: 50000,
      section40A2: 118000,
      section40A2Excess: 7000,
      section36Va: 9210,
      section40Aia: 27000,
      section40Ai: 95000,
      itDepreciation: 130950,
      section34Shortfall: 6500,
      section34bUnfiledCount: 1,
      hasItWdv: true,
      hasClause34: true,
      hasClause34b: true,
      hasTaxAuditClassification: true,
    });
    expect(clauses.length).toBeGreaterThanOrEqual(10);
    const cash = clauses.find((c) => c.clause.includes('40A(3)'));
    expect(cash?.amount).toBe(18500);
    expect(cash?.notes).toMatch(/Rule 6DD/);
    const st = clauses.find((c) => c.clause === '31 / §269ST');
    expect(st?.amount).toBe(480000);
    expect(st?.includeInPutativeSum).toBe(false);
    expect(st?.detailPath).toContain('cash-receipt-269st');
    const dep = clauses.find((c) => c.clause === '13 / 18');
    expect(dep?.amount).toBe(130950);
    expect(dep?.includeInPutativeSum).toBe(false);
    expect(dep?.detailPath).toContain('books-vs-it-depreciation');
    const c34 = clauses.find((c) => c.clause === '34(a)');
    expect(c34?.status).toBe('READY_BOOKS');
    expect(c34?.amount).toBe(6500);
    expect(c34?.includeInPutativeSum).toBe(false);
    expect(c34?.detailPath).toContain('clause-34-tds');
    const c34b = clauses.find((c) => c.clause === '34(b)');
    expect(c34b?.status).toBe('READY_BOOKS');
    expect(c34b?.amount).toBe(1);
    expect(c34b?.includeInPutativeSum).toBe(false);
    const c21a = clauses.find((c) => c.clause === '21(a)');
    expect(c21a?.amount).toBe(78700);
    expect(c21a?.status).toBe('READY_BOOKS');
    expect(c21a?.includeInPutativeSum).toBe(false);
    const s36 = clauses.find((c) => c.clause === '20(b) / §36(1)(va)');
    expect(s36?.amount).toBe(9210);
    const s43b = clauses.find((c) => c.clause === '26 / §43B');
    expect(s43b?.amount).toBe(50000);
    const s40a2 = clauses.find((c) => c.clause === '23 / §40A(2)');
    expect(s40a2?.amount).toBe(118000);
    expect(s40a2?.includeInPutativeSum).toBe(false);
    expect(s40a2?.putativeExtra).toBe(7000);
    const summary = summarizeTaxAuditPack(clauses);
    // 21(a) tagged schedule excluded from putative; statutory worksheets + FMV excess only.
    expect(summary.totalPutativeDisallowance).toBe(
      18500 + 175855.4 + 50000 + 7000 + 9210 + 27000 + 95000,
    );
    expect(summary.readyBooksCount).toBeGreaterThan(0);
  });
});
