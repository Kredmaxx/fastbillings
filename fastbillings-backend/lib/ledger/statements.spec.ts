// lib/ledger/statements.spec.ts
import { describe, it, expect } from 'vitest';
import {
  trialBalanceFrom,
  profitLossFrom,
  balanceSheetFrom,
  cashFlowFrom,
  type AccountBalance,
} from './statements';

// A tiny balanced book: sold goods (cost 60) for 100+18 tax, all on credit then nothing paid.
// Invoice issued: Dr AR 118 / Cr Sales 100 / Cr Output Tax 18
// COGS:           Dr COGS 60 / Cr Inventory 60
// Opening:        Dr Inventory 60 / Cr OBE 60   (so inventory starts at 60)
const book: AccountBalance[] = [
  { id: 'ar', code: '1100', name: 'AR', accountType: 'ASSET', role: 'AR', debit: '118', credit: '0' },
  { id: 'inv', code: '1200', name: 'Inventory', accountType: 'ASSET', role: 'INVENTORY', debit: '60', credit: '60' },
  { id: 'otax', code: '2100', name: 'Output Tax', accountType: 'LIABILITY', role: 'OUTPUT_TAX', debit: '0', credit: '18' },
  { id: 'obe', code: '3050', name: 'OBE', accountType: 'EQUITY', role: 'OPENING_BALANCE_EQUITY', debit: '0', credit: '60' },
  { id: 'sales', code: '4001', name: 'Sales', accountType: 'INCOME', role: 'SALES_REVENUE', debit: '0', credit: '100' },
  { id: 'cogs', code: '5001', name: 'COGS', accountType: 'EXPENSE', role: 'COGS', debit: '60', credit: '0' },
];

describe('trialBalanceFrom', () => {
  it('lists accounts and balances; total debits == total credits', () => {
    const tb = trialBalanceFrom(book);
    expect(tb.totals.debit).toBeCloseTo(tb.totals.credit, 4);
    expect(tb.balanced).toBe(true);
    expect(tb.accounts).toHaveLength(6);
  });
});

describe('profitLossFrom', () => {
  it('revenue net of returns, COGS, gross profit, net income', () => {
    const pl = profitLossFrom(book);
    expect(pl.revenue.total).toBeCloseTo(100, 4);
    expect(pl.costOfGoodsSold.total).toBeCloseTo(60, 4);
    expect(pl.grossProfit).toBeCloseTo(40, 4);
    expect(pl.netIncome).toBeCloseTo(40, 4); // no other expenses
  });
  it('taxes come from OUTPUT_TAX/INPUT_TAX role accounts', () => {
    const pl = profitLossFrom(book);
    expect(pl.taxes.outputTax).toBeCloseTo(18, 4);
    expect(pl.taxes.inputTax).toBeCloseTo(0, 4);
  });
});

describe('balanceSheetFrom', () => {
  it('assets == liabilities + equity (equity includes net income)', () => {
    const bs = balanceSheetFrom(book);
    // assets: AR 118 + Inventory 0 (60-60) = 118 ; liabilities: output tax 18 ; equity: OBE 60 + NI 40 = 100
    expect(bs.assets.total).toBeCloseTo(118, 4);
    expect(bs.liabilities.total).toBeCloseTo(18, 4);
    expect(bs.equity.total).toBeCloseTo(100, 4);
    expect(bs.totalLiabilitiesAndEquity).toBeCloseTo(bs.assets.total, 4);
  });
  it('fills named buckets from roles', () => {
    const bs = balanceSheetFrom(book);
    expect(bs.assets.current.receivables).toBeCloseTo(118, 4);
    expect(bs.assets.current.inventory).toBeCloseTo(0, 4);
    expect(bs.liabilities.current.taxLiability).toBeCloseTo(18, 4);
  });
});

describe('cashFlowFrom', () => {
  it('reconciles opening/closing cash with operating + residual financing', () => {
    const opening: AccountBalance[] = [
      { id: 'cash', code: '1000', name: 'Cash', accountType: 'ASSET', role: 'CASH', debit: '50', credit: '0' },
      { id: 'ar', code: '1100', name: 'AR', accountType: 'ASSET', role: 'AR', debit: '0', credit: '0' },
      { id: 'sales', code: '4001', name: 'Sales', accountType: 'INCOME', role: 'SALES_REVENUE', debit: '0', credit: '0' },
    ];
    const closing: AccountBalance[] = [
      { id: 'cash', code: '1000', name: 'Cash', accountType: 'ASSET', role: 'CASH', debit: '90', credit: '0' },
      { id: 'ar', code: '1100', name: 'AR', accountType: 'ASSET', role: 'AR', debit: '10', credit: '0' },
      { id: 'sales', code: '4001', name: 'Sales', accountType: 'INCOME', role: 'SALES_REVENUE', debit: '0', credit: '50' },
    ];
    const cf = cashFlowFrom(opening, closing);
    expect(cf.openingCash).toBeCloseTo(50, 2);
    expect(cf.closingCash).toBeCloseTo(90, 2);
    expect(cf.netIncreaseInCash).toBeCloseTo(40, 2);
    expect(cf.operatingActivities.netIncome).toBeCloseTo(50, 2);
    // NI 50 - increase AR 10 = 40 operating, matches cash increase
    expect(cf.operatingActivities.netCashFromOperating).toBeCloseTo(40, 2);
  });
});
