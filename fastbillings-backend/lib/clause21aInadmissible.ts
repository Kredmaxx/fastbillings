/**
 * Form 3CD–style clause 21(a) inadmissible schedule for books navigation.
 * Merges ExpenseCategory taxClass tags with links to statutory worksheets — not Form 3CD e-filing.
 */

export const CLAUSE_21A_TAX_CLASSES = ['DISALLOWABLE', 'PERSONAL', 'CAPITAL'] as const;
export type Clause21aTaxClass = (typeof CLAUSE_21A_TAX_CLASSES)[number];

export type Clause21aTaggedRow = {
  taxClass: Clause21aTaxClass;
  categoryCount: number;
  expenseCount: number;
  amount: number;
};

export type Clause21aWorksheetLink = {
  key: string;
  label: string;
  amount: number;
  detailPath: string;
  countsTowardPutative: boolean;
};

export function roundClause21a(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

export function isClause21aTaxClass(v: string): v is Clause21aTaxClass {
  return (CLAUSE_21A_TAX_CLASSES as readonly string[]).includes(v);
}

export function buildClause21aSchedule(input: {
  taggedByClass: Clause21aTaggedRow[];
  worksheets: {
    section40A3: number;
    section43Bh: number;
    section43B: number;
    section40A2Excess: number;
    section36Va: number;
    section40Aia: number;
    section40Ai: number;
  };
  /** Cash/petty DISALLOWABLE amounts that also feed §40A(3) buckets (warning only). */
  overlapCashInDisallowable?: number;
}): {
  taggedByClass: Clause21aTaggedRow[];
  taggedTotal: number;
  worksheetLinks: Clause21aWorksheetLink[];
  worksheetPutativeTotal: number;
  overlapCashInDisallowable: number;
} {
  const taggedByClass = CLAUSE_21A_TAX_CLASSES.map((taxClass) => {
    const row = input.taggedByClass.find((r) => r.taxClass === taxClass);
    return {
      taxClass,
      categoryCount: row?.categoryCount ?? 0,
      expenseCount: row?.expenseCount ?? 0,
      amount: roundClause21a(row?.amount ?? 0),
    };
  });
  const taggedTotal = roundClause21a(taggedByClass.reduce((s, r) => s + r.amount, 0));

  const worksheetLinks: Clause21aWorksheetLink[] = [
    {
      key: 'section40A3',
      label: '§40A(3) cash day+payee',
      amount: roundClause21a(input.worksheets.section40A3),
      detailPath: '/admin/accounting/reports/cash-expense-disallowance',
      countsTowardPutative: true,
    },
    {
      key: 'section40A2Excess',
      label: '§40A(2) tagged FMV excess',
      amount: roundClause21a(input.worksheets.section40A2Excess),
      detailPath: '/admin/accounting/reports/section-40a-2-related-party',
      countsTowardPutative: true,
    },
    {
      key: 'section40Aia',
      label: '§40(a)(ia) resident TDS',
      amount: roundClause21a(input.worksheets.section40Aia),
      detailPath: '/admin/accounting/reports/section-40a-ia-disallowance',
      countsTowardPutative: true,
    },
    {
      key: 'section40Ai',
      label: '§40(a)(i) NR TDS',
      amount: roundClause21a(input.worksheets.section40Ai),
      detailPath: '/admin/accounting/reports/section-40a-i-disallowance',
      countsTowardPutative: true,
    },
    {
      key: 'section43Bh',
      label: '§43B(h) MSME delay',
      amount: roundClause21a(input.worksheets.section43Bh),
      detailPath: '/admin/accounting/reports/msme-43bh-disallowance',
      countsTowardPutative: true,
    },
    {
      key: 'section43B',
      label: '§43B statutory dues',
      amount: roundClause21a(input.worksheets.section43B),
      detailPath: '/admin/accounting/reports/section-43b-disallowance',
      countsTowardPutative: true,
    },
    {
      key: 'section36Va',
      label: '§36(1)(va) employee PF/ESI',
      amount: roundClause21a(input.worksheets.section36Va),
      detailPath: '/admin/accounting/reports/section-36-1-va-disallowance',
      countsTowardPutative: true,
    },
  ];

  const worksheetPutativeTotal = roundClause21a(
    worksheetLinks.reduce((s, w) => s + (w.countsTowardPutative ? w.amount : 0), 0),
  );

  return {
    taggedByClass,
    taggedTotal,
    worksheetLinks,
    worksheetPutativeTotal,
    overlapCashInDisallowable: roundClause21a(input.overlapCashInDisallowable ?? 0),
  };
}
