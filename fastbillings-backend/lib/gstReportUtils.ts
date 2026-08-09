import type { Request } from 'express';

import { requireUserId, tenantOrUserScope } from './tenantScope';

export interface ItemTaxLine {
  taxRateId?: string;
  name?: string;
  kind?: string | null;
  percent?: number;
  amount?: number;
}

export type GstSupplyType = 'TAXABLE' | 'NIL_RATED' | 'EXEMPT' | 'NON_GST';

export interface DocItem {
  qty?: number;
  rate?: number;
  discount?: number;
  taxes?: ItemTaxLine[];
  totalTax?: number;
  tax?: number;
  hsn?: string;
  hsnSac?: string;
  sac?: string;
  description?: string;
  name?: string;
  gstSupplyType?: string | null;
}

export interface TaxBreakdown {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export function defaultMonthRange(req: Request): { fromDate: Date; toDate: Date } {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  toDate.setHours(23, 59, 59, 999);
  fromDate.setHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

/** India FY label → Apr 1 … Mar 31 (e.g. 2025-26 or 2025-2026). */
export function parseFinancialYearLabel(fy: string): { fromDate: Date; toDate: Date; fyLabel: string } | null {
  const m = fy.trim().match(/^(\d{4})\s*[-/]\s*(\d{2}|\d{4})$/);
  if (!m) return null;
  const startYear = Number(m[1]);
  const endRaw = m[2];
  const endYear = endRaw.length === 2 ? 2000 + Number(endRaw) : Number(endRaw);
  if (!(startYear > 1990 && endYear === startYear + 1)) return null;
  const fromDate = new Date(startYear, 3, 1, 0, 0, 0, 0); // 1 Apr
  const toDate = new Date(endYear, 2, 31, 23, 59, 59, 999); // 31 Mar
  const fyLabel = `${startYear}-${String(endYear).slice(-2)}`;
  return { fromDate, toDate, fyLabel };
}

/** Current India FY containing `asOf` (Apr–Mar). */
export function indiaFinancialYearContaining(asOf = new Date()): {
  fromDate: Date;
  toDate: Date;
  fyLabel: string;
} {
  const y = asOf.getFullYear();
  const startYear = asOf.getMonth() >= 3 ? y : y - 1;
  return parseFinancialYearLabel(`${startYear}-${String(startYear + 1).slice(-2)}`)!;
}

/**
 * GET …?fy=2025-26  OR  ?from=&to=
 * Prefer explicit fy; else from/to; else current India FY.
 */
export function defaultFinancialYearRange(req: Request): {
  fromDate: Date;
  toDate: Date;
  fyLabel: string;
} {
  const fy = req.query.fy as string | undefined;
  if (fy) {
    const parsed = parseFinancialYearLabel(fy);
    if (parsed) return parsed;
  }
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);
    const startYear = fromDate.getFullYear();
    const fyLabel =
      fromDate.getMonth() === 3 && fromDate.getDate() === 1
        ? `${startYear}-${String(startYear + 1).slice(-2)}`
        : `${fromDate.toISOString().slice(0, 10)}_${toDate.toISOString().slice(0, 10)}`;
    return { fromDate, toDate, fyLabel };
  }
  return indiaFinancialYearContaining();
}

/**
 * India FY quarter label → date range.
 * Accepts `2025-26-Q1` or `2025-Q1` (Q1=Apr–Jun … Q4=Jan–Mar).
 */
