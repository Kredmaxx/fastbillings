/**
 * Form 3CD–style clause 34(a): TDS/TCS deducted vs challan-allocated deposit (books).
 * Not TRACES / CPC / e-TDS filing / §201 interest.
 */

export type Clause34Form = '24Q' | '26Q' | '27Q' | '27EQ';
export type Clause34Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type Clause34SourceType = 'PURCHASE' | 'SALARY' | 'INVOICE';

export function round34(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/** India FY quarter from a local date (Apr–Mar). */
export function indiaFyQuarterLabel(d: Date): Clause34Quarter {
  const m = d.getMonth();
  if (m >= 3 && m <= 5) return 'Q1';
  if (m >= 6 && m <= 8) return 'Q2';
  if (m >= 9 && m <= 11) return 'Q3';
  return 'Q4';
}

export function clause34FormForPurchase(isNonResident: boolean): '26Q' | '27Q' {
  return isNonResident ? '27Q' : '26Q';
}

export function clause34FormForSalary(): '24Q' {
  return '24Q';
}

export function clause34FormForInvoiceTcs(): '27EQ' {
  return '27EQ';
}

export type Clause34LineInput = {
  form: Clause34Form;
  sourceType: Clause34SourceType;
  sourceId: string;
  docNumber: string | null;
  date: Date;
  section: string | null;
  partyName: string;
  deducted: number;
  deposited: number;
};

export type Clause34Line = {
  form: Clause34Form;
  quarter: Clause34Quarter;
  sourceType: Clause34SourceType;
  sourceId: string;
  docNumber: string | null;
  date: string;
  section: string | null;
  partyName: string;
  deducted: number;
  deposited: number;
  shortfall: number;
};

export function buildClause34Line(input: Clause34LineInput): Clause34Line {
  const deducted = round34(Math.max(0, Number(input.deducted) || 0));
  const deposited = round34(Math.max(0, Number(input.deposited) || 0));
  return {
    form: input.form,
    quarter: indiaFyQuarterLabel(input.date),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    docNumber: input.docNumber,
    date: input.date.toISOString().slice(0, 10),
    section: input.section,
    partyName: input.partyName,
    deducted,
    deposited,
    shortfall: round34(Math.max(0, deducted - deposited)),
  };
}

export type Clause34Bucket = {
  form: Clause34Form;
  quarter: Clause34Quarter;
  lineCount: number;
  deducted: number;
  deposited: number;
  shortfall: number;
};

export function rollupClause34ByFormQuarter(lines: Clause34Line[]): Clause34Bucket[] {
  const map = new Map<string, Clause34Bucket>();
  for (const line of lines) {
    const key = `${line.form}|${line.quarter}`;
    const cur = map.get(key) || {
      form: line.form,
      quarter: line.quarter,
      lineCount: 0,
      deducted: 0,
      deposited: 0,
      shortfall: 0,
    };
    cur.lineCount += 1;
    cur.deducted = round34(cur.deducted + line.deducted);
    cur.deposited = round34(cur.deposited + line.deposited);
    cur.shortfall = round34(cur.shortfall + line.shortfall);
    map.set(key, cur);
  }
  const orderForm: Clause34Form[] = ['24Q', '26Q', '27Q', '27EQ'];
  const orderQ: Clause34Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];
  return [...map.values()].sort((a, b) => {
    const fi = orderForm.indexOf(a.form) - orderForm.indexOf(b.form);
    if (fi !== 0) return fi;
    return orderQ.indexOf(a.quarter) - orderQ.indexOf(b.quarter);
  });
}

