import { describe, it, expect } from 'vitest';
import {
  defaultEmployeeFundDueDate,
  putative36VaComponent,
  summarize36VaLine,
} from './section36Va';

describe('section36Va', () => {
  const payDate = new Date('2026-05-31T00:00:00.000Z');

  it('defaults due date to 15th of next month', () => {
    expect(defaultEmployeeFundDueDate(payDate).toISOString().slice(0, 10)).toBe('2026-06-15');
  });

  it('disallows undeposited and late deposits', () => {
    expect(
      putative36VaComponent({
        amount: 8640,
        dueDate: new Date('2026-06-15T23:59:59.999Z'),
        depositedDate: null,
        payDate,
      }),
    ).toBe(8640);
    expect(
      putative36VaComponent({
        amount: 570,
        dueDate: new Date('2026-06-15T23:59:59.999Z'),
        depositedDate: new Date('2026-06-25T00:00:00.000Z'),
        payDate,
      }),
    ).toBe(570);
    expect(
      putative36VaComponent({
        amount: 10200,
        dueDate: new Date('2026-06-15T23:59:59.999Z'),
        depositedDate: new Date('2026-06-10T00:00:00.000Z'),
        payDate,
      }),
    ).toBe(0);
  });

  it('summarizes PF + ESI line', () => {
    const s = summarize36VaLine({
      payDate,
      employeePfAmount: 8640,
      employeeEsiAmount: 570,
      pfDepositedDate: null,
      esiDueDate: new Date('2026-06-15T23:59:59.999Z'),
      esiDepositedDate: new Date('2026-06-25T00:00:00.000Z'),
    });
    expect(s.pfIssue).toBe('UNDEPOSITED');
    expect(s.esiIssue).toBe('LATE');
    expect(s.totalDisallowance).toBe(9210);
  });
});
