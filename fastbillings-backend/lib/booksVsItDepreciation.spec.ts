import { describe, it, expect } from 'vitest';
import {
  buildBooksVsItRows,
  computeBooksFyDepreciation,
  computeItWdvForFy,
  inclusiveCalendarMonths,
  summarizeBooksVsIt,
} from './booksVsItDepreciation';

describe('booksVsItDepreciation', () => {
  const fyFrom = new Date(2026, 3, 1);
  const fyTo = new Date(2027, 2, 31, 23, 59, 59, 999);

  it('counts inclusive calendar months across FY (Apr–Mar = 12)', () => {
    expect(inclusiveCalendarMonths(fyFrom, fyTo)).toBe(12);
    expect(inclusiveCalendarMonths(new Date(2026, 9, 15), fyTo)).toBe(6);
  });

  it('computes IT WDV dep for demo laptop / server', () => {
    const laptop = computeItWdvForFy(
      {
        acquisitionDate: new Date(2025, 6, 1),
        cost: 450000,
        itOpeningWdv: 270000,
        itBlock: 'Computers',
        itRatePercent: 40,
      },
      fyFrom,
      fyTo,
    );
    expect(laptop.depreciation).toBe(108000);
    expect(laptop.closingWdv).toBe(162000);

    const server = computeItWdvForFy(
      {
        acquisitionDate: new Date(2025, 2, 15),
        cost: 180000,
        itOpeningWdv: 153000,
        itBlock: 'Plant & Machinery',
        itRatePercent: 15,
      },
      fyFrom,
      fyTo,
    );
    expect(server.depreciation).toBe(22950);
  });

  it('computes books SLM FY dep capped by remaining', () => {
    const laptop = computeBooksFyDepreciation(
      {
        cost: 450000,
        salvageValue: 45000,
        usefulLifeMonths: 36,
        acquisitionDate: new Date(2025, 6, 1),
        accumulatedDepreciation: 75000,
      },
      fyFrom,
      fyTo,
    );
    expect(laptop.monthlyDepreciation).toBe(11250);
    expect(laptop.booksMonths).toBe(12);
    expect(laptop.booksDepreciation).toBe(135000);

    const server = computeBooksFyDepreciation(
      {
        cost: 180000,
        salvageValue: 18000,
        usefulLifeMonths: 60,
        acquisitionDate: new Date(2025, 2, 15),
        accumulatedDepreciation: 36000,
      },
      fyFrom,
      fyTo,
    );
    expect(server.monthlyDepreciation).toBe(2700);
    expect(server.booksDepreciation).toBe(32400);
  });

  it('summarizes demo fleet difference books − IT', () => {
    const rows = buildBooksVsItRows(
      [
        {
          id: 'a1',
          name: 'Office Laptop Fleet',
          cost: 450000,
          salvageValue: 45000,
          usefulLifeMonths: 36,
          acquisitionDate: new Date(2025, 6, 1),
          accumulatedDepreciation: 75000,
          itOpeningWdv: 270000,
          itBlock: 'Computers',
          itRatePercent: 40,
        },
        {
          id: 'a2',
          name: 'Server Rack',
          cost: 180000,
          salvageValue: 18000,
          usefulLifeMonths: 60,
          acquisitionDate: new Date(2025, 2, 15),
          accumulatedDepreciation: 36000,
          itOpeningWdv: 153000,
          itBlock: 'Plant & Machinery',
          itRatePercent: 15,
        },
      ],
      fyFrom,
      fyTo,
    );
    const summary = summarizeBooksVsIt(rows);
    expect(summary.totalItDepreciation).toBe(130950);
    expect(summary.totalBooksDepreciation).toBe(167400);
    expect(summary.totalDifferenceBooksMinusIt).toBe(36450);
  });
});
