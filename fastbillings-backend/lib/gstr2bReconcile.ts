import type { Gstr2bMatchStatus } from '@prisma/client';

export type Gstr2bDocType = 'B2B' | 'CDNR' | 'CDNUR' | 'OTHER';

export interface Portal2bLine {
  docType?: Gstr2bDocType;
  supplierGstin?: string | null;
  supplierName?: string | null;
  invoiceNumber: string;
  invoiceDate?: Date | null;
  taxableValue: number;
  igst?: number;
  cgst?: number;
  sgst?: number;
  cess?: number;
  invoiceValue?: number | null;
}

export interface BooksDocRow {
  id: string;
  kind: 'purchase' | 'debit_note';
  documentNumber?: string | null;
  referenceNo?: string | null;
  docDate: Date;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  supplierGstin?: string | null;
}

export interface MatchResult {
  matchStatus: Gstr2bMatchStatus;
  matchedPurchaseId: string | null;
  matchedDebitNoteId: string | null;
  matchNotes: string | null;
}

export function normInv(v: string | null | undefined): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-_./]/g, '');
}

export function normGstin(v: string | null | undefined): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function dayDiff(a: Date | null | undefined, b: Date): number | null {
  if (!a) return null;
  return Math.round(Math.abs(startOfDay(a) - startOfDay(b)) / 86400000);
}

function taxClose(a: number, b: number, tol = 1): boolean {
  return Math.abs(Number(a) - Number(b)) <= tol;
}

/** Calendar month ± padMonths for books lookup window. */
export function booksDateWindow(
  periodMonth: string,
  padMonths = 1,
): { fromDate: Date; toDate: Date } {
  const [y, m] = periodMonth.split('-').map(Number);
  const fromDate = new Date(y, m - 1 - padMonths, 1);
  const toDate = new Date(y, m - 1 + padMonths + 1, 0, 23, 59, 59, 999);
  return { fromDate, toDate };
}

/**
 * Match a GSTR-2B portal line to books purchases / debit notes.
 * Prefers GSTIN + invoice number; falls back to invoice number alone.
 */
export function matchPortalLine(
  line: Portal2bLine,
  docs: BooksDocRow[],
  usedDocIds: Set<string>,
): MatchResult {
  const key = normInv(line.invoiceNumber);
  const lineGstin = normGstin(line.supplierGstin);
  const docType = line.docType ?? 'B2B';
  const wantKind: BooksDocRow['kind'] =
    docType === 'CDNR' || docType === 'CDNUR' ? 'debit_note' : 'purchase';

  const empty = {
    matchedPurchaseId: null as string | null,
    matchedDebitNoteId: null as string | null,
  };

  if (!key) {
    return {
      matchStatus: 'MISSING_IN_BOOKS',
      ...empty,
      matchNotes: 'Empty invoice number',
    };
  }

  const pool = docs.filter((d) => d.kind === wantKind && !usedDocIds.has(`${d.kind}:${d.id}`));

  const byNumber = pool.filter((p) => {
    const a = normInv(p.documentNumber);
    const b = normInv(p.referenceNo);
    return a === key || b === key;
  });

  let candidates = byNumber;
  if (lineGstin) {
    const gstinHits = byNumber.filter((p) => normGstin(p.supplierGstin) === lineGstin);
    if (gstinHits.length > 0) candidates = gstinHits;
  }

  if (candidates.length === 0) {
    return {
      matchStatus: 'MISSING_IN_BOOKS',
      ...empty,
      matchNotes:
        wantKind === 'debit_note'
          ? 'No debit note with matching number/reference'
          : 'No purchase with matching invoice/reference number',
    };
  }

  let best: BooksDocRow | null = null;
  let bestScore = -1;
  for (const p of candidates) {
    let score = 10;
    if (lineGstin && normGstin(p.supplierGstin) === lineGstin) score += 8;
    else if (lineGstin && p.supplierGstin) score -= 2;
    const dd = dayDiff(line.invoiceDate, p.docDate);
    if (dd != null) {
      if (dd === 0) score += 5;
      else if (dd <= 3) score += 2;
      else if (dd > 15) score -= 3;
    }
    if (taxClose(line.taxableValue, p.taxable)) score += 5;
    else if (taxClose(line.taxableValue, p.taxable, 50)) score += 1;
    const lineTax = Number(line.igst ?? 0) + Number(line.cgst ?? 0) + Number(line.sgst ?? 0);
    const bookTax = p.igst + p.cgst + p.sgst;
    if (taxClose(lineTax, bookTax)) score += 3;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best) {
    return { matchStatus: 'MISSING_IN_BOOKS', ...empty, matchNotes: 'No candidate' };
  }

  const taxableOk = taxClose(line.taxableValue, best.taxable);
  const lineTax = Number(line.igst ?? 0) + Number(line.cgst ?? 0) + Number(line.sgst ?? 0);
  const bookTax = best.igst + best.cgst + best.sgst;
  const taxOk = taxClose(lineTax, bookTax);
  usedDocIds.add(`${best.kind}:${best.id}`);

  const ids =
    best.kind === 'debit_note'
      ? { matchedPurchaseId: null, matchedDebitNoteId: best.id }
      : { matchedPurchaseId: best.id, matchedDebitNoteId: null };

  const gstinNote =
    lineGstin && normGstin(best.supplierGstin) === lineGstin ? 'GSTIN+number' : 'number';

  if (taxableOk && taxOk) {
    return {
      matchStatus: 'MATCHED',
      ...ids,
      matchNotes: `Auto (${gstinNote})`,
    };
  }
  return {
    matchStatus: 'PARTIAL',
    ...ids,
    matchNotes: `Taxable portal=${line.taxableValue} books=${best.taxable}; tax portal=${lineTax} books=${bookTax} (${gstinNote})`,
  };
}

