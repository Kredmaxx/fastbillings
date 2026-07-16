// lib/reports/aging.spec.ts
import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { bucketAging, type AgingItem } from './aging';

// Helper: build a date N days before asOf
function daysAgo(asOf: Date, n: number): Date {
  return new Date(asOf.getTime() - n * 86_400_000);
}

const asOf = new Date('2024-06-15T00:00:00.000Z');

describe('bucketAging', () => {
  it('places an item with dueDate = asOf in current bucket (daysOverdue = 0)', () => {
    const items: AgingItem[] = [
      { id: '1', label: 'INV-001 / Acme', amount: '100', dueDate: asOf },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.current.toString()).toBe('100');
    expect(result.buckets.d1_30.toString()).toBe('0');
    expect(result.rows[0].bucket).toBe('current');
    expect(result.rows[0].daysOverdue).toBe(0);
  });

  it('places an item 15 days overdue in d1_30 bucket', () => {
    const items: AgingItem[] = [
      { id: '2', label: 'INV-002 / Beta', amount: '200', dueDate: daysAgo(asOf, 15) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d1_30.toString()).toBe('200');
    expect(result.rows[0].bucket).toBe('d1_30');
    expect(result.rows[0].daysOverdue).toBe(15);
  });

  it('places an item 45 days overdue in d31_60 bucket', () => {
    const items: AgingItem[] = [
      { id: '3', label: 'INV-003 / Gamma', amount: '300', dueDate: daysAgo(asOf, 45) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d31_60.toString()).toBe('300');
    expect(result.rows[0].bucket).toBe('d31_60');
    expect(result.rows[0].daysOverdue).toBe(45);
  });

  it('places an item 75 days overdue in d61_90 bucket', () => {
    const items: AgingItem[] = [
      { id: '4', label: 'INV-004 / Delta', amount: '400', dueDate: daysAgo(asOf, 75) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d61_90.toString()).toBe('400');
    expect(result.rows[0].bucket).toBe('d61_90');
    expect(result.rows[0].daysOverdue).toBe(75);
  });

  it('places an item 120 days overdue in d90plus bucket', () => {
    const items: AgingItem[] = [
      { id: '5', label: 'INV-005 / Epsilon', amount: '500', dueDate: daysAgo(asOf, 120) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d90plus.toString()).toBe('500');
    expect(result.rows[0].bucket).toBe('d90plus');
    expect(result.rows[0].daysOverdue).toBe(120);
  });

  it('total equals sum of all items across buckets', () => {
    const items: AgingItem[] = [
      { id: '1', label: 'A', amount: '100', dueDate: asOf },
      { id: '2', label: 'B', amount: '200', dueDate: daysAgo(asOf, 15) },
      { id: '3', label: 'C', amount: '300', dueDate: daysAgo(asOf, 45) },
      { id: '4', label: 'D', amount: '400', dueDate: daysAgo(asOf, 75) },
      { id: '5', label: 'E', amount: '500', dueDate: daysAgo(asOf, 120) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.total.toString()).toBe('1500');
    expect(result.buckets.current.toString()).toBe('100');
    expect(result.buckets.d1_30.toString()).toBe('200');
    expect(result.buckets.d31_60.toString()).toBe('300');
    expect(result.buckets.d61_90.toString()).toBe('400');
    expect(result.buckets.d90plus.toString()).toBe('500');
  });

  it('returns all-zero buckets and empty rows for empty input', () => {
    const result = bucketAging([], asOf);
    expect(result.total.toString()).toBe('0');
    expect(result.buckets.current.toString()).toBe('0');
    expect(result.buckets.d1_30.toString()).toBe('0');
    expect(result.buckets.d31_60.toString()).toBe('0');
    expect(result.buckets.d61_90.toString()).toBe('0');
    expect(result.buckets.d90plus.toString()).toBe('0');
    expect(result.rows).toHaveLength(0);
  });

  it('uses Prisma.Decimal for precise arithmetic', () => {
    const items: AgingItem[] = [
      { id: '1', label: 'A', amount: '1.005', dueDate: daysAgo(asOf, 5) },
      { id: '2', label: 'B', amount: '2.005', dueDate: daysAgo(asOf, 5) },
    ];
    const result = bucketAging(items, asOf);
    // Prisma.Decimal: 1.005 + 2.005 = 3.01 exactly
    expect(result.total.equals(new Prisma.Decimal('3.010'))).toBe(true);
  });

  it('places an item exactly 1 day overdue in d1_30', () => {
    const items: AgingItem[] = [
      { id: '6', label: 'F', amount: '50', dueDate: daysAgo(asOf, 1) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d1_30.toString()).toBe('50');
    expect(result.rows[0].bucket).toBe('d1_30');
  });

  it('places an item exactly 30 days overdue in d1_30', () => {
    const items: AgingItem[] = [
      { id: '7', label: 'G', amount: '70', dueDate: daysAgo(asOf, 30) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d1_30.toString()).toBe('70');
    expect(result.rows[0].bucket).toBe('d1_30');
  });

  it('places an item exactly 31 days overdue in d31_60', () => {
    const items: AgingItem[] = [
      { id: '8', label: 'H', amount: '80', dueDate: daysAgo(asOf, 31) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d31_60.toString()).toBe('80');
    expect(result.rows[0].bucket).toBe('d31_60');
  });

  it('places an item exactly 91 days overdue in d90plus', () => {
    const items: AgingItem[] = [
      { id: '9', label: 'I', amount: '90', dueDate: daysAgo(asOf, 91) },
    ];
    const result = bucketAging(items, asOf);
    expect(result.buckets.d90plus.toString()).toBe('90');
    expect(result.rows[0].bucket).toBe('d90plus');
  });
});
