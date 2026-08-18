import { describe, expect, it } from 'vitest';
import {
  billedQtyToPrimary,
  convertRateBetweenUnits,
  lineStockQty,
  parseBillingUnit,
  parseProductDualUom,
  rateForBilledUnit,
  stampDualUomOnLine,
} from './dualUom';

describe('parseBillingUnit', () => {
  it('defaults to PRIMARY', () => {
    expect(parseBillingUnit(undefined)).toBe('PRIMARY');
    expect(parseBillingUnit('pcs')).toBe('PRIMARY');
  });
  it('accepts SECONDARY', () => {
    expect(parseBillingUnit('secondary')).toBe('SECONDARY');
  });
});

describe('billedQtyToPrimary', () => {
  it('leaves primary qty unchanged', () => {
    expect(billedQtyToPrimary(3, 'PRIMARY', 12)).toBe(3);
  });
  it('multiplies secondary qty by conversion', () => {
    expect(billedQtyToPrimary(2, 'SECONDARY', 12)).toBe(24);
  });
  it('ignores missing conversion', () => {
    expect(billedQtyToPrimary(2, 'SECONDARY', null)).toBe(2);
  });
});

describe('convertRateBetweenUnits', () => {
  it('scales PCS rate up to BOX', () => {
    expect(convertRateBetweenUnits(10, 'PRIMARY', 'SECONDARY', 12)).toBe(120);
  });
  it('scales BOX rate down to PCS', () => {
    expect(convertRateBetweenUnits(120, 'SECONDARY', 'PRIMARY', 12)).toBe(10);
  });
});

describe('rateForBilledUnit', () => {
  it('uses stored price when the line matches product billing unit', () => {
    expect(
      rateForBilledUnit({
        storedSellingPrice: 120,
        productBillingUnit: 'SECONDARY',
        lineBillingUnit: 'SECONDARY',
        conversion: 12,
      }),
    ).toBe(120);
  });
  it('divides when product is priced per box and line is PCS', () => {
    expect(
      rateForBilledUnit({
        storedSellingPrice: 120,
        productBillingUnit: 'SECONDARY',
        lineBillingUnit: 'PRIMARY',
        conversion: 12,
      }),
    ).toBe(10);
  });
});

describe('lineStockQty', () => {
  it('prefers stamped qtyPrimary', () => {
    expect(lineStockQty({ qty: 2, unitKind: 'SECONDARY', secondaryToPrimaryQty: 12, qtyPrimary: 99 })).toBe(99);
  });
  it('converts when qtyPrimary is missing', () => {
    expect(lineStockQty({ qty: 2, unitKind: 'SECONDARY', secondaryToPrimaryQty: 12 })).toBe(24);
  });
});

describe('stampDualUomOnLine', () => {
  it('stamps qtyPrimary and secondary unit name', () => {
    const stamped = stampDualUomOnLine(
      { qty: 2, unitKind: 'SECONDARY' },
      {
        billingUnit: 'SECONDARY',
        secondaryToPrimaryQty: 12,
        unit: { short_name: 'PCS' },
        secondaryUnit: { short_name: 'BOX' },
      },
    );
    expect(stamped.qtyPrimary).toBe(24);
    expect(stamped.unit).toBe('BOX');
    expect(stamped.unitKind).toBe('SECONDARY');
  });
});

describe('parseProductDualUom', () => {
  it('clears secondary fields for services', () => {
    const parsed = parseProductDualUom({
      primaryUnitId: 'u1',
      isService: true,
      secondaryUnitId: 'u2',
      secondaryToPrimaryQty: 12,
      billingUnit: 'SECONDARY',
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.secondaryUnitId).toBeNull();
      expect(parsed.billingUnit).toBe('PRIMARY');
    }
  });
  it('rejects the same unit for primary and secondary', () => {
    const parsed = parseProductDualUom({
      primaryUnitId: 'u1',
      isService: false,
      secondaryUnitId: 'u1',
      secondaryToPrimaryQty: 12,
    });
    expect(parsed.ok).toBe(false);
  });
  it('requires conversion when secondary is set', () => {
    const parsed = parseProductDualUom({
      primaryUnitId: 'u1',
      isService: false,
      secondaryUnitId: 'u2',
    });
    expect(parsed.ok).toBe(false);
  });
});
