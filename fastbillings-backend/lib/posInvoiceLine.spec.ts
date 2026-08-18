import { describe, expect, it } from 'vitest';
import { buildPosInvoiceLine } from './posInvoiceLine';

describe('buildPosInvoiceLine', () => {
  it('applies CGST+SGST on taxable goods', () => {
    const line = buildPosInvoiceLine({
      productId: 'p1',
      name: 'Soap',
      qty: 2,
      rate: 50,
      taxGroupId: 'g18',
      taxRates: [
        { id: 'c', name: 'CGST 9%', rate: 9, isActive: true, taxKind: 'CGST' },
        { id: 's', name: 'SGST 9%', rate: 9, isActive: true, taxKind: 'SGST' },
      ],
    });
    expect(line.totalTax).toBe(18);
    expect(line.amount).toBe(118);
    expect(line.taxes).toHaveLength(2);
  });

  it('skips tax for exempt supply', () => {
    const line = buildPosInvoiceLine({
      productId: 'p2',
      name: 'Book',
      qty: 1,
      rate: 200,
      gstSupplyType: 'EXEMPT',
      taxRates: [{ id: 'c', name: 'CGST', rate: 9, isActive: true, taxKind: 'CGST' }],
    });
    expect(line.totalTax).toBe(0);
    expect(line.amount).toBe(200);
  });
});
