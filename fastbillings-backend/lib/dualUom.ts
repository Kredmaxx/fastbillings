import { prisma } from './prisma';

export type BillingUnit = 'PRIMARY' | 'SECONDARY';

export type DualUomSnapshot = {
  billingUnit?: string | null;
  secondaryToPrimaryQty?: unknown;
  unit?: { short_name?: string | null; unit_name?: string | null } | null;
  secondaryUnit?: { short_name?: string | null; unit_name?: string | null } | null;
};

export type DualUomLine = {
  qty?: unknown;
  qtyPrimary?: unknown;
  unitKind?: unknown;
  unit?: unknown;
  secondaryToPrimaryQty?: unknown;
};

export type DualUomApi = {
  billingUnit: BillingUnit;
  conversion: number | null;
  primary: { id: string; name: string } | null;
  secondary: { id: string; name: string } | null;
};

export function parseBillingUnit(v: unknown): BillingUnit {
  return String(v ?? '').toUpperCase() === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY';
}

export function normalizeConversion(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function unitShortName(unit: {
  short_name?: string | null;
  unit_name?: string | null;
  name?: string | null;
} | null | undefined): string {
  if (!unit) return '';
  return String(unit.short_name || unit.name || unit.unit_name || '').trim();
}

/** Stock qty in the product's primary UOM. */
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

/** Convert a rate from one billed unit to another using 1 secondary = N primary. */
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

/** selling_price is stored for product.billingUnit; return the rate for the line's unit. */
export function rateForBilledUnit(opts: {
  storedSellingPrice: number;
  productBillingUnit: BillingUnit | string | undefined;
  lineBillingUnit: BillingUnit | string | undefined;
  conversion: number | null | undefined;
}): number {
  return convertRateBetweenUnits(
    opts.storedSellingPrice,
    opts.productBillingUnit,
    opts.lineBillingUnit,
    opts.conversion,
  );
}

/** Prefer a stamped qtyPrimary so later conversion edits do not rewrite historical stock. */
export function lineStockQty(item: DualUomLine): number {
  const stamped = Number(item.qtyPrimary);
  if (Number.isFinite(stamped) && stamped > 0) return stamped;
  return billedQtyToPrimary(
    Number(item.qty) || 0,
    parseBillingUnit(item.unitKind),
    normalizeConversion(item.secondaryToPrimaryQty),
  );
}

export function lineStockQtyInt(item: DualUomLine): number {
  return Math.round(lineStockQty(item));
}

export function stampDualUomOnLine<T extends DualUomLine & { productId?: string; id?: string }>(
  item: T,
  product: DualUomSnapshot | null | undefined,
): T {
  const conversion = normalizeConversion(product?.secondaryToPrimaryQty);
  const hasSecondary = Boolean(conversion && (product?.secondaryUnit || conversion > 0));
  const requested = parseBillingUnit(item.unitKind ?? product?.billingUnit);
  const unitKind: BillingUnit = hasSecondary ? requested : 'PRIMARY';
  const qty = Number(item.qty) || 0;
  const qtyPrimary = billedQtyToPrimary(qty, unitKind, conversion);
  const unitName =
    unitKind === 'SECONDARY'
      ? unitShortName(product?.secondaryUnit)
      : unitShortName(product?.unit);
  return {
    ...item,
    unitKind,
    secondaryToPrimaryQty: conversion,
    qtyPrimary,
    unit: item.unit || unitName || item.unit,
  };
}

export function dualUomApiFromProduct(product: {
  unitId?: string;
  billingUnit?: string | null;
  secondaryToPrimaryQty?: unknown;
  unit?: { id?: string; short_name?: string | null; unit_name?: string | null } | null;
  secondaryUnitId?: string | null;
  secondaryUnit?: { id?: string; short_name?: string | null; unit_name?: string | null } | null;
}): DualUomApi {
  const conversion = normalizeConversion(product.secondaryToPrimaryQty);
  return {
    billingUnit: parseBillingUnit(product.billingUnit),
    conversion,
    primary: product.unit
      ? {
          id: String(product.unit.id ?? product.unitId ?? ''),
          name: unitShortName(product.unit),
        }
      : null,
    secondary:
      conversion && product.secondaryUnit
        ? {
            id: String(product.secondaryUnit.id ?? product.secondaryUnitId ?? ''),
            name: unitShortName(product.secondaryUnit),
          }
        : null,
  };
}

export function parseProductDualUom(input: {
  secondaryUnitId?: unknown;
  secondaryToPrimaryQty?: unknown;
  billingUnit?: unknown;
  primaryUnitId: string;
  isService: boolean;
}): { ok: true; secondaryUnitId: string | null; secondaryToPrimaryQty: number | null; billingUnit: BillingUnit } | { ok: false; message: string } {
  if (input.isService) {
    return { ok: true, secondaryUnitId: null, secondaryToPrimaryQty: null, billingUnit: 'PRIMARY' };
  }
  const secondaryUnitId =
    typeof input.secondaryUnitId === 'string' && input.secondaryUnitId.trim()
      ? input.secondaryUnitId.trim()
      : null;
  const conversion = normalizeConversion(input.secondaryToPrimaryQty);
  const billingUnit = parseBillingUnit(input.billingUnit);

  if (!secondaryUnitId) {
    if (billingUnit === 'SECONDARY') {
      return { ok: false, message: 'Set a secondary unit before billing in that unit.' };
    }
    return { ok: true, secondaryUnitId: null, secondaryToPrimaryQty: null, billingUnit: 'PRIMARY' };
  }
  if (secondaryUnitId === input.primaryUnitId) {
    return { ok: false, message: 'Secondary unit must be different from the stock unit.' };
  }
  if (!conversion) {
    return { ok: false, message: 'Enter how many stock units equal 1 secondary unit (must be > 0).' };
  }
  return { ok: true, secondaryUnitId, secondaryToPrimaryQty: conversion, billingUnit };
}

export async function attachDualUomToItems<T extends DualUomLine & { productId?: string; id?: string }>(
  tenantId: string | null | undefined,
  items: T[],
): Promise<T[]> {
  if (!tenantId || !items.length) return items.map((item) => stampDualUomOnLine(item, null));
  const ids = [
    ...new Set(
      items
        .map((item) => String(item.productId ?? item.id ?? '').trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return items.map((item) => stampDualUomOnLine(item, null));

  const products = await prisma.product.findMany({
    where: { tenantId, id: { in: ids } },
    select: {
      id: true,
      billingUnit: true,
      secondaryToPrimaryQty: true,
      unit: { select: { short_name: true, unit_name: true } },
      secondaryUnit: { select: { short_name: true, unit_name: true } },
    },
  });
  const map = new Map(products.map((p) => [p.id, p]));
  return items.map((item) => {
    const id = String(item.productId ?? item.id ?? '');
    return stampDualUomOnLine(item, map.get(id) ?? null);
  });
}
