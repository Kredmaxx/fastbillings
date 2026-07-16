import type { InvoiceData, Item } from "@models/invoice";

export type TaxLineRow = {
  kind?: string | null;
  percent?: number;
  name?: string;
  amount?: number;
};

export type LineWithTax = Item & {
  taxes?: TaxLineRow[];
  hsn?: string | null;
  hsnSac?: string | null;
  sac?: string | null;
  taxableAmount?: number;
};

export function getItemHsn(item: LineWithTax): string {
  return (item.hsnSac || item.hsn || item.sac || "").toString().trim() || "—";
}

export function getItemTaxable(item: LineWithTax): number {
  if (typeof item.taxableAmount === "number") return item.taxableAmount;
  const line = Number(item.amount ?? item.lineTotal ?? 0);
  const taxes = Array.isArray(item.taxes) ? item.taxes : [];
  const taxSum = taxes.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  if (taxSum > 0) return Math.max(0, line - taxSum);
  const rate = Number(item.rate ?? 0);
  const qty = Number(item.qty ?? 0);
  const discount = Number(item.discount ?? 0);
  return Math.max(0, rate * qty - discount);
}

export function aggregateGstTaxes(items: LineWithTax[]): {
  byKind: Record<string, number>;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  other: number;
} {
  const byKind: Record<string, number> = {};
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;
  let other = 0;

  for (const line of items) {
    const taxes = Array.isArray(line.taxes) ? line.taxes : [];
    for (const t of taxes) {
      const amount = Number(t.amount ?? 0);
      const kind = (t.kind || "").toUpperCase();
      const label = kind
        ? `${kind}${t.percent != null ? ` ${t.percent}%` : ""}`
        : t.name || "Tax";
      byKind[label] = (byKind[label] ?? 0) + amount;
      if (kind === "CGST") cgst += amount;
      else if (kind === "SGST" || kind === "UTGST") sgst += amount;
      else if (kind === "IGST") igst += amount;
      else if (kind === "CESS") cess += amount;
      else other += amount;
    }
  }

  return { byKind, cgst, sgst, igst, cess, other };
}

export function placeOfSupply(invoice: InvoiceData): string {
  const addr = invoice?.billTo?.billingAddress;
  if (!addr) return "—";
  const state = addr.state?.trim();
  const country = addr.country?.trim();
  if (state && country) return `${state}, ${country}`;
  return state || country || "—";
}

export function buyerGstin(invoice: InvoiceData): string {
  const gst =
    (invoice.billTo as { gstin?: string | null } | undefined)?.gstin ||
    (invoice as { customer?: { gstin?: string | null } }).customer?.gstin;
  return gst?.trim() || "—";
}

export function sellerGstin(company: { gstin?: string | null } | null | undefined): string {
  return company?.gstin?.trim() || "—";
}

export function stateCodeFromGstin(gstin: string): string {
  if (!gstin || gstin === "—" || gstin.length < 2) return "—";
  return gstin.slice(0, 2);
}
