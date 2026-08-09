/**
 * Books vs income-tax depreciation comparison for Form 3CD–style cl. 13/18.
 * SLM books proxy + IT block WDV — not Schedule DPM / Form 3CD e-filing.
 */

export function roundDep(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

export type ItWdvAssetInput = {
  acquisitionDate: Date;
  cost: number;
  itOpeningWdv: number | null;
  itBlock: string | null;
  itRatePercent: number | null;
};

export type ItWdvRow = {
  itBlock: string;
  itRatePercent: number;
  openingWdv: number;
  additions: number;
  putToUseHalfYear: boolean;
  depreciation: number;
  closingWdv: number;
  missingItFields: boolean;
  /** False when asset acquired after FY end (skip). */
  inPeriod: boolean;
};

/** Inclusive calendar months from start month through end month. */
export function inclusiveCalendarMonths(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) return 0;
  const startYm = start.getFullYear() * 12 + start.getMonth();
  const endYm = end.getFullYear() * 12 + end.getMonth();
  return Math.max(0, endYm - startYm + 1);
}

/**
 * Income-tax WDV depreciation for one asset in FY (same rules as IT-WDV report).
 * Half-year rate when put to use on/after 1 Oct of FY start year.
 */
export function computeItWdvForFy(
  asset: ItWdvAssetInput,
  fromDate: Date,
  toDate: Date,
): ItWdvRow {
  const rate = asset.itRatePercent != null ? Number(asset.itRatePercent) : NaN;
  const block = (asset.itBlock || '').trim() || 'Unassigned';
  const cost = Number(asset.cost);
  const openingOverride =
    asset.itOpeningWdv != null ? Number(asset.itOpeningWdv) : null;
  const acquiredBeforeFy = asset.acquisitionDate < fromDate;
  const acquiredInFy =
    asset.acquisitionDate >= fromDate && asset.acquisitionDate <= toDate;

  if (!acquiredBeforeFy && !acquiredInFy) {
    return {
      itBlock: block,
      itRatePercent: Number.isFinite(rate) ? rate : 0,
      openingWdv: 0,
      additions: 0,
      putToUseHalfYear: false,
      depreciation: 0,
      closingWdv: 0,
      missingItFields: true,
      inPeriod: false,
    };
  }

  let openingWdv = 0;
  let additions = 0;
  if (acquiredBeforeFy) {
    openingWdv = openingOverride != null ? openingOverride : cost;
  } else {
    additions = openingOverride != null ? openingOverride : cost;
  }

  const halfYearCut = new Date(fromDate.getFullYear(), 9, 1, 0, 0, 0, 0);
  const missingItFields = !asset.itBlock?.trim() || !Number.isFinite(rate) || rate <= 0;
  const putToUseHalfYear = acquiredInFy && asset.acquisitionDate >= halfYearCut;
  const base = openingWdv + additions;
  const effectiveRate = missingItFields ? 0 : putToUseHalfYear ? rate / 2 : rate;
  const depreciation = roundDep((base * effectiveRate) / 100);
  const closingWdv = roundDep(Math.max(0, base - depreciation));

  return {
    itBlock: block,
    itRatePercent: Number.isFinite(rate) ? rate : 0,
    openingWdv: roundDep(openingWdv),
    additions: roundDep(additions),
    putToUseHalfYear,
    depreciation,
    closingWdv,
    missingItFields,
    inPeriod: true,
  };
}

export type BooksFyAssetInput = {
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  acquisitionDate: Date;
  /** Treated as books accumulated dep at FY start (worksheet proxy). */
  accumulatedDepreciation: number;
};

/**
 * Books SLM depreciation for FY: monthly × inclusive months in ownership ∩ FY,
 * capped by remaining depreciable base at FY start (cost − salvage − accum).
 */
export function computeBooksFyDepreciation(
  asset: BooksFyAssetInput,
  fromDate: Date,
  toDate: Date,
): {
  monthlyDepreciation: number;
  booksMonths: number;
  remainingAtFyStart: number;
  booksDepreciation: number;
} {
  const cost = Number(asset.cost);
  const salvage = Number(asset.salvageValue);
  const life = Number(asset.usefulLifeMonths);
  const accum = Number(asset.accumulatedDepreciation);
  const depreciableBase = roundDep(Math.max(0, cost - salvage));
  const remainingAtFyStart = roundDep(Math.max(0, depreciableBase - accum));

  if (life <= 0 || remainingAtFyStart <= 0 || asset.acquisitionDate > toDate) {
    return {
      monthlyDepreciation: 0,
      booksMonths: 0,
      remainingAtFyStart,
      booksDepreciation: 0,
    };
  }

  const monthly = roundDep(depreciableBase / life);
  const ownershipStart =
    asset.acquisitionDate > fromDate ? asset.acquisitionDate : fromDate;
  const booksMonths = inclusiveCalendarMonths(ownershipStart, toDate);
  const gross = roundDep(monthly * booksMonths);
  const booksDepreciation = roundDep(Math.min(gross, remainingAtFyStart));

  return {
    monthlyDepreciation: monthly,
    booksMonths,
    remainingAtFyStart,
    booksDepreciation,
  };
}

export type BooksVsItAssetInput = ItWdvAssetInput &
  BooksFyAssetInput & {
    id: string;
    name: string;
  };

export type BooksVsItRow = {
  assetId: string;
  name: string;
  itBlock: string;
  itRatePercent: number;
  acquisitionDate: string;
  openingWdv: number;
  additions: number;
  putToUseHalfYear: boolean;
  itDepreciation: number;
  closingWdv: number;
  monthlyBooksDepreciation: number;
  booksMonths: number;
  booksDepreciation: number;
  differenceBooksMinusIt: number;
  missingItFields: boolean;
};

export function buildBooksVsItRows(
  assets: BooksVsItAssetInput[],
  fromDate: Date,
  toDate: Date,
): BooksVsItRow[] {
  const rows: BooksVsItRow[] = [];
  for (const a of assets) {
    const it = computeItWdvForFy(a, fromDate, toDate);
    if (!it.inPeriod) continue;
    const books = computeBooksFyDepreciation(a, fromDate, toDate);
    rows.push({
      assetId: a.id,
      name: a.name,
      itBlock: it.itBlock,
      itRatePercent: it.itRatePercent,
      acquisitionDate: a.acquisitionDate.toISOString().slice(0, 10),
      openingWdv: it.openingWdv,
      additions: it.additions,
      putToUseHalfYear: it.putToUseHalfYear,
      itDepreciation: it.depreciation,
      closingWdv: it.closingWdv,
      monthlyBooksDepreciation: books.monthlyDepreciation,
      booksMonths: books.booksMonths,
      booksDepreciation: books.booksDepreciation,
      differenceBooksMinusIt: roundDep(books.booksDepreciation - it.depreciation),
      missingItFields: it.missingItFields,
    });
  }
  return rows;
}

export function summarizeBooksVsIt(rows: BooksVsItRow[]): {
  assetCount: number;
  missingItFieldsCount: number;
  totalItDepreciation: number;
  totalBooksDepreciation: number;
  totalDifferenceBooksMinusIt: number;
} {
  return {
    assetCount: rows.length,
    missingItFieldsCount: rows.filter((r) => r.missingItFields).length,
    totalItDepreciation: roundDep(rows.reduce((s, r) => s + r.itDepreciation, 0)),
    totalBooksDepreciation: roundDep(rows.reduce((s, r) => s + r.booksDepreciation, 0)),
    totalDifferenceBooksMinusIt: roundDep(
      rows.reduce((s, r) => s + r.differenceBooksMinusIt, 0),
    ),
  };
}
