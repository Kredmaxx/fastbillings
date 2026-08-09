import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import {
  postAdvanceTaxPayment,
  postAdvanceTaxProvision,
  postAdvanceTaxSetoff,
  postInterest234Provision,
  reverseDocument,
  type PostingTx,
} from '../lib/ledger/ledgerPosting';
import { ensureMissingLedgerRoles, type ApplyPackTx } from '../lib/ledger/applyPack';
import { LedgerError } from '../lib/ledger/buildLines';
import { estimateInterest234 } from '../lib/interest234';

const INSTALLMENTS = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'OTHER']);

/** India FY Apr–Mar; default due dates for advance tax (non-corporate schedule). */
function defaultDueDates(fyLabel: string): Record<string, string> {
  const m = /^(\d{4})-(\d{2})$/.exec(fyLabel.trim());
  if (!m) return {};
  const y1 = Number(m[1]);
  const y2 = y1 + 1;
  return {
    Q1: `${y1}-06-15`,
    Q2: `${y1}-09-15`,
    Q3: `${y1}-12-15`,
    Q4: `${y2}-03-15`,
  };
}

/** Default year-end setoff date = 31 Mar of FY end year. */
function defaultSetoffDate(fyLabel: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(fyLabel.trim());
  if (!m) return null;
  return `${Number(m[1]) + 1}-03-31`;
}

function currentFyLabel(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth(); // 0=Jan
  if (m >= 3) {
    const next = String((y + 1) % 100).padStart(2, '0');
    return `${y}-${next}`;
  }
  const prev = y - 1;
  const curr = String(y % 100).padStart(2, '0');
  return `${prev}-${curr}`;
}

function money(n: Prisma.Decimal | number): number {
  return Math.round(Number(n) * 100) / 100;
}

