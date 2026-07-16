// lib/ledger/cutover.spec.ts
import { describe, it, expect } from 'vitest';
import { buildOpeningInstructions, type OpeningSummary } from './cutover';
import { toDecimal, sumDecimals } from './money';
import type { LineInstruction } from './types';

const balanced = (lines: LineInstruction[]) => {
  const d = sumDecimals(lines.filter((l) => l.side === 'debit').map((l) => toDecimal(l.amount)));
  const c = sumDecimals(lines.filter((l) => l.side === 'credit').map((l) => toDecimal(l.amount)));
  return d.equals(c);
};

describe('buildOpeningInstructions', () => {
  it('assets debit, liabilities credit, residual to OBE (positive equity → credit)', () => {
    const s: OpeningSummary = { bank: '1000', cash: '100', ar: '500', inventory: '400', ap: '300' };
    const lines = buildOpeningInstructions(s);
    const byRole = Object.fromEntries(lines.map((l) => [l.roleKey, l]));
    expect(byRole['BANK']).toMatchObject({ side: 'debit', amount: '1000' });
    expect(byRole['CASH']).toMatchObject({ side: 'debit', amount: '100' });
    expect(byRole['AR']).toMatchObject({ side: 'debit', amount: '500' });
    expect(byRole['INVENTORY']).toMatchObject({ side: 'debit', amount: '400' });
    expect(byRole['AP']).toMatchObject({ side: 'credit', amount: '300' });
    // equity = (1000+100+500+400) - 300 = 1700 → credit OBE
    expect(byRole['OPENING_BALANCE_EQUITY']).toMatchObject({ side: 'credit', amount: '1700' });
    expect(balanced(lines)).toBe(true);
  });

  it('negative net equity → OBE on the debit side', () => {
    const s: OpeningSummary = { bank: '0', cash: '0', ar: '0', inventory: '0', ap: '500' };
    const lines = buildOpeningInstructions(s);
    const obe = lines.find((l) => l.roleKey === 'OPENING_BALANCE_EQUITY')!;
    expect(obe).toMatchObject({ side: 'debit', amount: '500' });
    expect(balanced(lines)).toBe(true);
  });

  it('omits zero-amount asset/liability lines', () => {
    const s: OpeningSummary = { bank: '100', cash: '0', ar: '0', inventory: '0', ap: '0' };
    const lines = buildOpeningInstructions(s);
    expect(lines.find((l) => l.roleKey === 'CASH')).toBeUndefined();
    expect(lines.find((l) => l.roleKey === 'AR')).toBeUndefined();
    expect(balanced(lines)).toBe(true);
  });

  it('all-zero summary yields no lines', () => {
    const lines = buildOpeningInstructions({ bank: '0', cash: '0', ar: '0', inventory: '0', ap: '0' });
    expect(lines).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Task 2: computeOpeningSummary + previewCutover + commitCutover
// ---------------------------------------------------------------------------
import { vi } from 'vitest';
import { computeOpeningSummary, previewCutover, commitCutover } from './cutover';

function fakeTx(opts: { initialized?: boolean; existingOpening?: boolean; goLive?: string } = {}) {
  const createCalls: any[] = [];
  return {
    createCalls,
    companySettings: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'cs1', ledgerInitialized: opts.initialized ?? false,
        functionalCurrency: 'INR', goLiveDate: new Date(opts.goLive ?? '2026-04-01'),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    bankDetail: { findMany: vi.fn().mockResolvedValue([{ currentBalance: '1000', accountType: 'current' }]) },
    pettyCash: { findFirst: vi.fn().mockResolvedValue({ currentBalance: '100' }) },
    invoice: { findMany: vi.fn().mockResolvedValue([{ TotalAmount: '500', payments: [] }]) },
    purchase: { findMany: vi.fn().mockResolvedValue([{ totalAmount: '300', paidAmount: '0' }]) },
    inventory: { findMany: vi.fn().mockResolvedValue([{ quantityOnHand: '10', avgCost: '40' }]) }, // 400
    ledgerAccountMapping: { findMany: vi.fn().mockResolvedValue([
      { roleKey: 'BANK', accountId: 'a-bank' }, { roleKey: 'CASH', accountId: 'a-cash' },
      { roleKey: 'AR', accountId: 'a-ar' }, { roleKey: 'INVENTORY', accountId: 'a-inv' },
      { roleKey: 'AP', accountId: 'a-ap' }, { roleKey: 'OPENING_BALANCE_EQUITY', accountId: 'a-obe' },
    ]) },
    accountingPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(opts.existingOpening ? { id: 'je-open' } : null),
      create: vi.fn().mockImplementation(async ({ data }: any) => { createCalls.push(data); return { id: 'je-open', ...data }; }),
    },
  };
}

describe('computeOpeningSummary', () => {
  it('aggregates bank, cash, AR, AP, inventory', async () => {
    const tx = fakeTx();
    const s = await computeOpeningSummary(tx as never, 'u1', new Date('2026-03-31'));
    expect(s.bank).toBe('1000'); expect(s.cash).toBe('100');
    expect(s.ar).toBe('500'); expect(s.ap).toBe('300'); expect(s.inventory).toBe('400');
  });
});

describe('previewCutover', () => {
  it('returns the summary + draft lines + balanced flag, writes nothing', async () => {
    const tx = fakeTx();
    const r = await previewCutover(tx as never, 'u1');
    expect(r.balanced).toBe(true);
    expect(r.lines.length).toBeGreaterThan(0);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('commitCutover', () => {
  it('posts one opening entry dated goLive-1 and sets ledgerInitialized', async () => {
    const tx = fakeTx();
    await commitCutover(tx as never, 'u1');
    expect(tx.journalEntry.create).toHaveBeenCalledOnce();
    const data = tx.createCalls[0];
    expect(data).toMatchObject({ isOpeningBalance: true, sourceType: 'Cutover', event: 'opening' });
    expect(tx.companySettings.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ledgerInitialized: true }) }));
  });
  it('is idempotent: no new entry, but still ensures ledgerInitialized is true', async () => {
    const tx = fakeTx({ existingOpening: true });
    await commitCutover(tx as never, 'u1');
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
    // even on the early-return path the flag must be (re-)set true to repair partial failures
    expect(tx.companySettings.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ledgerInitialized: true }) }),
    );
  });
});
