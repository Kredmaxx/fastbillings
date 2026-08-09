import {
  extractTaxes,
  isNonTaxableSupply,
  itemHsn,
  lineTaxableBase,
  placeOfSupplyFromAddress,
  type DocItem,
} from './gstReportUtils';
import type { EInvoiceLineItem, EInvoicePayload } from './einvoiceProvider';

/** Indian GSTIN: 15 chars, checksum position 14 is always Z. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** HSN/SAC digits only, 4–8 length (common IRP acceptance). */
const HSN_RE = /^\d{4,8}$/;

export function normalizeGstin(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isValidGstin(raw: unknown): boolean {
  return GSTIN_RE.test(normalizeGstin(raw));
}

export function stateCodeFromGstin(gstin: string): string | null {
  const g = normalizeGstin(gstin);
  if (g.length < 2) return null;
  const code = g.slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

export class EInvoiceValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(errors.join('; '));
    this.name = 'EInvoiceValidationError';
    this.errors = errors;
  }
}

function lineTaxSplit(item: DocItem): { cgst: number; sgst: number; igst: number; cess: number } {
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;
  for (const t of item.taxes ?? []) {
    const amt = Number(t.amount ?? 0);
    const kind = String(t.kind ?? '').toUpperCase();
    if (kind === 'CGST') cgst += amt;
    else if (kind === 'SGST' || kind === 'UTGST') sgst += amt;
    else if (kind === 'IGST') igst += amt;
    else if (kind === 'CESS') cess += amt;
  }
  if (cgst === 0 && sgst === 0 && igst === 0) {
    // Untyped line tax → treat as IGST for IRP payload (interstate-safe default)
    igst = Number(item.totalTax ?? item.tax ?? 0);
  }
  return { cgst, sgst, igst, cess };
}

function lineGstRate(item: DocItem, taxable: number, taxTotal: number): number {
  const fromPercents = (item.taxes ?? []).reduce((s, t) => s + Number(t.percent ?? 0), 0);
  if (fromPercents > 0) return Math.round(fromPercents * 100) / 100;
  if (taxable > 0 && taxTotal > 0) return Math.round((taxTotal / taxable) * 10000) / 100;
  return 0;
}

function isServiceLine(item: DocItem): boolean {
  const flagged = (item as { isService?: boolean; type?: string }).isService;
  if (flagged === true) return true;
  const type = String((item as { type?: string }).type ?? '').toLowerCase();
  if (type === 'service' || type === 'services') return true;
  const sac = String((item as { sac?: string }).sac ?? '').trim();
  return sac.length > 0;
}

export interface BuildEInvoicePayloadInput {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  sellerGstin: string;
  sellerName?: string | null;
  buyerGstin: string | null | undefined;
  buyerName?: string | null;
  buyerBillingAddress?: unknown;
  companyState?: string | null;
  totalAmount: number;
  taxableAmount: number;
  vat: number;
  items: DocItem[] | null | undefined;
}

/**
 * Validate IRP prerequisites and build a schema-complete e-invoice payload.
 * Throws EInvoiceValidationError with actionable messages.
 */
