// lib/ledger/ledgerPosting.spec.ts
import { describe, it, expect, vi } from 'vitest';
import {
  postInvoiceIssued, postInvoicePayment, postPurchaseReceived,
  postSupplierPayment, postExpense, postCreditNoteIssued, postDebitNoteIssued,
  reverseDocument, cashRoleFor, postSaleCogs, postReturnCogs,
} from './ledgerPosting';
import { LedgerError } from './buildLines';

function fakeTx(opts: { initialized?: boolean; goLive?: string } = {}) {
  const createCalls: any[] = [];
  return {
    createCalls,
    companySettings: {
      findFirst: vi.fn().mockResolvedValue({
        ledgerInitialized: opts.initialized ?? true,
        goLiveDate: opts.goLive ? new Date(opts.goLive) : new Date('2026-01-01'),
      }),
    },
    ledgerAccountMapping: {
      findMany: vi.fn().mockResolvedValue([
        { roleKey: 'AR', accountId: 'a-ar' }, { roleKey: 'AP', accountId: 'a-ap' },
        { roleKey: 'SALES_REVENUE', accountId: 'a-rev' }, { roleKey: 'SALES_RETURNS', accountId: 'a-ret' },
        { roleKey: 'OUTPUT_TAX', accountId: 'a-otax' }, { roleKey: 'INPUT_TAX', accountId: 'a-itax' },
        { roleKey: 'PURCHASES', accountId: 'a-pur' }, { roleKey: 'INVENTORY', accountId: 'a-inv' },
        { roleKey: 'BANK', accountId: 'a-bank' }, { roleKey: 'CASH', accountId: 'a-cash' },
        { roleKey: 'COGS', accountId: 'a-cogs' }, { roleKey: 'FX_GAIN_LOSS', accountId: 'a-fx' },
      ]),
    },
    accountingPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: any) => { createCalls.push(data); return { id: 'je1', ...data }; }),
    },
  };
}

describe('cashRoleFor', () => {
  it('maps cash slug and petty cash to CASH, else BANK', () => {
    expect(cashRoleFor({ paymentModeSlug: 'cash' })).toBe('CASH');
    expect(cashRoleFor({ sourceType: 'PETTY_CASH' })).toBe('CASH');
    expect(cashRoleFor({ paymentModeSlug: 'bank-transfer' })).toBe('BANK');
    expect(cashRoleFor({})).toBe('BANK');
  });
});

