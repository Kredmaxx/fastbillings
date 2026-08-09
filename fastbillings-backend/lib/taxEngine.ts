import type { TaxRate, TaxRegime, TaxKind } from '@prisma/client';

export interface TaxLine {
  taxRateId: string;
  name: string;
  kind: TaxKind | null;
  percent: number;
  amount: number;
}

export interface LineComputeInput {
  qty: number;
  rate: number;          // unit price
  discount?: number;     // absolute, applied before tax
  appliedTaxes: Array<Pick<TaxRate, 'id' | 'name' | 'taxKind'> & { rate: number | string }>;
}

export interface LineComputeOutput {
  taxableAmount: number;
  taxes: TaxLine[];
  totalTax: number;
  lineTotal: number;
}

/**
 * Pure: compute the per-line taxable amount and the breakdown of taxes.
 * All amounts rounded half-up to 2 decimal places.
 */
export function computeLineTaxes(input: LineComputeInput): LineComputeOutput {
  const taxable = round2(input.qty * input.rate - (input.discount ?? 0));
  const taxes: TaxLine[] = input.appliedTaxes.map((t) => {
    const percent = Number(t.rate);
    const amount = round2((taxable * percent) / 100);
    return {
      taxRateId: t.id,
      name: t.name,
      kind: t.taxKind ?? null,
      percent,
      amount,
    };
  });
  const totalTax = round2(taxes.reduce((sum, x) => sum + x.amount, 0));
  return { taxableAmount: taxable, taxes, totalTax, lineTotal: round2(taxable + totalTax) };
}

export interface SuggestInput {
  regime: TaxRegime;
  companyCountryId: string | null;
  companyStateId: string | null;
  customerCountryId: string | null;
  customerStateId: string | null;
  libraryRates: Array<TaxRate>;
  /** Composition dealer: no output GST on sales. */
  isComposition?: boolean;
  /** Reverse charge: do not auto-apply output GST on the document. */
  isReverseCharge?: boolean;
  /** Nil / exempt / non-GST lines: no output GST suggestion. */
  gstSupplyType?: string | null;
}

/**
 * Pure: pick which TaxRate rows from the library should apply by default for this line.
 * Caller can override per line.
 */
export function suggestTaxesForLine(input: SuggestInput): TaxRate[] {
  const supply = String(input.gstSupplyType ?? 'TAXABLE').toUpperCase().replace(/[\s-]+/g, '_');
  const nonTaxable =
    supply === 'NIL_RATED' ||
    supply === 'NIL' ||
    supply === 'EXEMPT' ||
    supply === 'NON_GST' ||
    supply === 'NONGST';
  if (input.isComposition || input.isReverseCharge || nonTaxable) {
    return [];
  }

  const lib = input.libraryRates.filter((r) => r.isActive && !r.isDeleted && r.regime === input.regime);

  if (input.regime === 'NONE') return [];

  if (input.regime === 'GST_INDIA') {
    const sameCountry =
      input.companyCountryId !== null &&
      input.customerCountryId !== null &&
      input.companyCountryId === input.customerCountryId;
    const sameState =
      sameCountry &&
      input.companyStateId !== null &&
      input.customerStateId !== null &&
      input.companyStateId === input.customerStateId;
    if (sameState) {
      // Intra-state: CGST + SGST (or UTGST if a union territory)
      const cgst = lib.find((r) => r.taxKind === 'CGST');
      const sgst = lib.find((r) => r.taxKind === 'SGST');
      const utgst = lib.find((r) => r.taxKind === 'UTGST');
      // Prefer SGST when present; fall back to UTGST for union territories
      if (cgst && sgst) return [cgst, sgst];
      if (cgst && utgst) return [cgst, utgst];
      return [];
    }
    // Inter-state: IGST
    const igst = lib.find((r) => r.taxKind === 'IGST');
    return igst ? [igst] : [];
  }

  if (input.regime === 'VAT_GENERIC') {
    // Default to the first VAT-kind rate
    const vat = lib.find((r) => r.taxKind === 'VAT' || r.taxKind === null);
    return vat ? [vat] : [];
  }

  if (input.regime === 'US_SALES_TAX') {
    // Match customer state
    if (input.customerStateId) {
      const matched = lib.filter((r) => r.taxKind === 'SALES_TAX' && r.stateId === input.customerStateId);
      return matched;
    }
    return [];
  }

  return [];
}

/**
 * Pick default India GST rates for RCM liability when the document has no line taxes.
 * Prefer matching CGST+SGST (same %), else IGST.
 */
export function pickDefaultIndiaGstRates(
  libraryRates: Array<TaxRate>,
): TaxRate[] {
  const lib = libraryRates.filter((r) => r.isActive && !r.isDeleted && r.regime === 'GST_INDIA');
  const cgsts = lib.filter((r) => r.taxKind === 'CGST');
  const sgsts = lib.filter((r) => r.taxKind === 'SGST' || r.taxKind === 'UTGST');
  for (const c of cgsts) {
    const pair = sgsts.find((s) => Number(s.rate) === Number(c.rate));
    if (pair) return [c, pair];
  }
  const igst =
    lib.find((r) => r.taxKind === 'IGST' && Number(r.rate) === 18) ||
    lib.find((r) => r.taxKind === 'IGST');
  return igst ? [igst] : [];
}

/** Apply rate percents to a taxable base → CGST/SGST/IGST split + total. */
export function computeTaxSplitFromRates(
  taxableBase: number,
  rates: Array<{ taxKind: string | null; rate: number | string }>,
): { total: number; split: { CGST?: string; SGST?: string; IGST?: string } } | null {
  if (!(taxableBase > 0) || rates.length === 0) return null;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  for (const r of rates) {
    const amt = round2((taxableBase * Number(r.rate)) / 100);
    if (!(amt > 0)) continue;
    const kind = String(r.taxKind ?? '').toUpperCase();
    if (kind === 'CGST') cgst += amt;
    else if (kind === 'SGST' || kind === 'UTGST') sgst += amt;
    else if (kind === 'IGST') igst += amt;
  }
  const total = round2(cgst + sgst + igst);
  if (!(total > 0)) return null;
  return {
    total,
    split: {
      ...(cgst > 0 ? { CGST: cgst.toFixed(4) } : {}),
      ...(sgst > 0 ? { SGST: sgst.toFixed(4) } : {}),
      ...(igst > 0 ? { IGST: igst.toFixed(4) } : {}),
    },
  };
}

/** Pure: TDS amount from taxable base and rate percent. */
export function computeTdsAmount(taxableBase: number, ratePercent: number): number {
  if (taxableBase <= 0 || ratePercent <= 0) return 0;
  return round2((taxableBase * ratePercent) / 100);
}

/** Pure: TCS amount — same math as TDS; base may be tax-inclusive. */
export function computeTcsAmount(taxableBase: number, ratePercent: number): number {
  return computeTdsAmount(taxableBase, ratePercent);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
