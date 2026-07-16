// lib/ledger/postingGate.ts
export interface LedgerSettings {
  ledgerInitialized: boolean;
  goLiveDate: Date | null;
}

/** Posts only when the tenant ledger is initialized and the document is dated
 *  on/after the cutover (go-live) date. Everything else is a no-op so existing
 *  installs are unaffected until they opt into the ledger (B.5/B.6). */
export function shouldPost(settings: LedgerSettings | null | undefined, date: Date): boolean {
  if (!settings || !settings.ledgerInitialized || !settings.goLiveDate) return false;
  return date.getTime() >= settings.goLiveDate.getTime();
}