export function parseIndiaFyQuarter(raw: string): {
  fromDate: Date;
  toDate: Date;
  quarterLabel: string;
  fyLabel: string;
  quarter: 1 | 2 | 3 | 4;
} | null {
  const m = raw.trim().match(/^(\d{4})(?:-(\d{2}))?-Q([1-4])$/i);
  if (!m) return null;
  const startYear = Number(m[1]);
  const endRaw = m[2];
  if (endRaw) {
    const endYear = 2000 + Number(endRaw);
    if (endYear !== startYear + 1) return null;
  }
  const quarter = Number(m[3]) as 1 | 2 | 3 | 4;
  // Q1 Apr(3)–Jun(5), Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar (next calendar year)
  const startMonth = 3 + (quarter - 1) * 3; // 3,6,9,12
  const endMonth = startMonth + 2; // inclusive
  const fromDate = new Date(startYear, startMonth, 1, 0, 0, 0, 0);
  const toDate = new Date(startYear, endMonth + 1, 0, 23, 59, 59, 999);
  const fyLabel = `${startYear}-${String(startYear + 1).slice(-2)}`;
  const quarterLabel = `${fyLabel}-Q${quarter}`;
  return { fromDate, toDate, quarterLabel, fyLabel, quarter };
}

/** Current India FY quarter containing `asOf`. */
export function indiaFyQuarterContaining(asOf = new Date()): {
  fromDate: Date;
  toDate: Date;
  quarterLabel: string;
  fyLabel: string;
  quarter: 1 | 2 | 3 | 4;
} {
  const fy = indiaFinancialYearContaining(asOf);
  const startYear = Number(fy.fyLabel.slice(0, 4));
  const month = asOf.getMonth(); // 0–11
  let quarter: 1 | 2 | 3 | 4;
  if (month >= 3 && month <= 5) quarter = 1;
  else if (month >= 6 && month <= 8) quarter = 2;
  else if (month >= 9 && month <= 11) quarter = 3;
  else quarter = 4;
  return parseIndiaFyQuarter(`${startYear}-Q${quarter}`)!;
}

/**
 * GET …?quarter=2025-26-Q1  OR  ?from=&to=
 * Prefer quarter; else from/to; else current India FY quarter.
 */
export function defaultFyQuarterRange(req: Request): {
  fromDate: Date;
  toDate: Date;
  quarterLabel: string;
  fyLabel: string;
  quarter: 1 | 2 | 3 | 4;
} {
  const quarter = req.query.quarter as string | undefined;
  if (quarter) {
    const parsed = parseIndiaFyQuarter(quarter);
    if (parsed) return parsed;
  }
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  if (from && to) {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);
    const cur = indiaFyQuarterContaining(fromDate);
    return {
      fromDate,
      toDate,
      quarterLabel: cur.quarterLabel,
      fyLabel: cur.fyLabel,
      quarter: cur.quarter,
    };
  }
  return indiaFyQuarterContaining();
}

/** Prefer tenant invoices; fall back to owner userId for legacy rows. */
export function invoiceScope(req: Request): {
  userId?: string;
  tenantId?: string;
  OR?: Array<{ tenantId: string } | { userId: string }>;
  isDeleted: false;
} {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  if (tenantId) {
    return { OR: [{ tenantId }, { userId }], isDeleted: false };
  }
  return { userId, isDeleted: false };
}

/** Credit notes / purchases / expenses — dual tenant/user scope mid-migration. */
export function userDocScope(req: Request): ReturnType<typeof tenantOrUserScope> {
  return tenantOrUserScope(req);
}

export function extractTaxes(
  items: DocItem[] | null | undefined,
  taxableAmount: unknown,
  fallbackVat: unknown,
): TaxBreakdown {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;
  for (const item of items ?? []) {
    for (const t of item.taxes ?? []) {
      const amt = Number(t.amount ?? 0);
      const kind = String(t.kind ?? '').toUpperCase();
      if (kind === 'CGST') cgst += amt;
      else if (kind === 'SGST' || kind === 'UTGST') sgst += amt;
      else if (kind === 'IGST') igst += amt;
      else if (kind === 'CESS') cess += amt;
    }
  }
  if (cgst === 0 && sgst === 0 && igst === 0 && fallbackVat != null) {
    igst = Number(fallbackVat ?? 0);
  }
  return {
    taxable: Number(taxableAmount ?? 0),
    cgst,
    sgst,
    igst,
    cess,
  };
}

