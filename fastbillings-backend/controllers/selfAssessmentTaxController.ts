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
  postSelfAssessmentTaxPayment,
  reverseDocument,
  type PostingTx,
} from '../lib/ledger/ledgerPosting';
import { ensureMissingLedgerRoles, type ApplyPackTx } from '../lib/ledger/applyPack';
import { LedgerError } from '../lib/ledger/buildLines';

function currentFyLabel(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth();
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
  paidDate: Date | null;
  amount: Prisma.Decimal | number;
  challanNo: string | null;
  notes: string | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    fyLabel: r.fyLabel,
    paidDate: r.paidDate ? r.paidDate.toISOString().slice(0, 10) : null,
    amount: money(r.amount),
    challanNo: r.challanNo,
    notes: r.notes,
    createdAt: r.createdAt,
  };
}

export async function listSelfAssessmentTax(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const fy = ((req.query.fy as string) || currentFyLabel()).trim();

    const [payments, setoff, interestProvision] = await Promise.all([
      prisma.selfAssessmentTaxPayment.findMany({
        where: {
          isDeleted: false,
          fyLabel: fy,
          AND: [{ OR: tenantOrUserScope(req).OR }],
        },
        orderBy: [{ paidDate: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.advanceTaxSetoff.findFirst({
        where: {
          isDeleted: false,
          fyLabel: fy,
          AND: [{ OR: tenantOrUserScope(req).OR }],
        },
        orderBy: { createdAt: 'desc' },
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

    const paidTotal = Math.round(payments.reduce((s, r) => s + money(r.amount), 0) * 100) / 100;
    const interestPayable = interestProvision ? money(interestProvision.totalAmount) : 0;
    const taxStillPayableAfterSetoff = setoff
      ? Math.max(0, money(setoff.provisionAmount) - money(setoff.setoffAmount))
      : null;
    const taxStillPayable =
      taxStillPayableAfterSetoff == null && !interestProvision
        ? null
        : Math.round(((taxStillPayableAfterSetoff ?? 0) + interestPayable) * 100) / 100;
    const remaining =
      taxStillPayable == null
        ? null
        : Math.max(0, Math.round((taxStillPayable - paidTotal) * 100) / 100);

    res.json({
      success: true,
      data: {
        fyLabel: fy,
        notes:
          'Books self-assessment tax tracker. Settles remaining income-tax payable after advance-tax setoff and any interest u/s 234B/C provision (Dr TAX_PAYABLE / Cr BANK when ledger live). Not OLTAS / ITR e-pay.',
        summary: {
          taxStillPayableAfterSetoff,
          interest234Provisioned: interestProvision ? interestPayable : null,
          taxStillPayable,
          paidTotal,
          remaining,
          paymentCount: payments.length,
          hasSetoff: Boolean(setoff),
          hasInterest234Provision: Boolean(interestProvision),
        },
        setoff: setoff
          ? {
              id: setoff.id,
              provisionAmount: money(setoff.provisionAmount),
              setoffAmount: money(setoff.setoffAmount),
              taxStillPayable: taxStillPayableAfterSetoff,
              setoffDate: setoff.setoffDate.toISOString().slice(0, 10),
            }
          : null,
        interestProvision: interestProvision
          ? {
              id: interestProvision.id,
              totalAmount: interestPayable,
              amount234B: money(interestProvision.amount234B),
              amount234C: money(interestProvision.amount234C),
              provisionDate: interestProvision.provisionDate.toISOString().slice(0, 10),
            }
          : null,
        payments: payments.map(formatRow),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listSelfAssessmentTax error:', err);
    res.status(500).json({ success: false, message: 'Failed to list self-assessment tax' });
  }
}

export async function createSelfAssessmentTax(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    const fyLabel = String(body.fyLabel ?? currentFyLabel()).trim();
    if (!/^(\d{4})-(\d{2})$/.test(fyLabel)) {
      res.status(400).json({ success: false, message: 'fyLabel must be YYYY-YY' });
      return;
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ success: false, message: 'amount must be greater than 0' });
      return;
    }

    const paidDateStr =
      body.paidDate != null && String(body.paidDate).trim()
        ? String(body.paidDate).slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const paidDate = new Date(`${paidDateStr}T00:00:00.000Z`);
    const roundedAmount = Math.round(amount * 100) / 100;
    const challanNo = body.challanNo != null ? String(body.challanNo).trim() || null : null;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.selfAssessmentTaxPayment.create({
        data: {
          userId,
          tenantId,
          fyLabel,
          paidDate,
          amount: new Prisma.Decimal(roundedAmount),
          challanNo,
          notes: body.notes != null ? String(body.notes).trim() || null : null,
        },
      });

      const settings = await tx.companySettings.findFirst({
        where: { OR: tenantId ? [{ tenantId }, { userId }] : [{ userId }] },
        select: {
          countryCode: true,
          functionalCurrency: true,
          tenantId: true,
          ledgerInitialized: true,
        },
      });
      if (settings?.ledgerInitialized) {
        await ensureMissingLedgerRoles(tx as unknown as ApplyPackTx, {
          userId,
          tenantId: tenantId ?? settings.tenantId ?? null,
          countryCode: settings.countryCode ?? 'IN',
          functionalCurrency: settings.functionalCurrency ?? null,
        });
      }

      await postSelfAssessmentTaxPayment(tx as unknown as PostingTx, {
        userId,
        paymentId: row.id,
        date: paidDate,
        amount: String(roundedAmount),
        fyLabel,
        challanNo,
      });

      return row;
    });

    res.status(201).json({
      success: true,
      message: 'Self-assessment tax payment recorded',
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
    console.error('createSelfAssessmentTax error:', err);
    res.status(500).json({ success: false, message: 'Failed to create self-assessment tax payment' });
  }
}

export async function deleteSelfAssessmentTax(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.selfAssessmentTaxPayment.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Payment not found' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await reverseDocument(tx as unknown as PostingTx, {
        userId: existing.userId,
        sourceType: 'SelfAssessmentTaxPayment',
        sourceId: id,
        event: 'payment',
      });
      await tx.selfAssessmentTaxPayment.update({
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
    console.error('deleteSelfAssessmentTax error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete payment' });
  }
}

const handlers = {
  listSelfAssessmentTax,
  createSelfAssessmentTax,
  deleteSelfAssessmentTax,
};
module.exports = handlers;
module.exports.default = handlers;
