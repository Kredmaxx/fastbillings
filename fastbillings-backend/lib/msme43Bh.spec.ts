import { describe, it, expect } from 'vitest';
import {
  MSME_43BH_DAYS,
  daysPastDeadline,
  isLatePayment,
  paymentDeadlineFromPurchase,
  putative43BhDisallowance,
} from './msme43Bh';

describe('msme43Bh', () => {
  it('uses 45-day default deadline from purchase date', () => {
    expect(MSME_43BH_DAYS).toBe(45);
    const purchase = new Date('2026-04-01T00:00:00.000Z');
    expect(paymentDeadlineFromPurchase(purchase).toISOString().slice(0, 10)).toBe('2026-05-16');
  });

  it('disallows unpaid balance when deadline passed by FY end', () => {
    const purchaseDate = new Date('2026-04-01T00:00:00.000Z');
    const fyEnd = new Date('2027-03-31T23:59:59.999Z');
    expect(
      putative43BhDisallowance({ balanceAmount: 25000, purchaseDate, fyEnd }),
    ).toBe(25000);
  });

  it('does not disallow when still within 45 days at FY end', () => {
    const purchaseDate = new Date('2027-03-01T00:00:00.000Z');
    const fyEnd = new Date('2027-03-31T23:59:59.999Z');
    expect(
      putative43BhDisallowance({ balanceAmount: 10000, purchaseDate, fyEnd }),
    ).toBe(0);
  });

  it('does not disallow zero balance or future purchases', () => {
    const fyEnd = new Date('2027-03-31T23:59:59.999Z');
    expect(
      putative43BhDisallowance({
        balanceAmount: 0,
        purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
        fyEnd,
      }),
    ).toBe(0);
    expect(
      putative43BhDisallowance({
        balanceAmount: 5000,
        purchaseDate: new Date('2027-04-01T00:00:00.000Z'),
        fyEnd,
      }),
    ).toBe(0);
  });

  it('flags late payments after deadline', () => {
    const purchaseDate = new Date('2026-04-01T00:00:00.000Z');
    expect(
      isLatePayment({
        purchaseDate,
        paymentDate: new Date('2026-05-20T00:00:00.000Z'),
      }),
    ).toBe(true);
    expect(
      isLatePayment({
        purchaseDate,
        paymentDate: new Date('2026-05-10T00:00:00.000Z'),
      }),
    ).toBe(false);
    expect(
      daysPastDeadline(paymentDeadlineFromPurchase(purchaseDate), new Date('2026-05-26T00:00:00.000Z')),
    ).toBe(10);
  });
});
