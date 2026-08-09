// lib/ledger/statements.ts
import { toDecimal } from './money';

export interface AccountBalance {
  id: string; code: string; name: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  debit: string; credit: string;
  role?: string | null;
}

const n = (v: string): number => Number(toDecimal(v).toFixed(4));
const debitNet = (a: AccountBalance): number => n(a.debit) - n(a.credit);   // asset/expense normal
const creditNet = (a: AccountBalance): number => n(a.credit) - n(a.debit);  // liability/equity/income normal

export function trialBalanceFrom(accounts: AccountBalance[]) {
  const rows = accounts.map((a) => ({
    id: a.id, code: a.code, name: a.name, accountType: a.accountType,
    totalDebit: n(a.debit), totalCredit: n(a.credit), net: n(a.debit) - n(a.credit),
  })).sort((x, y) => x.code.localeCompare(y.code));
  const totalDebit = rows.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
  return { accounts: rows, totals: { debit: totalDebit, credit: totalCredit }, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
}

function byRole(accounts: AccountBalance[], role: string): AccountBalance[] {
  return accounts.filter((a) => a.role === role);
}
function sumDebitNet(accounts: AccountBalance[]): number { return accounts.reduce((s, a) => s + debitNet(a), 0); }
function sumCreditNet(accounts: AccountBalance[]): number { return accounts.reduce((s, a) => s + creditNet(a), 0); }

export function profitLossFrom(accounts: AccountBalance[]) {
  const income = accounts.filter((a) => a.accountType === 'INCOME');
  const expenses = accounts.filter((a) => a.accountType === 'EXPENSE');
  const cogsAccts = expenses.filter((a) => a.role === 'COGS');
  // operating expenses = all EXPENSE accounts except COGS
  // (includes PURCHASES, ROUNDING, FX_GAIN_LOSS, INPUT_TAX-as-expense, and anything else EXPENSE-typed)
  const opex = expenses.filter((a) => a.role !== 'COGS');
  // revenue = net of all INCOME accounts (SALES_RETURNS is INCOME-typed contra, nets down)
  const revenueTotal = sumCreditNet(income);
  const cogsTotal = sumDebitNet(cogsAccts);
  const opexTotal = sumDebitNet(opex);
  const grossProfit = revenueTotal - cogsTotal;
  const operatingIncome = grossProfit - opexTotal;
  const outputTax = sumCreditNet(byRole(accounts, 'OUTPUT_TAX'));
  const inputTax = sumDebitNet(byRole(accounts, 'INPUT_TAX'));
  return {
    revenue: { total: revenueTotal, byCategory: income.map((a) => ({ name: a.name, total: creditNet(a) })) },
    costOfGoodsSold: { total: cogsTotal },
    grossProfit,
    operatingExpenses: { total: opexTotal, byCategory: opex.map((a) => ({ name: a.name, total: debitNet(a) })) },
    operatingIncome,
    netIncome: operatingIncome,
    taxes: { outputTax, inputTax, netTax: outputTax - inputTax },
  };
}

/**
 * Indirect cash-flow statement (AS-3 style MVP).
 * `opening` = balances as-of day before period start; `closing` = balances as-of period end.
 */
export function cashFlowFrom(opening: AccountBalance[], closing: AccountBalance[]) {
  const pl = profitLossFrom(closing);
  const openCash = sumDebitNet([...byRole(opening, 'BANK'), ...byRole(opening, 'CASH')]);
  const closeCash = sumDebitNet([...byRole(closing, 'BANK'), ...byRole(closing, 'CASH')]);

  const delta = (role: string, debitNormal: boolean) => {
    const o = debitNormal ? sumDebitNet(byRole(opening, role)) : sumCreditNet(byRole(opening, role));
    const c = debitNormal ? sumDebitNet(byRole(closing, role)) : sumCreditNet(byRole(closing, role));
    return c - o;
  };

  // Working capital: increase in AR uses cash; decrease frees cash
  const changeAR = delta('AR', true);
  const changeInventory = delta('INVENTORY', true);
  const changeAP = delta('AP', false);

  const adjustments = {
    decreaseInReceivables: changeAR < 0 ? Math.abs(changeAR) : 0,
    increaseInReceivables: changeAR > 0 ? changeAR : 0,
    decreaseInInventory: changeInventory < 0 ? Math.abs(changeInventory) : 0,
    increaseInInventory: changeInventory > 0 ? changeInventory : 0,
    increaseInPayables: changeAP > 0 ? changeAP : 0,
    decreaseInPayables: changeAP < 0 ? Math.abs(changeAP) : 0,
  };

  const netCashFromOperating =
    pl.netIncome +
    adjustments.decreaseInReceivables -
    adjustments.increaseInReceivables +
    adjustments.decreaseInInventory -
    adjustments.increaseInInventory +
    adjustments.increaseInPayables -
    adjustments.decreaseInPayables;

  const netIncreaseInCash = closeCash - openCash;
  // Investing/financing not separately tracked yet — residual plug for reconciliation
  const residual = round2(netIncreaseInCash - netCashFromOperating);

  return {
    operatingActivities: {
      netIncome: round2(pl.netIncome),
      adjustments: {
        decreaseInReceivables: round2(adjustments.decreaseInReceivables),
        increaseInReceivables: round2(adjustments.increaseInReceivables),
        decreaseInInventory: round2(adjustments.decreaseInInventory),
        increaseInInventory: round2(adjustments.increaseInInventory),
        increaseInPayables: round2(adjustments.increaseInPayables),
        decreaseInPayables: round2(adjustments.decreaseInPayables),
      },
      netCashFromOperating: round2(netCashFromOperating),
    },
    investingActivities: { netCashFromInvesting: 0 },
    financingActivities: { netCashFromFinancing: round2(residual) },
    netIncreaseInCash: round2(netIncreaseInCash),
    openingCash: round2(openCash),
    closingCash: round2(closeCash),
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function balanceSheetFrom(accounts: AccountBalance[]) {
  const assetsTotal = sumDebitNet(accounts.filter((a) => a.accountType === 'ASSET'));
  const liabilitiesTotal = sumCreditNet(accounts.filter((a) => a.accountType === 'LIABILITY'));
  const equityAccountsTotal = sumCreditNet(accounts.filter((a) => a.accountType === 'EQUITY'));
  const incomeTotal = sumCreditNet(accounts.filter((a) => a.accountType === 'INCOME'));
  const expenseTotal = sumDebitNet(accounts.filter((a) => a.accountType === 'EXPENSE'));
  const netIncome = incomeTotal - expenseTotal;
  const equityTotal = equityAccountsTotal + netIncome;

  const cashAndBank = sumDebitNet([...byRole(accounts, 'BANK'), ...byRole(accounts, 'CASH')]);
  const receivables = sumDebitNet(byRole(accounts, 'AR'));
  const inventory = sumDebitNet(byRole(accounts, 'INVENTORY'));
  const payables = sumCreditNet(byRole(accounts, 'AP'));
  // Net output tax only against RECOVERABLE (asset-typed) input tax. In regimes
  // where input tax is a cost (e.g. US sales tax, inputTaxIsExpense), the
  // INPUT_TAX account is EXPENSE-typed and must NOT reduce the tax liability.
  const recoverableInputTax = byRole(accounts, 'INPUT_TAX').filter((a) => a.accountType === 'ASSET');
  const taxLiability = sumCreditNet(byRole(accounts, 'OUTPUT_TAX')) - sumDebitNet(recoverableInputTax);
  // Liabilities not captured by the named buckets (e.g. loans, accruals) so the
  // sub-buckets reconcile to liabilities.total.
  const otherLiabilities = liabilitiesTotal - payables - sumCreditNet(byRole(accounts, 'OUTPUT_TAX'));

  return {
    assets: { current: { cashAndBank, receivables, inventory }, fixed: { total: 0 }, total: assetsTotal },
    liabilities: { current: { payables, taxLiability, other: otherLiabilities }, longTerm: { total: 0 }, total: liabilitiesTotal },
    equity: { ownerEquity: equityAccountsTotal, retainedEarnings: netIncome, total: equityTotal },
    totalLiabilitiesAndEquity: liabilitiesTotal + equityTotal,
  };
}