describe('ledgerPosting (gated)', () => {
  it('no-ops when ledger not initialized', async () => {
    const tx = fakeTx({ initialized: false });
    await postInvoiceIssued(tx as never, { userId: 'u1', invoiceId: 'i1', date: new Date('2026-06-01'), total: '118', tax: '18' });
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('no-ops when date before go-live', async () => {
    const tx = fakeTx({ goLive: '2026-07-01' });
    await postInvoiceIssued(tx as never, { userId: 'u1', invoiceId: 'i1', date: new Date('2026-06-01'), total: '118', tax: '18' });
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('posts invoice.issued: Dr AR total, Cr revenue net, Cr output tax', async () => {
    const tx = fakeTx();
    await postInvoiceIssued(tx as never, { userId: 'u1', invoiceId: 'i1', date: new Date('2026-06-01'), total: '118', tax: '18' });
    const data = tx.createCalls[0];
    expect(data).toMatchObject({ sourceType: 'Invoice', sourceId: 'i1', event: 'issued' });
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-ar']).toMatchObject({ debit: '118.0000' });
    expect(byAcc['a-rev']).toMatchObject({ credit: '100.0000' });
    expect(byAcc['a-otax']).toMatchObject({ credit: '18.0000' });
  });

  it('posts invoice.payment into BANK', async () => {
    const tx = fakeTx();
    await postInvoicePayment(tx as never, { userId: 'u1', invoiceId: 'i1', paymentId: 'p1', date: new Date('2026-06-02'), amount: '50', paymentModeSlug: 'neft' });
    const data = tx.createCalls[0];
    expect(data).toMatchObject({ sourceType: 'InvoicePayment', sourceId: 'p1', event: 'payment' });
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-bank']).toMatchObject({ debit: '50.0000' });
    expect(byAcc['a-ar']).toMatchObject({ credit: '50.0000' });
  });

  it('posts purchase.received split across inventory + purchases', async () => {
    const tx = fakeTx();
    await postPurchaseReceived(tx as never, {
      userId: 'u1', purchaseId: 'pu1', date: new Date('2026-06-03'),
      total: '236', tax: '36', inventoryNet: '120', expenseNet: '80',
    });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-inv']).toMatchObject({ debit: '120.0000' });
    expect(byAcc['a-pur']).toMatchObject({ debit: '80.0000' });
    expect(byAcc['a-itax']).toMatchObject({ debit: '36.0000' });
    expect(byAcc['a-ap']).toMatchObject({ credit: '236.0000' });
  });

  it('posts expense to a specific expense account + input tax, credit source', async () => {
    const tx = fakeTx();
    await postExpense(tx as never, {
      userId: 'u1', expenseId: 'e1', date: new Date('2026-06-04'),
      total: '100', tax: '10', expenseAccountId: 'a-rent', sourceType: 'BANK', paymentModeSlug: 'card',
    });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-rent']).toMatchObject({ debit: '90.0000' });
    expect(byAcc['a-itax']).toMatchObject({ debit: '10.0000' });
    expect(byAcc['a-bank']).toMatchObject({ credit: '100.0000' });
  });

  it('posts creditNote.issued', async () => {
    const tx = fakeTx();
    await postCreditNoteIssued(tx as never, { userId: 'u1', creditNoteId: 'c1', date: new Date('2026-06-05'), total: '118', tax: '18' });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-ret']).toMatchObject({ debit: '100.0000' });
    expect(byAcc['a-otax']).toMatchObject({ debit: '18.0000' });
    expect(byAcc['a-ar']).toMatchObject({ credit: '118.0000' });
  });

  it('posts supplierPayment: Dr AP, Cr source (CASH for petty cash)', async () => {
    const tx = fakeTx();
    await postSupplierPayment(tx as never, {
      userId: 'u1', purchaseId: 'pu1', paymentId: 'sp1', date: new Date('2026-06-06'),
      amount: '120', sourceType: 'PETTY_CASH',
    });
    const data = tx.createCalls[0];
    expect(data).toMatchObject({ sourceType: 'SupplierPayment', sourceId: 'sp1', event: 'payment' });
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-ap']).toMatchObject({ debit: '120.0000' });
    expect(byAcc['a-cash']).toMatchObject({ credit: '120.0000' });
  });

  it('posts debitNote.issued: Dr AP total, Cr input tax + inventory + purchases', async () => {
    const tx = fakeTx();
    await postDebitNoteIssued(tx as never, {
      userId: 'u1', debitNoteId: 'd1', date: new Date('2026-06-06'),
      total: '236', tax: '36', inventoryNet: '120', expenseNet: '80',
    });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-ap']).toMatchObject({ debit: '236.0000' });
    expect(byAcc['a-itax']).toMatchObject({ credit: '36.0000' });
    expect(byAcc['a-inv']).toMatchObject({ credit: '120.0000' });
    expect(byAcc['a-pur']).toMatchObject({ credit: '80.0000' });
  });

  it('throws a domain error when a purchase split does not reconcile to total', async () => {
    const tx = fakeTx();
    await expect(postPurchaseReceived(tx as never, {
      userId: 'u1', purchaseId: 'pu2', date: new Date('2026-06-06'),
      total: '236', tax: '36', inventoryNet: '120', expenseNet: '50', // 120+50+36 = 206 != 236
    })).rejects.toThrow(LedgerError);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('reverseDocument no-ops when no entry exists', async () => {
    const tx = fakeTx();
    await reverseDocument(tx as never, { userId: 'u1', sourceType: 'Invoice', sourceId: 'i1', event: 'issued' });
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('postSaleCogs', () => {
  it('posts Dr COGS / Cr INVENTORY at cost (event cogs)', async () => {
    const tx = fakeTx(); // mappings include COGS:a-cogs and INVENTORY:a-inv
    await postSaleCogs(tx as never, { userId: 'u1', invoiceId: 'i1', date: new Date('2026-06-06'), cost: '70' });
    const data = tx.createCalls[0];
    expect(data).toMatchObject({ sourceType: 'Invoice', sourceId: 'i1', event: 'cogs' });
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-cogs']).toMatchObject({ debit: '70.0000' });
    expect(byAcc['a-inv']).toMatchObject({ credit: '70.0000' });
  });
  it('no-ops when cost is zero', async () => {
    const tx = fakeTx();
    await postSaleCogs(tx as never, { userId: 'u1', invoiceId: 'i1', date: new Date('2026-06-06'), cost: '0' });
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('postReturnCogs', () => {
  it('posts Dr INVENTORY / Cr COGS at cost (event cogs on CreditNote)', async () => {
    const tx = fakeTx();
    await postReturnCogs(tx as never, { userId: 'u1', creditNoteId: 'c1', date: new Date('2026-06-06'), cost: '50' });
    const data = tx.createCalls[0];
    expect(data).toMatchObject({ sourceType: 'CreditNote', sourceId: 'c1', event: 'cogs' });
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-inv']).toMatchObject({ debit: '50.0000' });
    expect(byAcc['a-cogs']).toMatchObject({ credit: '50.0000' });
  });
  it('no-ops when cost is zero', async () => {
    const tx = fakeTx();
    await postReturnCogs(tx as never, { userId: 'u1', creditNoteId: 'c1', date: new Date('2026-06-06'), cost: '0' });
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

// ── Task 4: FX-aware builders ────────────────────────────────────────────────

describe('postInvoiceIssued — foreign currency', () => {
  it('passes currencyCode + exchangeRate through to journal lines', async () => {
    const tx = fakeTx();
    await postInvoiceIssued(tx as never, {
      userId: 'u1', invoiceId: 'i1', date: new Date('2026-06-01'),
      total: '1000', tax: '0',
      currencyCode: 'USD', exchangeRate: '83',
    });
    const data = tx.createCalls[0];
    // Lines should carry the foreign currencyCode and base = amount × rate
    const lines: any[] = data.lines.create;
    expect(lines[0]).toMatchObject({ currencyCode: 'USD', debit: '1000.0000', baseDebit: '83000.0000' });
    expect(lines[1]).toMatchObject({ currencyCode: 'USD', credit: '1000.0000', baseCredit: '83000.0000' });
  });

  it('functional-currency path unchanged (no currencyCode) — base = amount × 1, currencyCode BASE on lines', async () => {
    const tx = fakeTx();
    await postInvoiceIssued(tx as never, {
      userId: 'u1', invoiceId: 'i2', date: new Date('2026-06-01'),
      total: '118', tax: '18',
    });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-ar']).toMatchObject({ currencyCode: 'BASE', debit: '118.0000', baseDebit: '118.0000' });
  });
});

describe('postPurchaseReceived — foreign currency', () => {
  it('passes currencyCode + exchangeRate through to lines', async () => {
    const tx = fakeTx();
    await postPurchaseReceived(tx as never, {
      userId: 'u1', purchaseId: 'p1', date: new Date('2026-06-01'),
      total: '500', tax: '0', inventoryNet: '500', expenseNet: '0',
      currencyCode: 'USD', exchangeRate: '83',
    });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    // AP credit: 500 USD × 83 = 41500 base
    expect(byAcc['a-ap']).toMatchObject({ currencyCode: 'USD', credit: '500.0000', baseCredit: '41500.0000' });
  });
});

describe('postInvoicePayment — FX settlement', () => {
  // Worked example:
  //   Invoice: 1000 USD at doc rate 80 → AR posted at 80000 INR base
  //   Payment: 1000 USD at payment rate 83
  //   Dr BANK  1000 USD, base = 83000
  //   Cr AR    1000 USD, base = 80000  (relieve at doc rate)
  //   Cr FX    0 USD,    base = 3000   (gain — credit FX)
  //   Sum Dr base = 83000 = Sum Cr base (80000 + 3000) ✓

  it('paymentRate > documentRate → FX GAIN (credit FX_GAIN_LOSS), entry balances, AR at docRate', async () => {
    const tx = fakeTx();
    await postInvoicePayment(tx as never, {
      userId: 'u1', invoiceId: 'i1', paymentId: 'p1',
      date: new Date('2026-06-05'), amount: '1000',
      currencyCode: 'USD', paymentRate: '83', documentRate: '80',
    });
    const data = tx.createCalls[0];
    // Lines carry the foreign currencyCode
    expect(data.lines.create[0].currencyCode).toBe('USD');
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));

    // Bank: Dr 1000 USD, base 83000
    expect(byAcc['a-bank']).toMatchObject({ debit: '1000.0000', baseDebit: '83000.0000' });
    // AR: Cr 1000 USD, base 80000 (document rate)
    expect(byAcc['a-ar']).toMatchObject({ credit: '1000.0000', baseCredit: '80000.0000' });
    // FX: Cr 0 USD, base 3000 (gain)
    expect(byAcc['a-fx']).toMatchObject({ credit: '0.0000', baseCredit: '3000.0000', debit: '0.0000', baseDebit: '0.0000' });

    // Verify base balance: sum debit == sum credit
    const totalDebit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseDebit), 0);
    const totalCredit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseCredit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 4);
  });

  it('paymentRate < documentRate → FX LOSS (debit FX_GAIN_LOSS), entry balances', async () => {
    // 1000 USD, docRate 80 → AR at 80000; payRate 79 → bank 79000; FX Dr 1000 (loss)
    // Dr BANK 79000 + Dr FX 1000 = Cr AR 80000 ✓
    const tx = fakeTx();
    await postInvoicePayment(tx as never, {
      userId: 'u1', invoiceId: 'i1', paymentId: 'p2',
      date: new Date('2026-06-05'), amount: '1000',
      currencyCode: 'USD', paymentRate: '79', documentRate: '80',
    });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    // Bank: Dr 79000
    expect(byAcc['a-bank']).toMatchObject({ baseDebit: '79000.0000' });
    // AR: Cr 80000
    expect(byAcc['a-ar']).toMatchObject({ baseCredit: '80000.0000' });
    // FX: Dr 1000 (loss)
    expect(byAcc['a-fx']).toMatchObject({ debit: '0.0000', baseDebit: '1000.0000', baseCredit: '0.0000' });

    const totalDebit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseDebit), 0);
    const totalCredit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseCredit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 4);
  });

  it('equal paymentRate and documentRate → no FX leg (only 2 lines)', async () => {
    const tx = fakeTx();
    await postInvoicePayment(tx as never, {
      userId: 'u1', invoiceId: 'i1', paymentId: 'p3',
      date: new Date('2026-06-05'), amount: '1000',
      currencyCode: 'USD', paymentRate: '83', documentRate: '83',
    });
    const data = tx.createCalls[0];
    expect(data.lines.create).toHaveLength(2);
  });

  it('functional-currency path (no currencyCode) — unchanged 2-line entry, lines carry BASE', async () => {
    const tx = fakeTx();
    await postInvoicePayment(tx as never, {
      userId: 'u1', invoiceId: 'i1', paymentId: 'p4',
      date: new Date('2026-06-05'), amount: '500',
    });
    const data = tx.createCalls[0];
    expect(data.lines.create).toHaveLength(2);
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-bank']).toMatchObject({ currencyCode: 'BASE', debit: '500.0000' });
    expect(byAcc['a-ar']).toMatchObject({ currencyCode: 'BASE', credit: '500.0000' });
  });
});

describe('postSupplierPayment — FX settlement', () => {
  // Worked example (gain scenario):
  //   Purchase: 1000 USD at doc rate 80 → AP posted at 80000 INR base (credit)
  //   Payment:  1000 USD at payment rate 83 → paid out 83000 INR (loss — paid more)
  //   Dr AP      1000 USD, base = 80000  (relieve AP at doc rate)
  //   Cr BANK    1000 USD, base = 83000  (cash out at payment rate)
  //   Dr FX      0 USD,    base = 3000   (loss — debit FX)
  //   Sum Dr base = 80000 + 3000 = 83000 = Sum Cr base ✓
  //
  // Gain scenario (payRate < docRate):
  //   payRate 79: Dr AP 80000 = Cr BANK 79000 + Cr FX 1000 (gain) ✓

  it('paymentRate > documentRate → FX LOSS (debit FX_GAIN_LOSS), AP at docRate, entry balances', async () => {
    const tx = fakeTx();
    await postSupplierPayment(tx as never, {
      userId: 'u1', purchaseId: 'pu1', paymentId: 'sp1',
      date: new Date('2026-06-05'), amount: '1000',
      currencyCode: 'USD', paymentRate: '83', documentRate: '80',
    });
    const data = tx.createCalls[0];
    expect(data.lines.create[0].currencyCode).toBe('USD');
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));

    // AP: Dr 1000 USD, base 80000 (doc rate)
    expect(byAcc['a-ap']).toMatchObject({ debit: '1000.0000', baseDebit: '80000.0000' });
    // BANK: Cr 1000 USD, base 83000 (payment rate)
    expect(byAcc['a-bank']).toMatchObject({ credit: '1000.0000', baseCredit: '83000.0000' });
    // FX: Dr 0 USD, base 3000 (loss)
    expect(byAcc['a-fx']).toMatchObject({ debit: '0.0000', baseDebit: '3000.0000', baseCredit: '0.0000' });

    const totalDebit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseDebit), 0);
    const totalCredit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseCredit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 4);
  });

  it('paymentRate < documentRate → FX GAIN (credit FX_GAIN_LOSS), entry balances', async () => {
    // 1000 USD, docRate 80 → AP at 80000; payRate 79 → bank 79000; FX Cr 1000 (gain)
    // Dr AP 80000 = Cr BANK 79000 + Cr FX 1000 ✓
    const tx = fakeTx();
    await postSupplierPayment(tx as never, {
      userId: 'u1', purchaseId: 'pu1', paymentId: 'sp2',
      date: new Date('2026-06-05'), amount: '1000',
      currencyCode: 'USD', paymentRate: '79', documentRate: '80',
    });
    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    // AP: Dr 80000
    expect(byAcc['a-ap']).toMatchObject({ baseDebit: '80000.0000' });
    // BANK: Cr 79000
    expect(byAcc['a-bank']).toMatchObject({ baseCredit: '79000.0000' });
    // FX: Cr 1000 (gain)
    expect(byAcc['a-fx']).toMatchObject({ credit: '0.0000', baseCredit: '1000.0000', baseDebit: '0.0000' });

    const totalDebit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseDebit), 0);
    const totalCredit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseCredit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 4);
  });

  it('equal rates → no FX leg (only 2 lines)', async () => {
    const tx = fakeTx();
    await postSupplierPayment(tx as never, {
      userId: 'u1', purchaseId: 'pu1', paymentId: 'sp3',
      date: new Date('2026-06-05'), amount: '1000',
      currencyCode: 'USD', paymentRate: '83', documentRate: '83',
    });
    const data = tx.createCalls[0];
    expect(data.lines.create).toHaveLength(2);
  });

  it('functional-currency path (no currencyCode) — unchanged 2-line entry, lines carry BASE', async () => {
    const tx = fakeTx();
    await postSupplierPayment(tx as never, {
      userId: 'u1', purchaseId: 'pu1', paymentId: 'sp4',
      date: new Date('2026-06-05'), amount: '120', sourceType: 'PETTY_CASH',
    });
    const data = tx.createCalls[0];
    expect(data.lines.create).toHaveLength(2);
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    expect(byAcc['a-ap']).toMatchObject({ currencyCode: 'BASE', debit: '120.0000' });
    expect(byAcc['a-cash']).toMatchObject({ currencyCode: 'BASE', credit: '120.0000' });
  });
});

// ── Fix 1 (review): repeating-decimal rate rounding safety ───────────────────

describe('postInvoicePayment — repeating-decimal rates', () => {
  it('amount=1, docRate=1.11115, payRate=1.33333 — posts without throw, FX leg on credit side (gain)', async () => {
    // bankBase = 1 × 1.33333 → "1.3333"
    // arBase   = 1 × 1.11115 → "1.1112" (rounded 4dp)
    // fxBase   = |1.3333 − 1.1112| = "0.2221"  ← residual, balances exactly
    const tx = fakeTx();
    await expect(postInvoicePayment(tx as never, {
      userId: 'u1', invoiceId: 'i1', paymentId: 'p-rd1',
      date: new Date('2026-06-05'), amount: '1',
      currencyCode: 'EUR', paymentRate: '1.33333', documentRate: '1.11115',
    })).resolves.toBeUndefined();

    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    // payRate > docRate → FX gain → credit FX
    expect(parseFloat(byAcc['a-fx'].baseCredit)).toBeGreaterThan(0);
    expect(parseFloat(byAcc['a-fx'].baseDebit)).toBe(0);

    // Base balance must hold exactly
    const totalDebit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseDebit), 0);
    const totalCredit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseCredit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 4);
  });
});

