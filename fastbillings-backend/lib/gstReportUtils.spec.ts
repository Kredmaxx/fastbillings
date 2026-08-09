import { describe, expect, it } from 'vitest';
import {
  cdnurAggKey,
  gstr1DocsSeries,
  indiaFinancialYearContaining,
  parseFinancialYearLabel,
  parseIndiaFyQuarter,
  sumNilExemptFromItems,
} from './gstReportUtils';

describe('financial year helpers', () => {
  it('parses 2025-26 as Apr 1 2025 – Mar 31 2026', () => {
    const r = parseFinancialYearLabel('2025-26');
    expect(r).not.toBeNull();
    expect(r!.fyLabel).toBe('2025-26');
    expect(r!.fromDate.getFullYear()).toBe(2025);
    expect(r!.fromDate.getMonth()).toBe(3);
    expect(r!.fromDate.getDate()).toBe(1);
    expect(r!.toDate.getFullYear()).toBe(2026);
    expect(r!.toDate.getMonth()).toBe(2);
    expect(r!.toDate.getDate()).toBe(31);
  });

  it('rejects invalid FY labels', () => {
    expect(parseFinancialYearLabel('2025')).toBeNull();
    expect(parseFinancialYearLabel('2025-28')).toBeNull();
  });

  it('resolves FY containing a date in Jan to prior Apr start', () => {
    const r = indiaFinancialYearContaining(new Date(2026, 0, 15));
    expect(r.fyLabel).toBe('2025-26');
  });

  it('resolves FY containing a date in Jul to same-year Apr start', () => {
    const r = indiaFinancialYearContaining(new Date(2025, 6, 1));
    expect(r.fyLabel).toBe('2025-26');
  });
});

describe('parseIndiaFyQuarter', () => {
  it('maps 2025-26-Q1 to Apr–Jun 2025', () => {
    const r = parseIndiaFyQuarter('2025-26-Q1');
    expect(r).not.toBeNull();
    expect(r!.fromDate.getFullYear()).toBe(2025);
    expect(r!.fromDate.getMonth()).toBe(3);
    expect(r!.toDate.getMonth()).toBe(5);
    expect(r!.toDate.getDate()).toBe(30);
  });

  it('maps 2025-Q4 to Jan–Mar 2026', () => {
    const r = parseIndiaFyQuarter('2025-Q4');
    expect(r!.fromDate.getFullYear()).toBe(2026);
    expect(r!.fromDate.getMonth()).toBe(0);
    expect(r!.toDate.getMonth()).toBe(2);
    expect(r!.toDate.getDate()).toBe(31);
  });
});

describe('sumNilExemptFromItems', () => {
  it('buckets line bases by gstSupplyType', () => {
    const r = sumNilExemptFromItems([
      { qty: 1, rate: 100, gstSupplyType: 'NIL_RATED' },
      { qty: 2, rate: 50, discount: 10, gstSupplyType: 'EXEMPT' },
      { qty: 1, rate: 40, gstSupplyType: 'NON_GST' },
      { qty: 1, rate: 999, gstSupplyType: 'TAXABLE' },
    ]);
    expect(r.nilRated).toBe(100);
    expect(r.exempt).toBe(90);
    expect(r.nonGst).toBe(40);
  });
});

describe('cdnurAggKey', () => {
  it('keeps C and D notes separate for the same POS', () => {
    expect(cdnurAggKey('Karnataka', 'C')).toBe('Karnataka|C');
    expect(cdnurAggKey('Karnataka', 'D')).toBe('Karnataka|D');
    expect(cdnurAggKey('Karnataka', 'C')).not.toBe(cdnurAggKey('Karnataka', 'D'));
  });
});

describe('gstr1DocsSeries', () => {
  it('includes cancelled in total and series range; net = active', () => {
    const row = gstr1DocsSeries({
      nature: 'Invoices for outward supply',
      docType: 'INV',
      activeCount: 2,
      cancelledCount: 1,
      numbers: ['INV-003', 'INV-001', 'INV-002'],
    });
    expect(row.totalNumber).toBe(3);
    expect(row.cancelled).toBe(1);
    expect(row.netIssued).toBe(2);
    expect(row.from).toBe('INV-001');
    expect(row.to).toBe('INV-003');
  });
});
