import type { Request, Response } from 'express';
import type { TaxDepositChallanSourceType } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import { invoiceScope, userDocScope } from '../lib/gstReportUtils';
import {
  postTaxDepositChallan,
  reverseDocument,
  type PostingTx,
} from '../lib/ledger/ledgerPosting';
import { LedgerError } from '../lib/ledger/buildLines';

const KINDS = new Set(['TDS', 'TCS']);
const QUARTERS = new Set(['Q1', 'Q2', 'Q3', 'Q4']);
const SOURCE_TYPES = new Set<TaxDepositChallanSourceType>(['PURCHASE', 'INVOICE', 'SALARY']);

function currentFyLabel(d = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) {
    return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  }
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}

function money(n: Prisma.Decimal | number): number {
  return Math.round(Number(n) * 100) / 100;
}

function isComplete(r: {
  bsrCode: string;
  challanNo: string;
  depositDate: Date | null;
  amount: Prisma.Decimal | number;
}): boolean {
  return Boolean(
    r.bsrCode?.trim() &&
      r.challanNo?.trim() &&
      r.depositDate &&
      Number(r.amount) > 0,
  );
}

function formatRow(
  r: {
    id: string;
    kind: string;
    fyLabel: string;
    quarter: string;
    section: string | null;
    bsrCode: string;
    challanNo: string;
    depositDate: Date;
    amount: Prisma.Decimal | number;
    notes: string | null;
    createdAt: Date;
  },
  allocatedTotal = 0,
) {
  const amount = money(r.amount);
  const allocated = money(allocatedTotal);
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
    notes: r.notes,
    complete: isComplete(r),
    allocatedTotal: allocated,
    unallocatedAmount: money(Math.max(0, amount - allocated)),
    createdAt: r.createdAt,
  };
}

async function allocatedTotalsByChallan(
  challanIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!challanIds.length) return map;
  const rows = await prisma.taxDepositChallanAllocation.groupBy({
    by: ['challanId'],
    where: { challanId: { in: challanIds } },
    _sum: { amount: true },
  });
  for (const r of rows) {
    map.set(r.challanId, money(r._sum.amount ?? 0));
  }
  return map;
}

export async function listTaxDepositChallans(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const fy = ((req.query.fy as string) || currentFyLabel()).trim();
    const kindRaw = ((req.query.kind as string) || '').trim().toUpperCase();
    const quarterRaw = ((req.query.quarter as string) || '').trim().toUpperCase();

    const where: Prisma.TaxDepositChallanWhereInput = {
      isDeleted: false,
      fyLabel: fy,
      AND: [{ OR: tenantOrUserScope(req).OR }],
    };
    if (kindRaw) {
      if (!KINDS.has(kindRaw)) {
        res.status(400).json({ success: false, message: 'kind must be TDS or TCS' });
        return;
      }
      where.kind = kindRaw;
    }
    if (quarterRaw) {
      if (!QUARTERS.has(quarterRaw)) {
        res.status(400).json({ success: false, message: 'quarter must be Q1–Q4' });
        return;
      }
      where.quarter = quarterRaw;
    }

    const rows = await prisma.taxDepositChallan.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { quarter: 'asc' }, { depositDate: 'asc' }],
    });
    const allocMap = await allocatedTotalsByChallan(rows.map((r) => r.id));
    const formatted = rows.map((r) => formatRow(r, allocMap.get(r.id) ?? 0));
    const completeRows = formatted.filter((r) => r.complete);
    const depositedTotal = completeRows.reduce((s, r) => s + r.amount, 0);
    const allocatedTotal = formatted.reduce((s, r) => s + r.allocatedTotal, 0);

    res.json({
      success: true,
      data: {
        fyLabel: fy,
        kind: kindRaw || null,
        quarter: quarterRaw || null,
        notes:
          'Books TDS/TCS deposit challan tracker with deductee line mapping and GL settlement (Dr TDS/TCS payable / Cr BANK when ledger is live). Not OLTAS / TRACES filing.',
        summary: {
          count: formatted.length,
          completeCount: completeRows.length,
          depositedTotal: money(depositedTotal),
          allocatedTotal: money(allocatedTotal),
          unallocatedTotal: money(Math.max(0, depositedTotal - allocatedTotal)),
          allComplete: formatted.length > 0 && completeRows.length === formatted.length,
        },
        challans: formatted,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listTaxDepositChallans error:', err);
    res.status(500).json({ success: false, message: 'Failed to list tax deposit challans' });
  }
}

export async function createTaxDepositChallan(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const kind = String(body.kind ?? '').trim().toUpperCase();
    if (!KINDS.has(kind)) {
      res.status(400).json({ success: false, message: 'kind must be TDS or TCS' });
      return;
    }
    const fyLabel = String(body.fyLabel ?? currentFyLabel()).trim();
    const quarter = String(body.quarter ?? '').trim().toUpperCase();
    if (!QUARTERS.has(quarter)) {
      res.status(400).json({ success: false, message: 'quarter must be Q1, Q2, Q3, or Q4' });
      return;
    }
    const bsrCode = String(body.bsrCode ?? '').trim();
    const challanNo = String(body.challanNo ?? '').trim();
    if (!bsrCode || !challanNo) {
      res.status(400).json({ success: false, message: 'bsrCode and challanNo are required' });
      return;
    }
    const depositDateStr = String(body.depositDate ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(depositDateStr)) {
      res.status(400).json({ success: false, message: 'depositDate must be YYYY-MM-DD' });
      return;
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ success: false, message: 'amount must be greater than 0' });
      return;
    }

    const roundedAmount = Math.round(amount * 100) / 100;
    const depositDate = new Date(`${depositDateStr}T00:00:00.000Z`);

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.taxDepositChallan.create({
        data: {
          userId,
          tenantId: optionalTenantId(req),
          kind,
          fyLabel,
          quarter,
          section:
            body.section != null && String(body.section).trim()
              ? String(body.section).trim()
              : null,
          bsrCode,
          challanNo,
          depositDate,
          amount: new Prisma.Decimal(roundedAmount),
          notes: body.notes != null ? String(body.notes).trim() || null : null,
        },
      });
      await postTaxDepositChallan(tx as unknown as PostingTx, {
        userId,
        challanId: row.id,
        date: depositDate,
        amount: String(roundedAmount),
        kind: kind as 'TDS' | 'TCS',
        challanNo,
      });
      return row;
    });

    res.status(201).json({
      success: true,
      message: 'Tax deposit challan recorded',
      data: { challan: formatRow(created, 0) },
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
    console.error('createTaxDepositChallan error:', err);
    res.status(500).json({ success: false, message: 'Failed to create tax deposit challan' });
  }
}

