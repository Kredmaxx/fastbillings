// lib/ledger/inventoryCost.spec.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { applyReceipt, applyIssue, type StockState } from './inventoryCost';
import { toDecimal } from './money';

const S = (qty: string, avg: string): StockState => ({ quantityOnHand: toDecimal(qty), avgCost: toDecimal(avg) });
const eq = (d: Prisma.Decimal, v: string) => d.equals(toDecimal(v));

describe('applyReceipt (WAC)', () => {
  it('first receipt sets average to unit cost', () => {
    const r = applyReceipt(S('0', '0'), '10', '5');
    expect(eq(r.quantityOnHand, '10')).toBe(true);
    expect(eq(r.avgCost, '5')).toBe(true);
  });
  it('blends average across receipts', () => {
    // 10 @ 5 then 10 @ 7 => 20 @ 6
    const r = applyReceipt(S('10', '5'), '10', '7');
    expect(eq(r.quantityOnHand, '20')).toBe(true);
    expect(eq(r.avgCost, '6')).toBe(true);
  });
  it('zero qtyIn leaves state unchanged', () => {
    const r = applyReceipt(S('10', '5'), '0', '99');
    expect(eq(r.quantityOnHand, '10')).toBe(true);
    expect(eq(r.avgCost, '5')).toBe(true);
  });
});

describe('applyIssue (WAC)', () => {
  it('COGS = qtyOut * avgCost; quantity decremented; average unchanged', () => {
    const r = applyIssue(S('20', '6'), '5');
    expect(eq(r.cogs, '30')).toBe(true);
    expect(eq(r.state.quantityOnHand, '15')).toBe(true);
    expect(eq(r.state.avgCost, '6')).toBe(true);
  });
  it('issuing more than on hand allows negative quantity (COGS at current avg)', () => {
    const r = applyIssue(S('2', '6'), '5');
    expect(eq(r.cogs, '30')).toBe(true);
    expect(eq(r.state.quantityOnHand, '-3')).toBe(true);
  });
  it('zero qtyOut yields zero COGS, unchanged state', () => {
    const r = applyIssue(S('10', '6'), '0');
    expect(eq(r.cogs, '0')).toBe(true);
    expect(eq(r.state.quantityOnHand, '10')).toBe(true);
  });
});
