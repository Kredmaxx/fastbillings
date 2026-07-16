// lib/reports/aging.ts
import { Prisma } from '@prisma/client';

export interface AgingItem {
  id: string;
  label: string;
  /** Decimal string (e.g. "1234.56") */
  amount: string;
  dueDate: Date;
}

export type AgingBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus';

export interface AgingRow extends AgingItem {
  daysOverdue: number;
  bucket: AgingBucket;
}

export interface AgingResult {
  buckets: {
    current: Prisma.Decimal;
    d1_30: Prisma.Decimal;
    d31_60: Prisma.Decimal;
    d61_90: Prisma.Decimal;
    d90plus: Prisma.Decimal;
  };
  total: Prisma.Decimal;
  rows: AgingRow[];
}

const ZERO = new Prisma.Decimal(0);
const MS_PER_DAY = 86_400_000;

function classifyDays(days: number): AgingBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90plus';
}

/**
 * Pure function — buckets a list of open items by days overdue.
 * `asOf` is the reference date (typically today or the user-supplied date).
 */
export function bucketAging(items: AgingItem[], asOf: Date): AgingResult {
  const buckets: AgingResult['buckets'] = {
    current: ZERO,
    d1_30: ZERO,
    d31_60: ZERO,
    d61_90: ZERO,
    d90plus: ZERO,
  };
  let total = ZERO;
  const rows: AgingRow[] = [];

  for (const item of items) {
    const daysOverdue = Math.floor((asOf.getTime() - item.dueDate.getTime()) / MS_PER_DAY);
    const bucket = classifyDays(daysOverdue);
    const amt = new Prisma.Decimal(item.amount);

    buckets[bucket] = buckets[bucket].add(amt);
    total = total.add(amt);

    rows.push({ ...item, daysOverdue, bucket });
  }

  return { buckets, total, rows };
}