export async function deleteTaxDepositChallan(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.taxDepositChallan.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Challan not found' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await reverseDocument(tx as unknown as PostingTx, {
        userId: existing.userId,
        sourceType: 'TaxDepositChallan',
        sourceId: id,
        event: 'deposit',
      });
      await tx.taxDepositChallanAllocation.deleteMany({ where: { challanId: id } });
      await tx.taxDepositChallan.update({
        where: { id },
        data: { isDeleted: true },
      });
    });
    res.json({ success: true, message: 'Challan deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof LedgerError) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteTaxDepositChallan error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete challan' });
  }
}

export async function listChallanAllocations(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const challan = await prisma.taxDepositChallan.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!challan) {
      res.status(404).json({ success: false, message: 'Challan not found' });
      return;
    }
    const rows = await prisma.taxDepositChallanAllocation.findMany({
      where: { challanId: id },
      orderBy: { createdAt: 'asc' },
    });
    const allocatedTotal = money(rows.reduce((s, r) => s + Number(r.amount), 0));
    res.json({
      success: true,
      data: {
        challan: formatRow(challan, allocatedTotal),
        allocations: rows.map((r) => ({
          id: r.id,
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          amount: money(r.amount),
        })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listChallanAllocations error:', err);
    res.status(500).json({ success: false, message: 'Failed to list allocations' });
  }
}

export async function replaceChallanAllocations(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const challan = await prisma.taxDepositChallan.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!challan) {
      res.status(404).json({ success: false, message: 'Challan not found' });
      return;
    }

    const raw = (req.body as { allocations?: unknown }).allocations;
    if (!Array.isArray(raw)) {
      res.status(400).json({ success: false, message: 'allocations must be an array' });
      return;
    }

    const allowedSources: TaxDepositChallanSourceType[] =
      challan.kind === 'TCS' ? ['INVOICE'] : ['PURCHASE', 'SALARY'];
    const defaultSource = allowedSources[0];
    const parsed: Array<{ sourceType: TaxDepositChallanSourceType; sourceId: string; amount: number }> =
      [];
    for (const item of raw) {
      const row = item as Record<string, unknown>;
      const sourceType = String(row.sourceType ?? defaultSource).toUpperCase() as TaxDepositChallanSourceType;
      if (!SOURCE_TYPES.has(sourceType) || !allowedSources.includes(sourceType)) {
        res.status(400).json({
          success: false,
          message: `sourceType must be ${allowedSources.join(' or ')} for ${challan.kind} challans`,
        });
        return;
      }
      const sourceId = String(row.sourceId ?? '').trim();
      const amount = Number(row.amount);
      if (!sourceId || !Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({
          success: false,
          message: 'Each allocation needs sourceId and amount > 0',
        });
        return;
      }
      parsed.push({ sourceType, sourceId, amount: money(amount) });
    }

    const allocatedTotal = money(parsed.reduce((s, a) => s + a.amount, 0));
    const challanAmount = money(challan.amount);
    if (allocatedTotal - challanAmount > 0.01) {
      res.status(400).json({
        success: false,
        message: `Allocated total ₹${allocatedTotal} exceeds challan amount ₹${challanAmount}`,
      });
      return;
    }

    // Validate sources exist in scope and match kind
    if (parsed.length) {
      const byType = new Map<TaxDepositChallanSourceType, string[]>();
      for (const p of parsed) {
        const list = byType.get(p.sourceType) || [];
        list.push(p.sourceId);
        byType.set(p.sourceType, list);
      }
      for (const [sourceType, ids] of byType) {
        if (sourceType === 'PURCHASE') {
          const found = await prisma.purchase.findMany({
            where: { id: { in: ids }, ...userDocScope(req), tdsAmount: { gt: 0 } },
            select: { id: true },
          });
          if (found.length !== new Set(ids).size) {
            res.status(400).json({
              success: false,
              message: 'One or more purchase IDs are invalid or have no TDS',
            });
            return;
          }
        } else if (sourceType === 'SALARY') {
          const found = await prisma.salaryTdsDeduction.findMany({
            where: {
              id: { in: ids },
              isDeleted: false,
              ...tenantOrUserScope(req),
              tdsAmount: { gt: 0 },
            },
            select: { id: true },
          });
          if (found.length !== new Set(ids).size) {
            res.status(400).json({
              success: false,
              message: 'One or more salary TDS deduction IDs are invalid or have no TDS',
            });
            return;
          }
        } else {
          const found = await prisma.invoice.findMany({
            where: {
              id: { in: ids },
              ...invoiceScope(req),
              tcsAmount: { gt: 0 },
              status: { notIn: ['DRAFT', 'CANCELLED'] },
            },
            select: { id: true },
          });
          if (found.length !== new Set(ids).size) {
            res.status(400).json({
              success: false,
              message: 'One or more invoice IDs are invalid or have no TCS',
            });
            return;
          }
        }
      }
    }

    const tenantId = optionalTenantId(req);
    await prisma.$transaction(async (tx) => {
      await tx.taxDepositChallanAllocation.deleteMany({ where: { challanId: id } });
      if (parsed.length) {
        await tx.taxDepositChallanAllocation.createMany({
          data: parsed.map((a) => ({
            challanId: id,
            sourceType: a.sourceType,
            sourceId: a.sourceId,
            amount: new Prisma.Decimal(a.amount),
            userId,
            tenantId,
          })),
        });
      }
    });

    const rows = await prisma.taxDepositChallanAllocation.findMany({
      where: { challanId: id },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      message: 'Challan allocations saved',
      data: {
        challan: formatRow(challan, allocatedTotal),
        allocations: rows.map((r) => ({
          id: r.id,
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          amount: money(r.amount),
        })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('replaceChallanAllocations error:', err);
    res.status(500).json({ success: false, message: 'Failed to save allocations' });
  }
}

/**
 * GET /tax-deposit-challans/candidates?kind=TDS|TCS&fy=&quarter=
 * Documents with TDS/TCS in the quarter and remaining unallocated tax.
 */
export async function listAllocationCandidates(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const kind = String(req.query.kind ?? 'TDS').trim().toUpperCase();
    if (!KINDS.has(kind)) {
      res.status(400).json({ success: false, message: 'kind must be TDS or TCS' });
      return;
    }
    // Reuse quarter parsing via fake query on a cloned pattern
    const fy = ((req.query.fy as string) || currentFyLabel()).trim();
    const quarterRaw = ((req.query.quarter as string) || '').trim().toUpperCase();
    if (!QUARTERS.has(quarterRaw)) {
      res.status(400).json({ success: false, message: 'quarter must be Q1–Q4' });
      return;
    }
    // Build date range from fy+quarter
    const qNum = Number(quarterRaw.slice(1)) as 1 | 2 | 3 | 4;
    const startYear = Number(fy.slice(0, 4));
    const monthStart = [3, 6, 9, 0][qNum - 1];
    const yearStart = qNum === 4 ? startYear + 1 : startYear;
    const fromDate = new Date(yearStart, monthStart, 1, 0, 0, 0, 0);
    const toDate = new Date(fromDate);
    toDate.setMonth(toDate.getMonth() + 3);
    toDate.setMilliseconds(-1);

    const sourceTypeParam = String(req.query.sourceType ?? '').trim().toUpperCase();
    const sourceType: TaxDepositChallanSourceType =
      kind === 'TCS'
        ? 'INVOICE'
        : sourceTypeParam === 'SALARY'
          ? 'SALARY'
          : 'PURCHASE';
    const allocRows = await prisma.taxDepositChallanAllocation.findMany({
      where: {
        sourceType,
        challan: {
          isDeleted: false,
          kind,
          fyLabel: fy,
          quarter: quarterRaw,
          AND: [{ OR: tenantOrUserScope(req).OR }],
        },
      },
      select: { sourceId: true, amount: true, challanId: true, challan: { select: { challanNo: true } } },
    });
    const allocatedBySource = new Map<string, number>();
    const challanNosBySource = new Map<string, Set<string>>();
    for (const a of allocRows) {
      allocatedBySource.set(
        a.sourceId,
        money((allocatedBySource.get(a.sourceId) ?? 0) + Number(a.amount)),
      );
      const set = challanNosBySource.get(a.sourceId) || new Set<string>();
      set.add(a.challan.challanNo);
      challanNosBySource.set(a.sourceId, set);
    }

    if (kind === 'TDS' && sourceType === 'SALARY') {
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
      const candidates = deductions.map((d) => {
        const tax = money(d.tdsAmount);
        const allocated = allocatedBySource.get(d.id) ?? 0;
        return {
          sourceType: 'SALARY' as const,
          sourceId: d.id,
          documentNo: d.employee.employeeCode || d.employee.name,
          partyName: d.employee.name,
          date: d.payDate.toISOString().slice(0, 10),
          section: d.section,
          taxAmount: tax,
          allocatedAmount: allocated,
          remainingAmount: money(Math.max(0, tax - allocated)),
          challanNos: [...(challanNosBySource.get(d.id) || [])],
        };
      });
      res.json({
        success: true,
        data: {
          kind,
          sourceType,
          fyLabel: fy,
          quarter: quarterRaw,
          period: { from: fromDate, to: toDate },
          candidates,
        },
      });
      return;
    }

    if (kind === 'TDS') {
      const purchases = await prisma.purchase.findMany({
        where: {
          ...userDocScope(req),
          purchaseDate: { gte: fromDate, lte: toDate },
          tdsAmount: { gt: 0 },
        },
        select: {
          id: true,
          purchaseId: true,
          purchaseDate: true,
          tdsSection: true,
          tdsAmount: true,
          taxableAmount: true,
          totalAmount: true,
        },
        orderBy: { purchaseDate: 'asc' },
      });
      const candidates = purchases.map((p) => {
        const tax = money(p.tdsAmount ?? 0);
        const allocated = allocatedBySource.get(p.id) ?? 0;
        return {
          sourceType: 'PURCHASE' as const,
          sourceId: p.id,
          documentNo: p.purchaseId,
          date: p.purchaseDate.toISOString().slice(0, 10),
          section: p.tdsSection,
          taxAmount: tax,
          allocatedAmount: allocated,
          remainingAmount: money(Math.max(0, tax - allocated)),
          challanNos: [...(challanNosBySource.get(p.id) || [])],
        };
      });
      res.json({
        success: true,
        data: {
          kind,
          sourceType: 'PURCHASE',
          fyLabel: fy,
          quarter: quarterRaw,
          period: { from: fromDate, to: toDate },
          candidates,
        },
      });
      return;
    }

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
        tcsSection: true,
        tcsAmount: true,
        taxableAmount: true,
        TotalAmount: true,
      },
      orderBy: { invoiceDate: 'asc' },
    });
    const candidates = invoices.map((inv) => {
      const tax = money(inv.tcsAmount ?? 0);
      const allocated = allocatedBySource.get(inv.id) ?? 0;
      return {
        sourceType: 'INVOICE' as const,
        sourceId: inv.id,
        documentNo: inv.invoiceNumber,
        date: inv.invoiceDate.toISOString().slice(0, 10),
        section: inv.tcsSection,
        taxAmount: tax,
        allocatedAmount: allocated,
        remainingAmount: money(Math.max(0, tax - allocated)),
        challanNos: [...(challanNosBySource.get(inv.id) || [])],
      };
    });
    res.json({
      success: true,
      data: {
        kind,
        fyLabel: fy,
        quarter: quarterRaw,
        period: { from: fromDate, to: toDate },
        candidates,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listAllocationCandidates error:', err);
    res.status(500).json({ success: false, message: 'Failed to list allocation candidates' });
  }
}

const handlers = {
  listTaxDepositChallans,
  createTaxDepositChallan,
  deleteTaxDepositChallan,
  listChallanAllocations,
  replaceChallanAllocations,
  listAllocationCandidates,
};
module.exports = handlers;
module.exports.default = handlers;
