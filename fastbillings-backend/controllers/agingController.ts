// controllers/agingController.ts
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireUserId, UnauthorizedError } from '../lib/tenantScope';
import { bucketAging, type AgingItem } from '../lib/reports/aging';

// =============================================================================
// Helpers
// =============================================================================

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

function parseAsOf(value: unknown): Date {
  if (!value) return new Date();
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

// =============================================================================
// arAging — GET /reports/ar-aging?asOf=
// =============================================================================

export async function arAging(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const asOf = parseAsOf(req.query.asOf);

    const invoices = await prisma.invoice.findMany({
      where: {
        userId,
        isDeleted: false,
        invoiceType: 'INVOICE',
        status: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE', 'SENT'] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        TotalAmount: true,
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    });

    const items: AgingItem[] = [];
    for (const inv of invoices) {
      // Compute outstanding = TotalAmount − Σ payments.amount
      const totalPaid = inv.payments.reduce(
        (acc, p) => acc.add(new Prisma.Decimal(p.amount.toString())),
        new Prisma.Decimal(0),
      );
      const outstanding = new Prisma.Decimal(inv.TotalAmount.toString()).sub(totalPaid);
      if (outstanding.lte(0)) continue;

      const dueDate = inv.dueDate ?? inv.invoiceDate;
      const label = `${inv.invoiceNumber ?? inv.id} / ${inv.customer?.name ?? ''}`.trim();

      items.push({
        id: inv.id,
        label,
        amount: outstanding.toString(),
        dueDate,
      });
    }

    const result = bucketAging(items, asOf);

    res.json({
      success: true,
      data: {
        asOf: asOf.toISOString(),
        buckets: {
          current: result.buckets.current.toString(),
          d1_30: result.buckets.d1_30.toString(),
          d31_60: result.buckets.d31_60.toString(),
          d61_90: result.buckets.d61_90.toString(),
          d90plus: result.buckets.d90plus.toString(),
        },
        total: result.total.toString(),
        rows: result.rows.map((r) => ({
          id: r.id,
          label: r.label,
          amount: r.amount,
          dueDate: r.dueDate.toISOString(),
          daysOverdue: r.daysOverdue,
          bucket: r.bucket,
        })),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching AR aging:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AR aging report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// apAging — GET /reports/ap-aging?asOf=
// =============================================================================

export async function apAging(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const asOf = parseAsOf(req.query.asOf);

    const purchases = await prisma.purchase.findMany({
      where: {
        userId,
        isDeleted: false,
        balanceAmount: { gt: 0 },
      },
      select: {
        id: true,
        purchaseId: true,
        dueDate: true,
        balanceAmount: true,
        billFromUser: { select: { firstName: true, lastName: true } },
      },
    });

    const items: AgingItem[] = purchases.map((p) => {
      const supplierName = `${p.billFromUser?.firstName ?? ''} ${p.billFromUser?.lastName ?? ''}`.trim();
      const label = `${p.purchaseId ?? p.id} / ${supplierName}`.trim();
      return {
        id: p.id,
        label,
        amount: p.balanceAmount.toString(),
        dueDate: p.dueDate,
      };
    });

    const result = bucketAging(items, asOf);

    res.json({
      success: true,
      data: {
        asOf: asOf.toISOString(),
        buckets: {
          current: result.buckets.current.toString(),
          d1_30: result.buckets.d1_30.toString(),
          d31_60: result.buckets.d31_60.toString(),
          d61_90: result.buckets.d61_90.toString(),
          d90plus: result.buckets.d90plus.toString(),
        },
        total: result.total.toString(),
        rows: result.rows.map((r) => ({
          id: r.id,
          label: r.label,
          amount: r.amount,
          dueDate: r.dueDate.toISOString(),
          daysOverdue: r.daysOverdue,
          bucket: r.bucket,
        })),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching AP aging:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch AP aging report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// collections (dunning) — GET /reports/collections?asOf=
// =============================================================================

const DUNNING_STAGE: Record<string, string> = {
  d1_30: 'reminder',
  d31_60: 'first_notice',
  d61_90: 'second_notice',
  d90plus: 'final_notice',
};

export async function collections(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const asOf = parseAsOf(req.query.asOf);

    // Same source as arAging
    const invoices = await prisma.invoice.findMany({
      where: {
        userId,
        isDeleted: false,
        invoiceType: 'INVOICE',
        status: { in: ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE', 'SENT'] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        TotalAmount: true,
        customer: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    });

    const items: AgingItem[] = [];
    for (const inv of invoices) {
      const totalPaid = inv.payments.reduce(
        (acc, p) => acc.add(new Prisma.Decimal(p.amount.toString())),
        new Prisma.Decimal(0),
      );
      const outstanding = new Prisma.Decimal(inv.TotalAmount.toString()).sub(totalPaid);
      if (outstanding.lte(0)) continue;

      const dueDate = inv.dueDate ?? inv.invoiceDate;
      const label = `${inv.invoiceNumber ?? inv.id} / ${inv.customer?.name ?? ''}`.trim();

      items.push({
        id: inv.id,
        label,
        amount: outstanding.toString(),
        dueDate,
      });
    }

    const result = bucketAging(items, asOf);

    // Filter to overdue only and add dunning stage
    const overdueRows = result.rows
      .filter((r) => r.daysOverdue > 0)
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .map((r) => ({
        id: r.id,
        label: r.label,
        amount: r.amount,
        dueDate: r.dueDate.toISOString(),
        daysOverdue: r.daysOverdue,
        bucket: r.bucket,
        dunningStage: DUNNING_STAGE[r.bucket] ?? 'reminder',
      }));

    res.json({
      success: true,
      data: {
        asOf: asOf.toISOString(),
        buckets: {
          d1_30: result.buckets.d1_30.toString(),
          d31_60: result.buckets.d31_60.toString(),
          d61_90: result.buckets.d61_90.toString(),
          d90plus: result.buckets.d90plus.toString(),
        },
        total: result.total.sub(result.buckets.current).toString(),
        rows: overdueRows,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching collections report:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch collections report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
