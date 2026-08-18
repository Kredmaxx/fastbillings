import { describe, expect, it } from 'vitest';
import { calcSaleOrderTotals, normaliseSaleOrderItems } from './saleOrderItems';

describe('saleOrderItems', () => {
  it('normalises qty/rate/tax and computes totals without posting GL', () => {
    const items = normaliseSaleOrderItems([
      { id: 'p1', name: 'Soap', qty: 2, rate: 50, tax: 18, discount: 0 },
    ]);
    expect(items[0].amount).toBe(100);
    const totals = calcSaleOrderTotals(items);
    expect(totals.taxable).toBe(100);
    expect(totals.vat).toBe(18);
    expect(totals.total).toBe(118);
  });

  it('returns empty items for non-arrays', () => {
    expect(normaliseSaleOrderItems(null)).toEqual([]);
  });
});
