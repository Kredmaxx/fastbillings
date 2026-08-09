/**
 * Books Form 3CD–style clause index for tax-audit pack navigation.
 * Maps existing worksheets to approximate clause labels — not Form 3CD e-filing.
 */

export type TaxAuditPackClauseStatus = 'READY_BOOKS' | 'PARTIAL' | 'NOT_STARTED';

export type TaxAuditPackClause = {
  clause: string;
  title: string;
  status: TaxAuditPackClauseStatus;
  /** Putative amount when worksheet provides one; else null. */
  amount: number | null;
  detailPath: string;
  notes: string;
  /** When false, amount is disclosure/review only and excluded from putative sum. Default true. */
  includeInPutativeSum?: boolean;
  /** Extra putative (e.g. tagged FMV excess) not used as the displayed clause amount. */
  putativeExtra?: number;
};

export function buildTaxAuditPackClauses(input: {
  /** DISALLOWABLE + PERSONAL + CAPITAL expense taxClass totals (clause 21(a) schedule). */
  expenseInadmissibleTagged: number;
  section40A3: number;
  section40A3Excepted: number;
  section43Bh: number;
  section43B: number;
  section40A2: number;
  section40A2Excess: number;
  section36Va: number;
  section40Aia: number;
  section40Ai: number;
  /** IT Act block depreciation for FY (cl. 13/18 pack amount). */
  itDepreciation: number;
  /** Clause 34(a) books shortfall: deducted − challan allocated. */
  section34Shortfall: number;
  /** Clause 34(b) applicable form×quarter buckets not marked filed. */
  section34bUnfiledCount: number;
  hasItWdv: boolean;
  hasClause34: boolean;
  hasClause34b: boolean;
  hasTaxAuditClassification: boolean;
}): TaxAuditPackClause[] {
  const clauses: TaxAuditPackClause[] = [
    {
      clause: '13 / 18',
      title: 'Depreciation / WDV (IT Act blocks)',
      status: input.hasItWdv ? 'READY_BOOKS' : 'NOT_STARTED',
      amount: input.itDepreciation,
      detailPath: '/admin/accounting/reports/books-vs-it-depreciation',
      notes:
        'IT block depreciation (pack amount) vs books SLM proxy difference schedule — not ITR Schedule DPM / Form 3CD e-filing.',
      includeInPutativeSum: false,
    },
    {
      clause: '20(b) / §36(1)(va)',
      title: 'Employee PF/ESI contributions not deposited in time',
      status: 'READY_BOOKS',
      amount: input.section36Va,
      detailPath: '/admin/accounting/reports/section-36-1-va-disallowance',
      notes:
        'SalaryTdsDeduction employee PF/ESI vs due-date proxy (15th next month) — not EPFO/ESIC / Form 3CD.',
    },
    {
      clause: '21(a)',
      title: 'Amounts inadmissible (tax-class schedule)',
      status: input.hasTaxAuditClassification ? 'READY_BOOKS' : 'NOT_STARTED',
      amount: input.expenseInadmissibleTagged,
      detailPath: '/admin/accounting/reports/clause-21a-inadmissible',
      notes:
        'ExpenseCategory.taxClass DISALLOWABLE/PERSONAL/CAPITAL schedule with links to §40*/§43B/§36 worksheets — not auto-deduped vs §40A(3); not Form 3CD.',
      includeInPutativeSum: false,
    },
    {
      clause: '21(d) / §40A(3)',
      title: 'Cash payments exceeding ₹10,000 (day+payee)',
      status: 'READY_BOOKS',
      amount: input.section40A3,
      detailPath: '/admin/accounting/reports/cash-expense-disallowance',
      notes:
        input.section40A3Excepted > 0
          ? `Rule 6DD books tags excluded ${input.section40A3Excepted} line(s) from aggregation.`
          : 'Includes same-day payee aggregation; Rule 6DD tags optional.',
    },
    {
      clause: '23 / §40A(2)',
      title: 'Payments to related / specified persons',
      status: 'READY_BOOKS',
      amount: input.section40A2,
      detailPath: '/admin/accounting/reports/section-40a-2-related-party',
      notes:
        input.section40A2Excess > 0
          ? `Disclosure of related-party payments; tagged FMV excess ${input.section40A2Excess} is books putative only — not AO / Form 3CD.`
          : 'supplier.isRelatedParty purchases + expenses — disclosure; optional FMV tags add putative excess.',
      includeInPutativeSum: false,
      putativeExtra: input.section40A2Excess > 0 ? input.section40A2Excess : undefined,
    },
    {
      clause: '21(b) / §40(a)(ia)',
      title: 'Resident TDS non-deduction / non-deposit (30%)',
      status: 'READY_BOOKS',
      amount: input.section40Aia,
      detailPath: '/admin/accounting/reports/section-40a-ia-disallowance',
      notes: 'Books screen vs challan map — not CPC due dates.',
    },
    {
      clause: '21(b) / §40(a)(i)',
      title: 'Non-resident TDS non-deduction / non-deposit (100%)',
      status: 'READY_BOOKS',
      amount: input.section40Ai,
      detailPath: '/admin/accounting/reports/section-40a-i-disallowance',
      notes: 'Uses supplier.isNonResident — not Form 27Q filing.',
    },
    {
      clause: '22 / 26 / §43B(h)',
      title: 'MSME payments delayed beyond 45 days',
      status: 'READY_BOOKS',
      amount: input.section43Bh,
      detailPath: '/admin/accounting/reports/msme-43bh-disallowance',
      notes: 'purchaseDate+45d unpaid at FY end — MSME only; see clause 26 / §43B for bonus/PF.',
    },
    {
      clause: '26 / §43B',
      title: 'Unpaid statutory dues (bonus / PF / ESI / etc.)',
      status: 'READY_BOOKS',
      amount: input.section43B,
      detailPath: '/admin/accounting/reports/section-43b-disallowance',
      notes:
        'ExpenseCategory.section43BNature + PENDING at FY end; late-paid uses paidDate vs 31 Oct proxy — not Form 3CD / payroll.',
    },
    {
      clause: '34(a)',
      title: 'Tax deducted / collected at source (deducted vs deposited)',
      status: input.hasClause34 ? 'READY_BOOKS' : 'NOT_STARTED',
      amount: input.section34Shortfall,
      detailPath: '/admin/accounting/reports/clause-34-tds',
      notes:
        'FY books rollup of TDS/TCS deducted vs challan allocation by 24Q/26Q/27Q/27EQ — shortfall is deposit-map gap only; not TRACES / e-TDS / §201 interest. See also TDS register.',
      includeInPutativeSum: false,
    },
    {
      clause: '34(b)',
      title: 'TDS/TCS statements filed (books flag)',
      status: input.hasClause34b ? 'READY_BOOKS' : 'NOT_STARTED',
      amount: input.section34bUnfiledCount,
      detailPath: '/admin/accounting/reports/clause-34-tds',
      notes:
        'Books isFiled flags per 24Q/26Q/27Q/27EQ × quarter — amount = unfiled applicable buckets. Not CPC / TRACES / e-TDS filing proof.',
      includeInPutativeSum: false,
    },
    {
      clause: 'Pack hub',
      title: 'Tax-audit classification (expense + income tax class)',
      status: input.hasTaxAuditClassification ? 'READY_BOOKS' : 'NOT_STARTED',
      amount: null,
      detailPath: '/admin/accounting/reports/tax-audit-classification',
      notes: 'Surfaces putative disallowance worksheet totals for the FY.',
    },
  ];
  return clauses;
}

export function summarizeTaxAuditPack(clauses: TaxAuditPackClause[]): {
  clauseCount: number;
  readyBooksCount: number;
  partialCount: number;
  notStartedCount: number;
  totalPutativeDisallowance: number;
} {
  let ready = 0;
  let partial = 0;
  let notStarted = 0;
  let total = 0;
  for (const c of clauses) {
    if (c.status === 'READY_BOOKS') ready += 1;
    else if (c.status === 'PARTIAL') partial += 1;
    else notStarted += 1;
    if (
      c.amount != null &&
      Number.isFinite(c.amount) &&
      c.includeInPutativeSum !== false
    ) {
      total += c.amount;
    }
    if (c.putativeExtra != null && Number.isFinite(c.putativeExtra)) {
      total += c.putativeExtra;
    }
  }
  return {
    clauseCount: clauses.length,
    readyBooksCount: ready,
    partialCount: partial,
    notStartedCount: notStarted,
    totalPutativeDisallowance: Math.round(total * 100) / 100,
  };
}
