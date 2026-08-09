import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { getGstSummary } from '../lib/financialQueries';
import {
  createdByOwnershipFilter,
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import {
  B2CL_THRESHOLD,
  cdnurAggKey,
  defaultFinancialYearRange,
  defaultFyQuarterRange,
  defaultMonthRange,
  extractTaxes,
  gstr1DocsSeries,
  invoiceScope,
  itemHsn,
  placeOfSupplyFromAddress,
  sumNilExemptFromItems,
  taxableSupplyItems,
  userDocScope,
  type DocItem,
  type TaxBreakdown,
} from '../lib/gstReportUtils';
import { companyIsComposition } from '../lib/compositionGuard';
import {
  CASH_EXPENSE_40A3_THRESHOLD,
  RULE_6DD_EXCEPTION_CODES,
  aggregateCash40A3Buckets,
  isCashPaymentMode,
  normalizePayeeKey,
  normalizeRule6DdExceptionCode,
  partitionCash40A3Lines,
  rule6DdExceptionLabel,
  summarizeCash40A3Buckets,
  type Cash40A3Line,
} from '../lib/cashExpense40A3';
import {
  MSME_43BH_DAYS,
  daysPastDeadline,
  isLatePayment,
  paymentDeadlineFromPurchase,
  putative43BhDisallowance,
} from '../lib/msme43Bh';
import {
  summarizeCashExpense40A3,
  summarizeClause21aTagged,
  summarizeMsme43Bh,
  summarizeSection36Va,
  summarizeSection40A2,
  summarizeSection40Ai,
  summarizeSection40Aia,
  summarizeSection43B,
} from '../lib/taxAuditDisallowanceSummaries';
import {
  defaultEmployeeFundDueDate,
  summarize36VaLine,
} from '../lib/section36Va';
import { buildClause21aSchedule } from '../lib/clause21aInadmissible';
import {
  buildBooksVsItRows,
  computeItWdvForFy,
  summarizeBooksVsIt,
} from '../lib/booksVsItDepreciation';
import {
  buildClause34Line,
  clause34FormForInvoiceTcs,
  clause34FormForPurchase,
  clause34FormForSalary,
  isClause34Form,
  isClause34Quarter,
  mergeClause34bBuckets,
  rollupClause34ByFormQuarter,
  summarizeClause34,
  type Clause34Line,
  type Clause34bFilingRecord,
} from '../lib/clause34Tds';
import { buildTaxAuditPackClauses, summarizeTaxAuditPack } from '../lib/taxAuditPack';
import { taxAuditPackToCsv } from '../lib/taxAuditPackExport';
import {
  SECTION_40A_IA_DISALLOW_RATE,
  SECTION_40A_I_DISALLOW_RATE,
  classify40AiPurchase,
  classify40AiaPurchase,
  putative40AiDisallowance,
  putative40AiaDisallowance,
} from '../lib/section40Aia';
import {
  defaultSection43BReturnDueDate,
  isLate43BPayment,
  isSection43BTrackedNature,
  putative43BUnpaidDisallowance,
} from '../lib/section43B';
import {
  excessOverFmvAmount,
  parseFairMarketValueInput,
  relatedPartyPaymentAmount,
} from '../lib/section40A2';

function formatDepositChallan(r: {
  id: string;
  kind: string;
  fyLabel: string;
  quarter: string;
  section: string | null;
  bsrCode: string;
  challanNo: string;
  depositDate: Date;
  amount: { toString(): string } | number;
}) {
  const amount = Math.round(Number(r.amount) * 100) / 100;
  const complete = Boolean(
    r.bsrCode?.trim() && r.challanNo?.trim() && r.depositDate && amount > 0,
  );
  return {
    id: r.id,
    kind: r.kind,
    fyLabel: r.fyLabel,
    quarter: r.quarter,
    section: r.section,
    bsrCode: r.bsrCode,
    challanNo: r.challanNo,
    depositDate: r.depositDate.toISOString().slice(0, 10),
    amount,
    complete,
  };
}

async function loadTaxDepositChallansForQuarter(
  req: Request,
  kind: 'TDS' | 'TCS',
  fyLabel: string,
  quarter: 1 | 2 | 3 | 4,
) {
  const q = `Q${quarter}`;
  const rows = await prisma.taxDepositChallan.findMany({
    where: {
      isDeleted: false,
      kind,
      fyLabel,
      quarter: q,
      AND: [{ OR: tenantOrUserScope(req).OR }],
    },
    orderBy: { depositDate: 'asc' },
    include: {
      allocations: {
        select: { sourceId: true, sourceType: true, amount: true },
      },
    },
  });
  return rows.map((r) => {
    const base = formatDepositChallan(r);
    const allocatedTotal =
      Math.round(r.allocations.reduce((s, a) => s + Number(a.amount), 0) * 100) / 100;
    return {
      ...base,
      allocatedTotal,
      unallocatedAmount: Math.round(Math.max(0, base.amount - allocatedTotal) * 100) / 100,
      allocations: r.allocations.map((a) => ({
        sourceType: a.sourceType,
        sourceId: a.sourceId,
        amount: Math.round(Number(a.amount) * 100) / 100,
      })),
    };
  });
}

function allocationReadiness(
  challans: Awaited<ReturnType<typeof loadTaxDepositChallansForQuarter>>,
  documentIds: string[],
  taxByDocument: Map<string, number>,
  label: 'TDS' | 'TCS',
): {
  allocationSummary: {
    mappedDocumentCount: number;
    unmappedDocumentCount: number;
    mappedTax: number;
    unmappedTax: number;
    challanAllocatedTotal: number;
    challanUnallocatedTotal: number;
  };
  allocationBlockers: string[];
  challanNosByDocument: Map<string, string[]>;
  allocatedByDocument: Map<string, number>;
} {
  const round = (n: number) => Math.round(n * 100) / 100;
  const challanNosByDocument = new Map<string, string[]>();
  const allocatedByDocument = new Map<string, number>();
  let challanAllocatedTotal = 0;
  let challanUnallocatedTotal = 0;

  for (const c of challans) {
    challanAllocatedTotal += c.allocatedTotal;
    challanUnallocatedTotal += c.unallocatedAmount;
    for (const a of c.allocations) {
      allocatedByDocument.set(
        a.sourceId,
        round((allocatedByDocument.get(a.sourceId) ?? 0) + a.amount),
      );
      const nos = challanNosByDocument.get(a.sourceId) || [];
      if (!nos.includes(c.challanNo)) nos.push(c.challanNo);
      challanNosByDocument.set(a.sourceId, nos);
    }
  }

  let mappedDocumentCount = 0;
  let unmappedDocumentCount = 0;
  let mappedTax = 0;
  let unmappedTax = 0;
  for (const id of documentIds) {
    const tax = round(taxByDocument.get(id) ?? 0);
    const allocated = round(allocatedByDocument.get(id) ?? 0);
    if (allocated > 0) {
      mappedDocumentCount += 1;
      mappedTax += Math.min(tax, allocated);
      const short = round(Math.max(0, tax - allocated));
      if (short > 0) unmappedTax += short;
    } else if (tax > 0) {
      unmappedDocumentCount += 1;
      unmappedTax += tax;
    }
  }

  const allocationBlockers: string[] = [];
  if (unmappedDocumentCount > 0) {
    allocationBlockers.push(
      `${unmappedDocumentCount} ${label} document(s) have no challan line mapping (unmapped ₹${round(unmappedTax).toLocaleString('en-IN')})`,
    );
  }
  if (challanUnallocatedTotal > 0.01) {
    allocationBlockers.push(
      `${label} challan amount still unallocated to deductee/collectee lines: ₹${round(challanUnallocatedTotal).toLocaleString('en-IN')}`,
    );
  }

  return {
    allocationSummary: {
      mappedDocumentCount,
      unmappedDocumentCount,
      mappedTax: round(mappedTax),
      unmappedTax: round(unmappedTax),
      challanAllocatedTotal: round(challanAllocatedTotal),
      challanUnallocatedTotal: round(challanUnallocatedTotal),
    },
    allocationBlockers,
    challanNosByDocument,
    allocatedByDocument,
  };
}

function challanReadiness(
  challans: ReturnType<typeof formatDepositChallan>[],
  totalTax: number,
  label: 'TDS' | 'TCS',
): {
  challanSummary: {
    count: number;
    completeCount: number;
    depositedTotal: number;
    totalTax: number;
    shortfall: number;
  };
  challanBlockers: string[];
} {
  const complete = challans.filter((c) => c.complete);
  const depositedTotal = Math.round(complete.reduce((s, c) => s + c.amount, 0) * 100) / 100;
  const shortfall = Math.max(0, Math.round((totalTax - depositedTotal) * 100) / 100);
  const challanBlockers: string[] = [];
  if (complete.length === 0) {
    challanBlockers.push(
      `${label} deposit challans (BSR code / challan no / date) are not tracked for this quarter`,
    );
  } else if (shortfall > 0) {
    challanBlockers.push(
      `${label} challan deposits (₹${depositedTotal}) are short of books ${label} (₹${totalTax}) by ₹${shortfall}`,
    );
  }
  return {
    challanSummary: {
      count: challans.length,
      completeCount: complete.length,
      depositedTotal,
      totalTax,
      shortfall,
    },
    challanBlockers,
  };
}

async function loadCompanyStateName(req: Request): Promise<string | null> {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  const company = tenantId
    ? await prisma.companySettings.findFirst({
        where: { OR: [{ tenantId }, { userId }] },
        select: { state: true },
      })
    : await prisma.companySettings.findUnique({
        where: { userId },
        select: { state: true },
      });
  if (!company?.state) return null;
  // CompanySettings.state may store a State id or a free-text name.
  const stateRow = await prisma.state.findUnique({
    where: { id: company.state },
    select: { name: true },
  });
  return (stateRow?.name || company.state).trim() || null;
}

function isInterstate(pos: string, companyState: string | null): boolean {
  if (!companyState) return false;
  const a = pos.toLowerCase().trim();
  const b = companyState.toLowerCase().trim();
  if (!a || a === 'unknown') return false;
  return a !== b && !a.includes(b) && !b.includes(a);
}

function money(t: TaxBreakdown) {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    taxableValue: r(t.taxable),
    cgst: r(t.cgst),
    sgst: r(t.sgst),
    igst: r(t.igst),
    cess: r(t.cess),
  };
}

function sumTax(
  rows: Array<{ items?: unknown; taxableAmount?: unknown; vat?: unknown; totalTax?: unknown }>,
): TaxBreakdown {
  let taxable = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  let cess = 0;
  for (const row of rows) {
    const fallback = row.vat ?? row.totalTax;
    const t = extractTaxes(row.items as DocItem[], row.taxableAmount, fallback);
    taxable += t.taxable;
    cgst += t.cgst;
    sgst += t.sgst;
    igst += t.igst;
    cess += t.cess;
  }
  return { taxable, cgst, sgst, igst, cess };
}

/**
 * GET /api/admin/reports/tax-summary?from=&to=
 */
export async function taxSummary(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);
    const gst = await getGstSummary(userId, fromDate, toDate, optionalTenantId(req));

    res.json({
      success: true,
      data: {
        period: { from: gst.from, to: gst.to },
        outwardTaxes: { ...gst.outwardByKind, TOTAL: gst.outwardTotal },
        inwardTaxes: { ...gst.inwardByKind, TOTAL: gst.inwardTotal },
        netTaxLiability: { ...gst.netByKind, TOTAL: gst.netTotal },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('taxSummary error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute tax summary' });
  }
}

/**
 * GET /api/admin/reports/gstr-1?from=&to=
 * Sections: B2B, B2CL, B2CS, CDNR, CDNUR, HSN.
 */