function pushInvLines(
  lines: Portal2bLine[],
  party: Record<string, unknown>,
  invs: Array<Record<string, unknown>>,
  docType: Gstr2bDocType,
  numberKey: string,
): void {
  const ctin = String(party.ctin ?? '').trim() || null;
  for (const inv of invs) {
    const invoiceNumber = String(inv[numberKey] ?? inv.inum ?? '').trim();
    if (!invoiceNumber) continue;
    lines.push({
      docType,
      supplierGstin: ctin,
      supplierName: (party.trdnm as string) ?? null,
      invoiceNumber,
      invoiceDate: inv.idt ? parsePortalDate(String(inv.idt)) : null,
      taxableValue: Number(inv.txval ?? 0),
      igst: Number(inv.iamt ?? 0),
      cgst: Number(inv.camt ?? 0),
      sgst: Number(inv.samt ?? 0),
      cess: Number(inv.csamt ?? 0),
      invoiceValue: inv.val != null ? Number(inv.val) : null,
    });
  }
}

/** Parse portal-style GSTR-2B JSON or flat { lines: [...] }. */
export function parseGstr2bPayload(body: unknown): { periodMonth: string | null; lines: Portal2bLine[] } {
  const root = (body ?? {}) as Record<string, unknown>;
  let periodMonth =
    typeof root.periodMonth === 'string'
      ? root.periodMonth
      : typeof root.period === 'string'
        ? root.period
        : null;

  // Portal often nests under data / data.docdata
  const data = (root.data && typeof root.data === 'object' ? root.data : root) as Record<
    string,
    unknown
  >;
  const docdata =
    data.docdata && typeof data.docdata === 'object'
      ? (data.docdata as Record<string, unknown>)
      : data;

  const lines: Portal2bLine[] = [];

  if (Array.isArray(root.lines) || Array.isArray(data.lines)) {
    const arr = (Array.isArray(root.lines) ? root.lines : data.lines) as Array<Record<string, unknown>>;
    for (const r of arr) {
      const invoiceNumber = String(r.invoiceNumber ?? r.inum ?? r.ntnum ?? '').trim();
      if (!invoiceNumber) continue;
      const idt = r.invoiceDate ?? r.idt;
      const rawType = String(r.docType ?? r.typ ?? 'B2B').toUpperCase();
      const docType: Gstr2bDocType =
        rawType === 'CDNR' || rawType === 'C'
          ? 'CDNR'
          : rawType === 'CDNUR'
            ? 'CDNUR'
            : 'B2B';
      lines.push({
        docType,
        supplierGstin: (r.supplierGstin ?? r.ctin ?? null) as string | null,
        supplierName: (r.supplierName ?? r.trdnm ?? null) as string | null,
        invoiceNumber,
        invoiceDate: idt ? parsePortalDate(String(idt)) : null,
        taxableValue: Number(r.taxableValue ?? r.txval ?? 0),
        igst: Number(r.igst ?? r.iamt ?? 0),
        cgst: Number(r.cgst ?? r.camt ?? 0),
        sgst: Number(r.sgst ?? r.samt ?? 0),
        cess: Number(r.cess ?? r.csamt ?? 0),
        invoiceValue: r.invoiceValue != null || r.val != null ? Number(r.invoiceValue ?? r.val) : null,
      });
    }
  }

  if (Array.isArray(docdata.b2b)) {
    for (const party of docdata.b2b as Array<Record<string, unknown>>) {
      const invs = Array.isArray(party.inv) ? (party.inv as Array<Record<string, unknown>>) : [];
      pushInvLines(lines, party, invs, 'B2B', 'inum');
    }
  }

  if (Array.isArray(docdata.cdnr)) {
    for (const party of docdata.cdnr as Array<Record<string, unknown>>) {
      const nts = Array.isArray(party.nt) ? (party.nt as Array<Record<string, unknown>>) : [];
      pushInvLines(lines, party, nts, 'CDNR', 'ntnum');
    }
  }

  if (Array.isArray(docdata.cdnur)) {
    for (const row of docdata.cdnur as Array<Record<string, unknown>>) {
      const invoiceNumber = String(row.ntnum ?? row.inum ?? '').trim();
      if (!invoiceNumber) continue;
      lines.push({
        docType: 'CDNUR',
        supplierGstin: null,
        supplierName: null,
        invoiceNumber,
        invoiceDate: row.idt ? parsePortalDate(String(row.idt)) : null,
        taxableValue: Number(row.txval ?? 0),
        igst: Number(row.iamt ?? 0),
        cgst: Number(row.camt ?? 0),
        sgst: Number(row.samt ?? 0),
        cess: Number(row.csamt ?? 0),
        invoiceValue: row.val != null ? Number(row.val) : null,
      });
    }
  }

  if (!periodMonth && lines[0]?.invoiceDate) {
    const d = lines[0].invoiceDate;
    periodMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  return { periodMonth, lines };
}

export function parsePortalDate(raw: string): Date | null {
  const s = raw.trim();
  const m1 = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m1) return new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Recount MATCHED / PARTIAL / MISSING from line statuses. */
export function recountStatuses(
  statuses: Gstr2bMatchStatus[],
): { matchedCount: number; partialCount: number; missingCount: number } {
  let matchedCount = 0;
  let partialCount = 0;
  let missingCount = 0;
  for (const s of statuses) {
    if (s === 'MATCHED') matchedCount += 1;
    else if (s === 'PARTIAL') partialCount += 1;
    else missingCount += 1;
  }
  return { matchedCount, partialCount, missingCount };
}
