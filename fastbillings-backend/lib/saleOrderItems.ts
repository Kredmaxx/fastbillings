export type SaleOrderItemInput = {
  id?: string;
  name?: string;
  unit?: string;
  unitKind?: string;
  secondaryToPrimaryQty?: number | null;
  qtyPrimary?: number;
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  discount_type?: string;
  discount_value?: number;
  amount?: number;
  hsnSac?: string | null;
  gstSupplyType?: string;
};

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normaliseSaleOrderItems(raw: unknown): SaleOrderItemInput[] {
  if (!Array.isArray(raw)) return [];
  return (raw as SaleOrderItemInput[]).map((item) => ({
    id: item.id,
    name: item.name ?? '',
    unit: item.unit,
    unitKind: item.unitKind,
    secondaryToPrimaryQty: item.secondaryToPrimaryQty ?? null,
    qtyPrimary: item.qtyPrimary,
    qty: asNumber(item.qty, 0),
    rate: asNumber(item.rate, 0),
    discount: asNumber(item.discount, 0),
    tax: asNumber(item.tax, 0),
    tax_group_id: item.tax_group_id,
    discount_type: item.discount_type,
    discount_value: asNumber(item.discount_value, 0),
    amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
    hsnSac: item.hsnSac ?? null,
    gstSupplyType: item.gstSupplyType,
  }));
}

export function calcSaleOrderTotals(items: SaleOrderItemInput[]): {
  taxable: number;
  discount: number;
  vat: number;
  total: number;
} {
  const taxable = items.reduce(
    (sum, i) => sum + asNumber(i.rate, 0) * asNumber(i.qty, 0) - asNumber(i.discount, 0),
    0,
  );
  const discount = items.reduce((sum, i) => sum + asNumber(i.discount, 0), 0);
  const vat = items.reduce((sum, i) => sum + asNumber(i.tax, 0), 0);
  const total = Math.round((taxable + vat) * 100) / 100;
  return {
    taxable: Math.round(taxable * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    total,
  };
}
