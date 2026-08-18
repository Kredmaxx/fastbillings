/**
 * Books helpers for §269ST cash receipt screening (Form 3CD–style cl. 31).
 * Day + customer aggregation — not Form 3CD e-filing / §271DA penalty.
 */

import {
  dayPayeeBucketKey,
  isCashPaymentMode,
  normalizePayeeKey,
} from './cashExpense40A3';

/** Default §269ST books threshold (₹2,00,000 per person per day). Strictly greater than. */
export const CASH_RECEIPT_269ST_THRESHOLD = 200000;

export function exceeds269STThreshold(
  amount: number,
  threshold = CASH_RECEIPT_269ST_THRESHOLD,
): boolean {
  return Number.isFinite(amount) && amount > threshold;
}

export type Cash269STLine = {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  date: string;
  customer: string;
  customerKey: string;
  paymentMode: string | null;
  amount: number;
};

export type Cash269STBucket = {
  date: string;
  customer: string;
  customerKey: string;
  docCount: number;
  totalAmount: number;
  reportableAmount: number;
  docs: Cash269STLine[];
};

export function isCashReceiptMode(opts: {
  paymentModeSlug?: string | null;
  paymentModeName?: string | null;
}): boolean {
  return isCashPaymentMode({
    paymentModeSlug: opts.paymentModeSlug,
    paymentModeName: opts.paymentModeName,
  });
}

/**
 * Aggregate cash invoice receipts by calendar day + customer.
 * When bucket total > threshold, full bucket is reportable (books proxy).
 */
export function aggregateCash269STBuckets(
  lines: Cash269STLine[],
  threshold = CASH_RECEIPT_269ST_THRESHOLD,
): Cash269STBucket[] {
  const map = new Map<string, Cash269STBucket>();
  for (const line of lines) {
    if (!Number.isFinite(line.amount) || line.amount <= 0) continue;
    const key = dayPayeeBucketKey(line.date, line.customerKey);
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        date: line.date.slice(0, 10),
        customer: line.customer,
        customerKey: normalizePayeeKey(line.customerKey),
        docCount: 0,
        totalAmount: 0,
        reportableAmount: 0,
        docs: [],
      };
      map.set(key, bucket);
    }
    bucket.docCount += 1;
    bucket.totalAmount = Math.round((bucket.totalAmount + line.amount) * 100) / 100;
    bucket.docs.push(line);
    if (!bucket.customer || bucket.customer === '—' || bucket.customer === 'unknown') {
      bucket.customer = line.customer;
    }
  }

  const out: Cash269STBucket[] = [];
  for (const bucket of map.values()) {
    if (!exceeds269STThreshold(bucket.totalAmount, threshold)) continue;
    bucket.reportableAmount = bucket.totalAmount;
    bucket.docs.sort((a, b) => a.id.localeCompare(b.id));
    out.push(bucket);
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.customerKey.localeCompare(b.customerKey));
  return out;
}

export function summarizeCash269STBuckets(buckets: Cash269STBucket[]): {
  bucketCount: number;
  receiptCount: number;
  totalReportableReceipts: number;
} {
  let receiptCount = 0;
  let total = 0;
  for (const b of buckets) {
    receiptCount += b.docCount;
    total += b.reportableAmount;
  }
  return {
    bucketCount: buckets.length,
    receiptCount,
    totalReportableReceipts: Math.round(total * 100) / 100,
  };
}