describe('postSupplierPayment — repeating-decimal rates', () => {
  it('amount=1, docRate=80.1111, payRate=83.3333 — posts without throw, FX leg on debit side (loss)', async () => {
    // cashBase = 1 × 83.3333 → "83.3333"
    // apBase   = 1 × 80.1111 → "80.1111"
    // fxBase   = |83.3333 − 80.1111| = "3.2222"  ← residual
    const tx = fakeTx();
    await expect(postSupplierPayment(tx as never, {
      userId: 'u1', purchaseId: 'pu1', paymentId: 'sp-rd1',
      date: new Date('2026-06-05'), amount: '1',
      currencyCode: 'JPY', paymentRate: '83.3333', documentRate: '80.1111',
    })).resolves.toBeUndefined();

    const data = tx.createCalls[0];
    const byAcc = Object.fromEntries(data.lines.create.map((l: any) => [l.accountId, l]));
    // payRate > docRate → FX loss → debit FX
    expect(parseFloat(byAcc['a-fx'].baseDebit)).toBeGreaterThan(0);
    expect(parseFloat(byAcc['a-fx'].baseCredit)).toBe(0);

    const totalDebit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseDebit), 0);
    const totalCredit = data.lines.create.reduce((s: number, l: any) => s + parseFloat(l.baseCredit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 4);
  });
});

describe('postInvoicePayment — equal rates with foreign currency', () => {
  it('equal payRate===docRate with currencyCode set → 2-line entry (no FX leg) carrying currencyCode', async () => {
    const tx = fakeTx();
    await postInvoicePayment(tx as never, {
      userId: 'u1', invoiceId: 'i1', paymentId: 'p-eq1',
      date: new Date('2026-06-05'), amount: '500',
      currencyCode: 'EUR', paymentRate: '1.2', documentRate: '1.2',
    });
    const data = tx.createCalls[0];
    // No FX leg — only 2 lines
    expect(data.lines.create).toHaveLength(2);
    // Both lines carry the foreign currencyCode
    for (const line of data.lines.create) {
      expect(line.currencyCode).toBe('EUR');
    }
  });
});
