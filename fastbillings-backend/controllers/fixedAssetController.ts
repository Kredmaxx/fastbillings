// controllers/fixedAssetController.ts
// P3.4 — Fixed Assets + Depreciation CRUD and depreciation-run endpoint.
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import { depreciationDue } from '../lib/ledger/depreciation';
import { postDepreciation, postAssetAcquisition } from '../lib/ledger/ledgerPosting';

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

function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Format a Date as 'YYYY-MM' for the idempotency event key. */
function periodKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

// =============================================================================
// CRUD — Fixed Assets
// =============================================================================

/**
 * GET /fixed-assets
 * List all non-deleted fixed assets for the authenticated tenant.
 */
export async function listFixedAssets(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const assets = await prisma.fixedAsset.findMany({
      where: { ...tenantOrUserScope(req) },
      orderBy: [{ status: 'asc' }, { acquisitionDate: 'desc' }],
    });
    res.json({ success: true, data: assets });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('listFixedAssets error:', err);
    res.status(500).json({ success: false, message: 'Failed to list fixed assets' });
  }
}

/**
 * POST /fixed-assets
 * Body: { name, cost, salvageValue?, usefulLifeMonths, method?, acquisitionDate, postAcquisition? }
 *
 * `postAcquisition` defaults to false.
 * - When false (default): the acquisition cost is assumed to have already been recorded
 *   by another document (e.g. a purchase invoice) — no GL entry is made to avoid double-counting.
 * - When true: an acquisition posting (Dr FIXED_ASSET / Cr BANK) is created via the ledger
 *   engine only if the ledger is live and the acquisition date is on/after the go-live date.
 */
export async function createFixedAsset(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const {
      name,
      cost,
      salvageValue,
      usefulLifeMonths,
      method,
      acquisitionDate,
      postAcquisition = false,
      itBlock,
      itRatePercent,
      itOpeningWdv,
    } = req.body as {
      name?: string;
      cost?: string;
      salvageValue?: string;
      usefulLifeMonths?: number;
      method?: string;
      acquisitionDate?: string;
      postAcquisition?: boolean;
      itBlock?: string | null;
      itRatePercent?: string | number | null;
      itOpeningWdv?: string | number | null;
    };

    if (!name || !cost || !usefulLifeMonths || !acquisitionDate) {
      res.status(400).json({ success: false, message: 'name, cost, usefulLifeMonths, acquisitionDate are required' });
      return;
    }

    const acqDate = parseDate(acquisitionDate);
    if (!acqDate) {
      res.status(400).json({ success: false, message: 'Invalid acquisitionDate' });
      return;
    }

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.fixedAsset.create({
        data: {
          userId,
          tenantId,
          name,
          cost: new Prisma.Decimal(cost),
          salvageValue: salvageValue ? new Prisma.Decimal(salvageValue) : new Prisma.Decimal(0),
          usefulLifeMonths: Number(usefulLifeMonths),
          method: method ?? 'STRAIGHT_LINE',
          acquisitionDate: acqDate,
          itBlock:
            itBlock != null && String(itBlock).trim() ? String(itBlock).trim() : null,
          itRatePercent:
            itRatePercent != null && String(itRatePercent) !== ''
              ? new Prisma.Decimal(itRatePercent)
              : null,
          itOpeningWdv:
            itOpeningWdv != null && String(itOpeningWdv) !== ''
              ? new Prisma.Decimal(itOpeningWdv)
              : null,
        },
      });

      if (postAcquisition) {
        // Opt-in: post Dr FIXED_ASSET / Cr BANK at cost.
        // No-op when ledger not live (gated internally).
        await postAssetAcquisition(
          tx as never,
          { userId, assetId: created.id, date: acqDate, cost },
        );
      }

      return created;
    });

    res.status(201).json({ success: true, data: asset });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('createFixedAsset error:', err);
    res.status(500).json({ success: false, message: 'Failed to create fixed asset' });
  }
}

/**
 * PUT /fixed-assets/:id
 * Update mutable fields of a fixed asset. Accumulated depreciation and status are
 * managed by the system (run-depreciation); they are intentionally excluded here.
 */
