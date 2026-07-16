// lib/ledger/postingGate.spec.ts
import { describe, it, expect } from 'vitest';
import { shouldPost, type LedgerSettings } from './postingGate';

const on: LedgerSettings = { ledgerInitialized: true, goLiveDate: new Date('2026-04-01') };

describe('shouldPost', () => {
  it('false when ledger not initialized', () => {
    expect(shouldPost({ ledgerInitialized: false, goLiveDate: new Date('2026-04-01') }, new Date('2026-06-01'))).toBe(false);
  });
  it('false when settings missing', () => {
    expect(shouldPost(null, new Date('2026-06-01'))).toBe(false);
  });
  it('false when goLiveDate missing', () => {
    expect(shouldPost({ ledgerInitialized: true, goLiveDate: null }, new Date('2026-06-01'))).toBe(false);
  });
  it('false when date is before goLiveDate', () => {
    expect(shouldPost(on, new Date('2026-03-31'))).toBe(false);
  });
  it('true when initialized and date on/after goLiveDate', () => {
    expect(shouldPost(on, new Date('2026-04-01'))).toBe(true);
    expect(shouldPost(on, new Date('2026-06-01'))).toBe(true);
  });
});
