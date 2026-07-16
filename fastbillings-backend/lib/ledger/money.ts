// lib/ledger/money.ts
import { Prisma } from '@prisma/client';

export type DecimalInput = Prisma.Decimal | number | string;

export const ZERO = new Prisma.Decimal(0);

export function toDecimal(value: DecimalInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

export function sumDecimals(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}

export function decEq(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.equals(b);
}