export async function updateFixedAsset(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const {
      name,
      cost,
      salvageValue,
      usefulLifeMonths,
      method,
      acquisitionDate,
      itBlock,
      itRatePercent,
      itOpeningWdv,
    } = req.body as {
      name?: string;
      cost?: string;
      salvageValue?: string;
      usefulLifeMonths?: number;
      method?: string;
      acquisitionDate?: string;
      itBlock?: string | null;
      itRatePercent?: string | number | null;
      itOpeningWdv?: string | number | null;
    };

    const existing = await prisma.fixedAsset.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Fixed asset not found' });
      return;
    }

    const acqDate = acquisitionDate ? parseDate(acquisitionDate) : undefined;
    if (acquisitionDate && !acqDate) {
      res.status(400).json({ success: false, message: 'Invalid acquisitionDate' });
      return;
    }

    const updated = await prisma.fixedAsset.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(cost !== undefined && { cost: new Prisma.Decimal(cost) }),
        ...(salvageValue !== undefined && { salvageValue: new Prisma.Decimal(salvageValue) }),
        ...(usefulLifeMonths !== undefined && { usefulLifeMonths: Number(usefulLifeMonths) }),
        ...(method !== undefined && { method }),
        ...(acqDate !== undefined && { acquisitionDate: acqDate }),
        ...(itBlock !== undefined && {
          itBlock: itBlock != null && String(itBlock).trim() ? String(itBlock).trim() : null,
        }),
        ...(itRatePercent !== undefined && {
          itRatePercent:
            itRatePercent != null && String(itRatePercent) !== ''
              ? new Prisma.Decimal(itRatePercent)
              : null,
        }),
        ...(itOpeningWdv !== undefined && {
          itOpeningWdv:
            itOpeningWdv != null && String(itOpeningWdv) !== ''
              ? new Prisma.Decimal(itOpeningWdv)
              : null,
        }),
        ...(!existing.tenantId && optionalTenantId(req)
          ? { tenantId: optionalTenantId(req) }
          : {}),
      },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('updateFixedAsset error:', err);
    res.status(500).json({ success: false, message: 'Failed to update fixed asset' });
  }
}

/**
 * DELETE /fixed-assets/:id
 * Soft-delete a fixed asset.
 */
export async function deleteFixedAsset(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.fixedAsset.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Fixed asset not found' });
      return;
    }

    await prisma.fixedAsset.update({
      where: { id },
      data: { isDeleted: true, status: 'disposed' },
    });

    res.json({ success: true, message: 'Fixed asset deleted' });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('deleteFixedAsset error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete fixed asset' });
  }
}

// =============================================================================
// Depreciation Run
// =============================================================================

/**
 * POST /fixed-assets/run-depreciation
 * Body: { asOf: ISO date string }
 *
 * For each active asset belonging to the tenant:
 *  1. Compute depreciationDue(asset, asOf).
 *  2. If amount > 0, inside a $transaction:
 *     a. Post Dr DEPRECIATION_EXPENSE / Cr ACCUMULATED_DEPRECIATION (gated, idempotent).
 *     b. Update asset: accumulatedDepreciation += amount, lastDepreciatedOn = asOf.
 *        Set status = 'fully_depreciated' when the asset is now fully depreciated.
 *
 * Returns per-asset results: { assetId, name, months, amount, status }.
 */
export async function runDepreciation(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { asOf: asOfRaw } = req.body as { asOf?: string };

    if (!asOfRaw) {
      res.status(400).json({ success: false, message: 'asOf date is required' });
      return;
    }

    const asOf = parseDate(asOfRaw);
    if (!asOf) {
      res.status(400).json({ success: false, message: 'Invalid asOf date' });
      return;
    }

    const period = periodKey(asOf);

    const assets = await prisma.fixedAsset.findMany({
      where: { ...tenantOrUserScope(req), status: 'active' },
    });

    const results: {
      assetId: string;
      name: string;
      months: number;
      amount: string;
      status: string;
    }[] = [];

    for (const asset of assets) {
      const due = depreciationDue(
        {
          cost: asset.cost,
          salvageValue: asset.salvageValue,
          usefulLifeMonths: asset.usefulLifeMonths,
          acquisitionDate: asset.acquisitionDate,
          accumulatedDepreciation: asset.accumulatedDepreciation,
          lastDepreciatedOn: asset.lastDepreciatedOn,
        },
        asOf,
      );

      if (due.months === 0) {
        results.push({ assetId: asset.id, name: asset.name, months: 0, amount: '0', status: asset.status });
        continue;
      }

      const newAccumulated = asset.accumulatedDepreciation.plus(new Prisma.Decimal(due.amount));
      const depreciableBase = asset.cost.minus(asset.salvageValue);
      const newStatus = newAccumulated.greaterThanOrEqualTo(depreciableBase)
        ? 'fully_depreciated'
        : 'active';

      await prisma.$transaction(async (tx) => {
        // Post to the GL (gated — no-op when ledger not live)
        await postDepreciation(tx as never, {
          userId,
          assetId: asset.id,
          date: asOf,
          amount: due.amount,
          period,
        });

        // Update the asset register
        await tx.fixedAsset.update({
          where: { id: asset.id },
          data: {
            accumulatedDepreciation: newAccumulated,
            lastDepreciatedOn: asOf,
            status: newStatus,
          },
        });
      });

      results.push({ assetId: asset.id, name: asset.name, months: due.months, amount: due.amount, status: newStatus });
    }

    res.json({ success: true, data: { period, results } });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('runDepreciation error:', err);
    res.status(500).json({ success: false, message: 'Failed to run depreciation' });
  }
}
