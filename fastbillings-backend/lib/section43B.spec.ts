import { describe, it, expect } from 'vitest';
import {
  defaultSection43BReturnDueDate,
  isLate43BPayment,
  isSection43BTrackedNature,
  putative43BUnpaidDisallowance,
} from './section43B';

describe('section43B', () => {
  const fyEnd = new Date('2026-03-31T23:59:59.999Z');

  it('tracks natures except NONE', () => {
    expect(isSection43BTrackedNature('BONUS')).toBe(true);
    expect(isSection43BTrackedNature('NONE')).toBe(false);
    expect(isSection43BTrackedNature(null)).toBe(false);
  });

  it('disallows unpaid tagged dues at FY end', () => {
    expect(
      putative43BUnpaidDisallowance({
        amount: 50000,
        paymentStatus: 'PENDING',
        expenseDate: new Date('2026-03-15T00:00:00.000Z'),
        fyEnd,
        nature: 'BONUS',
      }),
    ).toBe(50000);
    expect(
      putative43BUnpaidDisallowance({
        amount: 50000,
        paymentStatus: 'PAID',
        expenseDate: new Date('2026-03-15T00:00:00.000Z'),
        fyEnd,
        nature: 'BONUS',
      }),
    ).toBe(0);
    expect(
      putative43BUnpaidDisallowance({
        amount: 50000,
        paymentStatus: 'PENDING',
        expenseDate: new Date('2026-03-15T00:00:00.000Z'),
        fyEnd,
        nature: 'NONE',
      }),
    ).toBe(0);
  });

  it('flags payments after return due-date proxy', () => {
    const due = defaultSection43BReturnDueDate(fyEnd);
    expect(due.toISOString().slice(0, 10)).toBe('2026-10-31');
    expect(
      isLate43BPayment({
        paidDate: new Date('2026-11-15T00:00:00.000Z'),
        returnDueDate: due,
        nature: 'PF_EMPLOYER',
        paymentStatus: 'PAID',
      }),
    ).toBe(true);
    expect(
      isLate43BPayment({
        paidDate: new Date('2026-09-01T00:00:00.000Z'),
        returnDueDate: due,
        nature: 'PF_EMPLOYER',
        paymentStatus: 'PAID',
      }),
    ).toBe(false);
  });
});
