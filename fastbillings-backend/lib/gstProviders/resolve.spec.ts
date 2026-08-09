import { describe, expect, it } from 'vitest';
import { resolveEInvoiceProvider, resolveEWayProvider } from './resolve';
import { isGstProviderName } from './types';

describe('gstProviders registry', () => {
  it('recognizes provider names', () => {
    expect(isGstProviderName('mock')).toBe(true);
    expect(isGstProviderName('cleartax')).toBe(true);
    expect(isGstProviderName('masters_india')).toBe(true);
    expect(isGstProviderName('nic')).toBe(false);
  });

  it('resolves e-invoice adapters by name', () => {
    expect(resolveEInvoiceProvider('mock').name).toBe('mock');
    expect(resolveEInvoiceProvider('cleartax').name).toBe('cleartax');
    expect(resolveEInvoiceProvider('masters_india').name).toBe('masters_india');
  });

  it('resolves e-way adapters by name', () => {
    expect(resolveEWayProvider('mock').name).toBe('mock');
    expect(resolveEWayProvider('cleartax').name).toBe('cleartax');
    expect(resolveEWayProvider('masters_india').name).toBe('masters_india');
  });
});
