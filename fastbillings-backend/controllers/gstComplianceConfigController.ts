import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { optionalTenantId, requireUserId, UnauthorizedError } from '../lib/tenantScope';
import { findGstComplianceConfig } from '../lib/gstProviders/resolve';
import { isGstProviderName } from '../lib/gstProviders/types';

function redact(config: unknown): unknown {
  if (!config || typeof config !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
    if (k === 'baseUrl' || k === 'gstin') {
      out[k] = v;
      continue;
    }
    if (typeof v === 'string' && v.length > 4) {
      out[k] = `${v.slice(0, 4)}…${v.slice(-2)}`;
    } else if (typeof v === 'string') {
      out[k] = '***';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function mergeConfig(
  existing: unknown,
  incoming: unknown,
): Prisma.InputJsonValue {
  const prev =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const next =
    incoming && typeof incoming === 'object' && !Array.isArray(incoming)
      ? (incoming as Record<string, unknown>)
      : {};
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && (v.includes('…') || v === '***')) continue; // keep prior secret
    prev[k] = v;
  }
  return prev as Prisma.InputJsonValue;
}

function toPublic(row: {
  eInvoiceProvider: string;
  eWayProvider: string;
  enabled: boolean;
  livemode: boolean;
  config: unknown;
  updatedAt: Date;
  tenantId?: string | null;
}, reveal: boolean) {
  return {
    eInvoiceProvider: row.eInvoiceProvider,
    eWayProvider: row.eWayProvider,
    enabled: row.enabled,
    livemode: row.livemode,
    config: reveal ? row.config : redact(row.config),
    tenantScoped: Boolean(row.tenantId),
    updatedAt: row.updatedAt,
  };
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const reveal = req.query.reveal === 'true';
    const row = await findGstComplianceConfig(userId, tenantId);
    res.json({
      success: true,
      data: {
        gstCompliance: row
          ? toPublic(row, reveal)
          : {
              eInvoiceProvider: 'mock',
              eWayProvider: 'mock',
              enabled: true,
              livemode: false,
              config: {},
              tenantScoped: Boolean(tenantId),
              updatedAt: null,
            },
        providers: [
          { id: 'mock', label: 'Mock (dev / demo)' },
          { id: 'cleartax', label: 'ClearTax' },
          { id: 'masters_india', label: 'Masters India' },
        ],
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstCompliance get error:', err);
    res.status(500).json({ success: false, message: 'Failed to load GST compliance config' });
  }
}

export async function upsert(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    const eInvoiceProvider = String(body.eInvoiceProvider ?? 'mock');
    const eWayProvider = String(body.eWayProvider ?? 'mock');
    if (!isGstProviderName(eInvoiceProvider) || !isGstProviderName(eWayProvider)) {
      res.status(400).json({
        success: false,
        message: 'eInvoiceProvider and eWayProvider must be mock | cleartax | masters_india',
      });
      return;
    }

    const enabled =
      body.enabled === undefined ? true : body.enabled === true || body.enabled === 'true';
    const livemode = body.livemode === true || body.livemode === 'true';

    // Workspace-first: one shared config per tenant; legacy falls back to userId upsert
    let existing = await findGstComplianceConfig(userId, tenantId);
    if (!existing && tenantId) {
      // Prefer attaching the caller's legacy user row to the tenant before creating a new one
      existing = await prisma.gstComplianceConfig.findUnique({ where: { userId } });
    }

    const config = mergeConfig(existing?.config, body.config);

    let row;
    if (existing) {
      row = await prisma.gstComplianceConfig.update({
        where: { id: existing.id },
        data: {
          eInvoiceProvider,
          eWayProvider,
          enabled: body.enabled === undefined ? undefined : enabled,
          livemode: body.livemode === undefined ? undefined : livemode,
          config,
          ...(tenantId && !existing.tenantId ? { tenantId } : {}),
        },
      });
    } else if (tenantId) {
      try {
        row = await prisma.gstComplianceConfig.create({
          data: {
            userId,
            tenantId,
            eInvoiceProvider,
            eWayProvider,
            enabled,
            livemode,
            config,
          },
        });
      } catch (e) {
        // Concurrent create for same tenant — update the winner
        const raced = await prisma.gstComplianceConfig.findUnique({ where: { tenantId } });
        if (!raced) throw e;
        row = await prisma.gstComplianceConfig.update({
          where: { id: raced.id },
          data: {
            eInvoiceProvider,
            eWayProvider,
            enabled: body.enabled === undefined ? undefined : enabled,
            livemode: body.livemode === undefined ? undefined : livemode,
            config: mergeConfig(raced.config, body.config),
          },
        });
      }
    } else {
      row = await prisma.gstComplianceConfig.upsert({
        where: { userId },
        create: {
          userId,
          eInvoiceProvider,
          eWayProvider,
          enabled,
          livemode,
          config,
        },
        update: {
          eInvoiceProvider,
          eWayProvider,
          enabled: body.enabled === undefined ? undefined : enabled,
          livemode: body.livemode === undefined ? undefined : livemode,
          config,
        },
      });
    }

    res.json({
      success: true,
      message: 'GST compliance settings saved',
      data: {
        gstCompliance: toPublic(row, false),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstCompliance upsert error:', err);
    res.status(500).json({ success: false, message: 'Failed to save GST compliance config' });
  }
}

const handlers = { get, upsert };
module.exports = handlers;
module.exports.default = handlers;
