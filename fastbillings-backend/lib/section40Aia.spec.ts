import { describe, it, expect } from 'vitest';
import {
  SECTION_40A_IA_DISALLOW_RATE,
  SECTION_40A_I_DISALLOW_RATE,
  classify40AiPurchase,
  classify40AiaPurchase,
  putative40AiDisallowance,
  putative40AiaDisallowance,
} from './section40Aia';

describe('section40Aia / section40Ai', () => {
  it('disallows 30% for §40(a)(ia) and 100% for §40(a)(i)', () => {
    expect(SECTION_40A_IA_DISALLOW_RATE).toBe(0.3);
    expect(SECTION_40A_I_DISALLOW_RATE).toBe(1);
    expect(putative40AiaDisallowance(100000)).toBe(30000);
    expect(putative40AiDisallowance(100000)).toBe(100000);
  });

  it('§40(a)(ia) skips non-residents; §40(a)(i) skips residents', () => {
    const base = { tdsSection: '194J', tdsAmount: 0, challanAllocated: 0 };
    expect(classify40AiaPurchase({ ...base, isNonResident: true })).toBeNull();
    expect(classify40AiaPurchase({ ...base, isNonResident: false })).toBe('NON_DEDUCTION');
    expect(classify40AiPurchase({ ...base, isNonResident: false })).toBeNull();
    expect(classify40AiPurchase({ ...base, isNonResident: true })).toBe('NON_DEDUCTION');
  });

  it('flags NON_DEPOSIT when challan allocation short', () => {
    expect(
      classify40AiaPurchase({
        tdsSection: '194C',
        tdsAmount: 500,
        challanAllocated: 100,
        isNonResident: false,
      }),
    ).toBe('NON_DEPOSIT');
    expect(
      classify40AiPurchase({
        tdsSection: '195',
        tdsAmount: 500,
        challanAllocated: 0,
        isNonResident: true,
      }),
    ).toBe('NON_DEPOSIT');
  });
});
