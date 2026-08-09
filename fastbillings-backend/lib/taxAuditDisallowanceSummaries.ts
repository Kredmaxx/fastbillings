/**
 * Shared FY summaries for tax-audit disallowance worksheets
 * (§40A(3), §43B(h), §40(a)(ia)). Books only — not Form 3CD.
 */
import type { PrismaClient } from '@prisma/client';

import {
  CASH_EXPENSE_40A3_THRESHOLD,
  aggregateCash40A3Buckets,
  isCashPaymentMode,
  normalizePayeeKey,
  partitionCash40A3Lines,
  summarizeCash40A3Buckets,
  type Cash40A3Line,
} from './cashExpense40A3';
import {
  MSME_43BH_DAYS,
  isLatePayment,
  putative43BhDisallowance,
} from './msme43Bh';
import {
  SECTION_40A_IA_DISALLOW_RATE,
  SECTION_40A_I_DISALLOW_RATE,
  classify40AiPurchase,
  classify40AiaPurchase,
  putative40AiDisallowance,
  putative40AiaDisallowance,
} from './section40Aia';
import {
  defaultSection43BReturnDueDate,
  isLate43BPayment,
  isSection43BTrackedNature,
  putative43BUnpaidDisallowance,
} from './section43B';
import { excessOverFmvAmount, relatedPartyPaymentAmount } from './section40A2';
import { summarize36VaLine } from './section36Va';
import { CLAUSE_21A_TAX_CLASSES, type Clause21aTaggedRow } from './clause21aInadmissible';
import { isCashPaymentMode } from './cashExpense40A3';

type Db = Pick<
  PrismaClient,
  | 'expense'
  | 'expenseCategory'
  | 'supplierPayment'
  | 'supplier'
  | 'purchase'
  | 'taxDepositChallanAllocation'
  | 'salaryTdsDeduction'
>;