export function summarizeClause34(lines: Clause34Line[]): {
  lineCount: number;
  shortfallLineCount: number;
  totalDeducted: number;
  totalDeposited: number;
  totalShortfall: number;
  byForm: Array<{
    form: Clause34Form;
    deducted: number;
    deposited: number;
    shortfall: number;
    lineCount: number;
  }>;
} {
  const byFormMap = new Map<
    Clause34Form,
    { form: Clause34Form; deducted: number; deposited: number; shortfall: number; lineCount: number }
  >();
  for (const line of lines) {
    const cur = byFormMap.get(line.form) || {
      form: line.form,
      deducted: 0,
      deposited: 0,
      shortfall: 0,
      lineCount: 0,
    };
    cur.lineCount += 1;
    cur.deducted = round34(cur.deducted + line.deducted);
    cur.deposited = round34(cur.deposited + line.deposited);
    cur.shortfall = round34(cur.shortfall + line.shortfall);
    byFormMap.set(line.form, cur);
  }
  return {
    lineCount: lines.length,
    shortfallLineCount: lines.filter((l) => l.shortfall > 0).length,
    totalDeducted: round34(lines.reduce((s, l) => s + l.deducted, 0)),
    totalDeposited: round34(lines.reduce((s, l) => s + l.deposited, 0)),
    totalShortfall: round34(lines.reduce((s, l) => s + l.shortfall, 0)),
    byForm: ['24Q', '26Q', '27Q', '27EQ']
      .map((f) => byFormMap.get(f as Clause34Form))
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  };
}

export const CLAUSE34_FORMS: Clause34Form[] = ['24Q', '26Q', '27Q', '27EQ'];
export const CLAUSE34_QUARTERS: Clause34Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export function isClause34Form(v: string): v is Clause34Form {
  return (CLAUSE34_FORMS as string[]).includes(v);
}

export function isClause34Quarter(v: string): v is Clause34Quarter {
  return (CLAUSE34_QUARTERS as string[]).includes(v);
}

export type Clause34bFilingRecord = {
  id: string;
  form: Clause34Form;
  quarter: Clause34Quarter;
  isFiled: boolean;
  filedDate: string | null;
  acknowledgementNo: string | null;
  notes: string | null;
};

export type Clause34bBucket = {
  form: Clause34Form;
  quarter: Clause34Quarter;
  deducted: number;
  applicable: boolean;
  filingStatus: 'FILED' | 'UNFILED' | 'NOT_APPLICABLE';
  filingId: string | null;
  isFiled: boolean;
  filedDate: string | null;
  acknowledgementNo: string | null;
  notes: string | null;
};

/**
 * Merge form×quarter deducted activity with books return-filed flags (cl. 34(b)).
 * Applicable = deducted > 0. Unfiled when applicable and not marked isFiled.
 */
export function mergeClause34bBuckets(
  byFormQuarter: Clause34Bucket[],
  filings: Clause34bFilingRecord[],
): {
  buckets: Clause34bBucket[];
  applicableCount: number;
  filedCount: number;
  unfiledCount: number;
  hasAnyFilingRecord: boolean;
} {
  const filingMap = new Map<string, Clause34bFilingRecord>();
  for (const f of filings) {
    filingMap.set(`${f.form}|${f.quarter}`, f);
  }

  const activity = new Map<string, Clause34Bucket>();
  for (const b of byFormQuarter) {
    activity.set(`${b.form}|${b.quarter}`, b);
  }

  const buckets: Clause34bBucket[] = [];
  for (const form of CLAUSE34_FORMS) {
    for (const quarter of CLAUSE34_QUARTERS) {
      const key = `${form}|${quarter}`;
      const act = activity.get(key);
      const filing = filingMap.get(key);
      const deducted = act?.deducted ?? 0;
      const applicable = deducted > 0;
      if (!applicable && !filing) continue;

      let filingStatus: Clause34bBucket['filingStatus'] = 'NOT_APPLICABLE';
      if (applicable) {
        filingStatus = filing?.isFiled ? 'FILED' : 'UNFILED';
      } else if (filing?.isFiled) {
        filingStatus = 'FILED';
      }

      buckets.push({
        form,
        quarter,
        deducted: round34(deducted),
        applicable,
        filingStatus,
        filingId: filing?.id ?? null,
        isFiled: Boolean(filing?.isFiled),
        filedDate: filing?.filedDate ?? null,
        acknowledgementNo: filing?.acknowledgementNo ?? null,
        notes: filing?.notes ?? null,
      });
    }
  }

  const applicable = buckets.filter((b) => b.applicable);
  return {
    buckets,
    applicableCount: applicable.length,
    filedCount: applicable.filter((b) => b.filingStatus === 'FILED').length,
    unfiledCount: applicable.filter((b) => b.filingStatus === 'UNFILED').length,
    hasAnyFilingRecord: filings.length > 0,
  };
}
