export type PosTaxComponent = {
  taxRateId: string;
  name: string;
  kind: string;
  percent: number;
  amount: number;
};

export type PosInvoiceLine = {
  productId: string;
  id: string;
  name: string;
  qty: number;
  rate: number;
  discount: number;
  tax: number;
  tax_group_id: string | null;
  amount: number;
  taxes: PosTaxComponent[];
  totalTax: number;
  hsnSac: string | null;
  gstSupplyType: string;
  unit?: string;
  unitKind?: string;
  secondaryToPrimaryQty?: number | null;
};

type ProductTaxRate = {
  id: string;
  name: string;
  rate: number;
  isActive: boolean;
  taxKind?: string | null;
};

function kindFromTax(rate: ProductTaxRate): string {
  if (rate.taxKind) return String(rate.taxKind).toUpperCase();
  const n = rate.name.toUpperCase();
  if (n.includes('IGST')) return 'IGST';
  if (n.includes('CGST')) return 'CGST';
  if (n.includes('SGST') || n.includes('UTGST')) return 'SGST';
  if (n.includes('CESS')) return 'CESS';
  return 'IGST';
}

/** Build invoice line taxes for a POS qty × selling price. Intra-state walk-in uses CGST+SGST when present. */
export function buildPosInvoiceLine(input: {
  productId: string;
  name: string;
  qty: number;
  rate: number;
  unit?: string | null;
  hsnSac?: string | null;
  gstSupplyType?: string | null;
  taxGroupId?: string | null;
  taxRates?: ProductTaxRate[];
  unitKind?: string;
  secondaryToPrimaryQty?: number | null;
}): PosInvoiceLine {
  const qty = Math.max(0, Number(input.qty) || 0);
  const rate = Math.max(0, Number(input.rate) || 0);
  const base = Math.round(qty * rate * 100) / 100;
  const gstSupplyType = String(input.gstSupplyType ?? 'TAXABLE').toUpperCase();
  const nonTaxable = gstSupplyType !== 'TAXABLE';

  if (nonTaxable || !input.taxRates?.length) {
    return {
      productId: input.productId,
      id: input.productId,
      name: input.name,
      qty,
      rate,
      discount: 0,
      tax: 0,
      tax_group_id: input.taxGroupId ?? null,
      amount: base,
      taxes: [],
      totalTax: 0,
      hsnSac: input.hsnSac ?? null,
      gstSupplyType,
      unit: input.unit ?? undefined,
      unitKind: input.unitKind,
      secondaryToPrimaryQty: input.secondaryToPrimaryQty ?? null,
    };
  }

  const active = input.taxRates.filter((t) => t.isActive !== false);
  const taxes: PosTaxComponent[] = active.map((t) => {
    const percent = Number(t.rate);
    const amount = Math.round(((base * percent) / 100) * 100) / 100;
    return {
      taxRateId: t.id,
      name: t.name,
      kind: kindFromTax(t),
      percent,
      amount,
    };
  });
  const totalTax = Math.round(taxes.reduce((s, t) => s + t.amount, 0) * 100) / 100;

  return {
    productId: input.productId,
    id: input.productId,
    name: input.name,
    qty,
    rate,
    discount: 0,
    tax: totalTax,
    tax_group_id: input.taxGroupId ?? null,
    amount: Math.round((base + totalTax) * 100) / 100,
    taxes,
    totalTax,
    hsnSac: input.hsnSac ?? null,
    gstSupplyType,
    unit: input.unit ?? undefined,
    unitKind: input.unitKind,
    secondaryToPrimaryQty: input.secondaryToPrimaryQty ?? null,
  };
}
