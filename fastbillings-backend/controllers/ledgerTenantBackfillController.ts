import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { requireUserId, UnauthorizedError } from '../lib/tenantScope';

/**
 * POST /api/admin/ledger/backfill-tenant
 * Stamps tenantId on GL rows for the current user's company when null.
 * Safe / idempotent — only fills where tenantId IS NULL.
 */
export async function backfillLedgerTenant(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      const company = await prisma.companySettings.findUnique({
        where: { userId },
        select: { tenantId: true },
      });
      if (!company?.tenantId) {
        res.status(400).json({
          success: false,
          message: 'No tenantId on session or company settings — nothing to backfill.',
        });
        return;
      }
      return runBackfill(res, userId, company.tenantId);
    }
    return runBackfill(res, userId, tenantId);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('backfillLedgerTenant error:', err);
    res.status(500).json({ success: false, message: 'Failed to backfill ledger tenantId' });
  }
}

async function runBackfill(res: Response, userId: string, tenantId: string): Promise<void> {
  const [accounts, journals, periods, mappings] = await prisma.$transaction([
    prisma.account.updateMany({
      where: { userId, tenantId: null },
      data: { tenantId },
    }),
    prisma.journalEntry.updateMany({
      where: { userId, tenantId: null },
      data: { tenantId },
    }),
    prisma.accountingPeriod.updateMany({
      where: { userId, tenantId: null },
      data: { tenantId },
    }),
    prisma.ledgerAccountMapping.updateMany({
      where: { userId, tenantId: null },
      data: { tenantId },
    }),
  ]);

  // Keep companySettings.tenantId in sync when missing
  await prisma.companySettings.updateMany({
    where: { userId, tenantId: null },
    data: { tenantId },
  });

  res.json({
    success: true,
    message: 'Ledger tenantId backfill complete',
    data: {
      tenantId,
      updated: {
        accounts: accounts.count,
        journalEntries: journals.count,
        accountingPeriods: periods.count,
        ledgerMappings: mappings.count,
      },
    },
  });
}

const handlers = { backfillLedgerTenant };
module.exports = handlers;
module.exports.default = handlers;