async function loadNrSupplierEmails(
  db: Db,
  supplierWhere: Record<string, unknown>,
): Promise<Set<string>> {
  const rows = await db.supplier.findMany({
    where: { ...supplierWhere, isNonResident: true },
    select: { supplier_email: true },
    take: 2000,
  });
  return new Set(rows.map((s) => s.supplier_email.trim().toLowerCase()).filter(Boolean));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function summarizeCashExpense40A3(
  db: Db,
  opts: {
    expenseWhere: Record<string, unknown>;
    supplierPaymentWhere: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
  },
): Promise<{
  threshold: number;
  bucketCount: number;
  rowCount: number;
  expenseCount: number;
  supplierPaymentCount: number;
  exceptedCount: number;
  totalPutativeDisallowance: number;
}> {
  const threshold = CASH_EXPENSE_40A3_THRESHOLD;
  const [expenses, supplierPayments] = await Promise.all([
    db.expense.findMany({
      where: {
        ...opts.expenseWhere,
        expenseDate: { gte: opts.fromDate, lte: opts.toDate },
      },
      select: {
        id: true,
        expenseId: true,
        expenseDate: true,
        amount: true,
        description: true,
        sourceType: true,
        rule6DdExceptionCode: true,
        paymentMode: { select: { name: true, slug: true } },
        expenseCategory: { select: { title: true, taxClass: true } },
        supplier: { select: { supplier_name: true } },
      },
      take: 2000,
    }),
    db.supplierPayment.findMany({
      where: {
        ...opts.supplierPaymentWhere,
        paymentDate: { gte: opts.fromDate, lte: opts.toDate },
      },
      select: {
        id: true,
        paymentId: true,
        paymentDate: true,
        amount: true,
        paidAmount: true,
        sourceType: true,
        rule6DdExceptionCode: true,
        paymentMode: { select: { name: true, slug: true } },
        supplier: { select: { firstName: true, lastName: true, email: true } },
        purchase: { select: { purchaseId: true } },
      },
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
    const amount = round2(Number(e.amount));
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
    const amount = round2(Number(p.paidAmount ?? p.amount));
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
  const summary = summarizeCash40A3Buckets(buckets);

  return {
    threshold,
    bucketCount: summary.bucketCount,
    rowCount: summary.docCount,
    expenseCount: summary.expenseCount,
    supplierPaymentCount: summary.supplierPaymentCount,
    exceptedCount: excepted.length,
    totalPutativeDisallowance: summary.totalPutativeDisallowance,
  };
}

export async function summarizeMsme43Bh(
  db: Db,
  opts: {
    supplierWhere: Record<string, unknown>;
    purchaseWhere: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
    daysLimit?: number;
  },
): Promise<{
  daysLimit: number;
  msmeSupplierCount: number;
  disallowRowCount: number;
  totalPutativeDisallowance: number;
  latePaidRowCount: number;
  latePaidAmount: number;
}> {
  const daysLimit = Math.max(1, opts.daysLimit ?? MSME_43BH_DAYS);
  const msmeList = await db.supplier.findMany({
    where: opts.supplierWhere,
    select: { supplier_email: true },
  });
  const emailSet = new Set(
    msmeList.map((s) => s.supplier_email.trim().toLowerCase()).filter(Boolean),
  );

  const purchases = await db.purchase.findMany({
    where: {
      ...opts.purchaseWhere,
      purchaseDate: { lte: opts.toDate },
    },
    select: {
      purchaseDate: true,
      balanceAmount: true,
      billToUser: { select: { email: true } },
      supplierPayments: {
        where: { isDeleted: false },
        select: { paymentDate: true, paidAmount: true, amount: true },
      },
    },
    take: 2000,
  });

  let disallowRowCount = 0;
  let totalDisallow = 0;
  let latePaidRowCount = 0;
  let latePaidAmount = 0;

  for (const p of purchases) {
    const email = (p.billToUser?.email || '').trim().toLowerCase();
    if (!email || !emailSet.has(email)) continue;

    const disallow = putative43BhDisallowance({
      balanceAmount: Number(p.balanceAmount),
      purchaseDate: p.purchaseDate,
      fyEnd: opts.toDate,
      daysLimit,
    });
    if (disallow > 0) {
      disallowRowCount += 1;
      totalDisallow += disallow;
    }

    for (const pay of p.supplierPayments) {
      if (
        !isLatePayment({
          paymentDate: pay.paymentDate,
          purchaseDate: p.purchaseDate,
          daysLimit,
        })
      ) {
        continue;
      }
      if (pay.paymentDate < opts.fromDate || pay.paymentDate > opts.toDate) continue;
      const amt = round2(Number(pay.paidAmount ?? pay.amount));
      if (amt <= 0) continue;
      latePaidRowCount += 1;
      latePaidAmount += amt;
    }
  }

  return {
    daysLimit,
    msmeSupplierCount: msmeList.length,
    disallowRowCount,
    totalPutativeDisallowance: round2(totalDisallow),
    latePaidRowCount,
    latePaidAmount: round2(latePaidAmount),
  };
}

export async function summarizeSection40Aia(
  db: Db,
  opts: {
    purchaseWhere: Record<string, unknown>;
    allocationWhere: Record<string, unknown>;
    supplierWhere?: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
  },
): Promise<{
  disallowRate: number;
  rowCount: number;
  nonDeductionCount: number;
  nonDepositCount: number;
  totalPutativeDisallowance: number;
}> {
  const nrEmails = await loadNrSupplierEmails(db, {
    isDeleted: false,
    ...(opts.supplierWhere || {}),
  });

  const purchases = await db.purchase.findMany({
    where: {
      ...opts.purchaseWhere,
      purchaseDate: { gte: opts.fromDate, lte: opts.toDate },
      OR: [{ tdsSection: { not: null } }, { tdsAmount: { gt: 0 } }],
    },
    select: {
      id: true,
      tdsSection: true,
      tdsAmount: true,
      taxableAmount: true,
      billToUser: { select: { email: true } },
    },
    take: 2000,
  });

  const ids = purchases.map((p) => p.id);
  const allocByPurchase = new Map<string, number>();
  if (ids.length > 0) {
    const allocs = await db.taxDepositChallanAllocation.findMany({
      where: {
        ...opts.allocationWhere,
        sourceType: 'PURCHASE',
        sourceId: { in: ids },
      },
      select: { sourceId: true, amount: true },
      take: 5000,
    });
    for (const a of allocs) {
      const prev = allocByPurchase.get(a.sourceId) || 0;
      allocByPurchase.set(a.sourceId, round2(prev + Number(a.amount)));
    }
  }

  let nonDeductionCount = 0;
  let nonDepositCount = 0;
  let total = 0;

  for (const p of purchases) {
    const email = (p.billToUser?.email || '').trim().toLowerCase();
    const issue = classify40AiaPurchase({
      tdsSection: p.tdsSection,
      tdsAmount: Number(p.tdsAmount ?? 0),
      challanAllocated: allocByPurchase.get(p.id) || 0,
      isNonResident: email ? nrEmails.has(email) : false,
    });
    if (!issue) continue;
    if (issue === 'NON_DEDUCTION') nonDeductionCount += 1;
    else nonDepositCount += 1;
    total += putative40AiaDisallowance(Number(p.taxableAmount));
  }

  return {
    disallowRate: SECTION_40A_IA_DISALLOW_RATE,
    rowCount: nonDeductionCount + nonDepositCount,
    nonDeductionCount,
    nonDepositCount,
    totalPutativeDisallowance: round2(total),
  };
}

export async function summarizeSection40Ai(
  db: Db,
  opts: {
    purchaseWhere: Record<string, unknown>;
    allocationWhere: Record<string, unknown>;
    supplierWhere?: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
  },
): Promise<{
  disallowRate: number;
  rowCount: number;
  nonDeductionCount: number;
  nonDepositCount: number;
  totalPutativeDisallowance: number;
}> {
  const nrEmails = await loadNrSupplierEmails(db, {
    isDeleted: false,
    ...(opts.supplierWhere || {}),
  });

  const purchases = await db.purchase.findMany({
    where: {
      ...opts.purchaseWhere,
      purchaseDate: { gte: opts.fromDate, lte: opts.toDate },
      OR: [{ tdsSection: { not: null } }, { tdsAmount: { gt: 0 } }],
    },
    select: {
      id: true,
      tdsSection: true,
      tdsAmount: true,
      taxableAmount: true,
      billToUser: { select: { email: true } },
    },
    take: 2000,
  });

  const ids = purchases.map((p) => p.id);
  const allocByPurchase = new Map<string, number>();
  if (ids.length > 0) {
    const allocs = await db.taxDepositChallanAllocation.findMany({
      where: {
        ...opts.allocationWhere,
        sourceType: 'PURCHASE',
        sourceId: { in: ids },
      },
      select: { sourceId: true, amount: true },
      take: 5000,
    });
    for (const a of allocs) {
      const prev = allocByPurchase.get(a.sourceId) || 0;
      allocByPurchase.set(a.sourceId, round2(prev + Number(a.amount)));
    }
  }

  let nonDeductionCount = 0;
  let nonDepositCount = 0;
  let total = 0;

  for (const p of purchases) {
    const email = (p.billToUser?.email || '').trim().toLowerCase();
    if (!email || !nrEmails.has(email)) continue;
    const issue = classify40AiPurchase({
      tdsSection: p.tdsSection,
      tdsAmount: Number(p.tdsAmount ?? 0),
      challanAllocated: allocByPurchase.get(p.id) || 0,
      isNonResident: true,
    });
    if (!issue) continue;
    if (issue === 'NON_DEDUCTION') nonDeductionCount += 1;
    else nonDepositCount += 1;
    total += putative40AiDisallowance(Number(p.taxableAmount));
  }

  return {
    disallowRate: SECTION_40A_I_DISALLOW_RATE,
    rowCount: nonDeductionCount + nonDepositCount,
    nonDeductionCount,
    nonDepositCount,
    totalPutativeDisallowance: round2(total),
  };
}

/**
 * §43B unpaid statutory dues (bonus/PF/etc.) via ExpenseCategory.section43BNature.
 * Separate from §43B(h) MSME screen. Books only — not Form 3CD.
 */
export async function summarizeSection43B(
  db: Db,
  opts: {
    expenseWhere: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
    returnDueDate?: Date;
  },
): Promise<{
  disallowRowCount: number;
  totalPutativeDisallowance: number;
  latePaidRowCount: number;
  latePaidAmount: number;
  returnDueDate: string;
}> {
  const returnDueDate = opts.returnDueDate ?? defaultSection43BReturnDueDate(opts.toDate);
  const expenses = await db.expense.findMany({
    where: {
      ...opts.expenseWhere,
      expenseDate: { lte: opts.toDate },
      expenseCategory: { section43BNature: { not: 'NONE' } },
    },
    select: {
      amount: true,
      paymentStatus: true,
      expenseDate: true,
      paidDate: true,
      expenseCategory: { select: { section43BNature: true } },
    },
    take: 2000,
  });

  let disallowRowCount = 0;
  let totalDisallow = 0;
  let latePaidRowCount = 0;
  let latePaidAmount = 0;

  for (const e of expenses) {
    const nature = e.expenseCategory?.section43BNature;
    if (!isSection43BTrackedNature(nature)) continue;

    const disallow = putative43BUnpaidDisallowance({
      amount: Number(e.amount),
      paymentStatus: e.paymentStatus,
      expenseDate: e.expenseDate,
      fyEnd: opts.toDate,
      nature,
    });
    if (disallow > 0) {
      disallowRowCount += 1;
      totalDisallow += disallow;
    }

    if (
      isLate43BPayment({
        paidDate: e.paidDate,
        returnDueDate,
        nature,
        paymentStatus: e.paymentStatus,
      })
    ) {
      const amt = round2(Number(e.amount));
      if (amt > 0) {
        latePaidRowCount += 1;
        latePaidAmount += amt;
      }
    }
  }

  return {
    disallowRowCount,
    totalPutativeDisallowance: round2(totalDisallow),
    latePaidRowCount,
    latePaidAmount: round2(latePaidAmount),
    returnDueDate: returnDueDate.toISOString().slice(0, 10),
  };
}

/**
 * §40A(2) related-party payments disclosure (purchases + expenses).
 * Totals are for Form 3CD–style review — not auto-disallowance / FMV opinion.
 */
export async function summarizeSection40A2(
  db: Db,
  opts: {
    supplierWhere: Record<string, unknown>;
    purchaseWhere: Record<string, unknown>;
    expenseWhere: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
  },
): Promise<{
  relatedSupplierCount: number;
  purchaseRowCount: number;
  expenseRowCount: number;
  purchaseAmount: number;
  expenseAmount: number;
  totalRelatedPartyPayments: number;
  fmvTaggedRowCount: number;
  totalExcessOverFmv: number;
}> {
  const related = await db.supplier.findMany({
    where: { ...opts.supplierWhere, isRelatedParty: true },
    select: { id: true, supplier_email: true },
    take: 2000,
  });
  const emailSet = new Set(
    related.map((s) => s.supplier_email.trim().toLowerCase()).filter(Boolean),
  );
  const idSet = new Set(related.map((s) => s.id));

  const [purchases, expenses] = await Promise.all([
    emailSet.size
      ? db.purchase.findMany({
          where: {
            ...opts.purchaseWhere,
            purchaseDate: { gte: opts.fromDate, lte: opts.toDate },
          },
          select: {
            totalAmount: true,
            paidAmount: true,
            taxableAmount: true,
            section40A2FairMarketValue: true,
            billToUser: { select: { email: true } },
          },
          take: 2000,
        })
      : Promise.resolve([]),
    idSet.size
      ? db.expense.findMany({
          where: {
            ...opts.expenseWhere,
            expenseDate: { gte: opts.fromDate, lte: opts.toDate },
            supplierId: { in: [...idSet] },
          },
          select: { amount: true, section40A2FairMarketValue: true },
          take: 2000,
        })
      : Promise.resolve([]),
  ]);

  let purchaseRowCount = 0;
  let purchaseAmount = 0;
  let fmvTaggedRowCount = 0;
  let totalExcess = 0;
  for (const p of purchases) {
    const email = (p.billToUser?.email || '').trim().toLowerCase();
    if (!email || !emailSet.has(email)) continue;
    const amt = relatedPartyPaymentAmount({
      paidAmount: Number(p.paidAmount),
      totalAmount: Number(p.totalAmount),
      taxableAmount: Number(p.taxableAmount),
    });
    if (amt <= 0) continue;
    purchaseRowCount += 1;
    purchaseAmount += amt;
    const fmv =
      p.section40A2FairMarketValue == null ? null : Number(p.section40A2FairMarketValue);
    if (fmv != null && Number.isFinite(fmv)) {
      fmvTaggedRowCount += 1;
      totalExcess += excessOverFmvAmount({ paymentAmount: amt, fairMarketValue: fmv });
    }
  }

  let expenseRowCount = 0;
  let expenseAmount = 0;
  for (const e of expenses) {
    const amt = relatedPartyPaymentAmount({ amount: Number(e.amount) });
    if (amt <= 0) continue;
    expenseRowCount += 1;
    expenseAmount += amt;
    const fmv =
      e.section40A2FairMarketValue == null ? null : Number(e.section40A2FairMarketValue);
    if (fmv != null && Number.isFinite(fmv)) {
      fmvTaggedRowCount += 1;
      totalExcess += excessOverFmvAmount({ paymentAmount: amt, fairMarketValue: fmv });
    }
  }

  return {
    relatedSupplierCount: related.length,
    purchaseRowCount,
    expenseRowCount,
    purchaseAmount: round2(purchaseAmount),
    expenseAmount: round2(expenseAmount),
    totalRelatedPartyPayments: round2(purchaseAmount + expenseAmount),
    fmvTaggedRowCount,
    totalExcessOverFmv: round2(totalExcess),
  };
}

/**
 * Clause 21(a) taxClass tagged inadmissible totals (DISALLOWABLE/PERSONAL/CAPITAL).
 */
export async function summarizeClause21aTagged(
  db: Db,
  opts: {
    categoryWhere: Record<string, unknown>;
    expenseWhere: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
  },
): Promise<{
  taggedByClass: Clause21aTaggedRow[];
  taggedTotal: number;
  overlapCashInDisallowable: number;
}> {
  const cats = await db.expenseCategory.findMany({
    where: {
      ...opts.categoryWhere,
      taxClass: { in: [...CLAUSE_21A_TAX_CLASSES] },
    },
    select: { id: true, taxClass: true },
    take: 2000,
  });
  const byClassIds = new Map<string, string[]>();
  for (const c of cats) {
    const list = byClassIds.get(c.taxClass) || [];
    list.push(c.id);
    byClassIds.set(c.taxClass, list);
  }

  const taggedByClass: Clause21aTaggedRow[] = [];
  let taggedTotal = 0;
  for (const taxClass of CLAUSE_21A_TAX_CLASSES) {
    const ids = byClassIds.get(taxClass) || [];
    if (!ids.length) {
      taggedByClass.push({ taxClass, categoryCount: 0, expenseCount: 0, amount: 0 });
      continue;
    }
    const expenses = await db.expense.findMany({
      where: {
        ...opts.expenseWhere,
        expenseDate: { gte: opts.fromDate, lte: opts.toDate },
        expenseCategoryId: { in: ids },
      },
      select: { amount: true },
      take: 5000,
    });
    const amount = round2(expenses.reduce((s, e) => s + Number(e.amount), 0));
    taggedByClass.push({
      taxClass,
      categoryCount: ids.length,
      expenseCount: expenses.length,
      amount,
    });
    taggedTotal += amount;
  }

  const disallowIds = byClassIds.get('DISALLOWABLE') || [];
  let overlapCashInDisallowable = 0;
  if (disallowIds.length) {
    const cashRows = await db.expense.findMany({
      where: {
        ...opts.expenseWhere,
        expenseDate: { gte: opts.fromDate, lte: opts.toDate },
        expenseCategoryId: { in: disallowIds },
      },
      select: {
        amount: true,
        sourceType: true,
        rule6DdExceptionCode: true,
        paymentMode: { select: { name: true, slug: true } },
      },
      take: 5000,
    });
    for (const e of cashRows) {
      if (e.rule6DdExceptionCode) continue;
      if (
        !isCashPaymentMode({
          sourceType: e.sourceType,
          paymentModeSlug: e.paymentMode?.slug,
          paymentModeName: e.paymentMode?.name,
        })
      ) {
        continue;
      }
      overlapCashInDisallowable += Number(e.amount);
    }
  }

  return {
    taggedByClass,
    taggedTotal: round2(taggedTotal),
    overlapCashInDisallowable: round2(overlapCashInDisallowable),
  };
}

/**
 * §36(1)(va) employee PF/ESI received but undeposited / late vs due-date proxy.
 * Separate from §43B employer PF. Books only — not EPFO/ESIC / Form 3CD.
 */
export async function summarizeSection36Va(
  db: Db,
  opts: {
    deductionWhere: Record<string, unknown>;
    fromDate: Date;
    toDate: Date;
  },
): Promise<{
  lineCount: number;
  pfReceived: number;
  esiReceived: number;
  disallowRowCount: number;
  totalPutativeDisallowance: number;
}> {
  const rows = await db.salaryTdsDeduction.findMany({
    where: {
      AND: [
        opts.deductionWhere,
        { payDate: { gte: opts.fromDate, lte: opts.toDate } },
        { OR: [{ employeePfAmount: { gt: 0 } }, { employeeEsiAmount: { gt: 0 } }] },
      ],
    },
    select: {
      payDate: true,
      employeePfAmount: true,
      employeeEsiAmount: true,
      pfDueDate: true,
      pfDepositedDate: true,
      esiDueDate: true,
      esiDepositedDate: true,
    },
    take: 2000,
  });

  let pfReceived = 0;
  let esiReceived = 0;
  let disallowRowCount = 0;
  let total = 0;

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
    if (s.totalDisallowance > 0) {
      disallowRowCount += 1;
      total += s.totalDisallowance;
    }
  }

  return {
    lineCount: rows.length,
    pfReceived: round2(pfReceived),
    esiReceived: round2(esiReceived),
    disallowRowCount,
    totalPutativeDisallowance: round2(total),
  };
}
