import { prisma } from './prisma';

export function overlayPartySelling(
  listPrice: number,
  partyPrice: number | null | undefined,
): { selling: number; partyRateApplied: boolean; listPrice: number } {
  const list = Number(listPrice) || 0;
  if (partyPrice == null || partyPrice === undefined) {
    return { selling: list, partyRateApplied: false, listPrice: list };
  }
  const party = Number(partyPrice);
  if (!Number.isFinite(party) || party < 0) {
    return { selling: list, partyRateApplied: false, listPrice: list };
  }
  return { selling: party, partyRateApplied: true, listPrice: list };
}

export function partyRateMapFromRows(
  rows: Array<{ productId: string; sellingPrice: unknown }>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const n = Number(row.sellingPrice);
    if (Number.isFinite(n) && n >= 0) map.set(row.productId, n);
  }
  return map;
}

export async function fetchPartyRateMap(opts: {
  tenantId: string;
  customerId: string;
  productIds?: string[];
}): Promise<Map<string, number>> {
  const rows = await prisma.customerProductRate.findMany({
    where: {
      tenantId: opts.tenantId,
      customerId: opts.customerId,
      ...(opts.productIds?.length ? { productId: { in: opts.productIds } } : {}),
    },
    select: { productId: true, sellingPrice: true },
  });
  return partyRateMapFromRows(rows);
}