export async function gstr1(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);
    const companyState = await loadCompanyStateName(req);

    const invoices = await prisma.invoice.findMany({
      where: {
        ...invoiceScope(req),
        invoiceType: 'INVOICE',
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      include: {
        billToCustomer: {
          select: { id: true, name: true, gstin: true, billingAddress: true },
        },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    const creditNotes = await prisma.creditNote.findMany({
      where: {
        ...userDocScope(req),
        creditNoteDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' },
      },
      include: {
        billToCustomer: {
          select: { id: true, name: true, gstin: true, billingAddress: true },
        },
        invoice: { select: { invoiceNumber: true, tenantId: true } },
      },
      orderBy: { creditNoteDate: 'asc' },
    });

    const salesDebitNotes = await prisma.salesDebitNote.findMany({
      where: {
        ...userDocScope(req),
        debitNoteDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' },
      },
      include: {
        billToCustomer: {
          select: { id: true, name: true, gstin: true, billingAddress: true },
        },
        invoice: { select: { invoiceNumber: true, tenantId: true } },
      },
      orderBy: { debitNoteDate: 'asc' },
    });

    const b2b: Array<Record<string, unknown>> = [];
    const b2cl: Array<Record<string, unknown>> = [];
    const b2csMap = new Map<string, Record<string, unknown>>();
    const hsnMap = new Map<string, Record<string, number | string>>();

    const pushHsn = (items: DocItem[] | null | undefined, tax: TaxBreakdown) => {
      const list = items ?? [];
      const rateHint =
        tax.taxable > 0
          ? Math.round(((tax.cgst + tax.sgst + tax.igst) / tax.taxable) * 10000) / 100
          : 0;
      if (list.length === 0) {
        const key = `UNSPECIFIED|${rateHint}`;
        const row = (hsnMap.get(key) || {
          hsn: 'UNSPECIFIED',
          description: 'Unspecified',
          uqc: 'OTH',
          rate: rateHint,
          qty: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
        }) as Record<string, number | string>;
        row.taxableValue = Number(row.taxableValue) + tax.taxable;
        row.cgst = Number(row.cgst) + tax.cgst;
        row.sgst = Number(row.sgst) + tax.sgst;
        row.igst = Number(row.igst) + tax.igst;
        row.cess = Number(row.cess) + tax.cess;
        hsnMap.set(key, row);
        return;
      }
      const itemTaxableTotal = list.reduce(
        (s, it) => s + Number(it.qty ?? 0) * Number(it.rate ?? 0),
        0,
      );
      for (const item of list) {
        const hsn = itemHsn(item);
        const uqc = String((item as { unit?: string }).unit || 'OTH').slice(0, 8);
        const lineBase = Number(item.qty ?? 0) * Number(item.rate ?? 0);
        const share = itemTaxableTotal > 0 ? lineBase / itemTaxableTotal : 1 / list.length;
        const key = `${hsn}|${uqc}|${rateHint}`;
        const row = (hsnMap.get(key) || {
          hsn,
          description: item.description || item.name || hsn,
          uqc,
          rate: rateHint,
          qty: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
        }) as Record<string, number | string>;
        row.qty = Number(row.qty) + Number(item.qty ?? 0);
        row.taxableValue = Number(row.taxableValue) + tax.taxable * share;
        row.cgst = Number(row.cgst) + tax.cgst * share;
        row.sgst = Number(row.sgst) + tax.sgst * share;
        row.igst = Number(row.igst) + tax.igst * share;
        row.cess = Number(row.cess) + tax.cess * share;
        hsnMap.set(key, row);
      }
    };

    let totalTaxableValue = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalCess = 0;
    let nilExempt = { nilRated: 0, exempt: 0, nonGst: 0 };

    for (const inv of invoices) {
      const allItems = inv.items as DocItem[];
      const taxableItems = taxableSupplyItems(allItems);
      const nilParts = sumNilExemptFromItems(allItems, 1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;

      const taxableBase = taxableItems.reduce((s, it) => {
        const qty = Number(it.qty ?? 0);
        const rate = Number(it.rate ?? 0);
        const discount = Number(it.discount ?? 0);
        return s + Math.max(0, qty * rate - discount);
      }, 0);
      const tax = extractTaxes(
        taxableItems,
        taxableItems.length > 0 ? taxableBase : 0,
        taxableItems.length === (allItems?.length ?? 0) ? inv.vat : 0,
      );
      // Skip pure nil/exempt/non-GST invoices from B2B/B2C tax tables
      if (taxableItems.length === 0 && (nilParts.nilRated || nilParts.exempt || nilParts.nonGst)) {
        continue;
      }

      const gstin = (inv.billToCustomer?.gstin || '').trim();
      const pos = placeOfSupplyFromAddress(inv.billToCustomer?.billingAddress);
      const interstate = isInterstate(pos, companyState) || tax.igst > 0;
      const total = tax.taxable + tax.cgst + tax.sgst + tax.igst + tax.cess;

      totalTaxableValue += tax.taxable;
      totalCgst += tax.cgst;
      totalSgst += tax.sgst;
      totalIgst += tax.igst;
      totalCess += tax.cess;
      pushHsn(taxableItems, tax);

      const row = {
        gstin: gstin || null,
        customerName: inv.billToCustomer?.name ?? '',
        invoiceNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        placeOfSupply: pos,
        taxableValue: tax.taxable,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        cess: tax.cess,
        total,
        reverseCharge: Boolean(inv.isReverseCharge),
      };

      if (gstin) {
        b2b.push({ ...row, gstin });
      } else if (interstate && tax.taxable > B2CL_THRESHOLD) {
        b2cl.push(row);
      } else {
        const rateHint =
          tax.taxable > 0
            ? Math.round(((tax.cgst + tax.sgst + tax.igst) / tax.taxable) * 10000) / 100
            : 0;
        const key = `${pos}|${rateHint}|${interstate ? 'I' : 'C'}`;
        const agg = b2csMap.get(key) || {
          placeOfSupply: pos,
          supplyType: interstate ? 'Inter-State' : 'Intra-State',
          rate: rateHint,
          invoiceCount: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
          tax: 0,
        };
        agg.invoiceCount = Number(agg.invoiceCount) + 1;
        agg.taxableValue = Number(agg.taxableValue) + tax.taxable;
        agg.cgst = Number(agg.cgst) + tax.cgst;
        agg.sgst = Number(agg.sgst) + tax.sgst;
        agg.igst = Number(agg.igst) + tax.igst;
        agg.cess = Number(agg.cess) + tax.cess;
        agg.tax = Number(agg.tax) + tax.cgst + tax.sgst + tax.igst + tax.cess;
        b2csMap.set(key, agg);
      }
    }

    const cdnr: Array<Record<string, unknown>> = [];
    const cdnurMap = new Map<string, Record<string, unknown>>();

    for (const cn of creditNotes) {
      const allItems = cn.items as DocItem[];
      const taxableItems = taxableSupplyItems(allItems);
      const nilParts = sumNilExemptFromItems(allItems, -1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;

      const taxableBase = taxableItems.reduce((s, it) => {
        const qty = Number(it.qty ?? 0);
        const rate = Number(it.rate ?? 0);
        const discount = Number(it.discount ?? 0);
        return s + Math.max(0, qty * rate - discount);
      }, 0);
      const tax = extractTaxes(
        taxableItems,
        taxableItems.length > 0 ? taxableBase : 0,
        taxableItems.length === (allItems?.length ?? 0) ? cn.vat : 0,
      );
      if (taxableItems.length === 0) {
        continue;
      }

      const gstin = (cn.billToCustomer?.gstin || '').trim();
      const pos = placeOfSupplyFromAddress(cn.billToCustomer?.billingAddress);
      const noteTotal = tax.taxable + tax.cgst + tax.sgst + tax.igst + tax.cess;

      // Credit notes reduce outward supplies in HSN
      pushHsn(taxableItems, {
        taxable: -tax.taxable,
        cgst: -tax.cgst,
        sgst: -tax.sgst,
        igst: -tax.igst,
        cess: -tax.cess,
      });
      totalTaxableValue -= tax.taxable;
      totalCgst -= tax.cgst;
      totalSgst -= tax.sgst;
      totalIgst -= tax.igst;
      totalCess -= tax.cess;

      const note = {
        noteNumber: cn.creditNoteNumber,
        noteDate: cn.creditNoteDate,
        noteType: 'C',
        invoiceNumber: cn.invoice?.invoiceNumber || null,
        customerName: cn.billToCustomer?.name ?? '',
        gstin: gstin || null,
        placeOfSupply: pos,
        taxableValue: tax.taxable,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        cess: tax.cess,
        total: noteTotal,
      };

      if (gstin) {
        cdnr.push({ ...note, gstin });
      } else {
        const key = cdnurAggKey(pos, 'C');
        const agg = cdnurMap.get(key) || {
          placeOfSupply: pos,
          noteType: 'C',
          noteCount: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
          tax: 0,
        };
        agg.noteCount = Number(agg.noteCount) + 1;
        agg.taxableValue = Number(agg.taxableValue) + tax.taxable;
        agg.cgst = Number(agg.cgst) + tax.cgst;
        agg.sgst = Number(agg.sgst) + tax.sgst;
        agg.igst = Number(agg.igst) + tax.igst;
        agg.cess = Number(agg.cess) + tax.cess;
        agg.tax = Number(agg.tax) + tax.cgst + tax.sgst + tax.igst + tax.cess;
        cdnurMap.set(key, agg);
      }
    }

    // Sales debit notes increase outward supplies (opposite of credit notes)
    for (const dn of salesDebitNotes) {
      const allItems = dn.items as DocItem[];
      const taxableItems = taxableSupplyItems(allItems);
      const nilParts = sumNilExemptFromItems(allItems, 1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;

      const taxableBase = taxableItems.reduce((s, it) => {
        const qty = Number(it.qty ?? 0);
        const rate = Number(it.rate ?? 0);
        const discount = Number(it.discount ?? 0);
        return s + Math.max(0, qty * rate - discount);
      }, 0);
      const tax = extractTaxes(
        taxableItems,
        taxableItems.length > 0 ? taxableBase : 0,
        taxableItems.length === (allItems?.length ?? 0) ? dn.vat : 0,
      );
      if (taxableItems.length === 0) {
        continue;
      }

      const gstin = (dn.billToCustomer?.gstin || '').trim();
      const pos = placeOfSupplyFromAddress(dn.billToCustomer?.billingAddress);
      const noteTotal = tax.taxable + tax.cgst + tax.sgst + tax.igst + tax.cess;

      pushHsn(taxableItems, {
        taxable: tax.taxable,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        cess: tax.cess,
      });
      totalTaxableValue += tax.taxable;
      totalCgst += tax.cgst;
      totalSgst += tax.sgst;
      totalIgst += tax.igst;
      totalCess += tax.cess;

      const note = {
        noteNumber: dn.debitNoteNumber,
        noteDate: dn.debitNoteDate,
        noteType: 'D',
        invoiceNumber: dn.invoice?.invoiceNumber || null,
        customerName: dn.billToCustomer?.name ?? '',
        gstin: gstin || null,
        placeOfSupply: pos,
        taxableValue: tax.taxable,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        cess: tax.cess,
        total: noteTotal,
      };

      if (gstin) {
        cdnr.push({ ...note, gstin });
      } else {
        const key = cdnurAggKey(pos, 'D');
        const agg = cdnurMap.get(key) || {
          placeOfSupply: pos,
          noteType: 'D',
          noteCount: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
          tax: 0,
        };
        agg.noteCount = Number(agg.noteCount) + 1;
        agg.taxableValue = Number(agg.taxableValue) + tax.taxable;
        agg.cgst = Number(agg.cgst) + tax.cgst;
        agg.sgst = Number(agg.sgst) + tax.sgst;
        agg.igst = Number(agg.igst) + tax.igst;
        agg.cess = Number(agg.cess) + tax.cess;
        agg.tax = Number(agg.tax) + tax.cgst + tax.sgst + tax.igst + tax.cess;
        cdnurMap.set(key, agg);
      }
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    const hsn = Array.from(hsnMap.values()).map((r) => ({
      hsn: String(r.hsn),
      description: String(r.description),
      uqc: String(r.uqc ?? 'OTH'),
      rate: round(Number(r.rate ?? 0)),
      qty: round(Number(r.qty)),
      taxableValue: round(Number(r.taxableValue)),
      cgst: round(Number(r.cgst)),
      sgst: round(Number(r.sgst)),
      igst: round(Number(r.igst)),
      cess: round(Number(r.cess)),
    }));

    const b2cs = Array.from(b2csMap.values());
    // Legacy flat B2C list for older UI/CSV consumers (B2CL rows + B2CS aggregates)
    const b2cLegacy = [
      ...b2cl.map((r) => ({
        placeOfSupply: r.placeOfSupply,
        invoiceCount: 1,
        taxableValue: r.taxableValue,
        tax: Number(r.cgst) + Number(r.sgst) + Number(r.igst) + Number(r.cess),
        invoiceNumber: r.invoiceNumber,
        date: r.date,
        customerName: r.customerName,
        supplyType: 'B2CL',
      })),
      ...b2cs.map((r) => ({ ...r, supplyType: 'B2CS' })),
    ];

    // Docs issued (GSTR-1 table 13 style) — include cancelled in total/series; tax tables stay active-only
    const [
      cancelledInvoices,
      cancelledCreditNotes,
      cancelledSalesDebitNotes,
      purchaseDebitNotesActive,
      purchaseDebitNotesCancelled,
    ] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          ...invoiceScope(req),
          invoiceType: 'INVOICE',
          invoiceDate: { gte: fromDate, lte: toDate },
          status: 'CANCELLED',
        },
        select: { invoiceNumber: true },
      }),
      prisma.creditNote.findMany({
        where: {
          ...userDocScope(req),
          creditNoteDate: { gte: fromDate, lte: toDate },
          status: 'CANCELLED',
        },
        select: { creditNoteNumber: true },
      }),
      prisma.salesDebitNote.findMany({
        where: {
          ...userDocScope(req),
          debitNoteDate: { gte: fromDate, lte: toDate },
          status: 'CANCELLED',
        },
        select: { debitNoteNumber: true },
      }),
      // Purchase DebitNote counts are books-only (inward); not GSTR-1 CDNR
      prisma.debitNote.findMany({
        where: {
          ...userDocScope(req),
          debitNoteDate: { gte: fromDate, lte: toDate },
          status: { not: 'cancelled' },
        },
        select: { debitNoteId: true },
      }),
      prisma.debitNote.findMany({
        where: {
          ...userDocScope(req),
          debitNoteDate: { gte: fromDate, lte: toDate },
          status: 'cancelled',
        },
        select: { debitNoteId: true },
      }),
    ]);

    const docs = [
      gstr1DocsSeries({
        nature: 'Invoices for outward supply',
        docType: 'INV',
        activeCount: invoices.length,
        cancelledCount: cancelledInvoices.length,
        numbers: [
          ...invoices.map((i) => i.invoiceNumber),
          ...cancelledInvoices.map((i) => i.invoiceNumber),
        ],
      }),
      gstr1DocsSeries({
        nature: 'Credit notes',
        docType: 'CRN',
        activeCount: creditNotes.length,
        cancelledCount: cancelledCreditNotes.length,
        numbers: [
          ...creditNotes.map((c) => c.creditNoteNumber),
          ...cancelledCreditNotes.map((c) => c.creditNoteNumber),
        ],
      }),
      gstr1DocsSeries({
        nature: 'Debit notes (outward / sales)',
        docType: 'DBN',
        activeCount: salesDebitNotes.length,
        cancelledCount: cancelledSalesDebitNotes.length,
        numbers: [
          ...salesDebitNotes.map((d) => d.debitNoteNumber),
          ...cancelledSalesDebitNotes.map((d) => d.debitNoteNumber),
        ],
      }),
      gstr1DocsSeries({
        nature: 'Debit notes (purchase / books only — not GSTR-1 Table 13)',
        docType: 'DBN-PUR',
        activeCount: purchaseDebitNotesActive.length,
        cancelledCount: purchaseDebitNotesCancelled.length,
        numbers: [
          ...purchaseDebitNotesActive.map((d) => d.debitNoteId),
          ...purchaseDebitNotesCancelled.map((d) => d.debitNoteId),
        ],
      }),
    ];

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        notes:
          'Books worksheet — not GST portal offline JSON. Use for reconciliation; file on portal separately.',
        companyState,
        b2b,
        b2cl,
        b2cs,
        b2c: b2cLegacy,
        cdnr,
        cdnur: Array.from(cdnurMap.values()),
        hsn,
        docs,
        nilExempt: {
          nilRated: { taxableValue: round(nilExempt.nilRated), cgst: 0, sgst: 0, igst: 0, cess: 0 },
          exempt: { taxableValue: round(nilExempt.exempt), cgst: 0, sgst: 0, igst: 0, cess: 0 },
          nonGst: { taxableValue: round(nilExempt.nonGst), cgst: 0, sgst: 0, igst: 0, cess: 0 },
        },
        summary: {
          totalInvoices: invoices.length,
          totalCreditNotes: creditNotes.length,
          totalSalesDebitNotes: salesDebitNotes.length,
          cancelledInvoices: cancelledInvoices.length,
          cancelledCreditNotes: cancelledCreditNotes.length,
          cancelledSalesDebitNotes: cancelledSalesDebitNotes.length,
          b2bCount: b2b.length,
          b2clCount: b2cl.length,
          b2csGroups: b2cs.length,
          cdnrCount: cdnr.length,
          cdnurGroups: cdnurMap.size,
          hsnCount: hsn.length,
          totalTaxableValue: round(totalTaxableValue),
          totalCgst: round(totalCgst),
          totalSgst: round(totalSgst),
          totalIgst: round(totalIgst),
          totalCess: round(totalCess),
          totalTax: round(totalCgst + totalSgst + totalIgst + totalCess),
          nilRatedValue: round(nilExempt.nilRated),
          exemptValue: round(nilExempt.exempt),
          nonGstValue: round(nilExempt.nonGst),
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr1 error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute GSTR-1' });
  }
}

/**
 * GET /api/admin/reports/gstr-3b?from=&to=
 */
export async function gstr3b(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);

    const [invoices, creditNotes, salesDebitNotes, debitNotes, purchases, itcReversalRows] =
      await Promise.all([
        prisma.invoice.findMany({
          where: {
            ...invoiceScope(req),
            invoiceType: 'INVOICE',
            invoiceDate: { gte: fromDate, lte: toDate },
            status: { notIn: ['DRAFT', 'CANCELLED'] },
          },
          select: {
            items: true,
            vat: true,
            taxableAmount: true,
            isReverseCharge: true,
            billToCustomer: { select: { gstin: true, billingAddress: true } },
          },
        }),
        prisma.creditNote.findMany({
          where: {
            ...userDocScope(req),
            creditNoteDate: { gte: fromDate, lte: toDate },
            status: { not: 'CANCELLED' },
          },
          select: { items: true, vat: true, taxableAmount: true },
        }),
        prisma.salesDebitNote.findMany({
          where: {
            ...userDocScope(req),
            debitNoteDate: { gte: fromDate, lte: toDate },
            status: { not: 'CANCELLED' },
          },
          select: { items: true, vat: true, taxableAmount: true },
        }),
        prisma.debitNote.findMany({
          where: {
            ...userDocScope(req),
            debitNoteDate: { gte: fromDate, lte: toDate },
            status: { notIn: ['cancelled'] },
          },
          select: { items: true, totalTax: true, taxableAmount: true },
        }),
        prisma.purchase.findMany({
          where: {
            ...userDocScope(req),
            purchaseDate: { gte: fromDate, lte: toDate },
            status: { not: 'cancelled' },
          },
          select: { items: true, taxableAmount: true, totalTax: true, isReverseCharge: true },
        }),
        prisma.itcReversal.findMany({
          where: {
            isDeleted: false,
            AND: [{ OR: tenantOrUserScope(req).OR }],
            reversalDate: { gte: fromDate, lte: toDate },
          },
          select: { cgst: true, sgst: true, igst: true, cess: true, reason: true },
        }),
      ]);

    const outwardGross = sumTax(invoices);
    const cnOut = sumTax(creditNotes);
    const sdnOut = sumTax(salesDebitNotes);
    // Purchase debit notes reduce inward taxable / ITC in this simplified model
    const dnIn = sumTax(debitNotes);
    const normalPurchases = purchases.filter((p) => !p.isReverseCharge);
    const rcmPurchases = purchases.filter((p) => p.isReverseCharge);
    const purchaseIn = sumTax(normalPurchases);
    const inwardRcm = sumTax(rcmPurchases);

    const itcReversal: TaxBreakdown = {
      taxable: 0,
      cgst: itcReversalRows.reduce((s, r) => s + Number(r.cgst), 0),
      sgst: itcReversalRows.reduce((s, r) => s + Number(r.sgst), 0),
      igst: itcReversalRows.reduce((s, r) => s + Number(r.igst), 0),
      cess: itcReversalRows.reduce((s, r) => s + Number(r.cess), 0),
    };

    let interStateUnregistered = 0;
    for (const inv of invoices) {
      const tax = extractTaxes(inv.items as DocItem[], inv.taxableAmount, inv.vat);
      if (!inv.billToCustomer?.gstin?.trim() && tax.igst > 0) {
        interStateUnregistered += tax.taxable;
      }
    }

    // Net outward = invoices − sales credit notes + sales debit notes (CDNR type D)
    const outwardNet: TaxBreakdown = {
      taxable: outwardGross.taxable - cnOut.taxable + sdnOut.taxable,
      cgst: outwardGross.cgst - cnOut.cgst + sdnOut.cgst,
      sgst: outwardGross.sgst - cnOut.sgst + sdnOut.sgst,
      igst: outwardGross.igst - cnOut.igst + sdnOut.igst,
      cess: outwardGross.cess - cnOut.cess + sdnOut.cess,
    };

    const itcEligible: TaxBreakdown = {
      taxable: purchaseIn.taxable - dnIn.taxable,
      cgst: purchaseIn.cgst - dnIn.cgst,
      sgst: purchaseIn.sgst - dnIn.sgst,
      igst: purchaseIn.igst - dnIn.igst,
      cess: purchaseIn.cess - dnIn.cess,
    };

    // 4(C) = 4(A) − 4(B) — net ITC after manual reversals (Rule 42/43 / other)
    const itcNet: TaxBreakdown = {
      taxable: itcEligible.taxable,
      cgst: itcEligible.cgst - itcReversal.cgst,
      sgst: itcEligible.sgst - itcReversal.sgst,
      igst: itcEligible.igst - itcReversal.igst,
      cess: itcEligible.cess - itcReversal.cess,
    };

    // Net outward − ITC (after reversal), plus inward RCM liability (3.1d).
    const taxPayable = {
      cgst: Math.max(
        0,
        Math.round((outwardNet.cgst - itcNet.cgst + inwardRcm.cgst) * 100) / 100,
      ),
      sgst: Math.max(
        0,
        Math.round((outwardNet.sgst - itcNet.sgst + inwardRcm.sgst) * 100) / 100,
      ),
      igst: Math.max(
        0,
        Math.round((outwardNet.igst - itcNet.igst + inwardRcm.igst) * 100) / 100,
      ),
      cess: Math.max(
        0,
        Math.round((outwardNet.cess - itcNet.cess + inwardRcm.cess) * 100) / 100,
      ),
    };

    const outwardBlock = money(outwardNet);
    const itcEligibleBlock = money(itcEligible);
    const itcReversalBlock = money(itcReversal);
    const itcBlock = money(itcNet);
    const inwardRcmBlock = money(inwardRcm);

    let inwardNilExempt = { nilRated: 0, exempt: 0, nonGst: 0 };
    for (const p of purchases) {
      const parts = sumNilExemptFromItems(p.items as DocItem[], 1);
      inwardNilExempt.nilRated += parts.nilRated;
      inwardNilExempt.exempt += parts.exempt;
      inwardNilExempt.nonGst += parts.nonGst;
    }
    for (const dn of debitNotes) {
      const parts = sumNilExemptFromItems(dn.items as DocItem[], -1);
      inwardNilExempt.nilRated += parts.nilRated;
      inwardNilExempt.exempt += parts.exempt;
      inwardNilExempt.nonGst += parts.nonGst;
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    const inwardNilExemptBlock = {
      nilRated: round(Math.max(0, inwardNilExempt.nilRated)),
      exempt: round(Math.max(0, inwardNilExempt.exempt)),
      nonGst: round(Math.max(0, inwardNilExempt.nonGst)),
      note: 'From purchase/debit-note line gstSupplyType (NIL_RATED / EXEMPT / NON_GST)',
    };

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        outwardSupplies: {
          invoices: money(outwardGross),
          creditNotes: money(cnOut),
          salesDebitNotes: money(sdnOut),
          net: outwardBlock,
        },
        eligibleItc: {
          purchases: money(purchaseIn),
          debitNotes: money(dnIn),
          gross: itcEligibleBlock,
          reversal: itcReversalBlock,
          net: itcBlock,
        },
        itcReversal: {
          ...itcReversalBlock,
          entryCount: itcReversalRows.length,
          note: 'Manual 4(B) rows (Rule 42/43/other) for the period',
        },
        inwardReverseCharge: {
          purchases: inwardRcmBlock,
          purchaseCount: rcmPurchases.length,
        },
        inwardNilExempt: inwardNilExemptBlock,
        // Legacy table keys expected by existing UI / CSV export
        '3.1_outwardSupplies': outwardBlock,
        '3.1_inwardReverseCharge': inwardRcmBlock,
        '3.1_exemptInward': inwardNilExemptBlock,
        '3.2_interStateUnregistered': {
          taxableValue: Math.round(interStateUnregistered * 100) / 100,
        },
        '4_itcEligible': itcEligibleBlock,
        '4B_itcReversal': itcReversalBlock,
        '4C_itcNet': itcBlock,
        '6.1_taxPayable': taxPayable,
        summary: {
          invoiceCount: invoices.length,
          creditNoteCount: creditNotes.length,
          salesDebitNoteCount: salesDebitNotes.length,
          debitNoteCount: debitNotes.length,
          purchaseCount: purchases.length,
          reverseChargePurchaseCount: rcmPurchases.length,
          reverseChargeInvoiceCount: invoices.filter((i) => i.isReverseCharge).length,
          itcReversalCount: itcReversalRows.length,
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr3b error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute GSTR-3B' });
  }
}

function emptyTax(): TaxBreakdown {
  return { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 };
}

function addTax(a: TaxBreakdown, b: TaxBreakdown): TaxBreakdown {
  return {
    taxable: a.taxable + b.taxable,
    cgst: a.cgst + b.cgst,
    sgst: a.sgst + b.sgst,
    igst: a.igst + b.igst,
    cess: a.cess + b.cess,
  };
}

function subTax(a: TaxBreakdown, b: TaxBreakdown): TaxBreakdown {
  return {
    taxable: a.taxable - b.taxable,
    cgst: a.cgst - b.cgst,
    sgst: a.sgst - b.sgst,
    igst: a.igst - b.igst,
    cess: a.cess - b.cess,
  };
}

function inRange(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/**
 * GET /api/admin/reports/gstr-9?fy=2025-26
 * Books-only annual GST worksheet (not portal filing JSON).
 */
export async function gstr9(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fromDate, toDate, fyLabel } = defaultFinancialYearRange(req);
    const companyState = await loadCompanyStateName(req);

    const [invoices, creditNotes, salesDebitNotes, debitNotes, purchases] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          ...invoiceScope(req),
          invoiceType: 'INVOICE',
          invoiceDate: { gte: fromDate, lte: toDate },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
        select: {
          invoiceDate: true,
          items: true,
          vat: true,
          taxableAmount: true,
          isReverseCharge: true,
          billToCustomer: { select: { gstin: true, billingAddress: true, name: true } },
        },
      }),
      prisma.creditNote.findMany({
        where: {
          ...userDocScope(req),
          creditNoteDate: { gte: fromDate, lte: toDate },
          status: { not: 'CANCELLED' },
        },
        select: {
          creditNoteDate: true,
          items: true,
          vat: true,
          taxableAmount: true,
          billToCustomer: { select: { gstin: true } },
        },
      }),
      prisma.salesDebitNote.findMany({
        where: {
          ...userDocScope(req),
          debitNoteDate: { gte: fromDate, lte: toDate },
          status: { not: 'CANCELLED' },
        },
        select: {
          debitNoteDate: true,
          items: true,
          vat: true,
          taxableAmount: true,
          billToCustomer: { select: { gstin: true } },
        },
      }),
      prisma.debitNote.findMany({
        where: {
          ...userDocScope(req),
          debitNoteDate: { gte: fromDate, lte: toDate },
          status: { notIn: ['cancelled'] },
        },
        select: { debitNoteDate: true, items: true, totalTax: true, taxableAmount: true },
      }),
      prisma.purchase.findMany({
        where: {
          ...userDocScope(req),
          purchaseDate: { gte: fromDate, lte: toDate },
          status: { not: 'cancelled' },
        },
        select: { purchaseDate: true, items: true, taxableAmount: true, totalTax: true },
      }),
    ]);

    let b2b = emptyTax();
    let b2cl = emptyTax();
    let b2cs = emptyTax();
    let rcmOutward = emptyTax();
    let interStateUnregistered = 0;
    const hsnMap = new Map<string, Record<string, number | string>>();

    const pushHsn = (items: DocItem[] | null | undefined, tax: TaxBreakdown, sign: 1 | -1) => {
      const list = items ?? [];
      const apply = (key: string, description: string, qty: number, share: number) => {
        const row = (hsnMap.get(key) || {
          hsn: key,
          description,
          qty: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          cess: 0,
        }) as Record<string, number | string>;
        row.qty = Number(row.qty) + sign * qty;
        row.taxableValue = Number(row.taxableValue) + sign * tax.taxable * share;
        row.cgst = Number(row.cgst) + sign * tax.cgst * share;
        row.sgst = Number(row.sgst) + sign * tax.sgst * share;
        row.igst = Number(row.igst) + sign * tax.igst * share;
        row.cess = Number(row.cess) + sign * tax.cess * share;
        hsnMap.set(key, row);
      };
      if (list.length === 0) {
        apply('UNSPECIFIED', 'Unspecified', 0, 1);
        return;
      }
      const itemTaxableTotal = list.reduce(
        (s, it) => s + Number(it.qty ?? 0) * Number(it.rate ?? 0),
        0,
      );
      for (const item of list) {
        const hsn = itemHsn(item);
        const lineBase = Number(item.qty ?? 0) * Number(item.rate ?? 0);
        const share = itemTaxableTotal > 0 ? lineBase / itemTaxableTotal : 1 / list.length;
        apply(hsn, item.description || item.name || hsn, Number(item.qty ?? 0), share);
      }
    };

    let nilExempt = { nilRated: 0, exempt: 0, nonGst: 0 };

    for (const inv of invoices) {
      const allItems = inv.items as DocItem[];
      const taxableItems = taxableSupplyItems(allItems);
      const nilParts = sumNilExemptFromItems(allItems, 1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;

      const taxableBase = taxableItems.reduce((s, it) => {
        const qty = Number(it.qty ?? 0);
        const rate = Number(it.rate ?? 0);
        const discount = Number(it.discount ?? 0);
        return s + Math.max(0, qty * rate - discount);
      }, 0);
      const tax = extractTaxes(
        taxableItems,
        taxableItems.length > 0 ? taxableBase : 0,
        taxableItems.length === (allItems?.length ?? 0) ? inv.vat : 0,
      );
      if (taxableItems.length === 0) continue;

      const gstin = (inv.billToCustomer?.gstin || '').trim();
      const pos = placeOfSupplyFromAddress(inv.billToCustomer?.billingAddress);
      const interstate = isInterstate(pos, companyState) || tax.igst > 0;
      pushHsn(taxableItems, tax, 1);
      if (inv.isReverseCharge) rcmOutward = addTax(rcmOutward, tax);
      if (!gstin && tax.igst > 0) interStateUnregistered += tax.taxable;
      if (gstin) b2b = addTax(b2b, tax);
      else if (interstate && tax.taxable > B2CL_THRESHOLD) b2cl = addTax(b2cl, tax);
      else b2cs = addTax(b2cs, tax);
    }

    let cdnr = emptyTax();
    let cdnur = emptyTax();
    for (const cn of creditNotes) {
      const allItems = cn.items as DocItem[];
      const taxableItems = taxableSupplyItems(allItems);
      const nilParts = sumNilExemptFromItems(allItems, -1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;

      const taxableBase = taxableItems.reduce((s, it) => {
        const qty = Number(it.qty ?? 0);
        const rate = Number(it.rate ?? 0);
        const discount = Number(it.discount ?? 0);
        return s + Math.max(0, qty * rate - discount);
      }, 0);
      const tax = extractTaxes(
        taxableItems,
        taxableItems.length > 0 ? taxableBase : 0,
        taxableItems.length === (allItems?.length ?? 0) ? cn.vat : 0,
      );
      if (taxableItems.length === 0) continue;
      pushHsn(taxableItems, tax, -1);
      if ((cn.billToCustomer?.gstin || '').trim()) cdnr = addTax(cdnr, tax);
      else cdnur = addTax(cdnur, tax);
    }

    let salesDnTax = emptyTax();
    for (const sdn of salesDebitNotes) {
      const allItems = sdn.items as DocItem[];
      const taxableItems = taxableSupplyItems(allItems);
      const nilParts = sumNilExemptFromItems(allItems, 1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;

      const taxableBase = taxableItems.reduce((s, it) => {
        const qty = Number(it.qty ?? 0);
        const rate = Number(it.rate ?? 0);
        const discount = Number(it.discount ?? 0);
        return s + Math.max(0, qty * rate - discount);
      }, 0);
      const tax = extractTaxes(
        taxableItems,
        taxableItems.length > 0 ? taxableBase : 0,
        taxableItems.length === (allItems?.length ?? 0) ? sdn.vat : 0,
      );
      if (taxableItems.length === 0) continue;
      pushHsn(taxableItems, tax, 1);
      salesDnTax = addTax(salesDnTax, tax);
    }

    const purchaseIn = sumTax(purchases);
    const dnIn = sumTax(debitNotes);
    const outwardGross = addTax(addTax(b2b, b2cl), b2cs);
    const cnOut = addTax(cdnr, cdnur);
    const outwardNet = addTax(subTax(outwardGross, cnOut), salesDnTax);
    const itcNet = subTax(purchaseIn, dnIn);

    const taxPayable = {
      cgst: Math.max(0, Math.round((outwardNet.cgst - itcNet.cgst) * 100) / 100),
      sgst: Math.max(0, Math.round((outwardNet.sgst - itcNet.sgst) * 100) / 100),
      igst: Math.max(0, Math.round((outwardNet.igst - itcNet.igst) * 100) / 100),
      cess: Math.max(0, Math.round((outwardNet.cess - itcNet.cess) * 100) / 100),
    };

    const monthlyBreakdown: Array<{
      month: string;
      outward: ReturnType<typeof money>;
      itc: ReturnType<typeof money>;
      taxPayable: typeof taxPayable;
      invoiceCount: number;
      purchaseCount: number;
    }> = [];

    const startYear = fromDate.getFullYear();
    for (let i = 0; i < 12; i++) {
      const mStart = new Date(startYear, 3 + i, 1, 0, 0, 0, 0);
      const mEnd = new Date(startYear, 4 + i, 0, 23, 59, 59, 999);
      const invM = invoices.filter((r) => inRange(new Date(r.invoiceDate), mStart, mEnd));
      const cnM = creditNotes.filter((r) => inRange(new Date(r.creditNoteDate), mStart, mEnd));
      const sdnM = salesDebitNotes.filter((r) => inRange(new Date(r.debitNoteDate), mStart, mEnd));
      const purM = purchases.filter((r) => inRange(new Date(r.purchaseDate), mStart, mEnd));
      const dnM = debitNotes.filter((r) => inRange(new Date(r.debitNoteDate), mStart, mEnd));
      const outM = addTax(subTax(sumTax(invM), sumTax(cnM)), sumTax(sdnM));
      const itcM = subTax(sumTax(purM), sumTax(dnM));
      monthlyBreakdown.push({
        month: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
        outward: money(outM),
        itc: money(itcM),
        taxPayable: {
          cgst: Math.max(0, Math.round((outM.cgst - itcM.cgst) * 100) / 100),
          sgst: Math.max(0, Math.round((outM.sgst - itcM.sgst) * 100) / 100),
          igst: Math.max(0, Math.round((outM.igst - itcM.igst) * 100) / 100),
          cess: Math.max(0, Math.round((outM.cess - itcM.cess) * 100) / 100),
        },
        invoiceCount: invM.length,
        purchaseCount: purM.length,
      });
    }

    const hsnAnnual = [...hsnMap.values()].map((row) => ({
      hsn: row.hsn,
      description: row.description,
      qty: Math.round(Number(row.qty) * 1000) / 1000,
      taxableValue: Math.round(Number(row.taxableValue) * 100) / 100,
      cgst: Math.round(Number(row.cgst) * 100) / 100,
      sgst: Math.round(Number(row.sgst) * 100) / 100,
      igst: Math.round(Number(row.igst) * 100) / 100,
      cess: Math.round(Number(row.cess) * 100) / 100,
    }));

    res.json({
      success: true,
      data: {
        period: { fy: fyLabel, from: fromDate, to: toDate },
        notes:
          'Books-only GSTR-9 worksheet from invoices/purchases/notes. Not a portal filing JSON.',
        table4_outward: {
          b2b: money(b2b),
          b2cl: money(b2cl),
          b2cs: money(b2cs),
          cdnr: money(cdnr),
          cdnur: money(cdnur),
          salesDebitNotes: money(salesDnTax),
          net: money(outwardNet),
          reverseChargeFlagged: money(rcmOutward),
          interStateUnregisteredTaxable: Math.round(interStateUnregistered * 100) / 100,
        },
        table5_nilExempt: {
          nilRated: money({
            taxable: nilExempt.nilRated,
            cgst: 0,
            sgst: 0,
            igst: 0,
            cess: 0,
          }),
          exempt: money({
            taxable: nilExempt.exempt,
            cgst: 0,
            sgst: 0,
            igst: 0,
            cess: 0,
          }),
          nonGst: money({
            taxable: nilExempt.nonGst,
            cgst: 0,
            sgst: 0,
            igst: 0,
            cess: 0,
          }),
          note: 'Outward — from invoice/CN/sales-DN line gstSupplyType (NIL_RATED / EXEMPT / NON_GST); tax always zero',
        },
        table5_inwardNilExempt: (() => {
          let inward = { nilRated: 0, exempt: 0, nonGst: 0 };
          for (const p of purchases) {
            const parts = sumNilExemptFromItems(p.items as DocItem[], 1);
            inward.nilRated += parts.nilRated;
            inward.exempt += parts.exempt;
            inward.nonGst += parts.nonGst;
          }
          for (const dn of debitNotes) {
            const parts = sumNilExemptFromItems(dn.items as DocItem[], -1);
            inward.nilRated += parts.nilRated;
            inward.exempt += parts.exempt;
            inward.nonGst += parts.nonGst;
          }
          const r = (n: number) => Math.round(Math.max(0, n) * 100) / 100;
          return {
            nilRated: money({ taxable: r(inward.nilRated), cgst: 0, sgst: 0, igst: 0, cess: 0 }),
            exempt: money({ taxable: r(inward.exempt), cgst: 0, sgst: 0, igst: 0, cess: 0 }),
            nonGst: money({ taxable: r(inward.nonGst), cgst: 0, sgst: 0, igst: 0, cess: 0 }),
            note: 'Inward — from purchase/DN line gstSupplyType',
          };
        })(),
        table6_itc: {
          purchases: money(purchaseIn),
          debitNotes: money(dnIn),
          net: money(itcNet),
        },
        table9_taxPaidApprox: taxPayable,
        hsnAnnual,
        monthlyBreakdown,
        documentCounts: {
          invoices: invoices.length,
          creditNotes: creditNotes.length,
          salesDebitNotes: salesDebitNotes.length,
          purchases: purchases.length,
          debitNotes: debitNotes.length,
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr9 error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute GSTR-9' });
  }
}

/**
 * GET /api/admin/reports/cmp-08?quarter=2025-26-Q1&rate=1
 * Composition quarterly books worksheet (CMP-08 / legacy GSTR-4 style). Not portal filing.
 */
export async function cmp08(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = req.auth?.tenantId;
    const { fromDate, toDate, quarterLabel, fyLabel, quarter } = defaultFyQuarterRange(req);
    const rateRaw = Number(req.query.rate ?? 1);
    const compositionRatePercent =
      rateRaw === 1 || rateRaw === 5 || rateRaw === 6 ? rateRaw : 1;

    const isComposition = await companyIsComposition({ userId, tenantId });

    const [invoices, creditNotes, salesDebitNotes, purchases] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          ...invoiceScope(req),
          invoiceType: 'INVOICE',
          invoiceDate: { gte: fromDate, lte: toDate },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
        select: {
          invoiceDate: true,
          items: true,
          vat: true,
          taxableAmount: true,
          TotalAmount: true,
          billToCustomer: { select: { gstin: true } },
        },
      }),
      prisma.creditNote.findMany({
        where: {
          ...userDocScope(req),
          creditNoteDate: { gte: fromDate, lte: toDate },
          status: { not: 'CANCELLED' },
        },
        select: { creditNoteDate: true, items: true, vat: true, taxableAmount: true },
      }),
      prisma.salesDebitNote.findMany({
        where: {
          ...userDocScope(req),
          debitNoteDate: { gte: fromDate, lte: toDate },
          status: { not: 'CANCELLED' },
        },
        select: {
          debitNoteDate: true,
          items: true,
          vat: true,
          taxableAmount: true,
          billToCustomer: { select: { gstin: true } },
        },
      }),
      prisma.purchase.findMany({
        where: {
          ...userDocScope(req),
          purchaseDate: { gte: fromDate, lte: toDate },
          status: { not: 'cancelled' },
        },
        select: {
          purchaseDate: true,
          items: true,
          taxableAmount: true,
          totalTax: true,
          isReverseCharge: true,
        },
      }),
    ]);

    const taxableBaseFromDoc = (
      items: DocItem[] | null | undefined,
      fallbackTaxable: unknown,
    ): number => {
      const taxableItems = taxableSupplyItems(items);
      if (taxableItems.length === 0) return Number(fallbackTaxable ?? 0);
      return taxableItems.reduce((s, it) => {
        const qty = Number(it.qty ?? 0);
        const rate = Number(it.rate ?? 0);
        const discount = Number(it.discount ?? 0);
        return s + Math.max(0, qty * rate - discount);
      }, 0);
    };

    let outwardTaxable = 0;
    let b2bTaxable = 0;
    let b2cTaxable = 0;
    let nilExempt = { nilRated: 0, exempt: 0, nonGst: 0 };

    for (const inv of invoices) {
      const items = inv.items as DocItem[];
      const nilParts = sumNilExemptFromItems(items, 1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;
      const base = taxableBaseFromDoc(items, inv.taxableAmount);
      outwardTaxable += base;
      if ((inv.billToCustomer?.gstin || '').trim()) b2bTaxable += base;
      else b2cTaxable += base;
    }

    for (const cn of creditNotes) {
      const items = cn.items as DocItem[];
      const nilParts = sumNilExemptFromItems(items, -1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;
      outwardTaxable -= taxableBaseFromDoc(items, cn.taxableAmount);
    }

    // Sales debit notes increase composition taxable turnover (same net as GSTR-3B/9)
    for (const sdn of salesDebitNotes) {
      const items = sdn.items as DocItem[];
      const nilParts = sumNilExemptFromItems(items, 1);
      nilExempt.nilRated += nilParts.nilRated;
      nilExempt.exempt += nilParts.exempt;
      nilExempt.nonGst += nilParts.nonGst;
      const base = taxableBaseFromDoc(items, sdn.taxableAmount);
      outwardTaxable += base;
      if ((sdn.billToCustomer?.gstin || '').trim()) b2bTaxable += base;
      else b2cTaxable += base;
    }

    const normalPurchases = purchases.filter((p) => !p.isReverseCharge);
    const rcmPurchases = purchases.filter((p) => p.isReverseCharge);
    const purchaseTaxable = normalPurchases.reduce(
      (s, p) => s + Number(p.taxableAmount ?? 0),
      0,
    );
    const rcmTaxable = rcmPurchases.reduce((s, p) => s + Number(p.taxableAmount ?? 0), 0);

    const round = (n: number) => Math.round(n * 100) / 100;
    const turnover = Math.max(0, outwardTaxable);
    const taxAmount = round((turnover * compositionRatePercent) / 100);
    const half = round(taxAmount / 2);

    const monthlyBreakdown: Array<{
      month: string;
      outwardTaxable: number;
      invoiceCount: number;
      creditNoteCount: number;
      salesDebitNoteCount: number;
      purchaseCount: number;
    }> = [];
    for (let i = 0; i < 3; i++) {
      const mStart = new Date(fromDate.getFullYear(), fromDate.getMonth() + i, 1, 0, 0, 0, 0);
      const mEnd = new Date(fromDate.getFullYear(), fromDate.getMonth() + i + 1, 0, 23, 59, 59, 999);
      const invM = invoices.filter((r) => {
        const t = new Date(r.invoiceDate).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      });
      const cnM = creditNotes.filter((r) => {
        const t = new Date(r.creditNoteDate).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      });
      const sdnM = salesDebitNotes.filter((r) => {
        const t = new Date(r.debitNoteDate).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      });
      const purM = purchases.filter((r) => {
        const t = new Date(r.purchaseDate).getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      });
      let monthOut = 0;
      for (const inv of invM) {
        monthOut += taxableBaseFromDoc(inv.items as DocItem[], inv.taxableAmount);
      }
      for (const cn of cnM) {
        monthOut -= taxableBaseFromDoc(cn.items as DocItem[], cn.taxableAmount);
      }
      for (const sdn of sdnM) {
        monthOut += taxableBaseFromDoc(sdn.items as DocItem[], sdn.taxableAmount);
      }
      monthlyBreakdown.push({
        month: `${mStart.getFullYear()}-${String(mStart.getMonth() + 1).padStart(2, '0')}`,
        outwardTaxable: round(Math.max(0, monthOut)),
        invoiceCount: invM.length,
        creditNoteCount: cnM.length,
        salesDebitNoteCount: sdnM.length,
        purchaseCount: purM.length,
      });
    }

    res.json({
      success: true,
      data: {
        period: {
          quarter: quarterLabel,
          fy: fyLabel,
          quarterNumber: quarter,
          from: fromDate,
          to: toDate,
        },
        isComposition,
        compositionRatePercent,
        notes:
          'Books-only CMP-08 / composition worksheet. Tax = taxable turnover × rate (1%/5%/6%). Not a portal filing JSON; ITC is generally not available under composition.',
        outwardSupplies: {
          taxableTurnover: round(turnover),
          b2bTaxable: round(Math.max(0, b2bTaxable)),
          b2cTaxable: round(Math.max(0, b2cTaxable)),
          nilExempt: {
            nilRated: round(nilExempt.nilRated),
            exempt: round(nilExempt.exempt),
            nonGst: round(nilExempt.nonGst),
          },
          invoiceCount: invoices.length,
          creditNoteCount: creditNotes.length,
          salesDebitNoteCount: salesDebitNotes.length,
        },
        inwardSupplies: {
          purchaseTaxable: round(purchaseTaxable),
          purchaseCount: normalPurchases.length,
          rcmTaxable: round(rcmTaxable),
          rcmPurchaseCount: rcmPurchases.length,
          note: 'Shown for reference — composition dealers typically cannot claim ITC',
        },
        taxPayable: {
          ratePercent: compositionRatePercent,
          taxableTurnover: round(turnover),
          taxAmount,
          cgst: half,
          sgst: round(taxAmount - half),
          igst: 0,
        },
        monthlyBreakdown,
        warnings: isComposition
          ? []
          : [
              'Company is not marked as composition scheme — enable it under Company Settings if this return applies.',
            ],
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('cmp08 error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute CMP-08' });
  }
}

/**
 * GET /api/admin/reports/tds-register?from=&to=
 * Books register of purchases with TDS deducted (not Form 26Q).
 */
export async function tdsRegister(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;

    const purchases = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        purchaseDate: { gte: fromDate, lte: toDate },
        status: { not: 'cancelled' },
        tdsAmount: { gt: 0 },
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        taxableAmount: true,
        totalTax: true,
        totalAmount: true,
        tdsSection: true,
        tdsRatePercent: true,
        tdsAmount: true,
        balanceAmount: true,
        paidAmount: true,
        billToUser: { select: { firstName: true, lastName: true, email: true } },
        vendor: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { purchaseDate: 'asc' },
    });

    const salaryDeductions = await prisma.salaryTdsDeduction.findMany({
      where: {
        isDeleted: false,
        ...tenantOrUserScope(req),
        payDate: { gte: fromDate, lte: toDate },
        tdsAmount: { gt: 0 },
      },
      include: {
        employee: { select: { name: true, pan: true, employeeCode: true } },
      },
      orderBy: { payDate: 'asc' },
    });

    type TdsRow = {
      id: string;
      sourceType: 'PURCHASE' | 'SALARY';
      documentNo: string | null;
      documentDate: string | Date;
      partyName: string;
      section: string;
      ratePercent: number;
      taxableAmount: number;
      totalTax: number;
      grossAmount: number;
      tdsAmount: number;
      netPayable: number;
      paidAmount: number;
      balanceAmount: number;
      // legacy aliases for existing UI
      purchaseId: string | null;
      purchaseDate: string | Date;
      vendorName: string;
    };

    const purchaseRows: TdsRow[] = purchases.map((p) => {
      const gross = Number(p.totalAmount ?? 0);
      const tds = Number(p.tdsAmount ?? 0);
      const vendorName =
        [p.billToUser?.firstName, p.billToUser?.lastName].filter(Boolean).join(' ').trim() ||
        [p.vendor?.firstName, p.vendor?.lastName].filter(Boolean).join(' ').trim() ||
        p.billToUser?.email ||
        p.vendor?.email ||
        '—';
      return {
        id: p.id,
        sourceType: 'PURCHASE' as const,
        documentNo: p.purchaseId,
        documentDate: p.purchaseDate,
        partyName: vendorName,
        section: p.tdsSection || '—',
        ratePercent: Number(p.tdsRatePercent ?? 0),
        taxableAmount: round(Number(p.taxableAmount ?? 0)),
        totalTax: round(Number(p.totalTax ?? 0)),
        grossAmount: round(gross),
        tdsAmount: round(tds),
        netPayable: round(Math.max(0, gross - tds)),
        paidAmount: round(Number(p.paidAmount ?? 0)),
        balanceAmount: round(Number(p.balanceAmount ?? 0)),
        purchaseId: p.purchaseId,
        purchaseDate: p.purchaseDate,
        vendorName,
      };
    });

    const salaryRows: TdsRow[] = salaryDeductions.map((d) => {
      const gross = Number(d.amountPaid);
      const tds = Number(d.tdsAmount);
      const partyName = d.employee.name;
      const documentNo = d.employee.employeeCode || null;
      return {
        id: d.id,
        sourceType: 'SALARY' as const,
        documentNo,
        documentDate: d.payDate,
        partyName,
        section: d.section || '192',
        ratePercent: 0,
        taxableAmount: round(gross),
        totalTax: 0,
        grossAmount: round(gross),
        tdsAmount: round(tds),
        netPayable: round(Math.max(0, gross - tds)),
        paidAmount: round(gross - tds),
        balanceAmount: 0,
        purchaseId: documentNo,
        purchaseDate: d.payDate,
        vendorName: partyName,
      };
    });

    const rows = [...purchaseRows, ...salaryRows].sort(
      (a, b) => new Date(a.documentDate).getTime() - new Date(b.documentDate).getTime(),
    );

    const bySection = new Map<
      string,
      { section: string; count: number; tdsAmount: number; grossAmount: number }
    >();
    for (const r of rows) {
      const key = r.section || '—';
      const cur = bySection.get(key) || { section: key, count: 0, tdsAmount: 0, grossAmount: 0 };
      cur.count += 1;
      cur.tdsAmount += r.tdsAmount;
      cur.grossAmount += r.grossAmount;
      bySection.set(key, cur);
    }

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        notes:
          'Books TDS deduction register from purchases + salary u/s 192. Not Form 24Q/26Q/27Q filing; deposit challans not included here.',
        summary: {
          purchaseCount: purchaseRows.length,
          salaryCount: salaryRows.length,
          rowCount: rows.length,
          totalTds: round(rows.reduce((s, r) => s + r.tdsAmount, 0)),
          totalGross: round(rows.reduce((s, r) => s + r.grossAmount, 0)),
          totalNetPayable: round(rows.reduce((s, r) => s + r.netPayable, 0)),
        },
        bySection: [...bySection.values()].map((s) => ({
          ...s,
          tdsAmount: round(s.tdsAmount),
          grossAmount: round(s.grossAmount),
        })),
        rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('tdsRegister error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute TDS register' });
  }
}

