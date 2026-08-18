import { describe, it, expect } from 'vitest';
import {
  CASH_RECEIPT_269ST_THRESHOLD,
  aggregateCash269STBuckets,
  exceeds269STThreshold,
  isCashReceiptMode,
  summarizeCash269STBuckets,
  type Cash269STLine,
} from './cashReceipt269ST';

function line(partial: Partial<Cash269STLine> & Pick<Cash269STLine, 'id' | 'amount' | 'date'>): Cash269STLine {
  return {
    invoiceId: partial.invoiceId ?? `inv-${partial.id}`,
    invoiceNumber: partial.invoiceNumber ?? `INV-${partial.id}`,
    customer: partial.customer ?? 'Acme',
    customerKey: partial.customerKey ?? 'acme',
    paymentMode: partial.paymentMode ?? 'Cash',
    ...partial,
  };
}

describe('cashReceipt269ST', () => {
  it('threshold is strictly greater than ₹2L', () => {
    expect(exceeds269STThreshold(200000)).toBe(false);
    expect(exceeds269STThreshold(200000.01)).toBe(true);
    expect(CASH_RECEIPT_269ST_THRESHOLD).toBe(200000);
  });

  it('detects cash payment modes', () => {
    expect(isCashReceiptMode({ paymentModeSlug: 'cash' })).toBe(true);
    expect(isCashReceiptMode({ paymentModeSlug: 'bank-transfer' })).toBe(false);
  });

  it('flags single and same-day split over threshold; ignores under', () => {
    const lines = [
      line({ id: '1', date: '2026-07-10', amount: 250000 }),
      line({ id: '2', date: '2026-07-11', amount: 120000, customer: 'Acme', customerKey: 'acme' }),
      line({ id: '3', date: '2026-07-11', amount: 110000, customer: 'Acme', customerKey: 'acme' }),
      line({ id: '4', date: '2026-07-12', amount: 150000 }),
    ];
    const buckets = aggregateCash269STBuckets(lines);
    const summary = summarizeCash269STBuckets(buckets);
    expect(summary.bucketCount).toBe(2);
    expect(summary.totalReportableReceipts).toBe(480000);
    expect(buckets.find((b) => b.date === '2026-07-11')?.docCount).toBe(2);
  });
});
