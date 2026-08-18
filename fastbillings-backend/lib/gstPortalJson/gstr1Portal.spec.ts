import { describe, expect, it } from 'vitest';

import { buildGstr1PortalJson } from './gstr1Portal';
import { filingPeriodFromRange, portalDate } from './format';
import { resolvePlaceOfSupplyCode } from './indianStateCodes';
import { validateGstr1PortalJson } from './validateGstr1Portal';
import type { Gstr1WorksheetData } from './types';

const SUPPLIER = '27AAPFU0939F1ZV';
const BUYER = '29AABCU9603R1ZM';

describe('gstPortalJson format', () => {
  it('formats portal dates DD-MM-YYYY', () => {
    expect(portalDate('2026-04-15')).toBe('15-04-2026');
  });

  it('builds filing period MMYYYY', () => {
    const from = new Date('2026-04-01');
    const to = new Date('2026-04-30');
    expect(filingPeriodFromRange(from, to)).toBe('042026');
  });

  it('resolves state name to GST code', () => {
    expect(resolvePlaceOfSupplyCode({ placeOfSupply: 'Karnataka' })).toBe('29');
    expect(resolvePlaceOfSupplyCode({ gstin: BUYER })).toBe('29');
  });
});

describe('buildGstr1PortalJson', () => {
  const worksheet: Gstr1WorksheetData = {
    period: { from: '2026-04-01', to: '2026-04-30' },
    companyState: 'Maharashtra',
    b2b: [
      {
        gstin: BUYER,
        customerName: 'Buyer Co',
        invoiceNumber: 'INV-1001',
        date: '2026-04-10',
        placeOfSupply: 'Karnataka',
        taxableValue: 10000,
        cgst: 0,
        sgst: 0,
        igst: 1800,
        cess: 0,
        total: 11800,
        reverseCharge: false,
      },
    ],
    b2cl: [],
    b2cs: [
      {
        placeOfSupply: 'Maharashtra',
        supplyType: 'Intra-State',
        rate: 18,
        invoiceCount: 3,
        taxableValue: 5000,
        cgst: 450,
        sgst: 450,
        igst: 0,
        cess: 0,
      },
    ],
    cdnr: [],
    cdnur: [],
    hsn: [
      {
        hsn: '847130',
        description: 'Laptops',
        uqc: 'NOS',
        rate: 18,
        qty: 2,
        taxableValue: 10000,
        cgst: 0,
        sgst: 0,
        igst: 1800,
        cess: 0,
      },
    ],
    summary: { totalTaxableValue: 15000, totalTax: 2700 },
  };

  it('transforms worksheet to portal JSON shape', () => {
    const portal = buildGstr1PortalJson({ worksheet, supplierGstin: SUPPLIER });
    expect(portal.gstin).toBe(SUPPLIER);
    expect(portal.fp).toBe('042026');
    expect(portal.b2b?.[0].ctin).toBe(BUYER);
    expect(portal.b2b?.[0].inv[0].inum).toBe('INV-1001');
    expect(portal.b2b?.[0].inv[0].idt).toBe('10-04-2026');
    expect(portal.b2b?.[0].inv[0].pos).toBe('29');
    expect(portal.b2cs?.[0].sply_ty).toBe('INTRA');
    expect(portal.hsn?.data[0].hsn_sc).toBe('847130');
  });

  it('passes validation for well-formed payload', () => {
    const portal = buildGstr1PortalJson({ worksheet, supplierGstin: SUPPLIER });
    const issues = validateGstr1PortalJson(portal);
    expect(issues).toEqual([]);
  });

  it('flags invalid supplier GSTIN', () => {
    const portal = buildGstr1PortalJson({ worksheet, supplierGstin: 'BAD' });
    const issues = validateGstr1PortalJson(portal);
    expect(issues.some((i) => i.code === 'INVALID_SUPPLIER_GSTIN')).toBe(true);
  });
});