/**
 * GET /api/admin/reports/tcs-register?from=&to=
 * Books register of invoices with TCS collected (not Form 27EQ).
 */
export async function tcsRegister(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);

    const invoices = await prisma.invoice.findMany({
      where: {
        ...invoiceScope(req),
        invoiceType: 'INVOICE',
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        tcsAmount: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        taxableAmount: true,
        vat: true,
        TotalAmount: true,
        tcsSection: true,
        tcsRatePercent: true,
        tcsAmount: true,
        status: true,
        billToCustomer: { select: { name: true, email: true, gstin: true } },
        customer: { select: { name: true, email: true, gstin: true } },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = invoices.map((inv) => {
      const invoiceTotal = Number(inv.TotalAmount ?? 0);
      const tcs = Number(inv.tcsAmount ?? 0);
      const customer =
        inv.billToCustomer?.name ||
        inv.customer?.name ||
        inv.billToCustomer?.email ||
        inv.customer?.email ||
        '—';
      const gstin = inv.billToCustomer?.gstin || inv.customer?.gstin || null;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        customerName: customer,
        customerGstin: gstin,
        status: inv.status,
        section: inv.tcsSection || '—',
        ratePercent: Number(inv.tcsRatePercent ?? 0),
        taxableAmount: round(Number(inv.taxableAmount ?? 0)),
        taxAmount: round(Number(inv.vat ?? 0)),
        invoiceTotal: round(invoiceTotal),
        tcsAmount: round(tcs),
        /** AR / collectible = invoice total + TCS */
        amountWithTcs: round(invoiceTotal + tcs),
      };
    });

    const bySection = new Map<
      string,
      { section: string; count: number; tcsAmount: number; invoiceTotal: number; amountWithTcs: number }
    >();
    for (const r of rows) {
      const key = r.section || '—';
      const cur = bySection.get(key) || {
        section: key,
        count: 0,
        tcsAmount: 0,
        invoiceTotal: 0,
        amountWithTcs: 0,
      };
      cur.count += 1;
      cur.tcsAmount += r.tcsAmount;
      cur.invoiceTotal += r.invoiceTotal;
      cur.amountWithTcs += r.amountWithTcs;
      bySection.set(key, cur);
    }

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        notes:
          'Books TCS collection register from invoices. Not Form 27EQ; deposit challans and collectee PAN not included. GL posts Cr TCS_PAYABLE.',
        summary: {
          invoiceCount: rows.length,
          totalTcs: round(rows.reduce((s, r) => s + r.tcsAmount, 0)),
          totalInvoice: round(rows.reduce((s, r) => s + r.invoiceTotal, 0)),
          totalWithTcs: round(rows.reduce((s, r) => s + r.amountWithTcs, 0)),
        },
        bySection: [...bySection.values()].map((s) => ({
          ...s,
          tcsAmount: round(s.tcsAmount),
          invoiceTotal: round(s.invoiceTotal),
          amountWithTcs: round(s.amountWithTcs),
        })),
        rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('tcsRegister error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute TCS register' });
  }
}

