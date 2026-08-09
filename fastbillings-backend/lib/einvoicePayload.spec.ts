import { describe, expect, it } from 'vitest';
import {
  buildEInvoicePayload,
  EInvoiceValidationError,
  isValidGstin,
  normalizeGstin,
  stateCodeFromGstin,
} from './einvoicePayload';

const SELLER = '27AAPFU0939F1ZV';
const BUYER = '29AABCU9603R1ZM';

describe('GSTIN helpers', () => {
  it('normalizes and validates GSTIN format', () => {
    expect(normalizeGstin(' 27aapfu0939f1zv ')).toBe(SELLER);
    expect(isValidGstin(SELLER)).toBe(true);
    expect(isValidGstin('29AABCU9603R1ZM')).toBe(true);
    expect(isValidGstin('SHORT')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
  });

  it('extracts state code', () => {
    expect(stateCodeFromGstin(BUYER)).toBe('29');
  });
});

describe('buildEInvoicePayload', () => {
  const base = {
    invoiceId: 'inv-1',
    invoiceNumber: 'INV-001',
    invoiceDate: new Date('2026-04-15'),
    sellerGstin: SELLER,
    sellerName: 'Seller Co',
    buyerGstin: BUYER,
    buyerName: 'Buyer Co',
    companyState: 'Maharashtra',
    totalAmount: 1180,
    taxableAmount: 1000,
    vat: 180,
    items: [
      {
        name: 'Widget',
        qty: 1,
        rate: 1000,
        hsnSac: '847130',
        taxes: [
          { kind: 'CGST', percent: 9, amount: 90 },
          { kind: 'SGST', percent: 9, amount: 90 },
        ],
      },
    ],
  };

  it('builds B2B payload with tax split, HSN, and POS from buyer GSTIN', () => {
    const p = buildEInvoicePayload(base);
    expect(p.buyerGstin).toBe(BUYER);
    expect(p.placeOfSupply).toBe('29');
    expect(p.cgst).toBe(90);
    expect(p.sgst).toBe(90);
    expect(p.igst).toBe(0);
    expect(p.items[0].hsn).toBe('847130');
    expect(p.items[0].gstRate).toBe(18);
    expect(p.items[0].isService).toBe(false);
  });

  it('rejects missing buyer GSTIN', () => {
    expect(() => buildEInvoicePayload({ ...base, buyerGstin: null })).toThrow(EInvoiceValidationError);
    try {
      buildEInvoicePayload({ ...base, buyerGstin: '' });
    } catch (e) {
      expect(e).toBeInstanceOf(EInvoiceValidationError);
      expect((e as EInvoiceValidationError).errors.some((m) => /Buyer GSTIN/i.test(m))).toBe(true);
    }
  });

  it('rejects taxable line without HSN', () => {
    expect(() =>
      buildEInvoicePayload({
        ...base,
        items: [{ name: 'No HSN', qty: 1, rate: 100, taxes: [{ kind: 'IGST', percent: 18, amount: 18 }] }],
      }),
    ).toThrow(/HSN\/SAC is required/);
  });

  it('allows nil-rated line without HSN', () => {
    const p = buildEInvoicePayload({
      ...base,
      taxableAmount: 0,
      vat: 0,
      totalAmount: 100,
      items: [{ name: 'Exempt', qty: 1, rate: 100, gstSupplyType: 'NIL_RATED' }],
    });
    expect(p.items).toHaveLength(1);
    expect(p.totalTax).toBe(0);
  });
});
