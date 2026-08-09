import { describe, it, expect } from 'vitest';
import {
  excessOverFmvAmount,
  isRelatedPartyFlag,
  parseFairMarketValueInput,
  relatedPartyPaymentAmount,
  roundRelatedPartyAmount,
} from './section40A2';

describe('section40A2', () => {
  it('parses related-party flags', () => {
    expect(isRelatedPartyFlag(true)).toBe(true);
    expect(isRelatedPartyFlag('true')).toBe(true);
    expect(isRelatedPartyFlag(false)).toBe(false);
    expect(isRelatedPartyFlag(null)).toBe(false);
  });

  it('picks payment amount for disclosure', () => {
    expect(
      relatedPartyPaymentAmount({
        paidAmount: 118000,
        totalAmount: 118000,
        taxableAmount: 100000,
      }),
    ).toBe(118000);
    expect(
      relatedPartyPaymentAmount({
        totalAmount: 59000,
        taxableAmount: 50000,
      }),
    ).toBe(59000);
    expect(relatedPartyPaymentAmount({ amount: 12500.456 })).toBe(12500.46);
    expect(roundRelatedPartyAmount(10.005)).toBe(10.01);
  });

  it('computes tagged FMV excess only when FMV set below payment', () => {
    expect(excessOverFmvAmount({ paymentAmount: 59000, fairMarketValue: 54000 })).toBe(5000);
    expect(excessOverFmvAmount({ paymentAmount: 59000, fairMarketValue: null })).toBe(0);
    expect(excessOverFmvAmount({ paymentAmount: 59000, fairMarketValue: 60000 })).toBe(0);
    expect(parseFairMarketValueInput('')).toEqual({ ok: true, value: null });
    expect(parseFairMarketValueInput('54000').value).toBe(54000);
    expect(parseFairMarketValueInput(-1).ok).toBe(false);
  });
});