export function placeOfSupplyFromAddress(billingAddress: unknown): string {
  const addr = billingAddress as {
    state?: string;
    stateName?: string;
    stateId?: string;
  } | null;
  return addr?.stateName || addr?.state || addr?.stateId || 'Unknown';
}

export function itemHsn(item: DocItem): string {
  const code = (item.hsnSac || item.hsn || item.sac || '').toString().trim();
  return code || 'UNSPECIFIED';
}

/** B2CL threshold: interstate B2C invoices above ₹2.5 lakh are listed separately. */
export const B2CL_THRESHOLD = 250000;

export function normalizeGstSupplyType(raw: unknown): GstSupplyType {
  const v = String(raw ?? 'TAXABLE').toUpperCase().replace(/[\s-]+/g, '_');
  if (v === 'NIL_RATED' || v === 'NIL' || v === 'NILRATED') return 'NIL_RATED';
  if (v === 'EXEMPT' || v === 'EXEMPTED') return 'EXEMPT';
  if (v === 'NON_GST' || v === 'NONGST') return 'NON_GST';
  return 'TAXABLE';
}

export function isNonTaxableSupply(raw: unknown): boolean {
  return normalizeGstSupplyType(raw) !== 'TAXABLE';
}

export function lineTaxableBase(item: DocItem): number {
  const qty = Number(
    item.qty ?? (item as { quantity?: number }).quantity ?? 0,
  );
  const rate = Number(item.rate ?? 0);
  const discount = Number(item.discount ?? 0);
  return Math.max(0, qty * rate - discount);
}

/** Sum line bases for nil / exempt / non-GST (tax always 0). */
export function sumNilExemptFromItems(
  items: DocItem[] | null | undefined,
  sign: 1 | -1 = 1,
): { nilRated: number; exempt: number; nonGst: number } {
  let nilRated = 0;
  let exempt = 0;
  let nonGst = 0;
  for (const item of items ?? []) {
    const base = lineTaxableBase(item) * sign;
    if (!(base !== 0)) continue;
    const st = normalizeGstSupplyType(item.gstSupplyType);
    if (st === 'NIL_RATED') nilRated += base;
    else if (st === 'EXEMPT') exempt += base;
    else if (st === 'NON_GST') nonGst += base;
  }
  return { nilRated, exempt, nonGst };
}

/** Items that attract GST (default TAXABLE when unset). */
export function taxableSupplyItems(items: DocItem[] | null | undefined): DocItem[] {
  return (items ?? []).filter((i) => !isNonTaxableSupply(i.gstSupplyType));
}

/** CDNUR aggregate key — keep credit (C) and debit (D) notes separate per POS. */
export function cdnurAggKey(placeOfSupply: string, noteType: 'C' | 'D'): string {
  return `${placeOfSupply}|${noteType}`;
}

export interface Gstr1DocsSeriesInput {
  nature: string;
  docType: string;
  /** Non-cancelled count in period (tax tables use these). */
  activeCount: number;
  /** Cancelled count in period. */
  cancelledCount: number;
  /** Document numbers from active + cancelled (for series from/to). */
  numbers: Array<string | null | undefined>;
}

/** GSTR-1 Table 13–style docs row: total includes cancelled; net = total − cancelled. */
export function gstr1DocsSeries(input: Gstr1DocsSeriesInput): {
  nature: string;
  docType: string;
  from: string | null;
  to: string | null;
  totalNumber: number;
  cancelled: number;
  netIssued: number;
} {
  const sorted = input.numbers
    .map((n) => String(n ?? '').trim())
    .filter(Boolean)
    .sort();
  const cancelled = Math.max(0, Math.floor(input.cancelledCount));
  const active = Math.max(0, Math.floor(input.activeCount));
  const totalNumber = active + cancelled;
  return {
    nature: input.nature,
    docType: input.docType,
    from: sorted[0] || null,
    to: sorted[sorted.length - 1] || null,
    totalNumber,
    cancelled,
    netIssued: totalNumber - cancelled,
  };
}
