/**
 * Books helpers for §40A(3) cash payment screening (IT Act).
 * Same-day + payee aggregation with optional Rule 6DD exception codes — not Form 3CD.
 */

/** Default aggregate threshold under §40A(3) (₹10,000 per person per day). */
export const CASH_EXPENSE_40A3_THRESHOLD = 10000;

/** Books catalog of Rule 6DD-style exception tags (not a legal opinion). */
export const RULE_6DD_EXCEPTION_CODES = [
  { code: 'BANK_ACCOUNT', label: 'Account-payee cheque / bank transfer to payee account' },
  { code: 'GOVT', label: 'Payment to government / local authority' },
  { code: 'EMPLOYEE', label: 'Certain employee payments (books tag)' },
  { code: 'TRANSPORTER', label: 'Goods carriage / transporter (books tag)' },
  { code: 'OTHER', label: 'Other Rule 6DD claim (manual)' },
] as const;

export type Rule6DdExceptionCode = (typeof RULE_6DD_EXCEPTION_CODES)[number]['code'];

const RULE_6DD_CODE_SET = new Set<string>(RULE_6DD_EXCEPTION_CODES.map((c) => c.code));

export function isValidRule6DdExceptionCode(
  code: string | null | undefined,
): code is Rule6DdExceptionCode {
  return Boolean(code && RULE_6DD_CODE_SET.has(code));
}

export function normalizeRule6DdExceptionCode(
  code: string | null | undefined,
): Rule6DdExceptionCode | null {
  const c = (code || '').trim().toUpperCase();
  if (!c) return null;
  return isValidRule6DdExceptionCode(c) ? c : null;
}

export function rule6DdExceptionLabel(code: string | null | undefined): string | null {
  const normalized = normalizeRule6DdExceptionCode(code);
  if (!normalized) return null;
  return RULE_6DD_EXCEPTION_CODES.find((c) => c.code === normalized)?.label ?? normalized;
}

export function isCashPaymentMode(opts: {
  sourceType?: string | null;
  paymentModeSlug?: string | null;
  paymentModeName?: string | null;
}): boolean {
  const source = (opts.sourceType || '').trim().toUpperCase();
  if (source === 'PETTY_CASH') return true;
  const slug = (opts.paymentModeSlug || '').trim().toLowerCase();
  if (slug === 'cash' || slug === 'petty-cash' || slug === 'petty_cash') return true;
  const name = (opts.paymentModeName || '').trim().toLowerCase();
  return name === 'cash' || name.includes('petty cash');
}

export function exceeds40A3Threshold(
  amount: number,
  threshold = CASH_EXPENSE_40A3_THRESHOLD,
): boolean {
  return Number.isFinite(amount) && amount > threshold;
}

/** Normalize payee for same-day aggregation (books key — not legal “person”). */
export function normalizePayeeKey(payee: string | null | undefined): string {
  const s = (payee || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return s || 'unknown';
}

export function dayPayeeBucketKey(dateIso: string, payeeKey: string): string {
  return `${dateIso.slice(0, 10)}|${normalizePayeeKey(payeeKey)}`;
}

/**
 * Single-doc screen (legacy): cash and amount > threshold.
 * Prefer {@link aggregateCash40A3Buckets} for Act-aligned day+payee totals.
 */
export function putative40A3Disallowance(
  amount: number,
  opts: {
    sourceType?: string | null;
    paymentModeSlug?: string | null;
    paymentModeName?: string | null;
    threshold?: number;
    rule6DdExceptionCode?: string | null;
  },
): number {
  if (normalizeRule6DdExceptionCode(opts.rule6DdExceptionCode)) return 0;
  if (!isCashPaymentMode(opts)) return 0;
  if (!exceeds40A3Threshold(amount, opts.threshold)) return 0;
  return Math.round(amount * 100) / 100;
}

export type Cash40A3Line = {
  docType: 'EXPENSE' | 'SUPPLIER_PAYMENT';
  id: string;
  docNumber: string | null;
  date: string;
  payee: string;
  payeeKey: string;
  category: string | null;
  taxClass: string | null;
  sourceType: string;
  paymentMode: string | null;
  amount: number;
  rule6DdExceptionCode?: string | null;
};

export type Cash40A3Bucket = {
  date: string;
  payee: string;
  payeeKey: string;
  docCount: number;
  totalAmount: number;
  putativeDisallowance: number;
  docs: Cash40A3Line[];
};

export function partitionCash40A3Lines(lines: Cash40A3Line[]): {
  countable: Cash40A3Line[];
  excepted: Cash40A3Line[];
} {
  const countable: Cash40A3Line[] = [];
  const excepted: Cash40A3Line[] = [];
  for (const line of lines) {
    if (normalizeRule6DdExceptionCode(line.rule6DdExceptionCode)) {
      excepted.push(line);
    } else {
      countable.push(line);
    }
  }
  return { countable, excepted };
}

/**
 * Aggregate cash lines by calendar day + payee (Rule 6DD-excepted lines should be
 * filtered out first via {@link partitionCash40A3Lines}).
 * When bucket total > threshold, full bucket amount is putative disallowance.
 */
export function aggregateCash40A3Buckets(
  lines: Cash40A3Line[],
  threshold = CASH_EXPENSE_40A3_THRESHOLD,
): Cash40A3Bucket[] {
  const map = new Map<string, Cash40A3Bucket>();
  for (const line of lines) {
    if (normalizeRule6DdExceptionCode(line.rule6DdExceptionCode)) continue;
    if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
    const key = dayPayeeBucketKey(line.date, line.payeeKey);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        date: line.date.slice(0, 10),
        payee: line.payee,
        payeeKey: normalizePayeeKey(line.payeeKey),
        docCount: 0,
        totalAmount: 0,
        putativeDisallowance: 0,
        docs: [],
      };
      map.set(key, bucket);
    }
    bucket.docCount += 1;
    bucket.totalAmount = Math.round((bucket.totalAmount + line.amount) * 100) / 100;
    bucket.docs.push(line);
    if (!bucket.payee || bucket.payee === '—' || bucket.payee === 'unknown') {
      bucket.payee = line.payee;
    }
  }

  const out: Cash40A3Bucket[] = [];
  for (const bucket of map.values()) {
    if (!exceeds40A3Threshold(bucket.totalAmount, threshold)) continue;
    bucket.putativeDisallowance = bucket.totalAmount;
    bucket.docs.sort((a, b) => a.docType.localeCompare(b.docType) || a.id.localeCompare(b.id));
    out.push(bucket);
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.payeeKey.localeCompare(b.payeeKey));
  return out;
}

export function summarizeCash40A3Buckets(buckets: Cash40A3Bucket[]): {
  bucketCount: number;
  docCount: number;
  expenseCount: number;
  supplierPaymentCount: number;
  totalPutativeDisallowance: number;
} {
  let docCount = 0;
  let expenseCount = 0;
  let supplierPaymentCount = 0;
  let total = 0;
  for (const b of buckets) {
    docCount += b.docCount;
    total += b.putativeDisallowance;
    for (const d of b.docs) {
      if (d.docType === 'EXPENSE') expenseCount += 1;
      else supplierPaymentCount += 1;
    }
  }
  return {
    bucketCount: buckets.length,
    docCount,
    expenseCount,
    supplierPaymentCount,
    totalPutativeDisallowance: Math.round(total * 100) / 100,
  };
}