export function buildEInvoicePayload(input: BuildEInvoicePayloadInput): EInvoicePayload {
  const errors: string[] = [];
  const sellerGstin = normalizeGstin(input.sellerGstin);
  const buyerGstin = normalizeGstin(input.buyerGstin);

  if (!sellerGstin) errors.push('Set company GSTIN in settings before generating e-invoice');
  else if (!isValidGstin(sellerGstin)) errors.push('Company GSTIN is invalid (expected 15-character GSTIN)');

  if (!buyerGstin) {
    errors.push('Buyer GSTIN is required for B2B e-invoice (IRN)');
  } else if (!isValidGstin(buyerGstin)) {
    errors.push('Buyer GSTIN is invalid (expected 15-character GSTIN)');
  }

  const items = input.items ?? [];
  if (items.length === 0) errors.push('Invoice has no line items');

  const lineItems: EInvoiceLineItem[] = [];
  let headerCgst = 0;
  let headerSgst = 0;
  let headerIgst = 0;
  let headerCess = 0;

  items.forEach((item, idx) => {
    const lineNo = idx + 1;
    const taxable = lineTaxableBase(item);
    const nonTaxable = isNonTaxableSupply(item.gstSupplyType);
    const hsnRaw = itemHsn(item);
    const hsn = hsnRaw === 'UNSPECIFIED' ? '' : hsnRaw.replace(/\s+/g, '');
    const split = lineTaxSplit(item);
    const taxTotal = split.cgst + split.sgst + split.igst + split.cess;

    if (!nonTaxable) {
      if (!hsn) {
        errors.push(`Line ${lineNo}: HSN/SAC is required for taxable supplies`);
      } else if (!HSN_RE.test(hsn)) {
        errors.push(`Line ${lineNo}: HSN/SAC "${hsn}" must be 4–8 digits`);
      }
    }

    headerCgst += split.cgst;
    headerSgst += split.sgst;
    headerIgst += split.igst;
    headerCess += split.cess;

    lineItems.push({
      name: String(item.name || item.description || `Item ${lineNo}`),
      qty: Number(item.qty ?? 0),
      rate: Number(item.rate ?? 0),
      amount: taxable + taxTotal,
      taxableAmount: taxable,
      tax: taxTotal,
      hsn: hsn || '0000',
      isService: isServiceLine(item),
      gstRate: nonTaxable ? 0 : lineGstRate(item, taxable, taxTotal),
      cgst: split.cgst,
      sgst: split.sgst,
      igst: split.igst,
      cess: split.cess,
      uqc: String((item as { uqc?: string; unit?: string }).uqc ?? (item as { unit?: string }).unit ?? 'OTH'),
    });
  });

  // If line taxes were untyped and all fell into IGST, but header extractTaxes has CGST/SGST, prefer header split.
  const headerFromItems = extractTaxes(items, input.taxableAmount, input.vat);
  if (headerCgst === 0 && headerSgst === 0 && (headerFromItems.cgst > 0 || headerFromItems.sgst > 0)) {
    headerCgst = headerFromItems.cgst;
    headerSgst = headerFromItems.sgst;
    headerIgst = headerFromItems.igst;
    headerCess = headerFromItems.cess;
  } else if (headerCgst === 0 && headerSgst === 0 && headerIgst === 0 && input.vat) {
    headerIgst = Number(input.vat);
  }

  const posFromGstin = buyerGstin ? stateCodeFromGstin(buyerGstin) : null;
  const posFromAddr = placeOfSupplyFromAddress(input.buyerBillingAddress);
  const placeOfSupply =
    posFromGstin ||
    stateCodeFromGstin(sellerGstin) ||
    (posFromAddr && posFromAddr !== 'Unknown' ? posFromAddr : '') ||
    String(input.companyState ?? '').trim() ||
    '00';

  if (errors.length > 0) throw new EInvoiceValidationError(errors);

  const r = (n: number) => Math.round(n * 100) / 100;

  return {
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    invoiceDate: input.invoiceDate,
    sellerGstin,
    buyerGstin,
    sellerName: input.sellerName ?? null,
    buyerName: input.buyerName ?? null,
    placeOfSupply,
    totalAmount: r(Number(input.totalAmount ?? 0)),
    taxableAmount: r(Number(input.taxableAmount ?? 0)),
    totalTax: r(headerCgst + headerSgst + headerIgst + headerCess),
    cgst: r(headerCgst),
    sgst: r(headerSgst),
    igst: r(headerIgst),
    cess: r(headerCess),
    items: lineItems.map((it) => ({
      ...it,
      amount: r(it.amount),
      taxableAmount: r(it.taxableAmount),
      tax: r(it.tax ?? 0),
      cgst: r(it.cgst),
      sgst: r(it.sgst),
      igst: r(it.igst),
      cess: r(it.cess),
    })),
  };
}
