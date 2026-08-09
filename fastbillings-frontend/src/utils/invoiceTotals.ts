/** Invoice total helpers — TCS is collected on top of TotalAmount. */

export function invoiceTcsAmount(inv: { tcsAmount?: number | string | null } | null | undefined): number {
  const n = Number(inv?.tcsAmount ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function invoiceAmountDue(
  inv: { TotalAmount?: number | string | null; tcsAmount?: number | string | null } | null | undefined,
): number {
  return Number(inv?.TotalAmount ?? 0) + invoiceTcsAmount(inv);
}
