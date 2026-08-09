import { describe, it, expect } from 'vitest';
import { escapeTaxAuditPackCsv, taxAuditPackToCsv } from './taxAuditPackExport';

describe('taxAuditPackExport', () => {
  it('escapes commas and quotes', () => {
    expect(escapeTaxAuditPackCsv('a,b')).toBe('"a,b"');
    expect(escapeTaxAuditPackCsv('say "hi"')).toBe('"say ""hi"""');
  });

  it('flattens pack clauses and summary', () => {
    const csv = taxAuditPackToCsv({
      form: 'TAX-AUDIT-PACK',
      notes: 'Books index — not Form 3CD',
      period: { fy: '2026-27', from: '2026-04-01', to: '2027-03-31' },
      summary: {
        clauseCount: 2,
        totalPutativeDisallowance: 18500,
      },
      readiness: { canFile: false, blockers: ['Books only'] },
      clauses: [
        {
          clause: '21(d) / §40A(3)',
          title: 'Cash payments',
          status: 'READY_BOOKS',
          amount: 18500,
          detailPath: '/admin/accounting/reports/cash-expense-disallowance',
          notes: 'Rule 6DD tags optional',
        },
        {
          clause: '34(b)',
          title: 'TDS/TCS statements filed',
          status: 'READY_BOOKS',
          amount: 1,
          includeInPutativeSum: false,
          detailPath: '/admin/accounting/reports/clause-34-tds',
          notes: 'Books flags',
        },
      ],
      worksheets: {
        section40A3: { totalPutativeDisallowance: 18500, exceptedCount: 1 },
      },
    });

    expect(csv).toContain('period,fy,2026-27');
    expect(csv).toContain('summary,totalPutativeDisallowance,18500');
    expect(csv).toContain('21(d) / §40A(3)');
    expect(csv).toContain('34(b)');
    expect(csv).toContain(',false,');
    expect(csv).toContain('section40A3,totalPutativeDisallowance,18500');
  });
});
