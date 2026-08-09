import { describe, it, expect, vi } from 'vitest';
import {
  summarizeCashExpense40A3,
  summarizeMsme43Bh,
  summarizeSection40Ai,
  summarizeSection40Aia,
} from './taxAuditDisallowanceSummaries';

describe('taxAuditDisallowanceSummaries', () => {
  it('summarizes §40A(3) by day+payee aggregate (not per-doc only)', async () => {
    const day = new Date('2026-06-01T00:00:00.000Z');
    const db = {
      expense: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'e1',
            expenseId: 'E1',
            expenseDate: day,
            amount: 18500,
            description: 'Big cash',
            sourceType: 'PETTY_CASH',
            rule6DdExceptionCode: null,
            paymentMode: { slug: 'cash', name: 'Cash' },
            expenseCategory: { title: 'Travel', taxClass: 'DEDUCTIBLE' },
            supplier: { supplier_name: 'Vendor Big' },
          },
          {
            id: 'e2',
            expenseId: 'E2',
            expenseDate: day,
            amount: 6000,
            description: 'Split A',
            sourceType: 'PETTY_CASH',
            rule6DdExceptionCode: null,
            paymentMode: { slug: 'cash', name: 'Cash' },
            expenseCategory: { title: 'Travel', taxClass: 'DEDUCTIBLE' },
            supplier: { supplier_name: 'Vendor Split' },
          },
          {
            id: 'e3',
            expenseId: 'E3',
            expenseDate: day,
            amount: 6000,
            description: 'Split B',
            sourceType: 'PETTY_CASH',
            rule6DdExceptionCode: 'BANK_ACCOUNT',
            paymentMode: { slug: 'cash', name: 'Cash' },
            expenseCategory: { title: 'Travel', taxClass: 'DEDUCTIBLE' },
            supplier: { supplier_name: 'Vendor Split' },
          },
          {
            id: 'e4',
            expenseId: 'E4',
            expenseDate: day,
            amount: 5000,
            description: 'Bank',
            sourceType: 'BANK',
            rule6DdExceptionCode: null,
            paymentMode: { slug: 'upi', name: 'UPI' },
            expenseCategory: null,
            supplier: null,
          },
        ]),
      },
      supplierPayment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      supplier: { findMany: vi.fn() },
      purchase: { findMany: vi.fn() },
      taxDepositChallanAllocation: { findMany: vi.fn() },
    };
    const s = await summarizeCashExpense40A3(db as never, {
      expenseWhere: {},
      supplierPaymentWhere: {},
      fromDate: new Date('2026-04-01'),
      toDate: new Date('2027-03-31'),
    });
    expect(s.bucketCount).toBe(1);
    expect(s.expenseCount).toBe(1);
    expect(s.exceptedCount).toBe(1);
    expect(s.supplierPaymentCount).toBe(0);
    expect(s.rowCount).toBe(1);
    expect(s.totalPutativeDisallowance).toBe(18500);
  });

  it('summarizes §43B(h) unpaid + late payments', async () => {
    const db = {
      expense: { findMany: vi.fn() },
      supplierPayment: { findMany: vi.fn() },
      supplier: {
        findMany: vi.fn().mockResolvedValue([{ supplier_email: 'msme@example.com' }]),
      },
      purchase: {
        findMany: vi.fn().mockResolvedValue([
          {
            purchaseDate: new Date('2026-04-01T00:00:00.000Z'),
            balanceAmount: 25000,
            billToUser: { email: 'msme@example.com' },
            supplierPayments: [
              {
                paymentDate: new Date('2026-06-01T00:00:00.000Z'),
                paidAmount: 5000,
                amount: 5000,
              },
            ],
          },
        ]),
      },
      taxDepositChallanAllocation: { findMany: vi.fn() },
    };
    const s = await summarizeMsme43Bh(db as never, {
      supplierWhere: {},
      purchaseWhere: {},
      fromDate: new Date('2026-04-01T00:00:00.000Z'),
      toDate: new Date('2027-03-31T23:59:59.999Z'),
    });
    expect(s.msmeSupplierCount).toBe(1);
    expect(s.disallowRowCount).toBe(1);
    expect(s.totalPutativeDisallowance).toBe(25000);
    expect(s.latePaidRowCount).toBe(1);
    expect(s.latePaidAmount).toBe(5000);
  });

  it('summarizes §40(a)(ia) for residents only', async () => {
    const db = {
      expense: { findMany: vi.fn() },
      supplierPayment: { findMany: vi.fn() },
      supplier: {
        findMany: vi.fn().mockResolvedValue([{ supplier_email: 'nr@example.com' }]),
      },
      purchase: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p1',
            tdsSection: '194J',
            tdsAmount: 0,
            taxableAmount: 100000,
            billToUser: { email: 'res@example.com' },
          },
          {
            id: 'p2',
            tdsSection: '194C',
            tdsAmount: 500,
            taxableAmount: 50000,
            billToUser: { email: 'res@example.com' },
          },
          {
            id: 'p-nr',
            tdsSection: '195',
            tdsAmount: 0,
            taxableAmount: 80000,
            billToUser: { email: 'nr@example.com' },
          },
        ]),
      },
      taxDepositChallanAllocation: {
        findMany: vi.fn().mockResolvedValue([{ sourceId: 'p2', amount: 100 }]),
      },
    };
    const s = await summarizeSection40Aia(db as never, {
      purchaseWhere: {},
      allocationWhere: {},
      fromDate: new Date('2026-04-01'),
      toDate: new Date('2027-03-31'),
    });
    expect(s.nonDeductionCount).toBe(1);
    expect(s.nonDepositCount).toBe(1);
    expect(s.rowCount).toBe(2);
    expect(s.totalPutativeDisallowance).toBe(45000);
  });

  it('summarizes §40(a)(i) for non-residents at 100%', async () => {
    const db = {
      expense: { findMany: vi.fn() },
      supplierPayment: { findMany: vi.fn() },
      supplier: {
        findMany: vi.fn().mockResolvedValue([{ supplier_email: 'nr@example.com' }]),
      },
      purchase: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'p-nr',
            tdsSection: '195',
            tdsAmount: 1000,
            taxableAmount: 80000,
            billToUser: { email: 'nr@example.com' },
          },
          {
            id: 'p-res',
            tdsSection: '194C',
            tdsAmount: 0,
            taxableAmount: 40000,
            billToUser: { email: 'res@example.com' },
          },
        ]),
      },
      taxDepositChallanAllocation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const s = await summarizeSection40Ai(db as never, {
      purchaseWhere: {},
      allocationWhere: {},
      fromDate: new Date('2026-04-01'),
      toDate: new Date('2027-03-31'),
    });
    expect(s.disallowRate).toBe(1);
    expect(s.nonDepositCount).toBe(1);
    expect(s.nonDeductionCount).toBe(0);
    expect(s.rowCount).toBe(1);
    expect(s.totalPutativeDisallowance).toBe(80000);
  });
});