/**
 * GET /api/admin/reports/msme-payables
 * Unpaid purchases matched to MSME-flagged suppliers (by vendor email),
 * highlighting balances open beyond 45 days from due date (MSME Act style).
 */
export async function msmePayables(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const asOf = new Date();
    const daysLimit = Math.max(1, Number(req.query.days ?? 45) || 45);

    // Supplier model uses user_id (not userId).
    const tenantId = req.auth?.tenantId;
    const userId = requireUserId(req);
    const supplierScope = tenantId
      ? { isDeleted: false, isMsme: true, OR: [{ tenantId }, { user_id: userId }] }
      : { isDeleted: false, isMsme: true, user_id: userId };

    const msmeList = await prisma.supplier.findMany({
      where: supplierScope,
      select: { id: true, supplier_name: true, supplier_email: true, msmeUdyam: true, gstin: true },
    });

    const emailSet = new Set(
      msmeList.map((s) => s.supplier_email.trim().toLowerCase()).filter(Boolean),
    );
    const byEmail = new Map(msmeList.map((s) => [s.supplier_email.trim().toLowerCase(), s]));

    const purchases = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        isDeleted: false,
        status: { not: 'cancelled' },
        balanceAmount: { gt: 0 },
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        billToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = [];
    for (const p of purchases) {
      const email = (p.billToUser?.email || '').trim().toLowerCase();
      if (!email || !emailSet.has(email)) continue;
      const msme = byEmail.get(email)!;
      const due = new Date(p.dueDate);
      const daysOpen = Math.floor((asOf.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
      rows.push({
        purchaseId: p.id,
        purchaseNumber: p.purchaseId,
        purchaseDate: p.purchaseDate.toISOString().slice(0, 10),
        dueDate: due.toISOString().slice(0, 10),
        vendorName: `${p.billToUser?.firstName ?? ''} ${p.billToUser?.lastName ?? ''}`.trim(),
        vendorEmail: p.billToUser?.email ?? null,
        supplierId: msme.id,
        supplierName: msme.supplier_name,
        msmeUdyam: msme.msmeUdyam,
        gstin: msme.gstin,
        totalAmount: round(Number(p.totalAmount)),
        paidAmount: round(Number(p.paidAmount)),
        balanceAmount: round(Number(p.balanceAmount)),
        daysPastDue: daysOpen,
        beyondMsmeLimit: daysOpen > daysLimit,
      });
    }

    const overdue = rows.filter((r) => r.beyondMsmeLimit);
    res.json({
      success: true,
      data: {
        asOf: asOf.toISOString().slice(0, 10),
        daysLimit,
        notes:
          'MSME-flagged suppliers matched to unpaid purchases by vendor email. Beyond limit = days past due date > threshold (default 45).',
        summary: {
          msmeSupplierCount: msmeList.length,
          openBillCount: rows.length,
          overdueCount: overdue.length,
          openBalance: round(rows.reduce((s, r) => s + r.balanceAmount, 0)),
          overdueBalance: round(overdue.reduce((s, r) => s + r.balanceAmount, 0)),
        },
        rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('msmePayables error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute MSME payables' });
  }
}

/**
 * GET /api/admin/reports/form-26q?quarter=YYYY-YY-Qn | from=&to=
 * Books worksheet shaped like Form 26Q Annexure I (resident deductees) — not TRACES / e-filing.
 */
export async function form26q(req: Request, res: Response): Promise<void> {
  return formTdsQuarterWorksheet(req, res, { form: '26Q', nonResident: false });
}

/**
 * GET /api/admin/reports/form-27q?quarter=YYYY-YY-Qn | from=&to=
 * Books worksheet shaped like Form 27Q (TDS to non-residents) — not TRACES / e-filing.
 * Distinct from Form 27EQ (TCS).
 */
export async function form27q(req: Request, res: Response): Promise<void> {
  return formTdsQuarterWorksheet(req, res, { form: '27Q', nonResident: true });
}

async function formTdsQuarterWorksheet(
  req: Request,
  res: Response,
  opts: { form: '26Q' | '27Q'; nonResident: boolean },
): Promise<void> {
  const logLabel = opts.form === '26Q' ? 'form26q' : 'form27q';
  try {
    requireUserId(req);
    const { fromDate, toDate, quarterLabel, fyLabel, quarter } = defaultFyQuarterRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;

    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const company = tenantId
      ? await prisma.companySettings.findFirst({
          where: { OR: [{ tenantId }, { userId }] },
          select: { companyName: true, gstin: true, tan: true },
        })
      : await prisma.companySettings.findUnique({
          where: { userId },
          select: { companyName: true, gstin: true, tan: true },
        });

    const allPurchases = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        purchaseDate: { gte: fromDate, lte: toDate },
        status: { not: 'cancelled' },
        tdsAmount: { gt: 0 },
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        taxableAmount: true,
        totalAmount: true,
        tdsSection: true,
        tdsRatePercent: true,
        tdsAmount: true,
        billToUser: { select: { firstName: true, lastName: true, email: true } },
        vendor: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { purchaseDate: 'asc' },
    });

    const supplierWhere: { isDeleted: boolean; OR?: Array<{ tenantId: string } | { user_id: string }> } =
      {
        isDeleted: false,
        OR: tenantId
          ? [{ tenantId }, { user_id: userId }]
          : [{ user_id: userId }],
      };
    const suppliers = await prisma.supplier.findMany({
      where: supplierWhere,
      select: { supplier_email: true, supplier_name: true, pan: true, isNonResident: true },
    });
    const panByEmail = new Map<string, string>();
    const panByName = new Map<string, string>();
    const nrByEmail = new Set<string>();
    const nrByName = new Set<string>();
    for (const s of suppliers) {
      const email = (s.supplier_email || '').trim().toLowerCase();
      const nameKey = (s.supplier_name || '').trim().toLowerCase();
      if (s.isNonResident) {
        if (email) nrByEmail.add(email);
        if (nameKey) nrByName.add(nameKey);
      }
      if (!s.pan) continue;
      if (email) panByEmail.set(email, s.pan);
      if (nameKey) panByName.set(nameKey, s.pan);
    }

    const purchaseDeducteeMeta = (p: (typeof allPurchases)[number]) => {
      const name =
        [p.billToUser?.firstName, p.billToUser?.lastName].filter(Boolean).join(' ').trim() ||
        [p.vendor?.firstName, p.vendor?.lastName].filter(Boolean).join(' ').trim() ||
        p.billToUser?.email ||
        p.vendor?.email ||
        '—';
      const email = (p.vendor?.email || p.billToUser?.email || '').trim().toLowerCase();
      const isNonResident =
        (email && nrByEmail.has(email)) || nrByName.has(name.trim().toLowerCase());
      return { name, email, isNonResident };
    };

    const purchases = allPurchases.filter((p) => {
      const { isNonResident } = purchaseDeducteeMeta(p);
      return opts.nonResident ? isNonResident : !isNonResident;
    });

    const companyTan = company?.tan?.trim() || null;
    const challans = await loadTaxDepositChallansForQuarter(req, 'TDS', fyLabel, quarter);
    const taxByDocument = new Map(
      purchases.map((p) => [p.id, round(Number(p.tdsAmount ?? 0))] as const),
    );
    const {
      allocationSummary,
      allocationBlockers,
      challanNosByDocument,
      allocatedByDocument,
    } = allocationReadiness(
      challans,
      purchases.map((p) => p.id),
      taxByDocument,
      'TDS',
    );

    const annexureI = purchases.map((p, idx) => {
      const { name, email } = purchaseDeducteeMeta(p);
      const deducteePan =
        (email && panByEmail.get(email)) ||
        panByName.get(name.trim().toLowerCase()) ||
        null;
      const amountPaid = round(Number(p.totalAmount ?? p.taxableAmount ?? 0));
      const tds = round(Number(p.tdsAmount ?? 0));
      const allocatedAmount = round(allocatedByDocument.get(p.id) ?? 0);
      return {
        sno: idx + 1,
        deducteeName: name,
        deducteePan,
        panMissing: !deducteePan,
        section: p.tdsSection || '—',
        amountPaidOrCredited: amountPaid,
        tdsAmount: tds,
        allocatedAmount,
        unmappedAmount: round(Math.max(0, tds - allocatedAmount)),
        challanNos: challanNosByDocument.get(p.id) || [],
        ratePercent: Number(p.tdsRatePercent ?? 0),
        dateOfCreditOrPayment: p.purchaseDate,
        documentNo: p.purchaseId,
        documentId: p.id,
      };
    });

    const bySection = new Map<
      string,
      { section: string; deducteeCount: number; amountPaidOrCredited: number; tdsAmount: number }
    >();
    for (const r of annexureI) {
      const cur = bySection.get(r.section) || {
        section: r.section,
        deducteeCount: 0,
        amountPaidOrCredited: 0,
        tdsAmount: 0,
      };
      cur.deducteeCount += 1;
      cur.amountPaidOrCredited += r.amountPaidOrCredited;
      cur.tdsAmount += r.tdsAmount;
      bySection.set(r.section, cur);
    }

    const panMissingCount = annexureI.filter((r) => r.panMissing).length;
    const totalTds = round(annexureI.reduce((s, r) => s + r.tdsAmount, 0));
    const { challanSummary, challanBlockers } = challanReadiness(challans, totalTds, 'TDS');

    const blockers: string[] = [];
    if (!companyTan) {
      blockers.push(
        `Company TAN is not captured in settings — required for Form ${opts.form} e-filing`,
      );
    }
    if (panMissingCount > 0) {
      blockers.push(
        `${panMissingCount} deductee row(s) missing supplier PAN — Annexure I incomplete`,
      );
    }
    blockers.push(...challanBlockers);
    blockers.push(...allocationBlockers);
    blockers.push(
      'This is a books worksheet only — not a substitute for TRACES / income-tax e-filing',
    );

    const notes =
      opts.form === '26Q'
        ? 'Form 26Q–style books worksheet from purchase TDS to resident deductees (supplier.isNonResident = false) with challan→line mapping. Not TRACES filing.'
        : 'Form 27Q–style books worksheet from purchase TDS to non-resident deductees (supplier.isNonResident). Distinct from Form 27EQ (TCS). Not TRACES filing.';

    res.json({
      success: true,
      data: {
        form: opts.form,
        period: {
          fy: fyLabel,
          quarter: quarterLabel,
          quarterNumber: quarter,
          from: fromDate,
          to: toDate,
        },
        deductor: {
          name: company?.companyName || '—',
          gstin: company?.gstin || null,
          tan: companyTan,
        },
        notes,
        warnings: blockers,
        readiness: { canFile: false, blockers },
        summary: {
          deducteeRowCount: annexureI.length,
          panMissingCount,
          totalAmountPaidOrCredited: round(
            annexureI.reduce((s, r) => s + r.amountPaidOrCredited, 0),
          ),
          totalTds,
        },
        challanSummary,
        allocationSummary,
        challans,
        bySection: [...bySection.values()].map((s) => ({
          ...s,
          amountPaidOrCredited: round(s.amountPaidOrCredited),
          tdsAmount: round(s.tdsAmount),
        })),
        annexureI,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error(`${logLabel} error:`, err);
    res.status(500).json({
      success: false,
      message: `Failed to compute Form ${opts.form} worksheet`,
    });
  }
}

/**
 * GET /api/admin/reports/form-27eq?quarter=YYYY-YY-Qn | from=&to=
 * Books worksheet shaped like Form 27EQ (TCS) — not e-filing.
 */
export async function form27eq(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fromDate, toDate, quarterLabel, fyLabel, quarter } = defaultFyQuarterRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;

    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const company = tenantId
      ? await prisma.companySettings.findFirst({
          where: { OR: [{ tenantId }, { userId }] },
          select: { companyName: true, gstin: true, tan: true },
        })
      : await prisma.companySettings.findUnique({
          where: { userId },
          select: { companyName: true, gstin: true, tan: true },
        });

    const invoices = await prisma.invoice.findMany({
      where: {
        ...invoiceScope(req),
        invoiceType: 'INVOICE',
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        tcsAmount: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        taxableAmount: true,
        TotalAmount: true,
        tcsSection: true,
        tcsRatePercent: true,
        tcsAmount: true,
        billToCustomer: { select: { name: true, email: true, gstin: true, pan: true } },
        customer: { select: { name: true, email: true, gstin: true, pan: true } },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    const companyTan = company?.tan?.trim() || null;
    const challans = await loadTaxDepositChallansForQuarter(req, 'TCS', fyLabel, quarter);
    const taxByDocument = new Map(
      invoices.map((inv) => [inv.id, round(Number(inv.tcsAmount ?? 0))] as const),
    );
    const {
      allocationSummary,
      allocationBlockers,
      challanNosByDocument,
      allocatedByDocument,
    } = allocationReadiness(
      challans,
      invoices.map((inv) => inv.id),
      taxByDocument,
      'TCS',
    );

    const annexure = invoices.map((inv, idx) => {
      const collecteeName =
        inv.billToCustomer?.name ||
        inv.customer?.name ||
        inv.billToCustomer?.email ||
        inv.customer?.email ||
        '—';
      const collecteePan = inv.billToCustomer?.pan || inv.customer?.pan || null;
      const amountReceived = round(Number(inv.TotalAmount ?? inv.taxableAmount ?? 0));
      const tcs = round(Number(inv.tcsAmount ?? 0));
      const allocatedAmount = round(allocatedByDocument.get(inv.id) ?? 0);
      return {
        sno: idx + 1,
        collecteeName,
        collecteePan,
        collecteeGstin: inv.billToCustomer?.gstin || inv.customer?.gstin || null,
        panMissing: !collecteePan,
        section: inv.tcsSection || '—',
        amountReceivedOrDebited: amountReceived,
        tcsAmount: tcs,
        allocatedAmount,
        unmappedAmount: round(Math.max(0, tcs - allocatedAmount)),
        challanNos: challanNosByDocument.get(inv.id) || [],
        ratePercent: Number(inv.tcsRatePercent ?? 0),
        dateOfReceiptOrDebit: inv.invoiceDate,
        documentNo: inv.invoiceNumber,
        documentId: inv.id,
      };
    });

    const bySection = new Map<
      string,
      { section: string; collecteeCount: number; amountReceivedOrDebited: number; tcsAmount: number }
    >();
    for (const r of annexure) {
      const cur = bySection.get(r.section) || {
        section: r.section,
        collecteeCount: 0,
        amountReceivedOrDebited: 0,
        tcsAmount: 0,
      };
      cur.collecteeCount += 1;
      cur.amountReceivedOrDebited += r.amountReceivedOrDebited;
      cur.tcsAmount += r.tcsAmount;
      bySection.set(r.section, cur);
    }

    const panMissingCount = annexure.filter((r) => r.panMissing).length;
    const totalTcs = round(annexure.reduce((s, r) => s + r.tcsAmount, 0));
    const { challanSummary, challanBlockers } = challanReadiness(challans, totalTcs, 'TCS');

    const blockers: string[] = [];
    if (!companyTan) {
      blockers.push('Company TAN is not captured in settings — required for Form 27EQ e-filing');
    }
    if (panMissingCount > 0) {
      blockers.push(`${panMissingCount} collectee row(s) missing customer PAN — annexure incomplete`);
    }
    blockers.push(...challanBlockers);
    blockers.push(...allocationBlockers);
    blockers.push(
      'This is a books worksheet only — not a substitute for TRACES / income-tax e-filing',
    );

    res.json({
      success: true,
      data: {
        form: '27EQ',
        period: {
          fy: fyLabel,
          quarter: quarterLabel,
          quarterNumber: quarter,
          from: fromDate,
          to: toDate,
        },
        collector: {
          name: company?.companyName || '—',
          gstin: company?.gstin || null,
          tan: companyTan,
        },
        notes:
          'Form 27EQ–style books worksheet from invoice TCS with challan→collectee line mapping. Not TRACES filing.',
        warnings: blockers,
        readiness: { canFile: false, blockers },
        summary: {
          collecteeRowCount: annexure.length,
          panMissingCount,
          totalAmountReceivedOrDebited: round(
            annexure.reduce((s, r) => s + r.amountReceivedOrDebited, 0),
          ),
          totalTcs,
        },
        challanSummary,
        allocationSummary,
        challans,
        bySection: [...bySection.values()].map((s) => ({
          ...s,
          amountReceivedOrDebited: round(s.amountReceivedOrDebited),
          tcsAmount: round(s.tcsAmount),
        })),
        annexure,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('form27eq error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute Form 27EQ worksheet' });
  }
}

/**
 * GET /api/admin/reports/it-wdv?fy=YYYY-YY
 * Income-tax WDV block schedule (books worksheet) — not ITR Schedule DPM / filing.
 */
export async function itWdv(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;

    const assets = await prisma.fixedAsset.findMany({
      where: {
        isDeleted: false,
        status: { not: 'disposed' },
        AND: [{ OR: tenantOrUserScope(req).OR }],
        acquisitionDate: { lte: toDate },
      },
      orderBy: [{ itBlock: 'asc' }, { name: 'asc' }],
    });

    type Row = {
      assetId: string;
      name: string;
      itBlock: string;
      itRatePercent: number;
      acquisitionDate: string;
      openingWdv: number;
      additions: number;
      putToUseHalfYear: boolean;
      depreciation: number;
      closingWdv: number;
      missingItFields: boolean;
    };

    const rows: Row[] = [];
    for (const a of assets) {
      const it = computeItWdvForFy(
        {
          acquisitionDate: a.acquisitionDate,
          cost: Number(a.cost),
          itOpeningWdv: a.itOpeningWdv != null ? Number(a.itOpeningWdv) : null,
          itBlock: a.itBlock,
          itRatePercent: a.itRatePercent != null ? Number(a.itRatePercent) : null,
        },
        fromDate,
        toDate,
      );
      if (!it.inPeriod) continue;
      rows.push({
        assetId: a.id,
        name: a.name,
        itBlock: it.itBlock,
        itRatePercent: it.itRatePercent,
        acquisitionDate: a.acquisitionDate.toISOString().slice(0, 10),
        openingWdv: it.openingWdv,
        additions: it.additions,
        putToUseHalfYear: it.putToUseHalfYear,
        depreciation: it.depreciation,
        closingWdv: it.closingWdv,
        missingItFields: it.missingItFields,
      });
    }

    const byBlock = new Map<
      string,
      {
        itBlock: string;
        ratePercent: number;
        openingWdv: number;
        additions: number;
        depreciation: number;
        closingWdv: number;
        assetCount: number;
      }
    >();
    for (const r of rows) {
      const cur = byBlock.get(r.itBlock) || {
        itBlock: r.itBlock,
        ratePercent: r.itRatePercent,
        openingWdv: 0,
        additions: 0,
        depreciation: 0,
        closingWdv: 0,
        assetCount: 0,
      };
      cur.openingWdv += r.openingWdv;
      cur.additions += r.additions;
      cur.depreciation += r.depreciation;
      cur.closingWdv += r.closingWdv;
      cur.assetCount += 1;
      if (r.itRatePercent > 0) cur.ratePercent = r.itRatePercent;
      byBlock.set(r.itBlock, cur);
    }

    const missingCount = rows.filter((r) => r.missingItFields).length;
    const blockers = [
      'This is a books WDV worksheet only — not ITR Schedule DPM / income-tax e-filing',
    ];
    if (missingCount > 0) {
      blockers.unshift(
        `${missingCount} asset(s) missing IT block and/or rate — depreciation shown as ₹0 for those rows`,
      );
    }

    res.json({
      success: true,
      data: {
        form: 'IT-WDV',
        period: { fy: fyLabel, from: fromDate, to: toDate },
        notes:
          'Income-tax WDV schedule by block. Half-year rate when put to use on/after 1 Oct of the FY. Books worksheet only — not a substitute for tax computation / ITR.',
        warnings: blockers,
        readiness: { canFile: false, blockers },
        summary: {
          assetCount: rows.length,
          missingItFieldsCount: missingCount,
          openingWdv: round(rows.reduce((s, r) => s + r.openingWdv, 0)),
          additions: round(rows.reduce((s, r) => s + r.additions, 0)),
          depreciation: round(rows.reduce((s, r) => s + r.depreciation, 0)),
          closingWdv: round(rows.reduce((s, r) => s + r.closingWdv, 0)),
        },
        byBlock: [...byBlock.values()].map((b) => ({
          ...b,
          openingWdv: round(b.openingWdv),
          additions: round(b.additions),
          depreciation: round(b.depreciation),
          closingWdv: round(b.closingWdv),
        })),
        assets: rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('itWdv error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute IT WDV worksheet' });
  }
}

async function loadClause34Worksheet(
  req: Request,
  fromDate: Date,
  toDate: Date,
  fyLabel: string,
) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const scope = userDocScope(req);
  const nrEmails = await loadNrEmailSet(req);

  const [purchases, salaryRows, invoices, challans, filingRows] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        ...scope,
        isDeleted: false,
        status: { not: 'cancelled' },
        purchaseDate: { gte: fromDate, lte: toDate },
        tdsAmount: { gt: 0 },
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        tdsSection: true,
        tdsAmount: true,
        billToUser: { select: { firstName: true, lastName: true, email: true } },
        vendor: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { purchaseDate: 'asc' },
      take: 3000,
    }),
    prisma.salaryTdsDeduction.findMany({
      where: {
        isDeleted: false,
        ...tenantOrUserFilter(req),
        payDate: { gte: fromDate, lte: toDate },
        tdsAmount: { gt: 0 },
      },
      select: {
        id: true,
        payDate: true,
        tdsAmount: true,
        section: true,
        employee: { select: { name: true, employeeCode: true } },
      },
      orderBy: { payDate: 'asc' },
      take: 3000,
    }),
    prisma.invoice.findMany({
      where: {
        ...invoiceScope(req),
        invoiceType: 'INVOICE',
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        tcsAmount: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        tcsSection: true,
        tcsAmount: true,
        billToCustomer: { select: { name: true } },
        customer: { select: { name: true } },
      },
      orderBy: { invoiceDate: 'asc' },
      take: 3000,
    }),
    prisma.taxDepositChallan.findMany({
      where: {
        isDeleted: false,
        AND: [{ OR: tenantOrUserScope(req).OR }],
        depositDate: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        kind: true,
        amount: true,
        allocations: { select: { amount: true } },
      },
      take: 2000,
    }),
    prisma.tdsTcsReturnFiling.findMany({
      where: {
        isDeleted: false,
        fyLabel,
        ...tenantOrUserScope(req),
      },
      select: {
        id: true,
        form: true,
        quarter: true,
        isFiled: true,
        filedDate: true,
        acknowledgementNo: true,
        notes: true,
      },
      take: 64,
    }),
  ]);

  const purchaseIds = purchases.map((p) => p.id);
  const salaryIds = salaryRows.map((d) => d.id);
  const invoiceIds = invoices.map((i) => i.id);
  const allocated = new Map<string, number>();

  const allocFilters: Array<{ sourceType: 'PURCHASE' | 'SALARY' | 'INVOICE'; sourceId: { in: string[] } }> =
    [];
  if (purchaseIds.length) allocFilters.push({ sourceType: 'PURCHASE', sourceId: { in: purchaseIds } });
  if (salaryIds.length) allocFilters.push({ sourceType: 'SALARY', sourceId: { in: salaryIds } });
  if (invoiceIds.length) allocFilters.push({ sourceType: 'INVOICE', sourceId: { in: invoiceIds } });

  if (allocFilters.length > 0) {
    const allocs = await prisma.taxDepositChallanAllocation.findMany({
      where: {
        ...tenantOrUserFilter(req),
        OR: allocFilters,
      },
      select: { sourceId: true, amount: true },
      take: 8000,
    });
    for (const a of allocs) {
      allocated.set(a.sourceId, round((allocated.get(a.sourceId) || 0) + Number(a.amount)));
    }
  }

  const lines: Clause34Line[] = [];

  for (const p of purchases) {
    const email = (p.billToUser?.email || p.vendor?.email || '').trim().toLowerCase();
    const partyName =
      [p.billToUser?.firstName, p.billToUser?.lastName].filter(Boolean).join(' ').trim() ||
      [p.vendor?.firstName, p.vendor?.lastName].filter(Boolean).join(' ').trim() ||
      p.billToUser?.email ||
      p.vendor?.email ||
      '—';
    lines.push(
      buildClause34Line({
        form: clause34FormForPurchase(email ? nrEmails.has(email) : false),
        sourceType: 'PURCHASE',
        sourceId: p.id,
        docNumber: p.purchaseId,
        date: p.purchaseDate,
        section: p.tdsSection,
        partyName,
        deducted: Number(p.tdsAmount ?? 0),
        deposited: allocated.get(p.id) || 0,
      }),
    );
  }

  for (const d of salaryRows) {
    lines.push(
      buildClause34Line({
        form: clause34FormForSalary(),
        sourceType: 'SALARY',
        sourceId: d.id,
        docNumber: d.employee.employeeCode || null,
        date: d.payDate,
        section: d.section,
        partyName: d.employee.name,
        deducted: Number(d.tdsAmount),
        deposited: allocated.get(d.id) || 0,
      }),
    );
  }

  for (const inv of invoices) {
    lines.push(
      buildClause34Line({
        form: clause34FormForInvoiceTcs(),
        sourceType: 'INVOICE',
        sourceId: inv.id,
        docNumber: inv.invoiceNumber,
        date: inv.invoiceDate,
        section: inv.tcsSection,
        partyName: inv.billToCustomer?.name || inv.customer?.name || '—',
        deducted: Number(inv.tcsAmount ?? 0),
        deposited: allocated.get(inv.id) || 0,
      }),
    );
  }

  lines.sort((a, b) => a.date.localeCompare(b.date) || a.form.localeCompare(b.form));

  let challanDepositTotal = 0;
  let challanAllocatedTotal = 0;
  for (const c of challans) {
    const amt = Number(c.amount);
    const allocSum = c.allocations.reduce((s, a) => s + Number(a.amount), 0);
    challanDepositTotal = round(challanDepositTotal + amt);
    challanAllocatedTotal = round(challanAllocatedTotal + allocSum);
  }
  const challanUnallocatedTotal = round(Math.max(0, challanDepositTotal - challanAllocatedTotal));

  const summary = summarizeClause34(lines);
  const byFormQuarter = rollupClause34ByFormQuarter(lines);

  const filings: Clause34bFilingRecord[] = filingRows
    .filter((f) => isClause34Form(f.form) && isClause34Quarter(f.quarter))
    .map((f) => ({
      id: f.id,
      form: f.form,
      quarter: f.quarter,
      isFiled: f.isFiled,
      filedDate: f.filedDate ? f.filedDate.toISOString().slice(0, 10) : null,
      acknowledgementNo: f.acknowledgementNo,
      notes: f.notes,
    }));

  const clause34b = mergeClause34bBuckets(byFormQuarter, filings);

  return {
    summary: {
      ...summary,
      challanDepositTotal,
      challanAllocatedTotal,
      challanUnallocatedTotal,
    },
    byFormQuarter,
    clause34b,
    lines,
  };
}

/**
 * GET /api/admin/reports/clause-34-tds?fy=YYYY-YY
 * Form 3CD–style cl. 34(a)/(b): deducted vs deposited + return-filed books flags — not TRACES / e-TDS.
 */
export async function clause34Tds(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const data = await loadClause34Worksheet(req, fromDate, toDate, fyLabel);

    const blockers = [
      'Books deducted vs challan allocation only — not TRACES / CPC / e-TDS filing',
      'Shortfall is deposit-map gap; §40(a)(ia)/(i) worksheets cover putative disallowance separately',
      'Clause 34(b) isFiled flags are books tags only — not CPC / TRACES filing proof',
    ];

    res.json({
      success: true,
      data: {
        form: 'CLAUSE-34-TDS',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        notes:
          'Clause 34(a)/(b) books worksheet: TDS/TCS deducted vs challan allocations, plus return-filed flags by form×quarter. Pack 34(a)=shortfall, 34(b)=unfiled count. Not Form 3CD e-filing / TRACES.',
        warnings: blockers,
        readiness: { canFile: false, blockers },
        summary: data.summary,
        byFormQuarter: data.byFormQuarter,
        clause34b: data.clause34b,
        relatedPaths: {
          tdsRegister: '/admin/accounting/reports/tds-register',
          taxDepositChallans: '/admin/accounting/reports/tax-deposit-challans',
          section40Aia: '/admin/accounting/reports/section-40a-ia-disallowance',
          taxAuditPack: '/admin/accounting/reports/tax-audit-pack',
        },
        lines: data.lines,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('clause34Tds error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute clause 34 TDS worksheet' });
  }
}

/**
 * GET /api/admin/reports/books-vs-it-depreciation?fy=YYYY-YY
 * Books SLM vs IT block depreciation difference — Form 3CD–style cl. 13/18 worksheet, not Schedule DPM.
 */
export async function booksVsItDepreciation(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);

    const assets = await prisma.fixedAsset.findMany({
      where: {
        isDeleted: false,
        status: { not: 'disposed' },
        AND: [{ OR: tenantOrUserScope(req).OR }],
        acquisitionDate: { lte: toDate },
      },
      orderBy: [{ itBlock: 'asc' }, { name: 'asc' }],
    });

    const rows = buildBooksVsItRows(
      assets.map((a) => ({
        id: a.id,
        name: a.name,
        cost: Number(a.cost),
        salvageValue: Number(a.salvageValue),
        usefulLifeMonths: a.usefulLifeMonths,
        acquisitionDate: a.acquisitionDate,
        accumulatedDepreciation: Number(a.accumulatedDepreciation),
        itOpeningWdv: a.itOpeningWdv != null ? Number(a.itOpeningWdv) : null,
        itBlock: a.itBlock,
        itRatePercent: a.itRatePercent != null ? Number(a.itRatePercent) : null,
      })),
      fromDate,
      toDate,
    );
    const summary = summarizeBooksVsIt(rows);

    const blockers = [
      'Books SLM proxy vs IT block WDV only — not ITR Schedule DPM / Form 3CD e-filing',
      'Difference is reconciliation only — not auto-disallowance / AO §32 determination',
    ];
    if (summary.missingItFieldsCount > 0) {
      blockers.unshift(
        `${summary.missingItFieldsCount} asset(s) missing IT block and/or rate — IT dep shown as ₹0 for those rows`,
      );
    }

    res.json({
      success: true,
      data: {
        form: 'BOOKS-VS-IT-DEP',
        period: { fy: fyLabel, from: fromDate, to: toDate },
        notes:
          'Compares books straight-line FY depreciation (from FixedAsset cost/life/accum) to IT Act block WDV depreciation. Pack cl. 13/18 amount = IT depreciation. Not Schedule DPM / Form 3CD.',
        warnings: blockers,
        readiness: { canFile: false, blockers },
        summary,
        relatedPaths: {
          itWdv: '/admin/accounting/reports/it-wdv',
          taxAuditPack: '/admin/accounting/reports/tax-audit-pack',
        },
        assets: rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('booksVsItDepreciation error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to compute books vs IT depreciation worksheet',
    });
  }
}

/**
 * GET /api/admin/reports/tax-audit-classification?fy=YYYY-YY
 * Expense + income books classification by category taxClass — not Form 3CD / tax-audit filing.
 */
export async function taxAuditClassification(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const scope = userDocScope(req);

    type ExpClass = 'ALLOWABLE' | 'DISALLOWABLE' | 'CAPITAL' | 'PERSONAL' | 'UNCLASSIFIED';
    type IncClass = 'BUSINESS' | 'EXEMPT' | 'CAPITAL' | 'OTHER' | 'UNCLASSIFIED';
    const expClassOrder: ExpClass[] = [
      'ALLOWABLE',
      'DISALLOWABLE',
      'CAPITAL',
      'PERSONAL',
      'UNCLASSIFIED',
    ];
    const incClassOrder: IncClass[] = [
      'BUSINESS',
      'EXEMPT',
      'CAPITAL',
      'OTHER',
      'UNCLASSIFIED',
    ];

    // --- Expenses (ExpenseCategory.taxClass) ---
    const expenses = await prisma.expense.findMany({
      where: {
        ...scope,
        expenseDate: { gte: fromDate, lte: toDate },
      },
      include: {
        expenseCategory: {
          select: { id: true, title: true, taxClass: true },
        },
      },
      orderBy: { expenseDate: 'asc' },
    });

    type ExpCatAgg = {
      categoryId: string;
      categoryTitle: string;
      taxClass: ExpClass;
      expenseCount: number;
      grossAmount: number;
      taxAmount: number;
      netAmount: number;
    };

    const expByCategory = new Map<string, ExpCatAgg>();
    const expByClass = new Map<
      ExpClass,
      {
        taxClass: ExpClass;
        expenseCount: number;
        categoryCount: number;
        grossAmount: number;
        taxAmount: number;
        netAmount: number;
      }
    >();
    for (const c of expClassOrder) {
      expByClass.set(c, {
        taxClass: c,
        expenseCount: 0,
        categoryCount: 0,
        grossAmount: 0,
        taxAmount: 0,
        netAmount: 0,
      });
    }

    for (const e of expenses) {
      const taxClass = (e.expenseCategory?.taxClass || 'UNCLASSIFIED') as ExpClass;
      const catId = e.expenseCategoryId;
      const gross = Number(e.amount);
      const tax = Number(e.taxAmount || 0);
      const net = gross - tax;

      let cat = expByCategory.get(catId);
      if (!cat) {
        cat = {
          categoryId: catId,
          categoryTitle: e.expenseCategory?.title || 'Unknown',
          taxClass,
          expenseCount: 0,
          grossAmount: 0,
          taxAmount: 0,
          netAmount: 0,
        };
        expByCategory.set(catId, cat);
        expByClass.get(taxClass)!.categoryCount += 1;
      }
      cat.expenseCount += 1;
      cat.grossAmount += gross;
      cat.taxAmount += tax;
      cat.netAmount += net;

      const cls = expByClass.get(taxClass)!;
      cls.expenseCount += 1;
      cls.grossAmount += gross;
      cls.taxAmount += tax;
      cls.netAmount += net;
    }

    const expenseCategories = [...expByCategory.values()]
      .map((c) => ({
        ...c,
        grossAmount: round(c.grossAmount),
        taxAmount: round(c.taxAmount),
        netAmount: round(c.netAmount),
      }))
      .sort(
        (a, b) =>
          a.taxClass.localeCompare(b.taxClass) || a.categoryTitle.localeCompare(b.categoryTitle),
      );

    const expenseByClass = expClassOrder.map((k) => {
      const c = expByClass.get(k)!;
      return {
        taxClass: c.taxClass,
        expenseCount: c.expenseCount,
        categoryCount: c.categoryCount,
        grossAmount: round(c.grossAmount),
        taxAmount: round(c.taxAmount),
        netAmount: round(c.netAmount),
      };
    });

    // --- Income (product Category.taxClass: invoices + sales DNs − credit notes) ---
    type LineItem = {
      productId?: string;
      taxableAmount?: number;
      totalTax?: number;
      lineTotal?: number;
    };

    const invoices = await prisma.invoice.findMany({
      where: {
        ...invoiceScope(req),
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      select: { id: true, items: true },
    });

    const creditNotes = await prisma.creditNote.findMany({
      where: {
        ...userDocScope(req),
        creditNoteDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' },
      },
      select: { id: true, items: true },
    });

    const salesDebitNotes = await prisma.salesDebitNote.findMany({
      where: {
        ...userDocScope(req),
        debitNoteDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' },
      },
      select: { id: true, items: true },
    });

    const productIds = new Set<string>();
    const collectProductIds = (items: unknown) => {
      const lines = Array.isArray(items) ? (items as LineItem[]) : [];
      for (const line of lines) {
        if (line.productId) productIds.add(String(line.productId));
      }
      return lines;
    };

    const parsedInvoices = invoices.map((inv) => ({ lines: collectProductIds(inv.items) }));
    const parsedCreditNotes = creditNotes.map((cn) => ({ lines: collectProductIds(cn.items) }));
    const parsedSalesDebitNotes = salesDebitNotes.map((dn) => ({
      lines: collectProductIds(dn.items),
    }));

    const products = productIds.size
      ? await prisma.product.findMany({
          where: { id: { in: [...productIds] } },
          select: {
            id: true,
            categoryId: true,
            category: { select: { id: true, category_name: true, taxClass: true } },
          },
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    type IncCatAgg = {
      categoryId: string;
      categoryTitle: string;
      taxClass: IncClass;
      lineCount: number;
      invoiceCount: number;
      salesDebitNoteCount: number;
      creditNoteCount: number;
      otherReceiptCount: number;
      invoiceTaxableAmount: number;
      salesDebitNoteTaxableAmount: number;
      creditNoteTaxableAmount: number;
      otherReceiptAmount: number;
      taxableAmount: number;
      taxAmount: number;
      lineTotal: number;
    };

    type IncClassAgg = {
      taxClass: IncClass;
      lineCount: number;
      categoryCount: number;
      invoiceCount: number;
      salesDebitNoteCount: number;
      creditNoteCount: number;
      otherReceiptCount: number;
      invoiceTaxableAmount: number;
      salesDebitNoteTaxableAmount: number;
      creditNoteTaxableAmount: number;
      otherReceiptAmount: number;
      taxableAmount: number;
      taxAmount: number;
      lineTotal: number;
    };

    const incByCategory = new Map<string, IncCatAgg>();
    const incByClass = new Map<IncClass, IncClassAgg>();
    for (const c of incClassOrder) {
      incByClass.set(c, {
        taxClass: c,
        lineCount: 0,
        categoryCount: 0,
        invoiceCount: 0,
        salesDebitNoteCount: 0,
        creditNoteCount: 0,
        otherReceiptCount: 0,
        invoiceTaxableAmount: 0,
        salesDebitNoteTaxableAmount: 0,
        creditNoteTaxableAmount: 0,
        otherReceiptAmount: 0,
        taxableAmount: 0,
        taxAmount: 0,
        lineTotal: 0,
      });
    }

    const ensureIncCat = (
      productId: string | undefined,
      taxClassHint?: IncClass,
    ): { cat: IncCatAgg; taxClass: IncClass } => {
      const product = productId ? productMap.get(String(productId)) : undefined;
      const taxClass = (product?.category?.taxClass || taxClassHint || 'UNCLASSIFIED') as IncClass;
      const catId = product?.categoryId || '__unclassified__';
      const catTitle = product?.category?.category_name || 'Unclassified / no product';
      let cat = incByCategory.get(catId);
      if (!cat) {
        cat = {
          categoryId: catId,
          categoryTitle: catTitle,
          taxClass,
          lineCount: 0,
          invoiceCount: 0,
          salesDebitNoteCount: 0,
          creditNoteCount: 0,
          otherReceiptCount: 0,
          invoiceTaxableAmount: 0,
          salesDebitNoteTaxableAmount: 0,
          creditNoteTaxableAmount: 0,
          otherReceiptAmount: 0,
          taxableAmount: 0,
          taxAmount: 0,
          lineTotal: 0,
        };
        incByCategory.set(catId, cat);
        incByClass.get(taxClass)!.categoryCount += 1;
      }
      return { cat, taxClass };
    };

    let invoiceLineCount = 0;
    let salesDebitNoteLineCount = 0;
    let creditNoteLineCount = 0;

    for (const inv of parsedInvoices) {
      const classesInDoc = new Set<IncClass>();
      const catsInDoc = new Set<string>();
      for (const line of inv.lines) {
        const { cat, taxClass } = ensureIncCat(line.productId);
        const taxable = Number(line.taxableAmount ?? 0);
        const tax = Number(line.totalTax ?? 0);
        const total = Number(line.lineTotal ?? taxable + tax);

        cat.lineCount += 1;
        cat.invoiceTaxableAmount += taxable;
        cat.taxableAmount += taxable;
        cat.taxAmount += tax;
        cat.lineTotal += total;

        const cls = incByClass.get(taxClass)!;
        cls.lineCount += 1;
        cls.invoiceTaxableAmount += taxable;
        cls.taxableAmount += taxable;
        cls.taxAmount += tax;
        cls.lineTotal += total;
        classesInDoc.add(taxClass);
        catsInDoc.add(cat.categoryId);
        invoiceLineCount += 1;
      }
      for (const taxClass of classesInDoc) incByClass.get(taxClass)!.invoiceCount += 1;
      for (const catId of catsInDoc) {
        const cat = incByCategory.get(catId);
        if (cat) cat.invoiceCount += 1;
      }
    }

    for (const dn of parsedSalesDebitNotes) {
      const classesInDoc = new Set<IncClass>();
      const catsInDoc = new Set<string>();
      for (const line of dn.lines) {
        const { cat, taxClass } = ensureIncCat(line.productId);
        const taxable = Number(line.taxableAmount ?? 0);
        const tax = Number(line.totalTax ?? 0);
        const total = Number(line.lineTotal ?? taxable + tax);

        cat.lineCount += 1;
        cat.salesDebitNoteTaxableAmount += taxable;
        cat.taxableAmount += taxable;
        cat.taxAmount += tax;
        cat.lineTotal += total;

        const cls = incByClass.get(taxClass)!;
        cls.lineCount += 1;
        cls.salesDebitNoteTaxableAmount += taxable;
        cls.taxableAmount += taxable;
        cls.taxAmount += tax;
        cls.lineTotal += total;
        classesInDoc.add(taxClass);
        catsInDoc.add(cat.categoryId);
        salesDebitNoteLineCount += 1;
      }
      for (const taxClass of classesInDoc) incByClass.get(taxClass)!.salesDebitNoteCount += 1;
      for (const catId of catsInDoc) {
        const cat = incByCategory.get(catId);
        if (cat) cat.salesDebitNoteCount += 1;
      }
    }

    for (const cn of parsedCreditNotes) {
      const classesInDoc = new Set<IncClass>();
      const catsInDoc = new Set<string>();
      for (const line of cn.lines) {
        const { cat, taxClass } = ensureIncCat(line.productId);
        const taxable = Number(line.taxableAmount ?? 0);
        const tax = Number(line.totalTax ?? 0);
        const total = Number(line.lineTotal ?? taxable + tax);

        cat.lineCount += 1;
        cat.creditNoteTaxableAmount += taxable;
        cat.taxableAmount -= taxable;
        cat.taxAmount -= tax;
        cat.lineTotal -= total;

        const cls = incByClass.get(taxClass)!;
        cls.lineCount += 1;
        cls.creditNoteTaxableAmount += taxable;
        cls.taxableAmount -= taxable;
        cls.taxAmount -= tax;
        cls.lineTotal -= total;
        classesInDoc.add(taxClass);
        catsInDoc.add(cat.categoryId);
        creditNoteLineCount += 1;
      }
      for (const taxClass of classesInDoc) incByClass.get(taxClass)!.creditNoteCount += 1;
      for (const catId of catsInDoc) {
        const cat = incByCategory.get(catId);
        if (cat) cat.creditNoteCount += 1;
      }
    }

    // --- Other receipts (manual, non-invoice) ---
    const otherReceiptRows = await prisma.taxAuditOtherReceipt.findMany({
      where: {
        ...userDocScope(req),
        isDeleted: false,
        receiptDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { receiptDate: 'asc' },
    });

    for (const r of otherReceiptRows) {
      const taxClass = (r.taxClass || 'OTHER') as IncClass;
      const amount = Number(r.amount);
      const catId = `__other_receipts__${taxClass}`;
      let cat = incByCategory.get(catId);
      if (!cat) {
        cat = {
          categoryId: catId,
          categoryTitle: `Other receipts (${taxClass})`,
          taxClass,
          lineCount: 0,
          invoiceCount: 0,
          salesDebitNoteCount: 0,
          creditNoteCount: 0,
          otherReceiptCount: 0,
          invoiceTaxableAmount: 0,
          salesDebitNoteTaxableAmount: 0,
          creditNoteTaxableAmount: 0,
          otherReceiptAmount: 0,
          taxableAmount: 0,
          taxAmount: 0,
          lineTotal: 0,
        };
        incByCategory.set(catId, cat);
        incByClass.get(taxClass)!.categoryCount += 1;
      }
      cat.lineCount += 1;
      cat.otherReceiptCount += 1;
      cat.otherReceiptAmount += amount;
      cat.taxableAmount += amount;
      cat.lineTotal += amount;

      const cls = incByClass.get(taxClass)!;
      cls.lineCount += 1;
      cls.otherReceiptCount += 1;
      cls.otherReceiptAmount += amount;
      cls.taxableAmount += amount;
      cls.lineTotal += amount;
    }

    const otherReceipts = otherReceiptRows.map((r, idx) => ({
      sno: idx + 1,
      id: r.id,
      receiptDate: r.receiptDate,
      description: r.description,
      taxClass: r.taxClass,
      amount: round(Number(r.amount)),
      notes: r.notes,
    }));

    const incomeCategories = [...incByCategory.values()]
      .map((c) => ({
        ...c,
        invoiceTaxableAmount: round(c.invoiceTaxableAmount),
        salesDebitNoteTaxableAmount: round(c.salesDebitNoteTaxableAmount),
        creditNoteTaxableAmount: round(c.creditNoteTaxableAmount),
        otherReceiptAmount: round(c.otherReceiptAmount),
        taxableAmount: round(c.taxableAmount),
        taxAmount: round(c.taxAmount),
        lineTotal: round(c.lineTotal),
      }))
      .sort(
        (a, b) =>
          a.taxClass.localeCompare(b.taxClass) || a.categoryTitle.localeCompare(b.categoryTitle),
      );

    const incomeByClass = incClassOrder.map((k) => {
      const c = incByClass.get(k)!;
      return {
        taxClass: c.taxClass,
        lineCount: c.lineCount,
        categoryCount: c.categoryCount,
        invoiceCount: c.invoiceCount,
        salesDebitNoteCount: c.salesDebitNoteCount,
        creditNoteCount: c.creditNoteCount,
        otherReceiptCount: c.otherReceiptCount,
        invoiceTaxableAmount: round(c.invoiceTaxableAmount),
        salesDebitNoteTaxableAmount: round(c.salesDebitNoteTaxableAmount),
        creditNoteTaxableAmount: round(c.creditNoteTaxableAmount),
        otherReceiptAmount: round(c.otherReceiptAmount),
        taxableAmount: round(c.taxableAmount),
        taxAmount: round(c.taxAmount),
        lineTotal: round(c.lineTotal),
      };
    });

    const expUnclassifiedCount = expByClass.get('UNCLASSIFIED')!.expenseCount;
    const expUnclassifiedNet = round(expByClass.get('UNCLASSIFIED')!.netAmount);
    const incUnclassifiedCount = incByClass.get('UNCLASSIFIED')!.lineCount;
    const incUnclassifiedNet = round(incByClass.get('UNCLASSIFIED')!.taxableAmount);

    const blockers = [
      'This is a books classification worksheet only — not Form 3CD / tax-audit e-filing',
      'Income net = invoices + sales debit notes − credit notes by product category + manual other receipts',
    ];
    if (expUnclassifiedCount > 0) {
      blockers.unshift(
        `${expUnclassifiedCount} expense(s) under UNCLASSIFIED categories (net ₹${expUnclassifiedNet.toLocaleString('en-IN')})`,
      );
    }
    if (incUnclassifiedCount > 0) {
      blockers.unshift(
        `${incUnclassifiedCount} income line(s) under UNCLASSIFIED product categories / other receipts (net taxable ₹${incUnclassifiedNet.toLocaleString('en-IN')})`,
      );
    }

    const expenseSummary = {
      expenseCount: expenses.length,
      categoryCount: expenseCategories.length,
      grossAmount: round(expenses.reduce((s, e) => s + Number(e.amount), 0)),
      taxAmount: round(expenses.reduce((s, e) => s + Number(e.taxAmount || 0), 0)),
      netAmount: round(
        expenses.reduce((s, e) => s + Number(e.amount) - Number(e.taxAmount || 0), 0),
      ),
      unclassifiedExpenseCount: expUnclassifiedCount,
    };

    const otherReceiptAmountTotal = round(
      otherReceipts.reduce((s, r) => s + r.amount, 0),
    );

    const incomeSummary = {
      invoiceCount: invoices.length,
      salesDebitNoteCount: salesDebitNotes.length,
      creditNoteCount: creditNotes.length,
      otherReceiptCount: otherReceipts.length,
      invoiceLineCount,
      salesDebitNoteLineCount,
      creditNoteLineCount,
      lineCount:
        invoiceLineCount +
        salesDebitNoteLineCount +
        creditNoteLineCount +
        otherReceipts.length,
      categoryCount: incomeCategories.length,
      invoiceTaxableAmount: round(incomeByClass.reduce((s, c) => s + c.invoiceTaxableAmount, 0)),
      salesDebitNoteTaxableAmount: round(
        incomeByClass.reduce((s, c) => s + c.salesDebitNoteTaxableAmount, 0),
      ),
      creditNoteTaxableAmount: round(
        incomeByClass.reduce((s, c) => s + c.creditNoteTaxableAmount, 0),
      ),
      otherReceiptAmount: otherReceiptAmountTotal,
      taxableAmount: round(incomeByClass.reduce((s, c) => s + c.taxableAmount, 0)),
      taxAmount: round(incomeByClass.reduce((s, c) => s + c.taxAmount, 0)),
      lineTotal: round(incomeByClass.reduce((s, c) => s + c.lineTotal, 0)),
      unclassifiedLineCount: incUnclassifiedCount,
    };

    const tenantId = optionalTenantId(req);
    const authUserId = requireUserId(req);
    const msmeSupplierWhere = tenantId
      ? { isDeleted: false, isMsme: true, OR: [{ tenantId }, { user_id: authUserId }] }
      : { isDeleted: false, isMsme: true, user_id: authUserId };
    const supplierScopeWhere = tenantId
      ? { OR: [{ tenantId }, { user_id: authUserId }] }
      : { user_id: authUserId };

    const purchaseWhereBase = {
      ...scope,
      isDeleted: false,
      status: { not: 'cancelled' as const },
    };
    const relatedSupplierWhere = tenantId
      ? { isDeleted: false, isRelatedParty: true, OR: [{ tenantId }, { user_id: authUserId }] }
      : { isDeleted: false, isRelatedParty: true, user_id: authUserId };

    const [
      section40A3,
      section43Bh,
      section43B,
      section40A2,
      section36Va,
      section40Aia,
      section40Ai,
    ] = await Promise.all([
      summarizeCashExpense40A3(prisma, {
        expenseWhere: { ...scope, isDeleted: false },
        supplierPaymentWhere: {
          isDeleted: false,
          AND: [createdByOwnershipFilter(req)],
        },
        fromDate,
        toDate,
      }),
      summarizeMsme43Bh(prisma, {
        supplierWhere: msmeSupplierWhere,
        purchaseWhere: purchaseWhereBase,
        fromDate,
        toDate,
      }),
      summarizeSection43B(prisma, {
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      summarizeSection40A2(prisma, {
        supplierWhere: relatedSupplierWhere,
        purchaseWhere: purchaseWhereBase,
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      summarizeSection36Va(prisma, {
        deductionWhere: { isDeleted: false, ...tenantOrUserFilter(req) },
        fromDate,
        toDate,
      }),
      summarizeSection40Aia(prisma, {
        purchaseWhere: purchaseWhereBase,
        allocationWhere: tenantOrUserFilter(req),
        supplierWhere: supplierScopeWhere,
        fromDate,
        toDate,
      }),
      summarizeSection40Ai(prisma, {
        purchaseWhere: purchaseWhereBase,
        allocationWhere: tenantOrUserFilter(req),
        supplierWhere: supplierScopeWhere,
        fromDate,
        toDate,
      }),
    ]);

    const totalPutativeDisallowance = round(
      section40A3.totalPutativeDisallowance +
        section43Bh.totalPutativeDisallowance +
        section43B.totalPutativeDisallowance +
        section40A2.totalExcessOverFmv +
        section36Va.totalPutativeDisallowance +
        section40Aia.totalPutativeDisallowance +
        section40Ai.totalPutativeDisallowance,
    );
    const disallowanceWorksheets = {
      notes:
        'Putative §40A(3) / §43B(h) / §43B / §40A(2) FMV-excess / §36(1)(va) / §40(a)(ia) / §40(a)(i) from books worksheets. §40A(2) gross related-party payments remain disclosure-only. Not Form 3CD.',
      section40A3,
      section43Bh,
      section43B,
      section40A2,
      section36Va,
      section40Aia,
      section40Ai,
      totalPutativeDisallowance,
    };

    res.json({
      success: true,
      data: {
        form: 'TAX-AUDIT-CLASS',
        period: { fy: fyLabel, from: fromDate, to: toDate },
        notes:
          'Expense: ExpenseCategory.taxClass. Income: product Category.taxClass on invoices + sales debit notes − credit notes + manual other receipts. Also surfaces putative disallowance worksheet totals and §40A(2) related-party disclosure. Books worksheet only — not Form 3CD.',
        warnings: blockers,
        readiness: { canFile: false, blockers },
        // Backward-compatible expense fields
        summary: expenseSummary,
        byClass: expenseByClass,
        categories: expenseCategories,
        expense: {
          summary: expenseSummary,
          byClass: expenseByClass,
          categories: expenseCategories,
        },
        income: {
          summary: incomeSummary,
          byClass: incomeByClass,
          categories: incomeCategories,
          otherReceipts,
        },
        disallowanceWorksheets,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('taxAuditClassification error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to compute tax-audit classification worksheet',
    });
  }
}

/**
 * GET /api/admin/reports/form-24q?quarter=YYYY-YY-Qn
 * Books worksheet shaped like Form 24Q (salary TDS u/s 192) — not TRACES / e-filing.
 */
export async function form24q(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fromDate, toDate, quarterLabel, fyLabel, quarter } = defaultFyQuarterRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;

    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const company = tenantId
      ? await prisma.companySettings.findFirst({
          where: { OR: [{ tenantId }, { userId }] },
          select: { companyName: true, gstin: true, tan: true },
        })
      : await prisma.companySettings.findUnique({
          where: { userId },
          select: { companyName: true, gstin: true, tan: true },
        });

    const deductions = await prisma.salaryTdsDeduction.findMany({
      where: {
        isDeleted: false,
        ...tenantOrUserScope(req),
        payDate: { gte: fromDate, lte: toDate },
        tdsAmount: { gt: 0 },
      },
      include: {
        employee: { select: { name: true, pan: true, employeeCode: true } },
      },
      orderBy: { payDate: 'asc' },
    });

    const companyTan = company?.tan?.trim() || null;
    const challans = await loadTaxDepositChallansForQuarter(req, 'TDS', fyLabel, quarter);
    const taxByDocument = new Map(
      deductions.map((d) => [d.id, round(Number(d.tdsAmount))] as const),
    );
    const {
      allocationSummary,
      allocationBlockers,
      challanNosByDocument,
      allocatedByDocument,
    } = allocationReadiness(
      challans,
      deductions.map((d) => d.id),
      taxByDocument,
      'TDS',
    );

    const annexure = deductions.map((d, idx) => {
      const tds = round(Number(d.tdsAmount));
      const allocatedAmount = round(allocatedByDocument.get(d.id) ?? 0);
      const pan = d.employee.pan?.trim() || null;
      return {
        sno: idx + 1,
        deducteeName: d.employee.name,
        deducteePan: pan,
        panMissing: !pan,
        employeeCode: d.employee.employeeCode,
        section: d.section || '192',
        amountPaidOrCredited: round(Number(d.amountPaid)),
        tdsAmount: tds,
        allocatedAmount,
        unmappedAmount: round(Math.max(0, tds - allocatedAmount)),
        challanNos: challanNosByDocument.get(d.id) || [],
        dateOfCreditOrPayment: d.payDate,
        documentId: d.id,
      };
    });

    const panMissingCount = annexure.filter((r) => r.panMissing).length;
    const totalTds = round(annexure.reduce((s, r) => s + r.tdsAmount, 0));
    const { challanSummary, challanBlockers } = challanReadiness(challans, totalTds, 'TDS');

    const blockers: string[] = [];
    if (!companyTan) {
      blockers.push('Company TAN is not captured in settings — required for Form 24Q e-filing');
    }
    if (panMissingCount > 0) {
      blockers.push(`${panMissingCount} employee row(s) missing PAN — annexure incomplete`);
    }
    blockers.push(...challanBlockers);
    blockers.push(...allocationBlockers);
    blockers.push(
      'This is a books worksheet only — not a substitute for TRACES / income-tax e-filing or full payroll',
    );

    res.json({
      success: true,
      data: {
        form: '24Q',
        period: {
          fy: fyLabel,
          quarter: quarterLabel,
          quarterNumber: quarter,
          from: fromDate,
          to: toDate,
        },
        deductor: {
          name: company?.companyName || '—',
          gstin: company?.gstin || null,
          tan: companyTan,
        },
        notes:
          'Form 24Q–style books worksheet from salary TDS u/s 192 with optional challan→line mapping. Not TRACES filing or full payroll.',
        warnings: blockers,
        readiness: { canFile: false, blockers },
        summary: {
          deducteeRowCount: annexure.length,
          panMissingCount,
          totalAmountPaidOrCredited: round(
            annexure.reduce((s, r) => s + r.amountPaidOrCredited, 0),
          ),
          totalTds,
        },
        challanSummary,
        allocationSummary,
        challans,
        annexure,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('form24q error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute Form 24Q worksheet' });
  }
}

/**
 * GET /api/admin/reports/cash-expense-disallowance?fy=YYYY-YY
 * §40A(3) cash payments — day+payee aggregate > ₹10,000, excluding Rule 6DD tags.
 */
export async function cashExpenseDisallowance(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const scope = userDocScope(req);
    const threshold = CASH_EXPENSE_40A3_THRESHOLD;

    const [expenses, supplierPayments] = await Promise.all([
      prisma.expense.findMany({
        where: {
          ...scope,
          isDeleted: false,
          expenseDate: { gte: fromDate, lte: toDate },
        },
        include: {
          paymentMode: { select: { name: true, slug: true } },
          expenseCategory: { select: { title: true, taxClass: true } },
          supplier: { select: { supplier_name: true } },
        },
        orderBy: { expenseDate: 'asc' },
        take: 2000,
      }),
      prisma.supplierPayment.findMany({
        where: {
          isDeleted: false,
          paymentDate: { gte: fromDate, lte: toDate },
          AND: [createdByOwnershipFilter(req)],
        },
        include: {
          paymentMode: { select: { name: true, slug: true } },
          supplier: { select: { firstName: true, lastName: true, email: true } },
          purchase: { select: { purchaseId: true } },
        },
        orderBy: { paymentDate: 'asc' },
        take: 2000,
      }),
    ]);

    const lines: Cash40A3Line[] = [];

    for (const e of expenses) {
      const cashOpts = {
        sourceType: e.sourceType,
        paymentModeSlug: e.paymentMode?.slug,
        paymentModeName: e.paymentMode?.name,
      };
      if (!isCashPaymentMode(cashOpts)) continue;
      const amount = round(Number(e.amount));
      if (amount <= 0) continue;
      const payee = e.supplier?.supplier_name || e.description || '—';
      lines.push({
        docType: 'EXPENSE',
        id: e.id,
        docNumber: e.expenseId,
        date: e.expenseDate.toISOString().slice(0, 10),
        payee,
        payeeKey: normalizePayeeKey(payee),
        category: e.expenseCategory?.title || null,
        taxClass: e.expenseCategory?.taxClass || null,
        sourceType: e.sourceType,
        paymentMode: e.paymentMode?.name || e.paymentMode?.slug || null,
        amount,
        rule6DdExceptionCode: e.rule6DdExceptionCode,
      });
    }

    for (const p of supplierPayments) {
      const cashOpts = {
        sourceType: p.sourceType,
        paymentModeSlug: p.paymentMode?.slug,
        paymentModeName: p.paymentMode?.name,
      };
      if (!isCashPaymentMode(cashOpts)) continue;
      const amount = round(Number(p.paidAmount ?? p.amount));
      if (amount <= 0) continue;
      const payee =
        [p.supplier?.firstName, p.supplier?.lastName].filter(Boolean).join(' ').trim() ||
        p.supplier?.email ||
        '—';
      lines.push({
        docType: 'SUPPLIER_PAYMENT',
        id: p.id,
        docNumber: p.paymentId || p.purchase?.purchaseId || null,
        date: p.paymentDate.toISOString().slice(0, 10),
        payee,
        payeeKey: normalizePayeeKey(payee),
        category: null,
        taxClass: null,
        sourceType: p.sourceType,
        paymentMode: p.paymentMode?.name || p.paymentMode?.slug || null,
        amount,
        rule6DdExceptionCode: p.rule6DdExceptionCode,
      });
    }

    const { countable, excepted } = partitionCash40A3Lines(lines);
    const buckets = aggregateCash40A3Buckets(countable, threshold);
    const bucketSummary = summarizeCash40A3Buckets(buckets);

    const rows = buckets.flatMap((b) =>
      b.docs.map((d, idx) => ({
        ...d,
        threshold,
        dayPayeeTotal: b.totalAmount,
        /** Full bucket disallowance on first doc only — avoid double-count if summing rows. */
        putativeDisallowance: idx === 0 ? b.putativeDisallowance : 0,
        isBucketLead: idx === 0,
      })),
    );

    res.json({
      success: true,
      data: {
        notes:
          'Books §40A(3) screen: cash / petty-cash aggregated by calendar day + payee; lines tagged with a Rule 6DD exception code are excluded from aggregation. Bucket total above ₹10,000 is putative disallowance. Exception tags are books-only — not Form 3CD / legal Rule 6DD opinion.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        threshold,
        rule6DdCodes: RULE_6DD_EXCEPTION_CODES,
        summary: {
          bucketCount: bucketSummary.bucketCount,
          rowCount: bucketSummary.docCount,
          expenseCount: bucketSummary.expenseCount,
          supplierPaymentCount: bucketSummary.supplierPaymentCount,
          exceptedCount: excepted.length,
          exceptedAmount: round(excepted.reduce((s, r) => s + r.amount, 0)),
          totalPutativeDisallowance: bucketSummary.totalPutativeDisallowance,
        },
        readiness: {
          canFile: false,
          blockers: ['Books worksheet only — not Form 3CD / tax-audit filing'],
        },
        buckets: buckets.map((b) => ({
          date: b.date,
          payee: b.payee,
          docCount: b.docCount,
          totalAmount: b.totalAmount,
          putativeDisallowance: b.putativeDisallowance,
          docs: b.docs,
        })),
        exceptedRows: excepted.map((d) => ({
          ...d,
          rule6DdExceptionLabel: rule6DdExceptionLabel(d.rule6DdExceptionCode),
        })),
        rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('cashExpenseDisallowance error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute cash expense disallowance' });
  }
}

/**
 * PATCH /api/admin/reports/cash-expense-disallowance/exception
 * Set / clear Rule 6DD exception code on an expense or supplier payment (books tag).
 */
export async function setCashExpenseRule6DdException(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const docType = String(body.docType || '').toUpperCase();
    const id = String(body.id || '').trim();
    if (!id || (docType !== 'EXPENSE' && docType !== 'SUPPLIER_PAYMENT')) {
      res.status(400).json({
        success: false,
        message: 'docType must be EXPENSE or SUPPLIER_PAYMENT, and id is required',
      });
      return;
    }

    const rawCode =
      body.rule6DdExceptionCode == null || String(body.rule6DdExceptionCode).trim() === ''
        ? null
        : String(body.rule6DdExceptionCode);
    const code = normalizeRule6DdExceptionCode(rawCode);
    if (rawCode && !code) {
      res.status(400).json({
        success: false,
        message: `Invalid Rule 6DD code. Allowed: ${RULE_6DD_EXCEPTION_CODES.map((c) => c.code).join(', ')}`,
      });
      return;
    }

    if (docType === 'EXPENSE') {
      const existing = await prisma.expense.findFirst({
        where: { id, isDeleted: false, ...userDocScope(req) },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Expense not found' });
        return;
      }
      const updated = await prisma.expense.update({
        where: { id },
        data: { rule6DdExceptionCode: code },
        select: { id: true, expenseId: true, rule6DdExceptionCode: true },
      });
      res.json({
        success: true,
        data: {
          docType: 'EXPENSE',
          id: updated.id,
          docNumber: updated.expenseId,
          rule6DdExceptionCode: updated.rule6DdExceptionCode,
          rule6DdExceptionLabel: rule6DdExceptionLabel(updated.rule6DdExceptionCode),
        },
      });
      return;
    }

    const existingPay = await prisma.supplierPayment.findFirst({
      where: {
        id,
        isDeleted: false,
        AND: [createdByOwnershipFilter(req)],
      },
      select: { id: true },
    });
    if (!existingPay) {
      res.status(404).json({ success: false, message: 'Supplier payment not found' });
      return;
    }
    const updatedPay = await prisma.supplierPayment.update({
      where: { id },
      data: { rule6DdExceptionCode: code },
      select: { id: true, paymentId: true, rule6DdExceptionCode: true },
    });
    res.json({
      success: true,
      data: {
        docType: 'SUPPLIER_PAYMENT',
        id: updatedPay.id,
        docNumber: updatedPay.paymentId,
        rule6DdExceptionCode: updatedPay.rule6DdExceptionCode,
        rule6DdExceptionLabel: rule6DdExceptionLabel(updatedPay.rule6DdExceptionCode),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('setCashExpenseRule6DdException error:', err);
    res.status(500).json({ success: false, message: 'Failed to update Rule 6DD exception' });
  }
}

/**
 * GET /api/admin/reports/msme-43bh-disallowance?fy=YYYY-YY
 * §43B(h) MSME payment-delay books screen — not Form 3CD / MSME Act interest.
 */
export async function msme43BhDisallowance(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const daysLimit = Math.max(1, Number(req.query.days ?? MSME_43BH_DAYS) || MSME_43BH_DAYS);
    const tenantId = req.auth?.tenantId;
    const userId = requireUserId(req);
    const supplierScope = tenantId
      ? { isDeleted: false, isMsme: true, OR: [{ tenantId }, { user_id: userId }] }
      : { isDeleted: false, isMsme: true, user_id: userId };

    const msmeList = await prisma.supplier.findMany({
      where: supplierScope,
      select: {
        id: true,
        supplier_name: true,
        supplier_email: true,
        msmeUdyam: true,
        gstin: true,
      },
    });
    const emailSet = new Set(
      msmeList.map((s) => s.supplier_email.trim().toLowerCase()).filter(Boolean),
    );
    const byEmail = new Map(
      msmeList.map((s) => [s.supplier_email.trim().toLowerCase(), s] as const),
    );

    const purchases = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        isDeleted: false,
        status: { not: 'cancelled' },
        purchaseDate: { lte: toDate },
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        balanceAmount: true,
        billToUser: { select: { firstName: true, lastName: true, email: true } },
        supplierPayments: {
          where: { isDeleted: false },
          select: { id: true, paymentId: true, paymentDate: true, paidAmount: true, amount: true },
        },
      },
      orderBy: { purchaseDate: 'asc' },
      take: 2000,
    });

    type DisallowRow = {
      purchaseId: string;
      purchaseNumber: string | null;
      purchaseDate: string;
      paymentDeadline: string;
      vendorName: string;
      vendorEmail: string | null;
      supplierId: string;
      supplierName: string;
      msmeUdyam: string | null;
      totalAmount: number;
      paidAmount: number;
      balanceAmount: number;
      daysPastDeadline: number;
      putativeDisallowance: number;
      inFy: boolean;
    };

    type LateRow = {
      purchaseId: string;
      purchaseNumber: string | null;
      purchaseDate: string;
      paymentDeadline: string;
      paymentId: string | null;
      paymentDate: string;
      paidAmount: number;
      daysLate: number;
      vendorName: string;
      supplierName: string;
    };

    const disallowRows: DisallowRow[] = [];
    const latePaidRows: LateRow[] = [];

    for (const p of purchases) {
      const email = (p.billToUser?.email || '').trim().toLowerCase();
      if (!email || !emailSet.has(email)) continue;
      const msme = byEmail.get(email)!;
      const vendorName =
        `${p.billToUser?.firstName ?? ''} ${p.billToUser?.lastName ?? ''}`.trim() || email;
      const purchaseDate = p.purchaseDate;
      const deadline = paymentDeadlineFromPurchase(purchaseDate, daysLimit);
      const balanceAmount = round(Number(p.balanceAmount));
      const paidAmount = round(Number(p.paidAmount));
      const totalAmount = round(Number(p.totalAmount));
      const inFy = purchaseDate >= fromDate && purchaseDate <= toDate;

      const disallow = putative43BhDisallowance({
        balanceAmount,
        purchaseDate,
        fyEnd: toDate,
        daysLimit,
      });
      if (disallow > 0) {
        disallowRows.push({
          purchaseId: p.id,
          purchaseNumber: p.purchaseId,
          purchaseDate: purchaseDate.toISOString().slice(0, 10),
          paymentDeadline: deadline.toISOString().slice(0, 10),
          vendorName,
          vendorEmail: p.billToUser?.email ?? null,
          supplierId: msme.id,
          supplierName: msme.supplier_name,
          msmeUdyam: msme.msmeUdyam,
          totalAmount,
          paidAmount,
          balanceAmount,
          daysPastDeadline: daysPastDeadline(deadline, toDate),
          putativeDisallowance: disallow,
          inFy,
        });
      }

      for (const pay of p.supplierPayments) {
        if (
          !isLatePayment({
            paymentDate: pay.paymentDate,
            purchaseDate,
            daysLimit,
          })
        ) {
          continue;
        }
        if (pay.paymentDate < fromDate || pay.paymentDate > toDate) continue;
        const amt = round(Number(pay.paidAmount ?? pay.amount));
        if (amt <= 0) continue;
        latePaidRows.push({
          purchaseId: p.id,
          purchaseNumber: p.purchaseId,
          purchaseDate: purchaseDate.toISOString().slice(0, 10),
          paymentDeadline: deadline.toISOString().slice(0, 10),
          paymentId: pay.paymentId,
          paymentDate: pay.paymentDate.toISOString().slice(0, 10),
          paidAmount: amt,
          daysLate: daysPastDeadline(deadline, pay.paymentDate),
          vendorName,
          supplierName: msme.supplier_name,
        });
      }
    }

    const totalDisallowance = round(
      disallowRows.reduce((s, r) => s + r.putativeDisallowance, 0),
    );

    res.json({
      success: true,
      data: {
        notes:
          'Books §43B(h) screen: MSME-flagged suppliers (matched by vendor email) with unpaid balances after purchaseDate + 45 days as of FY end. Purchase date used as acceptance proxy. Late payments in FY listed for review (deduction may shift to year of payment). Not Form 3CD / MSME Act interest / portal sync.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        daysLimit,
        summary: {
          msmeSupplierCount: msmeList.length,
          disallowRowCount: disallowRows.length,
          totalPutativeDisallowance: totalDisallowance,
          latePaidRowCount: latePaidRows.length,
          latePaidAmount: round(latePaidRows.reduce((s, r) => s + r.paidAmount, 0)),
        },
        readiness: {
          canFile: false,
          blockers: ['Books worksheet only — not Form 3CD / tax-audit filing'],
        },
        disallowRows,
        latePaidRows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('msme43BhDisallowance error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute §43B(h) disallowance' });
  }
}

async function loadNrEmailSet(req: Request): Promise<Set<string>> {
  const tenantId = optionalTenantId(req);
  const userId = requireUserId(req);
  const supplierWhere = tenantId
    ? { isDeleted: false, isNonResident: true, OR: [{ tenantId }, { user_id: userId }] }
    : { isDeleted: false, isNonResident: true, user_id: userId };
  const rows = await prisma.supplier.findMany({
    where: supplierWhere,
    select: { supplier_email: true },
    take: 2000,
  });
  return new Set(rows.map((s) => s.supplier_email.trim().toLowerCase()).filter(Boolean));
}

/**
 * GET /api/admin/reports/section-40a-ia-disallowance?fy=YYYY-YY
 * §40(a)(ia) resident TDS non-deduction / non-deposit — not Form 3CD / CPC / §40(a)(i).
 */
export async function section40AiaDisallowance(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const disallowRate = SECTION_40A_IA_DISALLOW_RATE;
    const nrEmails = await loadNrEmailSet(req);

    const purchases = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        isDeleted: false,
        status: { not: 'cancelled' },
        purchaseDate: { gte: fromDate, lte: toDate },
        OR: [{ tdsSection: { not: null } }, { tdsAmount: { gt: 0 } }],
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        taxableAmount: true,
        totalAmount: true,
        tdsSection: true,
        tdsRatePercent: true,
        tdsAmount: true,
        billToUser: { select: { firstName: true, lastName: true, email: true } },
        vendor: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { purchaseDate: 'asc' },
      take: 2000,
    });

    const ids = purchases.map((p) => p.id);
    const allocByPurchase = new Map<string, number>();
    if (ids.length > 0) {
      const allocs = await prisma.taxDepositChallanAllocation.findMany({
        where: {
          ...tenantOrUserFilter(req),
          sourceType: 'PURCHASE',
          sourceId: { in: ids },
        },
        select: { sourceId: true, amount: true },
        take: 5000,
      });
      for (const a of allocs) {
        const prev = allocByPurchase.get(a.sourceId) || 0;
        allocByPurchase.set(a.sourceId, round(prev + Number(a.amount)));
      }
    }

    type Row = {
      purchaseId: string;
      purchaseNumber: string | null;
      purchaseDate: string;
      vendorName: string;
      section: string | null;
      tdsRatePercent: number;
      taxableAmount: number;
      totalAmount: number;
      tdsAmount: number;
      challanAllocated: number;
      tdsShortfall: number;
      issue: 'NON_DEDUCTION' | 'NON_DEPOSIT';
      putativeDisallowance: number;
    };

    const rows: Row[] = [];
    for (const p of purchases) {
      const email = (p.billToUser?.email || p.vendor?.email || '').trim().toLowerCase();
      const tdsAmount = round(Number(p.tdsAmount ?? 0));
      const challanAllocated = allocByPurchase.get(p.id) || 0;
      const issue = classify40AiaPurchase({
        tdsSection: p.tdsSection,
        tdsAmount,
        challanAllocated,
        isNonResident: email ? nrEmails.has(email) : false,
      });
      if (!issue) continue;
      const taxableAmount = round(Number(p.taxableAmount));
      const vendorName =
        [p.billToUser?.firstName, p.billToUser?.lastName].filter(Boolean).join(' ').trim() ||
        [p.vendor?.firstName, p.vendor?.lastName].filter(Boolean).join(' ').trim() ||
        p.billToUser?.email ||
        p.vendor?.email ||
        '—';
      rows.push({
        purchaseId: p.id,
        purchaseNumber: p.purchaseId,
        purchaseDate: p.purchaseDate.toISOString().slice(0, 10),
        vendorName,
        section: p.tdsSection,
        tdsRatePercent: round(Number(p.tdsRatePercent ?? 0)),
        taxableAmount,
        totalAmount: round(Number(p.totalAmount)),
        tdsAmount,
        challanAllocated,
        tdsShortfall: round(Math.max(0, tdsAmount - challanAllocated)),
        issue,
        putativeDisallowance: putative40AiaDisallowance(taxableAmount, disallowRate),
      });
    }

    const nonDeductionCount = rows.filter((r) => r.issue === 'NON_DEDUCTION').length;
    const nonDepositCount = rows.filter((r) => r.issue === 'NON_DEPOSIT').length;
    const totalPutativeDisallowance = round(
      rows.reduce((s, r) => s + r.putativeDisallowance, 0),
    );

    res.json({
      success: true,
      data: {
        notes:
          'Books §40(a)(ia) screen (resident deductees only): TDS section with no deduction, or TDS not fully mapped to a deposit challan. Putative disallowance = 30% of taxable. Non-residents → §40(a)(i). Not CPC / Form 3CD.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        disallowRate,
        summary: {
          rowCount: rows.length,
          nonDeductionCount,
          nonDepositCount,
          totalPutativeDisallowance,
        },
        readiness: {
          canFile: false,
          blockers: ['Books worksheet only — not Form 3CD / tax-audit filing'],
        },
        rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('section40AiaDisallowance error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute §40(a)(ia) disallowance' });
  }
}

/**
 * GET /api/admin/reports/section-40a-i-disallowance?fy=YYYY-YY
 * §40(a)(i) non-resident TDS non-deduction / non-deposit — 100% of taxable. Not Form 3CD / CPC.
 */
export async function section40AiDisallowance(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const disallowRate = SECTION_40A_I_DISALLOW_RATE;
    const nrEmails = await loadNrEmailSet(req);

    const purchases = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        isDeleted: false,
        status: { not: 'cancelled' },
        purchaseDate: { gte: fromDate, lte: toDate },
        OR: [{ tdsSection: { not: null } }, { tdsAmount: { gt: 0 } }],
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        taxableAmount: true,
        totalAmount: true,
        tdsSection: true,
        tdsRatePercent: true,
        tdsAmount: true,
        billToUser: { select: { firstName: true, lastName: true, email: true } },
        vendor: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { purchaseDate: 'asc' },
      take: 2000,
    });

    const ids = purchases.map((p) => p.id);
    const allocByPurchase = new Map<string, number>();
    if (ids.length > 0) {
      const allocs = await prisma.taxDepositChallanAllocation.findMany({
        where: {
          ...tenantOrUserFilter(req),
          sourceType: 'PURCHASE',
          sourceId: { in: ids },
        },
        select: { sourceId: true, amount: true },
        take: 5000,
      });
      for (const a of allocs) {
        const prev = allocByPurchase.get(a.sourceId) || 0;
        allocByPurchase.set(a.sourceId, round(prev + Number(a.amount)));
      }
    }

    type Row = {
      purchaseId: string;
      purchaseNumber: string | null;
      purchaseDate: string;
      vendorName: string;
      section: string | null;
      tdsRatePercent: number;
      taxableAmount: number;
      totalAmount: number;
      tdsAmount: number;
      challanAllocated: number;
      tdsShortfall: number;
      issue: 'NON_DEDUCTION' | 'NON_DEPOSIT';
      putativeDisallowance: number;
    };

    const rows: Row[] = [];
    for (const p of purchases) {
      const email = (p.billToUser?.email || p.vendor?.email || '').trim().toLowerCase();
      if (!email || !nrEmails.has(email)) continue;
      const tdsAmount = round(Number(p.tdsAmount ?? 0));
      const challanAllocated = allocByPurchase.get(p.id) || 0;
      const issue = classify40AiPurchase({
        tdsSection: p.tdsSection,
        tdsAmount,
        challanAllocated,
        isNonResident: true,
      });
      if (!issue) continue;
      const taxableAmount = round(Number(p.taxableAmount));
      const vendorName =
        [p.billToUser?.firstName, p.billToUser?.lastName].filter(Boolean).join(' ').trim() ||
        [p.vendor?.firstName, p.vendor?.lastName].filter(Boolean).join(' ').trim() ||
        p.billToUser?.email ||
        p.vendor?.email ||
        '—';
      rows.push({
        purchaseId: p.id,
        purchaseNumber: p.purchaseId,
        purchaseDate: p.purchaseDate.toISOString().slice(0, 10),
        vendorName,
        section: p.tdsSection,
        tdsRatePercent: round(Number(p.tdsRatePercent ?? 0)),
        taxableAmount,
        totalAmount: round(Number(p.totalAmount)),
        tdsAmount,
        challanAllocated,
        tdsShortfall: round(Math.max(0, tdsAmount - challanAllocated)),
        issue,
        putativeDisallowance: putative40AiDisallowance(taxableAmount),
      });
    }

    const nonDeductionCount = rows.filter((r) => r.issue === 'NON_DEDUCTION').length;
    const nonDepositCount = rows.filter((r) => r.issue === 'NON_DEPOSIT').length;
    const totalPutativeDisallowance = round(
      rows.reduce((s, r) => s + r.putativeDisallowance, 0),
    );

    res.json({
      success: true,
      data: {
        notes:
          'Books §40(a)(i) screen (non-resident deductees via supplier.isNonResident): TDS not deducted or not fully mapped to a deposit challan. Putative disallowance = 100% of taxable. Residents → §40(a)(ia). Not CPC / Form 3CD / Form 27Q filing.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        disallowRate,
        summary: {
          rowCount: rows.length,
          nonDeductionCount,
          nonDepositCount,
          totalPutativeDisallowance,
        },
        readiness: {
          canFile: false,
          blockers: ['Books worksheet only — not Form 3CD / tax-audit filing'],
        },
        rows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('section40AiDisallowance error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute §40(a)(i) disallowance' });
  }
}

/**
 * GET /api/admin/reports/section-40a-2-related-party?fy=YYYY-YY
 * §40A(2) related-party payments disclosure — not Form 3CD / FMV opinion / auto-disallowance.
 */
export async function section40A2RelatedParty(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const scope = userDocScope(req);
    const tenantId = optionalTenantId(req);
    const userId = requireUserId(req);
    const supplierWhere = tenantId
      ? { isDeleted: false, isRelatedParty: true, OR: [{ tenantId }, { user_id: userId }] }
      : { isDeleted: false, isRelatedParty: true, user_id: userId };

    const related = await prisma.supplier.findMany({
      where: supplierWhere,
      select: {
        id: true,
        supplier_name: true,
        supplier_email: true,
        pan: true,
        gstin: true,
      },
      take: 2000,
    });
    const emailSet = new Set(
      related.map((s) => s.supplier_email.trim().toLowerCase()).filter(Boolean),
    );
    const byEmail = new Map(
      related.map((s) => [s.supplier_email.trim().toLowerCase(), s] as const),
    );
    const idSet = new Set(related.map((s) => s.id));
    const byId = new Map(related.map((s) => [s.id, s] as const));

    const [purchases, expenses] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          ...scope,
          isDeleted: false,
          status: { not: 'cancelled' },
          purchaseDate: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          purchaseId: true,
          purchaseDate: true,
          totalAmount: true,
          paidAmount: true,
          taxableAmount: true,
          section40A2FairMarketValue: true,
          section40A2FmvNote: true,
          billToUser: { select: { firstName: true, lastName: true, email: true } },
        },
        orderBy: { purchaseDate: 'asc' },
        take: 2000,
      }),
      idSet.size
        ? prisma.expense.findMany({
            where: {
              ...scope,
              isDeleted: false,
              expenseDate: { gte: fromDate, lte: toDate },
              supplierId: { in: [...idSet] },
            },
            select: {
              id: true,
              expenseId: true,
              expenseDate: true,
              amount: true,
              description: true,
              supplierId: true,
              section40A2FairMarketValue: true,
              section40A2FmvNote: true,
              expenseCategory: { select: { title: true } },
            },
            orderBy: { expenseDate: 'asc' },
            take: 2000,
          })
        : Promise.resolve([]),
    ]);

    type PurchaseRow = {
      purchaseId: string;
      purchaseNumber: string | null;
      purchaseDate: string;
      vendorName: string;
      supplierId: string;
      supplierName: string;
      pan: string | null;
      taxableAmount: number;
      totalAmount: number;
      paidAmount: number;
      paymentAmount: number;
      fairMarketValue: number | null;
      fmvNote: string | null;
      excessOverFmv: number;
    };
    type ExpenseRow = {
      expenseId: string;
      expenseNumber: string | null;
      expenseDate: string;
      supplierId: string;
      supplierName: string;
      categoryTitle: string;
      description: string | null;
      amount: number;
      fairMarketValue: number | null;
      fmvNote: string | null;
      excessOverFmv: number;
    };

    const purchaseRows: PurchaseRow[] = [];
    for (const p of purchases) {
      const email = (p.billToUser?.email || '').trim().toLowerCase();
      if (!email || !emailSet.has(email)) continue;
      const sup = byEmail.get(email)!;
      const paymentAmount = relatedPartyPaymentAmount({
        paidAmount: Number(p.paidAmount),
        totalAmount: Number(p.totalAmount),
        taxableAmount: Number(p.taxableAmount),
      });
      if (paymentAmount <= 0) continue;
      const fairMarketValue =
        p.section40A2FairMarketValue == null ? null : round(Number(p.section40A2FairMarketValue));
      purchaseRows.push({
        purchaseId: p.id,
        purchaseNumber: p.purchaseId,
        purchaseDate: p.purchaseDate.toISOString().slice(0, 10),
        vendorName:
          `${p.billToUser?.firstName ?? ''} ${p.billToUser?.lastName ?? ''}`.trim() || email,
        supplierId: sup.id,
        supplierName: sup.supplier_name,
        pan: sup.pan,
        taxableAmount: round(Number(p.taxableAmount)),
        totalAmount: round(Number(p.totalAmount)),
        paidAmount: round(Number(p.paidAmount)),
        paymentAmount,
        fairMarketValue,
        fmvNote: p.section40A2FmvNote,
        excessOverFmv: excessOverFmvAmount({ paymentAmount, fairMarketValue }),
      });
    }

    const expenseRows: ExpenseRow[] = [];
    for (const e of expenses) {
      if (!e.supplierId || !byId.has(e.supplierId)) continue;
      const sup = byId.get(e.supplierId)!;
      const amount = relatedPartyPaymentAmount({ amount: Number(e.amount) });
      if (amount <= 0) continue;
      const fairMarketValue =
        e.section40A2FairMarketValue == null ? null : round(Number(e.section40A2FairMarketValue));
      expenseRows.push({
        expenseId: e.id,
        expenseNumber: e.expenseId,
        expenseDate: e.expenseDate.toISOString().slice(0, 10),
        supplierId: sup.id,
        supplierName: sup.supplier_name,
        categoryTitle: e.expenseCategory?.title || '—',
        description: e.description,
        amount,
        fairMarketValue,
        fmvNote: e.section40A2FmvNote,
        excessOverFmv: excessOverFmvAmount({ paymentAmount: amount, fairMarketValue }),
      });
    }

    const purchaseAmount = round(purchaseRows.reduce((s, r) => s + r.paymentAmount, 0));
    const expenseAmount = round(expenseRows.reduce((s, r) => s + r.amount, 0));
    const totalExcessOverFmv = round(
      purchaseRows.reduce((s, r) => s + r.excessOverFmv, 0) +
        expenseRows.reduce((s, r) => s + r.excessOverFmv, 0),
    );
    const fmvTaggedRowCount =
      purchaseRows.filter((r) => r.fairMarketValue != null).length +
      expenseRows.filter((r) => r.fairMarketValue != null).length;

    res.json({
      success: true,
      data: {
        notes:
          'Books §40A(2) screen: purchases matched by vendor email and expenses linked to suppliers flagged isRelatedParty. Gross payments are disclosure. Optional FMV tags yield putative excess (payment − FMV) — not AO determination / Form 3CD e-filing.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        summary: {
          relatedSupplierCount: related.length,
          purchaseRowCount: purchaseRows.length,
          expenseRowCount: expenseRows.length,
          purchaseAmount,
          expenseAmount,
          totalRelatedPartyPayments: round(purchaseAmount + expenseAmount),
          fmvTaggedRowCount,
          totalExcessOverFmv,
        },
        readiness: {
          canFile: false,
          blockers: [
            'Books disclosure worksheet only — not Form 3CD / FMV determination',
            'Tagged FMV excess is books putative only — not AO opinion',
          ],
        },
        relatedSuppliers: related.map((s) => ({
          id: s.id,
          name: s.supplier_name,
          email: s.supplier_email,
          pan: s.pan,
          gstin: s.gstin,
        })),
        purchaseRows,
        expenseRows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('section40A2RelatedParty error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to compute §40A(2) related-party worksheet',
    });
  }
}

/**
 * PATCH /api/admin/reports/section-40a-2-related-party/fmv-tag
 * Set / clear books FMV tag on a related-party purchase or expense.
 */
export async function setSection40A2FmvTag(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const docType = String(body.docType || '').toUpperCase();
    const id = String(body.id || '').trim();
    if (!id || (docType !== 'PURCHASE' && docType !== 'EXPENSE')) {
      res.status(400).json({
        success: false,
        message: 'docType must be PURCHASE or EXPENSE, and id is required',
      });
      return;
    }
    const parsed = parseFairMarketValueInput(body.fairMarketValue);
    if (!parsed.ok) {
      res.status(400).json({ success: false, message: parsed.error });
      return;
    }
    const noteRaw = body.fmvNote;
    const fmvNote =
      noteRaw == null || String(noteRaw).trim() === ''
        ? null
        : String(noteRaw).trim().slice(0, 500);

    if (docType === 'PURCHASE') {
      const existing = await prisma.purchase.findFirst({
        where: { id, isDeleted: false, ...userDocScope(req) },
        select: {
          id: true,
          purchaseId: true,
          paidAmount: true,
          totalAmount: true,
          taxableAmount: true,
        },
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Purchase not found' });
        return;
      }
      const updated = await prisma.purchase.update({
        where: { id },
        data: {
          section40A2FairMarketValue: parsed.value,
          section40A2FmvNote: fmvNote,
        },
        select: {
          id: true,
          purchaseId: true,
          section40A2FairMarketValue: true,
          section40A2FmvNote: true,
          paidAmount: true,
          totalAmount: true,
          taxableAmount: true,
        },
      });
      const paymentAmount = relatedPartyPaymentAmount({
        paidAmount: Number(updated.paidAmount),
        totalAmount: Number(updated.totalAmount),
        taxableAmount: Number(updated.taxableAmount),
      });
      const fairMarketValue =
        updated.section40A2FairMarketValue == null
          ? null
          : Math.round(Number(updated.section40A2FairMarketValue) * 100) / 100;
      res.json({
        success: true,
        data: {
          docType: 'PURCHASE',
          id: updated.id,
          docNumber: updated.purchaseId,
          fairMarketValue,
          fmvNote: updated.section40A2FmvNote,
          paymentAmount,
          excessOverFmv: excessOverFmvAmount({ paymentAmount, fairMarketValue }),
        },
      });
      return;
    }

    const existingExp = await prisma.expense.findFirst({
      where: { id, isDeleted: false, ...userDocScope(req) },
      select: { id: true, expenseId: true, amount: true },
    });
    if (!existingExp) {
      res.status(404).json({ success: false, message: 'Expense not found' });
      return;
    }
    const updatedExp = await prisma.expense.update({
      where: { id },
      data: {
        section40A2FairMarketValue: parsed.value,
        section40A2FmvNote: fmvNote,
      },
      select: {
        id: true,
        expenseId: true,
        section40A2FairMarketValue: true,
        section40A2FmvNote: true,
        amount: true,
      },
    });
    const paymentAmount = relatedPartyPaymentAmount({ amount: Number(updatedExp.amount) });
    const fairMarketValue =
      updatedExp.section40A2FairMarketValue == null
        ? null
        : Math.round(Number(updatedExp.section40A2FairMarketValue) * 100) / 100;
    res.json({
      success: true,
      data: {
        docType: 'EXPENSE',
        id: updatedExp.id,
        docNumber: updatedExp.expenseId,
        fairMarketValue,
        fmvNote: updatedExp.section40A2FmvNote,
        paymentAmount,
        excessOverFmv: excessOverFmvAmount({ paymentAmount, fairMarketValue }),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('setSection40A2FmvTag error:', err);
    res.status(500).json({ success: false, message: 'Failed to update §40A(2) FMV tag' });
  }
}

/**
 * GET /api/admin/reports/clause-21a-inadmissible?fy=YYYY-YY
 * Form 3CD–style clause 21(a) schedule: taxClass tags + statutory links — not Form 3CD e-filing.
 */
export async function clause21aInadmissible(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const scope = userDocScope(req);
    const tenantId = optionalTenantId(req);
    const authUserId = requireUserId(req);
    const categoryScopeWhere = tenantId
      ? { isDeleted: false, OR: [{ tenantId }, { userId: authUserId }] }
      : { isDeleted: false, userId: authUserId };
    const msmeSupplierWhere = tenantId
      ? { isDeleted: false, isMsme: true, OR: [{ tenantId }, { user_id: authUserId }] }
      : { isDeleted: false, isMsme: true, user_id: authUserId };
    const relatedSupplierWhere = tenantId
      ? { isDeleted: false, isRelatedParty: true, OR: [{ tenantId }, { user_id: authUserId }] }
      : { isDeleted: false, isRelatedParty: true, user_id: authUserId };
    const supplierScopeWhere = tenantId
      ? { OR: [{ tenantId }, { user_id: authUserId }] }
      : { user_id: authUserId };
    const purchaseWhereBase = {
      ...scope,
      isDeleted: false,
      status: { not: 'cancelled' as const },
    };

    const [
      tagged,
      section40A3,
      section43Bh,
      section43B,
      section40A2,
      section36Va,
      section40Aia,
      section40Ai,
    ] = await Promise.all([
      summarizeClause21aTagged(prisma, {
        categoryWhere: categoryScopeWhere,
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      summarizeCashExpense40A3(prisma, {
        expenseWhere: { ...scope, isDeleted: false },
        supplierPaymentWhere: {
          isDeleted: false,
          AND: [createdByOwnershipFilter(req)],
        },
        fromDate,
        toDate,
      }),
      summarizeMsme43Bh(prisma, {
        supplierWhere: msmeSupplierWhere,
        purchaseWhere: purchaseWhereBase,
        fromDate,
        toDate,
      }),
      summarizeSection43B(prisma, {
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      summarizeSection40A2(prisma, {
        supplierWhere: relatedSupplierWhere,
        purchaseWhere: purchaseWhereBase,
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      summarizeSection36Va(prisma, {
        deductionWhere: { isDeleted: false, ...tenantOrUserFilter(req) },
        fromDate,
        toDate,
      }),
      summarizeSection40Aia(prisma, {
        purchaseWhere: purchaseWhereBase,
        allocationWhere: tenantOrUserFilter(req),
        supplierWhere: supplierScopeWhere,
        fromDate,
        toDate,
      }),
      summarizeSection40Ai(prisma, {
        purchaseWhere: purchaseWhereBase,
        allocationWhere: tenantOrUserFilter(req),
        supplierWhere: supplierScopeWhere,
        fromDate,
        toDate,
      }),
    ]);

    const schedule = buildClause21aSchedule({
      taggedByClass: tagged.taggedByClass,
      worksheets: {
        section40A3: section40A3.totalPutativeDisallowance,
        section43Bh: section43Bh.totalPutativeDisallowance,
        section43B: section43B.totalPutativeDisallowance,
        section40A2Excess: section40A2.totalExcessOverFmv,
        section36Va: section36Va.totalPutativeDisallowance,
        section40Aia: section40Aia.totalPutativeDisallowance,
        section40Ai: section40Ai.totalPutativeDisallowance,
      },
      overlapCashInDisallowable: tagged.overlapCashInDisallowable,
    });

    res.json({
      success: true,
      data: {
        form: 'CLAUSE-21A',
        notes:
          'Books clause 21(a) schedule: Section A = ExpenseCategory.taxClass DISALLOWABLE/PERSONAL/CAPITAL. Section B = putative amounts from dedicated worksheets (not added into tagged total). Cash in DISALLOWABLE may overlap §40A(3) — warned, not auto-deduped. Not Form 3CD e-filing / AO opinion.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        summary: {
          taggedTotal: schedule.taggedTotal,
          worksheetPutativeTotal: schedule.worksheetPutativeTotal,
          overlapCashInDisallowable: schedule.overlapCashInDisallowable,
        },
        readiness: {
          canFile: false,
          blockers: [
            'Books schedule only — not Form 3CD / tax-audit certification',
            'Tagged taxClass amounts are not auto-merged into statutory worksheet totals',
          ],
        },
        taggedByClass: schedule.taggedByClass,
        worksheetLinks: schedule.worksheetLinks,
        overlapCashInDisallowable: schedule.overlapCashInDisallowable,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('clause21aInadmissible error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to build clause 21(a) inadmissible schedule',
    });
  }
}

/**
 * GET /api/admin/reports/section-36-1-va-disallowance?fy=YYYY-YY
 * §36(1)(va) employee PF/ESI undeposited / late — not EPFO/ESIC / Form 3CD / §43B employer.
 */
export async function section36VaDisallowance(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;

    const rows = await prisma.salaryTdsDeduction.findMany({
      where: {
        AND: [
          { isDeleted: false },
          tenantOrUserFilter(req),
          { payDate: { gte: fromDate, lte: toDate } },
          { OR: [{ employeePfAmount: { gt: 0 } }, { employeeEsiAmount: { gt: 0 } }] },
        ],
      },
      include: {
        employee: { select: { name: true, pan: true, employeeCode: true } },
      },
      orderBy: { payDate: 'asc' },
      take: 2000,
    });

    type LineRow = {
      deductionId: string;
      employeeName: string;
      employeePan: string | null;
      payDate: string;
      amountPaid: number;
      pfReceived: number;
      esiReceived: number;
      pfDueDate: string;
      pfDepositedDate: string | null;
      esiDueDate: string;
      esiDepositedDate: string | null;
      pfIssue: string;
      esiIssue: string;
      putativeDisallowance: number;
    };

    const disallowRows: LineRow[] = [];
    let pfReceived = 0;
    let esiReceived = 0;
    let totalDisallow = 0;

    for (const r of rows) {
      const s = summarize36VaLine({
        payDate: r.payDate,
        employeePfAmount: r.employeePfAmount == null ? null : Number(r.employeePfAmount),
        employeeEsiAmount: r.employeeEsiAmount == null ? null : Number(r.employeeEsiAmount),
        pfDueDate: r.pfDueDate,
        pfDepositedDate: r.pfDepositedDate,
        esiDueDate: r.esiDueDate,
        esiDepositedDate: r.esiDepositedDate,
      });
      pfReceived += s.pfReceived;
      esiReceived += s.esiReceived;
      const pfDue = r.pfDueDate ?? defaultEmployeeFundDueDate(r.payDate);
      const esiDue = r.esiDueDate ?? defaultEmployeeFundDueDate(r.payDate);
      if (s.totalDisallowance <= 0) continue;
      totalDisallow += s.totalDisallowance;
      disallowRows.push({
        deductionId: r.id,
        employeeName: r.employee?.name || '—',
        employeePan: r.employee?.pan ?? null,
        payDate: r.payDate.toISOString().slice(0, 10),
        amountPaid: round(Number(r.amountPaid)),
        pfReceived: s.pfReceived,
        esiReceived: s.esiReceived,
        pfDueDate: pfDue.toISOString().slice(0, 10),
        pfDepositedDate: r.pfDepositedDate
          ? r.pfDepositedDate.toISOString().slice(0, 10)
          : null,
        esiDueDate: esiDue.toISOString().slice(0, 10),
        esiDepositedDate: r.esiDepositedDate
          ? r.esiDepositedDate.toISOString().slice(0, 10)
          : null,
        pfIssue: s.pfIssue,
        esiIssue: s.esiIssue,
        putativeDisallowance: s.totalDisallowance,
      });
    }

    res.json({
      success: true,
      data: {
        notes:
          'Books §36(1)(va) screen: employee PF/ESI on SalaryTdsDeduction lines. Undeposited or deposited after due-date proxy (15th of next month, or tagged due) = putative disallowance. Separate from §43B employer PF. Not EPFO/ESIC portal / Form 3CD.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        summary: {
          lineCount: rows.length,
          pfReceived: round(pfReceived),
          esiReceived: round(esiReceived),
          disallowRowCount: disallowRows.length,
          totalPutativeDisallowance: round(totalDisallow),
        },
        readiness: {
          canFile: false,
          blockers: [
            'Books worksheet only — not Form 3CD / EPFO / ESIC filing',
            'Due dates are books proxies unless tagged on the salary line',
          ],
        },
        disallowRows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('section36VaDisallowance error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to compute §36(1)(va) disallowance',
    });
  }
}

/**
 * GET /api/admin/reports/section-43b-disallowance?fy=YYYY-YY
 * §43B unpaid statutory dues (bonus/PF/ESI/etc.) — not Form 3CD / payroll / §43B(h).
 */
export async function section43BDisallowance(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const scope = userDocScope(req);
    const returnDueDate = defaultSection43BReturnDueDate(toDate);

    const expenses = await prisma.expense.findMany({
      where: {
        ...scope,
        isDeleted: false,
        expenseDate: { lte: toDate },
        expenseCategory: { section43BNature: { not: 'NONE' } },
      },
      select: {
        id: true,
        expenseId: true,
        expenseDate: true,
        paidDate: true,
        amount: true,
        paymentStatus: true,
        description: true,
        expenseCategory: {
          select: { id: true, title: true, section43BNature: true },
        },
      },
      orderBy: { expenseDate: 'asc' },
      take: 2000,
    });

    type DisallowRow = {
      expenseId: string;
      expenseNumber: string | null;
      expenseDate: string;
      categoryTitle: string;
      nature: string;
      amount: number;
      paymentStatus: string;
      putativeDisallowance: number;
      inFy: boolean;
    };
    type LateRow = {
      expenseId: string;
      expenseNumber: string | null;
      expenseDate: string;
      paidDate: string;
      returnDueDate: string;
      categoryTitle: string;
      nature: string;
      amount: number;
    };

    const disallowRows: DisallowRow[] = [];
    const latePaidRows: LateRow[] = [];

    for (const e of expenses) {
      const nature = e.expenseCategory?.section43BNature;
      if (!isSection43BTrackedNature(nature)) continue;
      const amount = round(Number(e.amount));
      const inFy = e.expenseDate >= fromDate && e.expenseDate <= toDate;
      const disallow = putative43BUnpaidDisallowance({
        amount,
        paymentStatus: e.paymentStatus,
        expenseDate: e.expenseDate,
        fyEnd: toDate,
        nature,
      });
      if (disallow > 0) {
        disallowRows.push({
          expenseId: e.id,
          expenseNumber: e.expenseId,
          expenseDate: e.expenseDate.toISOString().slice(0, 10),
          categoryTitle: e.expenseCategory?.title || '—',
          nature,
          amount,
          paymentStatus: e.paymentStatus,
          putativeDisallowance: disallow,
          inFy,
        });
      }
      if (
        isLate43BPayment({
          paidDate: e.paidDate,
          returnDueDate,
          nature,
          paymentStatus: e.paymentStatus,
        })
      ) {
        latePaidRows.push({
          expenseId: e.id,
          expenseNumber: e.expenseId,
          expenseDate: e.expenseDate.toISOString().slice(0, 10),
          paidDate: e.paidDate!.toISOString().slice(0, 10),
          returnDueDate: returnDueDate.toISOString().slice(0, 10),
          categoryTitle: e.expenseCategory?.title || '—',
          nature,
          amount,
        });
      }
    }

    const totalDisallowance = round(
      disallowRows.reduce((s, r) => s + r.putativeDisallowance, 0),
    );

    res.json({
      success: true,
      data: {
        notes:
          'Books §43B screen: expense categories tagged with section43BNature (bonus/PF/ESI/etc.). PENDING unpaid at FY end = putative disallowance. Late-paid uses optional Expense.paidDate vs 31 Oct return due-date proxy. Separate from §43B(h) MSME. Not Form 3CD / payroll / EPFO.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        returnDueDate: returnDueDate.toISOString().slice(0, 10),
        summary: {
          disallowRowCount: disallowRows.length,
          totalPutativeDisallowance: totalDisallowance,
          latePaidRowCount: latePaidRows.length,
          latePaidAmount: round(latePaidRows.reduce((s, r) => s + r.amount, 0)),
        },
        readiness: {
          canFile: false,
          blockers: ['Books worksheet only — not Form 3CD / tax-audit filing'],
        },
        disallowRows,
        latePaidRows,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('section43BDisallowance error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute §43B disallowance' });
  }
}

/**
 * GET /api/admin/reports/tax-audit-pack?fy=YYYY-YY
 * Form 3CD–style clause index over books worksheets — not Form 3CD e-filing.
 */
export async function taxAuditPack(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { fyLabel, fromDate, toDate } = defaultFinancialYearRange(req);
    const round = (n: number) => Math.round(n * 100) / 100;
    const scope = userDocScope(req);
    const tenantId = optionalTenantId(req);
    const authUserId = requireUserId(req);
    const msmeSupplierWhere = tenantId
      ? { isDeleted: false, isMsme: true, OR: [{ tenantId }, { user_id: authUserId }] }
      : { isDeleted: false, isMsme: true, user_id: authUserId };
    const supplierScopeWhere = tenantId
      ? { OR: [{ tenantId }, { user_id: authUserId }] }
      : { user_id: authUserId };
    const purchaseWhereBase = {
      ...scope,
      isDeleted: false,
      status: { not: 'cancelled' as const },
    };

    const categoryScopeWhere = tenantId
      ? { isDeleted: false, OR: [{ tenantId }, { userId: authUserId }] }
      : { isDeleted: false, userId: authUserId };

    const relatedSupplierWhere = tenantId
      ? { isDeleted: false, isRelatedParty: true, OR: [{ tenantId }, { user_id: authUserId }] }
      : { isDeleted: false, isRelatedParty: true, user_id: authUserId };

    const [
      section40A3,
      section43Bh,
      section43B,
      section40A2,
      section36Va,
      section40Aia,
      section40Ai,
      clause21aTagged,
      fixedAssets,
      clause34,
    ] = await Promise.all([
      summarizeCashExpense40A3(prisma, {
        expenseWhere: { ...scope, isDeleted: false },
        supplierPaymentWhere: {
          isDeleted: false,
          AND: [createdByOwnershipFilter(req)],
        },
        fromDate,
        toDate,
      }),
      summarizeMsme43Bh(prisma, {
        supplierWhere: msmeSupplierWhere,
        purchaseWhere: purchaseWhereBase,
        fromDate,
        toDate,
      }),
      summarizeSection43B(prisma, {
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      summarizeSection40A2(prisma, {
        supplierWhere: relatedSupplierWhere,
        purchaseWhere: purchaseWhereBase,
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      summarizeSection36Va(prisma, {
        deductionWhere: { isDeleted: false, ...tenantOrUserFilter(req) },
        fromDate,
        toDate,
      }),
      summarizeSection40Aia(prisma, {
        purchaseWhere: purchaseWhereBase,
        allocationWhere: tenantOrUserFilter(req),
        supplierWhere: supplierScopeWhere,
        fromDate,
        toDate,
      }),
      summarizeSection40Ai(prisma, {
        purchaseWhere: purchaseWhereBase,
        allocationWhere: tenantOrUserFilter(req),
        supplierWhere: supplierScopeWhere,
        fromDate,
        toDate,
      }),
      summarizeClause21aTagged(prisma, {
        categoryWhere: categoryScopeWhere,
        expenseWhere: { ...scope, isDeleted: false },
        fromDate,
        toDate,
      }),
      prisma.fixedAsset.findMany({
        where: {
          isDeleted: false,
          status: { not: 'disposed' },
          AND: [{ OR: tenantOrUserScope(req).OR }],
          acquisitionDate: { lte: toDate },
        },
      }),
      loadClause34Worksheet(req, fromDate, toDate, fyLabel),
    ]);

    const booksVsIt = summarizeBooksVsIt(
      buildBooksVsItRows(
        fixedAssets.map((a) => ({
          id: a.id,
          name: a.name,
          cost: Number(a.cost),
          salvageValue: Number(a.salvageValue),
          usefulLifeMonths: a.usefulLifeMonths,
          acquisitionDate: a.acquisitionDate,
          accumulatedDepreciation: Number(a.accumulatedDepreciation),
          itOpeningWdv: a.itOpeningWdv != null ? Number(a.itOpeningWdv) : null,
          itBlock: a.itBlock,
          itRatePercent: a.itRatePercent != null ? Number(a.itRatePercent) : null,
        })),
        fromDate,
        toDate,
      ),
    );

    const expenseInadmissibleTagged = round(clause21aTagged.taggedTotal);
    const clauses = buildTaxAuditPackClauses({
      expenseInadmissibleTagged,
      section40A3: section40A3.totalPutativeDisallowance,
      section40A3Excepted: section40A3.exceptedCount,
      section43Bh: section43Bh.totalPutativeDisallowance,
      section43B: section43B.totalPutativeDisallowance,
      section40A2: section40A2.totalRelatedPartyPayments,
      section40A2Excess: section40A2.totalExcessOverFmv,
      section36Va: section36Va.totalPutativeDisallowance,
      section40Aia: section40Aia.totalPutativeDisallowance,
      section40Ai: section40Ai.totalPutativeDisallowance,
      itDepreciation: booksVsIt.totalItDepreciation,
      section34Shortfall: clause34.summary.totalShortfall,
      section34bUnfiledCount: clause34.clause34b.unfiledCount,
      hasItWdv: true,
      hasClause34: clause34.summary.lineCount > 0,
      hasClause34b: clause34.clause34b.hasAnyFilingRecord,
      hasTaxAuditClassification: true,
    });
    const summary = summarizeTaxAuditPack(clauses);

    res.json({
      success: true,
      data: {
        form: 'TAX-AUDIT-PACK',
        notes:
          'Books Form 3CD–style clause index linking FastBillings worksheets. Approximate clause labels only — not Form 3CD e-filing, UDIN, or tax-audit certification.',
        period: {
          fy: fyLabel,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
        },
        summary,
        worksheets: {
          section40A3,
          section43Bh,
          section43B,
          section40A2,
          section36Va,
          section40Aia,
          section40Ai,
          expenseInadmissibleTagged,
          clause21aTagged,
          booksVsIt,
          clause34: clause34.summary,
          clause34b: {
            applicableCount: clause34.clause34b.applicableCount,
            filedCount: clause34.clause34b.filedCount,
            unfiledCount: clause34.clause34b.unfiledCount,
            hasAnyFilingRecord: clause34.clause34b.hasAnyFilingRecord,
          },
        },
        readiness: {
          canFile: false,
          blockers: [
            'Books clause index only — not Form 3CD / e-filing / UDIN',
            'Clause numbers are navigational labels, not certified mappings',
          ],
        },
        clauses,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('taxAuditPack error:', err);
    res.status(500).json({ success: false, message: 'Failed to build tax-audit pack' });
  }
}

/**
 * GET /api/admin/reports/tax-audit-pack/export?fy=YYYY-YY&format=csv|json
 * Download books Form 3CD–style pack — not Form 3CD XML / e-filing.
 */
export async function exportTaxAuditPack(req: Request, res: Response): Promise<void> {
  const captured: { status: number; body: unknown } = { status: 200, body: null };
  const fakeRes = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;

  await taxAuditPack(req, fakeRes);
  if (captured.status !== 200) {
    res.status(captured.status).json(captured.body);
    return;
  }

  const body = captured.body as { success: boolean; data: Record<string, unknown> };
  const format = String(req.query.format ?? 'json').toLowerCase();
  const fy =
    (body.data?.period as { fy?: string } | undefined)?.fy ||
    String(req.query.fy ?? 'fy');
  const safeFy = fy.replace(/[^\w.-]+/g, '_');

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tax_audit_pack_${safeFy}.csv"`,
    );
    res.send(taxAuditPackToCsv(body.data as Parameters<typeof taxAuditPackToCsv>[0]));
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="tax_audit_pack_${safeFy}.json"`,
  );
  res.send(JSON.stringify(body.data, null, 2));
}

const handlers = {
  taxSummary,
  gstr1,
  gstr3b,
  gstr9,
  cmp08,
  tdsRegister,
  tcsRegister,
  form24q,
  form26q,
  form27q,
  form27eq,
  msmePayables,
  itWdv,
  booksVsItDepreciation,
  clause34Tds,
  taxAuditClassification,
  taxAuditPack,
  exportTaxAuditPack,
  cashExpenseDisallowance,
  setCashExpenseRule6DdException,
  msme43BhDisallowance,
  clause21aInadmissible,
  section43BDisallowance,
  section40A2RelatedParty,
  setSection40A2FmvTag,
  section36VaDisallowance,
  section40AiaDisallowance,
  section40AiDisallowance,
};
module.exports = handlers;
module.exports.default = handlers;
