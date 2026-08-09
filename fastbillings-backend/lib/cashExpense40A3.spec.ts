import { describe, it, expect } from 'vitest';
import {
  CASH_EXPENSE_40A3_THRESHOLD,
  aggregateCash40A3Buckets,
  exceeds40A3Threshold,
  isCashPaymentMode,
  normalizePayeeKey,
  normalizeRule6DdExceptionCode,
  partitionCash40A3Lines,
  putative40A3Disallowance,
  summarizeCash40A3Buckets,
  type Cash40A3Line,
} from './cashExpense40A3';

describe('cashExpense40A3', () => {
  it('detects PETTY_CASH source and cash payment modes', () => {
    expect(isCashPaymentMode({ sourceType: 'PETTY_CASH' })).toBe(true);
    expect(isCashPaymentMode({ paymentModeSlug: 'cash' })).toBe(true);
    expect(isCashPaymentMode({ sourceType: 'BANK', paymentModeSlug: 'upi' })).toBe(false);
  });

  it('applies ₹10,000 threshold strictly greater-than', () => {
    expect(CASH_EXPENSE_40A3_THRESHOLD).toBe(10000);
    expect(exceeds40A3Threshold(10000)).toBe(false);
    expect(exceeds40A3Threshold(10000.01)).toBe(true);
  });

  it('normalizes Rule 6DD codes and zeroes single-doc disallowance when excepted', () => {
    expect(normalizeRule6DdExceptionCode('bank_account')).toBe('BANK_ACCOUNT');
    expect(normalizeRule6DdExceptionCode('NOPE')).toBeNull();
    expect(
      putative40A3Disallowance(15000, {
        sourceType: 'PETTY_CASH',
        rule6DdExceptionCode: 'BANK_ACCOUNT',
      }),
    ).toBe(0);
  });

  it('excludes Rule 6DD lines from day+payee aggregation', () => {
    const lines: Cash40A3Line[] = [
      {
        docType: 'EXPENSE',
        id: 'e1',
        docNumber: 'E1',
        date: '2026-06-01',
        payee: 'Vendor A',
        payeeKey: normalizePayeeKey('Vendor A'),
        category: null,
        taxClass: null,
        sourceType: 'PETTY_CASH',
        paymentMode: 'Cash',
        amount: 6000,
      },
      {
        docType: 'EXPENSE',
        id: 'e2',
        docNumber: 'E2',
        date: '2026-06-01',
        payee: 'Vendor A',
        payeeKey: normalizePayeeKey('Vendor A'),
        category: null,
        taxClass: null,
        sourceType: 'PETTY_CASH',
        paymentMode: 'Cash',
        amount: 6000,
        rule6DdExceptionCode: 'BANK_ACCOUNT',
      },
    ];
    const { countable, excepted } = partitionCash40A3Lines(lines);
    expect(excepted).toHaveLength(1);
    const buckets = aggregateCash40A3Buckets(countable);
    expect(buckets).toHaveLength(0);
    expect(summarizeCash40A3Buckets(buckets).totalPutativeDisallowance).toBe(0);
  });
});
