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
}

/**
 * Pure: pick which TaxRate rows from the library should apply by default for this line.
 * Caller can override per line.
 */
export function suggestTaxesForLine(input: SuggestInput): TaxRate[] {
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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
