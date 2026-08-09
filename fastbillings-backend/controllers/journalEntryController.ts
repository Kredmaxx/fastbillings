import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';


async function generateEntryNumber(req: Request): Promise<string> {
  const last = await prisma.journalEntry.findFirst({
    where: { entryNumber: { not: null }, ...tenantOrUserFilter(req) },
    orderBy: { createdAt: 'desc' },
    select: { entryNumber: true },
  });
  let lastNum = 0;
  if (last?.entryNumber) {
    const m = last.entryNumber.match(/\d+$/);
    if (m) lastNum = parseInt(m[0], 10);
  }
  return `JE-${String(lastNum + 1).padStart(6, '0')}`;
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));

    const where: Prisma.JournalEntryWhereInput = { ...tenantOrUserScope(req) };
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    if (from || to) {
      where.entryDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: { include: { account: { select: { id: true, code: true, name: true } } } },
        },
        orderBy: { entryDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        journalEntries: rows.map((e) => ({
          id: e.id,
          entryNumber: e.entryNumber,
          entryDate: e.entryDate,
          description: e.description,
          reference: e.reference,
          totalDebit: e.lines.reduce((s, l) => s + Number(l.debit ?? 0), 0),
          totalCredit: e.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0),
          lineCount: e.lines.length,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('journalEntry list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list journal entries' });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const row = await prisma.journalEntry.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      include: { lines: { include: { account: { select: { id: true, code: true, name: true, accountType: true } } } } },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Journal entry not found' });
      return;
    }
    res.json({ success: true, data: { journalEntry: { ...row } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('journalEntry getById error:', err);
    res.status(500).json({ success: false, message: 'Failed to load journal entry' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as {
      entryDate?: string;
      description?: string;
      reference?: string;
      lines?: Array<{ accountId: string; debit?: number; credit?: number; description?: string }>;
    };

    if (!Array.isArray(body.lines) || body.lines.length < 2) {
      res.status(400).json({ success: false, message: 'At least 2 lines required' });
      return;
    }

    const totalDebit = body.lines.reduce((s, l) => s + Number(l.debit ?? 0), 0);
    const totalCredit = body.lines.reduce((s, l) => s + Number(l.credit ?? 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      res.status(400).json({ success: false, message: `Debits (${totalDebit}) must equal credits (${totalCredit})` });
      return;
    }

    // Verify all accounts belong to workspace
    const accountIds = body.lines.map((l) => l.accountId);
    const accounts = await prisma.account.findMany({
      where: { id: { in: accountIds }, ...tenantOrUserScope(req) },
    });
    if (accounts.length !== new Set(accountIds).size) {
      res.status(400).json({ success: false, message: 'One or more accounts not found' });
      return;
    }

    const entryNumber = await generateEntryNumber(req);
    const created = await prisma.journalEntry.create({
      data: {
        userId,
        tenantId: optionalTenantId(req),
        entryNumber,
        entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
        description: body.description ?? null,
        reference: body.reference ?? null,
        lines: {
          create: body.lines.map((l) => ({
            accountId: l.accountId,
            debit: new Prisma.Decimal(Number(l.debit ?? 0)),
            credit: new Prisma.Decimal(Number(l.credit ?? 0)),
            description: l.description ?? null,
          })),
        },
      },
      include: { lines: true },
    });

    res.status(201).json({ success: true, message: 'Journal entry created', data: { journalEntry: { ...created } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('journalEntry create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create journal entry' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.journalEntry.findFirst({ where: { id, ...tenantOrUserScope(req) } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Journal entry not found' });
      return;
    }
    await prisma.journalEntry.update({ where: { id }, data: { isDeleted: true } });
    res.json({ success: true, message: 'Journal entry deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('journalEntry remove error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete journal entry' });
  }
}

const handlers = { list, getById, create, remove };
module.exports = handlers;
module.exports.default = handlers;
