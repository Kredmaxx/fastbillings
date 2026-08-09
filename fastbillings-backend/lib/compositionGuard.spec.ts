import { describe, expect, it } from 'vitest';
import { documentHasGstTaxes, stripGstFromDocumentItems } from './compositionGuard';

describe('compositionGuard', () => {
  it('strips taxes and recomputes line amount', () => {
    const out = stripGstFromDocumentItems([
      {
        qty: 2,
        rate: 100,
        discount: 10,
        tax: 36,
        totalTax: 36,
        amount: 226,
        taxes: [{ kind: 'CGST', amount: 18 }, { kind: 'SGST', amount: 18 }],
        appliedTaxRateIds: ['r1'],
      },
    ]);
    expect(out[0].taxes).toEqual([]);
    expect(out[0].tax).toBe(0);
    expect(out[0].totalTax).toBe(0);
    expect(out[0].amount).toBe(190);
    expect(out[0].appliedTaxRateIds).toEqual([]);
  });

  it('detects gst taxes on lines', () => {
    expect(documentHasGstTaxes([{ taxes: [{ kind: 'IGST', amount: 1 }] }])).toBe(true);
    expect(documentHasGstTaxes([{ taxes: [], tax: 0, totalTax: 0 }])).toBe(false);
  });
});
