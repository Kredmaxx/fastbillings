import { describe, expect, it } from 'vitest';

import {
  booksDateWindow,
  matchPortalLine,
  parseGstr2bPayload,
  parsePortalDate,
} from './gstr2bReconcile';

describe('gstr2bReconcile', () => {
  it('parses portal DD-MM-YYYY dates', () => {
    const d = parsePortalDate('15-07-2026');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(6);
    expect(d?.getDate()).toBe(15);
  });

  it('builds ±1 month books window', () => {
    const { fromDate, toDate } = booksDateWindow('2026-07', 1);
    expect(fromDate.getFullYear()).toBe(2026);
    expect(fromDate.getMonth()).toBe(5); // June
    expect(toDate.getMonth()).toBe(7); // August end
  });

  it('parses flat lines, b2b, and cdnr', () => {
    const flat = parseGstr2bPayload({
      periodMonth: '2026-07',
      lines: [{ invoiceNumber: 'P-1', taxableValue: 100, cgst: 9, sgst: 9 }],
    });
    expect(flat.lines).toHaveLength(1);

    const portal = parseGstr2bPayload({
      period: '2026-07',
      b2b: [
        {
          ctin: '27AAAAA0000A1Z5',
          inv: [{ inum: 'INV-9', idt: '01-07-2026', txval: 1000, camt: 90, samt: 90, iamt: 0, val: 1180 }],
        },
      ],
      cdnr: [
        {
          ctin: '27AAAAA0000A1Z5',
          nt: [{ ntnum: 'DN-1', idt: '05-07-2026', txval: 100, camt: 9, samt: 9, iamt: 0 }],
        },
      ],
    });
    expect(portal.periodMonth).toBe('2026-07');
    expect(portal.lines).toHaveLength(2);
    expect(portal.lines[0].docType).toBe('B2B');
    expect(portal.lines[1].docType).toBe('CDNR');
    expect(portal.lines[1].invoiceNumber).toBe('DN-1');
  });

  it('prefers GSTIN + invoice number match', () => {
    const used = new Set<string>();
    const result = matchPortalLine(
      {
        invoiceNumber: 'PUR-0001',
        supplierGstin: '27AAAAA0000A1Z5',
        invoiceDate: new Date(2026, 6, 10),
        taxableValue: 1000,
        cgst: 90,
        sgst: 90,
        igst: 0,
      },
      [
        {
          id: 'wrong',
          kind: 'purchase',
          documentNumber: 'PUR-0001',
          referenceNo: '',
          docDate: new Date(2026, 6, 10),
          taxable: 1000,
          cgst: 90,
          sgst: 90,
          igst: 0,
          cess: 0,
          supplierGstin: '29BBBBB0000B1Z5',
        },
        {
          id: 'p1',
          kind: 'purchase',
          documentNumber: 'PUR-0001',
          referenceNo: '',
          docDate: new Date(2026, 6, 10),
          taxable: 1000,
          cgst: 90,
          sgst: 90,
          igst: 0,
          cess: 0,
          supplierGstin: '27AAAAA0000A1Z5',
        },
      ],
      used,
    );
    expect(result.matchStatus).toBe('MATCHED');
    expect(result.matchedPurchaseId).toBe('p1');
  });

  it('matches CDNR to debit notes', () => {
    const result = matchPortalLine(
      {
        docType: 'CDNR',
        invoiceNumber: 'DN-9',
        taxableValue: 100,
        cgst: 9,
        sgst: 9,
        igst: 0,
      },
      [
        {
          id: 'dn1',
          kind: 'debit_note',
          documentNumber: 'DN-9',
          referenceNo: '',
          docDate: new Date(2026, 6, 1),
          taxable: 100,
          cgst: 9,
          sgst: 9,
          igst: 0,
          cess: 0,
        },
      ],
      new Set(),
    );
    expect(result.matchStatus).toBe('MATCHED');
    expect(result.matchedDebitNoteId).toBe('dn1');
    expect(result.matchedPurchaseId).toBeNull();
  });

  it('marks missing when no purchase number matches', () => {
    const result = matchPortalLine({ invoiceNumber: 'X-1', taxableValue: 10 }, [], new Set());
    expect(result.matchStatus).toBe('MISSING_IN_BOOKS');
  });
});
