import { describe, expect, it } from 'vitest';
import {
  normalizeTrackingMode,
  parseBatchAllocations,
  parseSerialNumbers,
} from './inventoryTracking';

describe('inventoryTracking parsers', () => {
  it('normalizes tracking modes', () => {
    expect(normalizeTrackingMode('BATCH')).toBe('BATCH');
    expect(normalizeTrackingMode('SERIAL')).toBe('SERIAL');
    expect(normalizeTrackingMode('none')).toBe('NONE');
    expect(normalizeTrackingMode(undefined)).toBe('NONE');
  });

  it('parses batch allocations', () => {
    expect(
      parseBatchAllocations({
        batchAllocations: [
          { lotNumber: ' L1 ', qty: 2 },
          { lotNumber: 'L2', qty: 0 },
        ],
      }),
    ).toEqual([{ lotNumber: 'L1', batchId: undefined, qty: 2, expiryDate: null }]);
  });

  it('parses serial numbers', () => {
    expect(parseSerialNumbers({ serialNumbers: [' A1 ', '', 'B2'] })).toEqual(['A1', 'B2']);
  });
});
