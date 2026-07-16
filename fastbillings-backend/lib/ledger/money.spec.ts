// lib/ledger/money.spec.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { toDecimal, sumDecimals, decEq, ZERO } from './money';

describe('money helpers', () => {
  it('toDecimal accepts number, string, Decimal', () => {
    expect(toDecimal(1.1).equals(new Prisma.Decimal('1.1'))).toBe(true);
    expect(toDecimal('2.25').equals(new Prisma.Decimal('2.25'))).toBe(true);
    expect(toDecimal(new Prisma.Decimal('3')).equals(new Prisma.Decimal('3'))).toBe(true);
  });

  it('sumDecimals adds without float drift', () => {
    // 0.1 + 0.2 === 0.3 exactly with Decimal (would be 0.30000000000000004 as float)
    expect(sumDecimals([toDecimal('0.1'), toDecimal('0.2')]).equals(toDecimal('0.3'))).toBe(true);
    expect(sumDecimals([]).equals(ZERO)).toBe(true);
  });

  it('decEq compares by value', () => {
    expect(decEq(toDecimal('1.50'), toDecimal('1.5'))).toBe(true);
    expect(decEq(toDecimal('1'), toDecimal('2'))).toBe(false);
  });
});
