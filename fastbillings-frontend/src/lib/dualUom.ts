export type BillingUnit = 'PRIMARY' | 'SECONDARY';

export type DualUomApi = {
  billingUnit?: BillingUnit | string | null;
  conversion?: number | null;
  primary?: { id: string; name: string } | null;
  secondary?: { id: string; name: string } | null;
};

export function parseBillingUnit(v: unknown): BillingUnit {
  return String(v ?? '').toUpperCase() === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY';
}

export function billedQtyToPrimary(
  billedQty: number,
  billedUnit: BillingUnit | string | undefined,
  conversion: number | null | undefined,
): number {
  const qty = Number(billedQty) || 0;
  const conv = Number(conversion);
  if (parseBillingUnit(billedUnit) === 'SECONDARY' && Number.isFinite(conv) && conv > 0) {
    return qty * conv;
  }
  return qty;
}

export function convertRateBetweenUnits(
  rate: number,
  from: BillingUnit | string | undefined,
  to: BillingUnit | string | undefined,
  conversion: number | null | undefined,
): number {
  const price = Number(rate) || 0;
  const src = parseBillingUnit(from);
  const dest = parseBillingUnit(to);
  const conv = Number(conversion);
  if (src === dest || !Number.isFinite(conv) || conv <= 0) return price;
  if (src === 'PRIMARY' && dest === 'SECONDARY') return price * conv;
  return price / conv;
}

export function unitNameForKind(dual: DualUomApi | null | undefined, kind: BillingUnit): string {
  if (kind === 'SECONDARY' && dual?.secondary?.name) return dual.secondary.name;
  return dual?.primary?.name || '';
}
