import { describe, expect, it } from 'vitest';
import { posInvoiceReference } from './posClientSale';

describe('posInvoiceReference', () => {
  it('prefixes POS for a client sale id', () => {
    expect(posInvoiceReference('abc-123')).toBe('POS:abc-123');
  });

  it('uses a shared POS marker when id is missing', () => {
    expect(posInvoiceReference('')).toBe('POS');
    expect(posInvoiceReference(null)).toBe('POS');
  });

  it('truncates client id to 64 characters so replay keys stay unique', () => {
    const long = 'x'.repeat(80);
    expect(posInvoiceReference(long)).toBe(`POS:${'x'.repeat(64)}`);
  });
});