function formatRow(r: {
  id: string;
  fyLabel: string;
  installment: string;
  dueDate: Date | null;
  paidDate: Date | null;
  amount: Prisma.Decimal | number;
  challanNo: string | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    fyLabel: r.fyLabel,
    installment: r.installment,
    dueDate: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    paidDate: r.paidDate ? r.paidDate.toISOString().slice(0, 10) : null,
    amount: money(r.amount),
    challanNo: r.challanNo,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

function formatSetoff(r: {
  id: string;
  fyLabel: string;
  setoffDate: Date;
  provisionAmount: Prisma.Decimal | number;
  setoffAmount: Prisma.Decimal | number;
  notes: string | null;
  createdAt: Date;
}) {
  const provisionAmount = money(r.provisionAmount);
  const setoffAmount = money(r.setoffAmount);
  return {
    id: r.id,
    fyLabel: r.fyLabel,
    setoffDate: r.setoffDate.toISOString().slice(0, 10),
    provisionAmount,
    setoffAmount,
    taxStillPayable: Math.max(0, Math.round((provisionAmount - setoffAmount) * 100) / 100),
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

function formatInterestProvision(r: {
  id: string;
  fyLabel: string;
  provisionDate: Date;
  amount234B: Prisma.Decimal | number;
  amount234C: Prisma.Decimal | number;
  totalAmount: Prisma.Decimal | number;
  estimatedLiabilitySnapshot: Prisma.Decimal | number | null;
  advanceTaxPaidSnapshot: Prisma.Decimal | number | null;
  asOfDate: Date | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    fyLabel: r.fyLabel,
    provisionDate: r.provisionDate.toISOString().slice(0, 10),
    amount234B: money(r.amount234B),
    amount234C: money(r.amount234C),
    totalAmount: money(r.totalAmount),
    estimatedLiabilitySnapshot:
      r.estimatedLiabilitySnapshot != null ? money(r.estimatedLiabilitySnapshot) : null,
    advanceTaxPaidSnapshot:
      r.advanceTaxPaidSnapshot != null ? money(r.advanceTaxPaidSnapshot) : null,
    asOfDate: r.asOfDate ? r.asOfDate.toISOString().slice(0, 10) : null,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

async function ensureLedgerRolesForUser(
  tx: {
    companySettings: {
      findFirst: (args: unknown) => Promise<{
        countryCode: string | null;
        functionalCurrency: string | null;
        tenantId: string | null;
        ledgerInitialized: boolean;
      } | null>;
    };
  },
  userId: string,
  tenantId: string | null,
): Promise<void> {
  const settings = await tx.companySettings.findFirst({
    where: { OR: tenantId ? [{ tenantId }, { userId }] : [{ userId }] },
    select: {
      countryCode: true,
      functionalCurrency: true,
      tenantId: true,
      ledgerInitialized: true,
    },
  });
  if (!settings?.ledgerInitialized) return;
  await ensureMissingLedgerRoles(tx as unknown as ApplyPackTx, {
    userId,
    tenantId: tenantId ?? settings.tenantId ?? null,
    countryCode: settings.countryCode ?? 'IN',
    functionalCurrency: settings.functionalCurrency ?? null,
  });
}

export async function listAdvanceTax(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const fy = ((req.query.fy as string) || currentFyLabel()).trim();
    const estimatedLiability = Math.max(0, Number(req.query.estimatedLiability ?? 0) || 0);

    const rows = await prisma.advanceTaxPayment.findMany({
      where: {
        isDeleted: false,
        fyLabel: fy,
        AND: [{ OR: tenantOrUserScope(req).OR }],
      },
      orderBy: [{ installment: 'asc' }, { paidDate: 'asc' }],
    });

    const [setoffRow, latestSat, interestProvisionRow] = await Promise.all([
      prisma.advanceTaxSetoff.findFirst({
        where: {
          isDeleted: false,
          fyLabel: fy,
          AND: [{ OR: tenantOrUserScope(req).OR }],
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.selfAssessmentTaxPayment.findFirst({
        where: {
          isDeleted: false,
          fyLabel: fy,
          paidDate: { not: null },
          AND: [{ OR: tenantOrUserScope(req).OR }],
        },
        orderBy: { paidDate: 'desc' },
        select: { paidDate: true },
      }),
      prisma.interest234Provision.findFirst({
        where: {
          isDeleted: false,
          fyLabel: fy,
          AND: [{ OR: tenantOrUserScope(req).OR }],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const paidTotal = rows.reduce((s, r) => s + money(r.amount), 0);
    const byInstallment: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OTHER: 0 };
    for (const r of rows) {
      const key = INSTALLMENTS.has(r.installment) ? r.installment : 'OTHER';
      byInstallment[key] = (byInstallment[key] ?? 0) + money(r.amount);
    }

    const dues = defaultDueDates(fy);
    const schedule = (['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => {
      const cumulativePct = q === 'Q1' ? 0.15 : q === 'Q2' ? 0.45 : q === 'Q3' ? 0.75 : 1;
      const cumulativeTarget = Math.round(estimatedLiability * cumulativePct * 100) / 100;
      const paidThrough = (['Q1', 'Q2', 'Q3', 'Q4'] as const)
        .slice(0, ['Q1', 'Q2', 'Q3', 'Q4'].indexOf(q) + 1)
        .reduce((s, k) => s + (byInstallment[k] ?? 0), 0);
      return {
        installment: q,
        dueDate: dues[q] ?? null,
        cumulativePct,
        cumulativeTarget,
        paidInInstallment: byInstallment[q] ?? 0,
        paidThrough,
        shortfall: Math.max(0, Math.round((cumulativeTarget - paidThrough) * 100) / 100),
      };
    });

    const setoff = setoffRow ? formatSetoff(setoffRow) : null;
    const interestProvision = interestProvisionRow
      ? formatInterestProvision(interestProvisionRow)
      : null;
    const suggestedSetoff = Math.min(
      paidTotal,
      estimatedLiability > 0 ? estimatedLiability : paidTotal,
    );

    const interestEstimate =
      estimatedLiability > 0
        ? estimateInterest234({
            fyLabel: fy,
            estimatedLiability,
            advanceTaxPaid: Math.round(paidTotal * 100) / 100,
            schedule,
            asOfDate: latestSat?.paidDate ?? null,
          })
        : null;

    res.json({
      success: true,
      data: {
        fyLabel: fy,
        estimatedLiability,
        notes:
          'Books advance-tax tracker (IT Act instalment schedule). GL: Dr ADVANCE_TAX / Cr BANK on payment; year-end provision Dr INCOME_TAX_EXPENSE / Cr TAX_PAYABLE then Dr TAX_PAYABLE / Cr ADVANCE_TAX. Interest 234B/C estimate can be posted as a books provision (same expense/payable roles). Not OLTAS / ITR / CPC.',
        dueDates: dues,
        defaultSetoffDate: defaultSetoffDate(fy),
        summary: {
          paidTotal: Math.round(paidTotal * 100) / 100,
          remaining:
            estimatedLiability > 0
              ? Math.max(0, Math.round((estimatedLiability - paidTotal) * 100) / 100)
              : null,
          paymentCount: rows.length,
          suggestedSetoff: Math.round(suggestedSetoff * 100) / 100,
          hasSetoff: Boolean(setoff),
          hasInterest234Provision: Boolean(interestProvision),
          interest234Total: interestEstimate?.totalInterest ?? null,
          interest234Provisioned: interestProvision?.totalAmount ?? null,
        },
        schedule,
        payments: rows.map(formatRow),
        setoff,
        interestEstimate,
        interestProvision,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listAdvanceTax error:', err);
    res.status(500).json({ success: false, message: 'Failed to list advance tax' });
  }
}

export async function createAdvanceTax(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const fyLabel = String(body.fyLabel ?? currentFyLabel()).trim();
    const installment = String(body.installment ?? 'OTHER').trim().toUpperCase();
    if (!INSTALLMENTS.has(installment)) {
      res.status(400).json({ success: false, message: 'installment must be Q1, Q2, Q3, Q4, or OTHER' });
      return;
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ success: false, message: 'amount must be greater than 0' });
      return;
    }

    const dues = defaultDueDates(fyLabel);
    const dueDateStr =
      body.dueDate != null && String(body.dueDate).trim()
        ? String(body.dueDate).slice(0, 10)
        : dues[installment] ?? null;
    const paidDateStr =
      body.paidDate != null && String(body.paidDate).trim()
        ? String(body.paidDate).slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const roundedAmount = Math.round(amount * 100) / 100;
    const paidDate = paidDateStr ? new Date(`${paidDateStr}T00:00:00.000Z`) : new Date();
    const tenantId = optionalTenantId(req);
    const challanNo = body.challanNo != null ? String(body.challanNo).trim() || null : null;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.advanceTaxPayment.create({
        data: {
          userId,
          tenantId,
          fyLabel,
          installment,
          dueDate: dueDateStr ? new Date(`${dueDateStr}T00:00:00.000Z`) : null,
          paidDate,
          amount: new Prisma.Decimal(roundedAmount),
          challanNo,
          notes: body.notes != null ? String(body.notes).trim() || null : null,
        },
      });

      await ensureLedgerRolesForUser(tx as unknown as ApplyPackTx, userId, tenantId);

      await postAdvanceTaxPayment(tx as unknown as PostingTx, {
        userId,
        paymentId: row.id,
        date: paidDate,
        amount: String(roundedAmount),
        installment,
        challanNo,
      });

      return row;
    });

    res.status(201).json({
      success: true,
      message: 'Advance tax payment recorded',
      data: { payment: formatRow(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof LedgerError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('createAdvanceTax error:', err);
    res.status(500).json({ success: false, message: 'Failed to create advance tax payment' });
  }
}

export async function deleteAdvanceTax(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.advanceTaxPayment.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Payment not found' });
      return;
    }
    const setoffExists = await prisma.advanceTaxSetoff.findFirst({
      where: {
        isDeleted: false,
        fyLabel: existing.fyLabel,
        AND: [{ OR: tenantOrUserScope(req).OR }],
      },
      select: { id: true },
    });
    if (setoffExists) {
      res.status(400).json({
        success: false,
        message: 'Delete the year-end setoff for this FY before deleting advance-tax payments',
      });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await reverseDocument(tx as unknown as PostingTx, {
        userId: existing.userId,
        sourceType: 'AdvanceTaxPayment',
        sourceId: id,
        event: 'payment',
      });
      await tx.advanceTaxPayment.update({
        where: { id },
        data: { isDeleted: true },
      });
    });
    res.json({ success: true, message: 'Payment deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof LedgerError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteAdvanceTax error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete payment' });
  }
}

/**
 * POST /api/admin/advance-tax/setoff
 * Year-end books: provision tax payable, then set off advance tax (not ITR / OLTAS).
 */
export async function createAdvanceTaxSetoff(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    const fyLabel = String(body.fyLabel ?? currentFyLabel()).trim();
    if (!/^(\d{4})-(\d{2})$/.test(fyLabel)) {
      res.status(400).json({ success: false, message: 'fyLabel must be YYYY-YY' });
      return;
    }

    const provisionAmount = Math.round(Number(body.estimatedLiability ?? body.provisionAmount) * 100) / 100;
    if (!Number.isFinite(provisionAmount) || provisionAmount <= 0) {
      res.status(400).json({
        success: false,
        message: 'estimatedLiability (provision) must be greater than 0',
      });
      return;
    }

    const existing = await prisma.advanceTaxSetoff.findFirst({
      where: {
        isDeleted: false,
        fyLabel,
        AND: [{ OR: tenantOrUserScope(req).OR }],
      },
    });
    if (existing) {
      res.status(400).json({
        success: false,
        message: `A year-end setoff already exists for FY ${fyLabel}. Delete it first to re-run.`,
      });
      return;
    }

    const payments = await prisma.advanceTaxPayment.findMany({
      where: {
        isDeleted: false,
        fyLabel,
        AND: [{ OR: tenantOrUserScope(req).OR }],
      },
      select: { amount: true },
    });
    const paidTotal = Math.round(payments.reduce((s, r) => s + money(r.amount), 0) * 100) / 100;
    if (paidTotal <= 0) {
      res.status(400).json({
        success: false,
        message: 'Record at least one advance-tax payment for this FY before setoff',
      });
      return;
    }

    let setoffAmount = Math.min(paidTotal, provisionAmount);
    if (body.setoffAmount != null && String(body.setoffAmount).trim() !== '') {
      const requested = Math.round(Number(body.setoffAmount) * 100) / 100;
      if (!Number.isFinite(requested) || requested <= 0) {
        res.status(400).json({ success: false, message: 'setoffAmount must be greater than 0' });
        return;
      }
      if (requested > paidTotal + 0.001) {
        res.status(400).json({
          success: false,
          message: `setoffAmount cannot exceed advance tax paid (${paidTotal})`,
        });
        return;
      }
      if (requested > provisionAmount + 0.001) {
        res.status(400).json({
          success: false,
          message: `setoffAmount cannot exceed provision (${provisionAmount})`,
        });
        return;
      }
      setoffAmount = requested;
    }

    const setoffDateStr =
      body.setoffDate != null && String(body.setoffDate).trim()
        ? String(body.setoffDate).slice(0, 10)
        : defaultSetoffDate(fyLabel) || new Date().toISOString().slice(0, 10);
    const setoffDate = new Date(`${setoffDateStr}T00:00:00.000Z`);
    const notes = body.notes != null ? String(body.notes).trim() || null : null;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.advanceTaxSetoff.create({
        data: {
          userId,
          tenantId,
          fyLabel,
          setoffDate,
          provisionAmount: new Prisma.Decimal(provisionAmount),
          setoffAmount: new Prisma.Decimal(setoffAmount),
          notes,
        },
      });

      await ensureLedgerRolesForUser(tx as unknown as ApplyPackTx, userId, tenantId);

      await postAdvanceTaxProvision(tx as unknown as PostingTx, {
        userId,
        setoffId: row.id,
        date: setoffDate,
        amount: String(provisionAmount),
        fyLabel,
      });
      await postAdvanceTaxSetoff(tx as unknown as PostingTx, {
        userId,
        setoffId: row.id,
        date: setoffDate,
        amount: String(setoffAmount),
        fyLabel,
      });

      return row;
    });

    res.status(201).json({
      success: true,
      message: 'Year-end advance tax setoff recorded',
      data: { setoff: formatSetoff(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof LedgerError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('createAdvanceTaxSetoff error:', err);
    res.status(500).json({ success: false, message: 'Failed to create advance tax setoff' });
  }
}

export async function deleteAdvanceTaxSetoff(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.advanceTaxSetoff.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Setoff not found' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await reverseDocument(tx as unknown as PostingTx, {
        userId: existing.userId,
        sourceType: 'AdvanceTaxSetoff',
        sourceId: id,
        event: 'setoff',
      });
      await reverseDocument(tx as unknown as PostingTx, {
        userId: existing.userId,
        sourceType: 'AdvanceTaxSetoff',
        sourceId: id,
        event: 'provision',
      });
      await tx.advanceTaxSetoff.update({
        where: { id },
        data: { isDeleted: true },
      });
    });
    res.json({ success: true, message: 'Setoff deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof LedgerError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteAdvanceTaxSetoff error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete setoff' });
  }
}

/**
 * POST /api/admin/advance-tax/interest-provision
 * Post books estimate of 234B/C interest to GL (Dr INCOME_TAX_EXPENSE / Cr TAX_PAYABLE).
 */
export async function createInterest234Provision(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    const fyLabel = String(body.fyLabel ?? currentFyLabel()).trim();
    if (!/^(\d{4})-(\d{2})$/.test(fyLabel)) {
      res.status(400).json({ success: false, message: 'fyLabel must be YYYY-YY' });
      return;
    }

    const existing = await prisma.interest234Provision.findFirst({
      where: {
        isDeleted: false,
        fyLabel,
        AND: [{ OR: tenantOrUserScope(req).OR }],
      },
    });
    if (existing) {
      res.status(400).json({
        success: false,
        message: `An interest 234B/C provision already exists for FY ${fyLabel}. Delete it first to re-run.`,
      });
      return;
    }

    const payments = await prisma.advanceTaxPayment.findMany({
      where: {
        isDeleted: false,
        fyLabel,
        AND: [{ OR: tenantOrUserScope(req).OR }],
      },
      orderBy: [{ installment: 'asc' }, { paidDate: 'asc' }],
    });
    const paidTotal = Math.round(payments.reduce((s, r) => s + money(r.amount), 0) * 100) / 100;
    const byInstallment: Record<string, number> = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OTHER: 0 };
    for (const r of payments) {
      const key = INSTALLMENTS.has(r.installment) ? r.installment : 'OTHER';
      byInstallment[key] = (byInstallment[key] ?? 0) + money(r.amount);
    }

    const estimatedLiability = Math.round(
      Number(body.estimatedLiability ?? body.estimatedLiabilitySnapshot ?? 0) * 100,
    ) / 100;

    let amount234B = Math.round(Number(body.amount234B ?? NaN) * 100) / 100;
    let amount234C = Math.round(Number(body.amount234C ?? NaN) * 100) / 100;
    let totalAmount = Math.round(Number(body.totalAmount ?? NaN) * 100) / 100;
    let asOfDate: Date | null = null;

    if (
      !Number.isFinite(amount234B) ||
      !Number.isFinite(amount234C) ||
      !Number.isFinite(totalAmount) ||
      totalAmount <= 0
    ) {
      if (!Number.isFinite(estimatedLiability) || estimatedLiability <= 0) {
        res.status(400).json({
          success: false,
          message: 'Provide estimatedLiability (or explicit amount234B/amount234C/totalAmount)',
        });
        return;
      }
      const dues = defaultDueDates(fyLabel);
      const schedule = (['Q1', 'Q2', 'Q3', 'Q4'] as const).map((q) => {
        const cumulativePct = q === 'Q1' ? 0.15 : q === 'Q2' ? 0.45 : q === 'Q3' ? 0.75 : 1;
        const cumulativeTarget = Math.round(estimatedLiability * cumulativePct * 100) / 100;
        const paidThrough = (['Q1', 'Q2', 'Q3', 'Q4'] as const)
          .slice(0, ['Q1', 'Q2', 'Q3', 'Q4'].indexOf(q) + 1)
          .reduce((s, k) => s + (byInstallment[k] ?? 0), 0);
        return {
          installment: q,
          dueDate: dues[q] ?? null,
          cumulativePct,
          cumulativeTarget,
          paidInInstallment: byInstallment[q] ?? 0,
          paidThrough,
          shortfall: Math.max(0, Math.round((cumulativeTarget - paidThrough) * 100) / 100),
        };
      });
      const latestSat = await prisma.selfAssessmentTaxPayment.findFirst({
        where: {
          isDeleted: false,
          fyLabel,
          paidDate: { not: null },
          AND: [{ OR: tenantOrUserScope(req).OR }],
        },
        orderBy: { paidDate: 'desc' },
        select: { paidDate: true },
      });
      const est = estimateInterest234({
        fyLabel,
        estimatedLiability,
        advanceTaxPaid: paidTotal,
        schedule,
        asOfDate: latestSat?.paidDate ?? null,
      });
      amount234B = est.section234B.interest;
      amount234C = est.section234C.total;
      totalAmount = est.totalInterest;
      asOfDate = est.section234B.asOfDate
        ? new Date(`${est.section234B.asOfDate}T00:00:00.000Z`)
        : null;
    }

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      res.status(400).json({
        success: false,
        message: 'Interest total must be greater than 0 (nothing to provision)',
      });
      return;
    }
    if (!Number.isFinite(amount234B) || amount234B < 0) amount234B = 0;
    if (!Number.isFinite(amount234C) || amount234C < 0) amount234C = 0;

    if (body.asOfDate != null && String(body.asOfDate).trim()) {
      asOfDate = new Date(`${String(body.asOfDate).slice(0, 10)}T00:00:00.000Z`);
    }

    const provisionDateStr =
      body.provisionDate != null && String(body.provisionDate).trim()
        ? String(body.provisionDate).slice(0, 10)
        : asOfDate
          ? asOfDate.toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
    const provisionDate = new Date(`${provisionDateStr}T00:00:00.000Z`);
    const notes =
      body.notes != null
        ? String(body.notes).trim() || null
        : 'Books interest u/s 234B/C provision — not CPC / ITR / OLTAS';

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.interest234Provision.create({
        data: {
          userId,
          tenantId,
          fyLabel,
          provisionDate,
          amount234B: new Prisma.Decimal(amount234B),
          amount234C: new Prisma.Decimal(amount234C),
          totalAmount: new Prisma.Decimal(totalAmount),
          estimatedLiabilitySnapshot:
            estimatedLiability > 0 ? new Prisma.Decimal(estimatedLiability) : null,
          advanceTaxPaidSnapshot: new Prisma.Decimal(paidTotal),
          asOfDate,
          notes,
        },
      });

      await ensureLedgerRolesForUser(tx as unknown as ApplyPackTx, userId, tenantId);
      await postInterest234Provision(tx as unknown as PostingTx, {
        userId,
        provisionId: row.id,
        date: provisionDate,
        amount: String(totalAmount),
        fyLabel,
      });

      return row;
    });

    res.status(201).json({
      success: true,
      message: 'Interest u/s 234B/C provision recorded',
      data: { interestProvision: formatInterestProvision(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof LedgerError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('createInterest234Provision error:', err);
    res.status(500).json({ success: false, message: 'Failed to create interest provision' });
  }
}

export async function deleteInterest234Provision(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.interest234Provision.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Interest provision not found' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await reverseDocument(tx as unknown as PostingTx, {
        userId: existing.userId,
        sourceType: 'Interest234Provision',
        sourceId: id,
        event: 'provision',
      });
      await tx.interest234Provision.update({
        where: { id },
        data: { isDeleted: true },
      });
    });
    res.json({ success: true, message: 'Interest provision deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof LedgerError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteInterest234Provision error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete interest provision' });
  }
}

const handlers = {
  listAdvanceTax,
  createAdvanceTax,
  deleteAdvanceTax,
  createAdvanceTaxSetoff,
  deleteAdvanceTaxSetoff,
  createInterest234Provision,
  deleteInterest234Provision,
};
module.exports = handlers;
module.exports.default = handlers;
