import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  UnauthorizedError,
} from '../lib/tenantScope';
import { post } from '../lib/ledger/postingEngine';
import type { LineInstruction } from '../lib/ledger/types';


export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const rows = await prisma.accountingPeriod.findMany({
      where: { ...tenantOrUserFilter(req) },
      orderBy: { startDate: 'desc' },
    });
    res.json({
      success: true,
      data: {
        accountingPeriods: rows.map((r) => ({ ...r })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingPeriod list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list periods' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as { name?: string; startDate?: string; endDate?: string; notes?: string };
    if (!body.name || !body.startDate || !body.endDate) {
      res.status(400).json({ success: false, message: 'name + startDate + endDate required' });
      return;
    }
    const created = await prisma.accountingPeriod.create({
      data: {
        userId,
        tenantId: optionalTenantId(req),
        name: body.name,
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        notes: body.notes ?? null,
      },
    });
    res.status(201).json({ success: true, message: 'Period created', data: { accountingPeriod: { ...created } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingPeriod create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create period' });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { name?: string; startDate?: string; endDate?: string; notes?: string };

    const existing = await prisma.accountingPeriod.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Period not found' });
      return;
    }
    if (existing.isLocked) {
      res.status(400).json({ success: false, message: 'Cannot edit a locked period' });
      return;
    }
    const data: Prisma.AccountingPeriodUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
    if (body.endDate !== undefined) data.endDate = new Date(body.endDate);
    if (body.notes !== undefined) data.notes = body.notes;

    const updated = await prisma.accountingPeriod.update({ where: { id }, data });
    res.json({ success: true, message: 'Period updated', data: { accountingPeriod: { ...updated } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingPeriod update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update period' });
  }
}

export async function lock(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.accountingPeriod.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Period not found' });
      return;
    }
    if (existing.isLocked) {
      res.status(400).json({ success: false, message: 'Already locked' });
      return;
    }
    const updated = await prisma.accountingPeriod.update({
      where: { id },
      data: { isLocked: true, lockedAt: new Date(), lockedBy: userId },
    });
    res.json({ success: true, message: 'Period locked', data: { accountingPeriod: { ...updated } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingPeriod lock error:', err);
    res.status(500).json({ success: false, message: 'Failed to lock period' });
  }
}

export async function unlock(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.accountingPeriod.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Period not found' });
      return;
    }
    const updated = await prisma.accountingPeriod.update({
      where: { id },
      data: { isLocked: false, lockedAt: null, lockedBy: null },
    });
    res.json({ success: true, message: 'Period unlocked', data: { accountingPeriod: { ...updated } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingPeriod unlock error:', err);
    res.status(500).json({ success: false, message: 'Failed to unlock period' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.accountingPeriod.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Period not found' });
      return;
    }
    if (existing.isLocked) {
      res.status(400).json({ success: false, message: 'Cannot delete a locked period; unlock first' });
      return;
    }
    await prisma.accountingPeriod.delete({ where: { id } });
    res.json({ success: true, message: 'Period deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingPeriod remove error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete period' });
  }
}

/**
 * POST /api/admin/accounting-periods/:id/close-year
 * Closes P&L accounts into RETAINED_EARNINGS for the period, then locks it.
 */
export async function closeYear(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.accountingPeriod.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Period not found' });
      return;
    }
    if (existing.isClosed) {
      res.status(400).json({ success: false, message: 'Period already closed' });
      return;
    }
    if (existing.isLocked) {
      res.status(400).json({
        success: false,
        message: 'Unlock the period before closing (closing posts a journal entry first)',
      });
      return;
    }

    const settings = await prisma.companySettings.findFirst({
      where: { ...tenantOrUserFilter(req) },
      select: { ledgerInitialized: true, functionalCurrency: true },
    });
    if (!settings?.ledgerInitialized) {
      res.status(400).json({ success: false, message: 'Ledger must be initialized before FY close' });
      return;
    }

    const accounts = await prisma.account.findMany({
      where: {
        isDeleted: false,
        accountType: { in: ['INCOME', 'EXPENSE'] },
        ...tenantOrUserFilter(req),
      },
      include: {
        journalLines: {
          where: {
            journalEntry: {
              isDeleted: false,
              entryDate: { gte: existing.startDate, lte: existing.endDate },
              ...tenantOrUserFilter(req),
            },
          },
          select: { baseDebit: true, baseCredit: true },
        },
      },
    });

    const instructions: LineInstruction[] = [];
    let netIncome = 0;

    for (const a of accounts) {
      const debit = a.journalLines.reduce((s, l) => s.plus(l.baseDebit), new Prisma.Decimal(0));
      const credit = a.journalLines.reduce((s, l) => s.plus(l.baseCredit), new Prisma.Decimal(0));
      if (a.accountType === 'INCOME') {
        const bal = credit.minus(debit); // credit-normal
        if (bal.greaterThan(0)) {
          instructions.push({
            accountId: a.id,
            side: 'debit',
            amount: bal.toFixed(4),
            description: `Close ${a.code} ${a.name}`,
          });
          netIncome += Number(bal);
        }
      } else {
        const bal = debit.minus(credit); // debit-normal
        if (bal.greaterThan(0)) {
          instructions.push({
            accountId: a.id,
            side: 'credit',
            amount: bal.toFixed(4),
            description: `Close ${a.code} ${a.name}`,
          });
          netIncome -= Number(bal);
        }
      }
    }

    if (instructions.length === 0 || Math.abs(netIncome) < 0.005) {
      const updated = await prisma.accountingPeriod.update({
        where: { id },
        data: {
          isClosed: true,
          closedAt: new Date(),
          closedBy: userId,
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: userId,
        },
      });
      res.json({
        success: true,
        message: 'Period closed (no P&L balances to transfer)',
        data: { accountingPeriod: updated, closingJournalId: null, netIncome: 0 },
      });
      return;
    }

    instructions.push({
      roleKey: 'RETAINED_EARNINGS',
      side: netIncome >= 0 ? 'credit' : 'debit',
      amount: Math.abs(netIncome).toFixed(4),
      description: 'FY close — retained earnings',
    });

    const currencyCode = settings.functionalCurrency || 'INR';
    const journal = await prisma.$transaction(async (tx) => {
      const je = await post(tx as never, {
        userId,
        tenantId: optionalTenantId(req),
        sourceType: 'AccountingPeriod',
        sourceId: id,
        event: 'fy_close',
        date: existing.endDate,
        currencyCode,
        description: `Year-end close: ${existing.name}`,
        instructions,
      });
      await tx.accountingPeriod.update({
        where: { id },
        data: {
          isClosed: true,
          closedAt: new Date(),
          closedBy: userId,
          closingJournalId: je.id,
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: userId,
        },
      });
      return je;
    });

    const updated = await prisma.accountingPeriod.findUnique({ where: { id } });
    res.json({
      success: true,
      message: 'Period closed to retained earnings',
      data: {
        accountingPeriod: updated,
        closingJournalId: journal.id,
        netIncome: Math.round(netIncome * 100) / 100,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to close period';
    console.error('accountingPeriod closeYear error:', err);
    res.status(500).json({ success: false, message });
  }
}

const handlers = { list, create, update, lock, unlock, remove, closeYear };
module.exports = handlers;
module.exports.default = handlers;
