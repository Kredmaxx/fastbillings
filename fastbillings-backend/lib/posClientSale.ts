/** Stable invoice.referenceNo for POS idempotency. Replay looks up this exact string. */
export function posInvoiceReference(clientSaleId?: string | null): string {
  const id = String(clientSaleId ?? '').trim().slice(0, 64);
  return id ? `POS:${id}` : 'POS';
}
