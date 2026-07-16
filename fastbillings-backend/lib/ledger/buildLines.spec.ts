// lib/ledger/buildLines.spec.ts
import { describe, it, expect } from 'vitest';
import { buildLines, LedgerError } from './buildLines';
import type { PostingInput } from './types';

const resolver = (role?: string, accountId?: string): string => {
  if (accountId) return accountId;
  const map: Record<string, string> = { AR: 'acc-ar', SALES_REVENUE: 'acc-rev', OUTPUT_TAX: 'acc-tax' };
  const id = role ? map[role] : undefined;
  if (!id) throw new LedgerError(`no account for role ${role}`);
  return id;
};

const base: PostingInput = {
  userId: 'u1', sourceType: 'Invoice', sourceId: 'inv1', event: 'issued',
  date: new Date('2026-06-06'), currencyCode: 'INR', instructions: [],
};

describe('buildLines', () => {
  it('builds balanced lines with base amounts (rate=1 default)', () => {
    const lines = buildLines({
      ...base,
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '118.00' },
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '100.00' },
        { roleKey: 'OUTPUT_TAX', side: 'credit', amount: '18.00', taxRoleKey: 'OUTPUT_TAX' },
      ],
    }, resolver);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ accountId: 'acc-ar', debit: '118.0000', credit: '0.0000', baseDebit: '118.0000' });
    expect(lines[2]).toMatchObject({ accountId: 'acc-tax', credit: '18.0000', taxRoleKey: 'OUTPUT_TAX' });
  });

  it('applies exchange rate to base amounts', () => {
    const lines = buildLines({
      ...base, currencyCode: 'USD', exchangeRate: '80',
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '10' },
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '10' },
      ],
    }, resolver);
    expect(lines[0].baseDebit).toBe('800.0000');
    expect(lines[1].baseCredit).toBe('800.0000');
  });

  it('throws when not balanced in base currency', () => {
    expect(() => buildLines({
      ...base,
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '100' },
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '90' },
      ],
    }, resolver)).toThrow(LedgerError);
  });

  it('throws when an instruction has neither roleKey nor accountId', () => {
    expect(() => buildLines({
      ...base, instructions: [{ side: 'debit', amount: '1' }],
    }, resolver)).toThrow(LedgerError);
  });

  it('throws when an instruction has both roleKey and accountId', () => {
    expect(() => buildLines({
      ...base, instructions: [{ roleKey: 'AR', accountId: 'x', side: 'debit', amount: '1' }],
    }, resolver)).toThrow(LedgerError);
  });

  it('rejects negative amounts', () => {
    expect(() => buildLines({
      ...base, instructions: [{ roleKey: 'AR', side: 'debit', amount: '-1' }],
    }, resolver)).toThrow(LedgerError);
  });

  // ── Task 2: baseAmount override ──────────────────────────────────────────

  it('normal line: base = amount × rate when no baseAmount override', () => {
    const lines = buildLines({
      ...base, currencyCode: 'USD', exchangeRate: '83',
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '100' },
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '100' },
      ],
    }, resolver);
    expect(lines[0].baseDebit).toBe('8300.0000');
    expect(lines[0].exchangeRate).toBe('83.00000000');
  });

  it('line with baseAmount override uses it instead of amount×rate', () => {
    // AR relieved at document rate 80, not payment rate 83
    const lines = buildLines({
      ...base, currencyCode: 'USD', exchangeRate: '83',
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '100', baseAmount: '8000' },
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '100', baseAmount: '8000' },
      ],
    }, resolver);
    expect(lines[0].baseDebit).toBe('8000.0000');
    // line exchangeRate = 8000/100 = 80
    expect(lines[0].exchangeRate).toBe('80.00000000');
  });

  it('entry that balances only via baseAmount override passes balance check', () => {
    // Cash Dr: 1000 USD × rate 83 → base 83000
    // AR   Cr: 1000 USD, baseAmount override 80000 (document rate 80)
    // FX   Cr: 0 USD, baseAmount 3000 (gain)
    // Sum baseDebit = 83000; sum baseCredit = 80000 + 3000 = 83000 ✓
    expect(() => buildLines({
      ...base, currencyCode: 'USD', exchangeRate: '83',
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '1000' },       // base = 83000
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '1000', baseAmount: '80000' }, // explicit 80000
        { accountId: 'acc-fx', side: 'credit', amount: '0', baseAmount: '3000' },          // FX adj leg
      ],
    }, resolver)).not.toThrow();
  });

  it('unbalanced base (even with overrides) still throws', () => {
    expect(() => buildLines({
      ...base, currencyCode: 'USD', exchangeRate: '83',
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '100', baseAmount: '8300' },
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '100', baseAmount: '7000' }, // deliberately off
      ],
    }, resolver)).toThrow(LedgerError);
  });

  it('allows amount=0 with positive baseAmount (FX adjustment leg)', () => {
    const lines = buildLines({
      ...base, currencyCode: 'USD', exchangeRate: '83',
      instructions: [
        { roleKey: 'AR', side: 'debit', amount: '100' },         // base 8300
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '100', baseAmount: '8000' },
        { accountId: 'acc-fx', side: 'credit', amount: '0', baseAmount: '300' },
      ],
    }, resolver);
    // The FX leg: amount=0, baseCredit=300 — must not throw, and stores base
    expect(lines[2].credit).toBe('0.0000');
    expect(lines[2].baseCredit).toBe('300.0000');
    // line exchangeRate falls back to entry rate (83) because amount=0
    expect(lines[2].exchangeRate).toBe('83.00000000');
  });

  it('rejects negative baseAmount', () => {
    expect(() => buildLines({
      ...base, instructions: [
        { roleKey: 'AR', side: 'debit', amount: '100', baseAmount: '-50' },
        { roleKey: 'SALES_REVENUE', side: 'credit', amount: '100' },
      ],
    }, resolver)).toThrow(LedgerError);
  });
});
