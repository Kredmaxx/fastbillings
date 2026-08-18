import { describe, expect, it } from 'vitest';
import { overlayPartySelling, partyRateMapFromRows } from './partyRate';

describe('overlayPartySelling', () => {
  it('keeps the list price when no party rate is set', () => {
    expect(overlayPartySelling(100, null)).toEqual({
      selling: 100,
      partyRateApplied: false,
      listPrice: 100,
    });
  });

  it('replaces the list price with a valid party rate', () => {
    expect(overlayPartySelling(100, 82.5)).toEqual({
      selling: 82.5,
      partyRateApplied: true,
      listPrice: 100,
    });
  });

  it('ignores negative party rates', () => {
    expect(overlayPartySelling(100, -1).partyRateApplied).toBe(false);
  });
});

describe('partyRateMapFromRows', () => {
  it('indexes selling prices by product id', () => {
    const map = partyRateMapFromRows([
      { productId: 'p1', sellingPrice: 50 },
      { productId: 'p2', sellingPrice: '12.25' },
    ]);
    expect(map.get('p1')).toBe(50);
    expect(map.get('p2')).toBe(12.25);
  });
});
