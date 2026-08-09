import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import type { IntegrationKind, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  findAccountingIntegration,
  listAccountingIntegrations,
} from '../lib/accountingIntegrationConfig';
import { optionalTenantId, requireUserId, UnauthorizedError } from '../lib/tenantScope';
import { xeroProvider } from '../lib/accountingIntegrations/xeroProvider';
import { quickbooksProvider } from '../lib/accountingIntegrations/quickbooksProvider';

const KINDS = ['XERO', 'QUICKBOOKS'] as const;
function isKind(s: string | undefined): s is 'XERO' | 'QUICKBOOKS' {
  return !!s && (KINDS as readonly string[]).includes(s);
}

function getProvider(kind: IntegrationKind) {
  return kind === 'XERO' ? xeroProvider : quickbooksProvider;
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const rows = await listAccountingIntegrations(userId, tenantId);
    res.json({
      success: true,
      data: {
        integrations: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          enabled: r.enabled,
          lastSyncedAt: r.lastSyncedAt,
          syncStatus: r.syncStatus,
          errorMessage: r.errorMessage,
          tenantScoped: Boolean(r.tenantId),
        })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingIntegration list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list integrations' });
  }
}

export async function connect(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { kind } = req.params as { kind: string };
    if (!isKind(kind)) {
      res.status(400).json({ success: false, message: 'Invalid kind' });
      return;
    }
    const body = req.body as { clientId?: string; redirectUri?: string };
    const provider = getProvider(kind);
    const state = randomBytes(16).toString('hex');
    const config = {
      state,
      clientId: body.clientId ?? '',
      redirectUri: body.redirectUri ?? '',
    } as Prisma.InputJsonValue;
    const intKind = kind as IntegrationKind;

    let existing = await findAccountingIntegration(userId, intKind, tenantId);
    if (!existing && tenantId) {
      existing = await prisma.accountingIntegration.findUnique({
        where: { userId_kind: { userId, kind: intKind } },
      });
    }

    if (existing) {
      await prisma.accountingIntegration.update({
        where: { id: existing.id },
        data: {
          config,
          ...(tenantId && !existing.tenantId ? { tenantId } : {}),
        },
      });
    } else if (tenantId) {
      try {
        await prisma.accountingIntegration.create({
          data: {
            userId,
            tenantId,
            kind: intKind,
            enabled: false,
            config,
          },
        });
      } catch (e) {
        const raced = await prisma.accountingIntegration.findUnique({
          where: { accounting_integration_tenant_kind_unique: { tenantId, kind: intKind } },
        });
        if (!raced) throw e;
        await prisma.accountingIntegration.update({
          where: { id: raced.id },
          data: { config },
        });
      }
    } else {
      await prisma.accountingIntegration.upsert({
        where: { userId_kind: { userId, kind: intKind } },
        update: { config },
        create: {
          userId,
          kind: intKind,
          enabled: false,
          config,
        },
      });
    }

    const oauthUrl = provider.buildOAuthUrl(state, {
      clientId: body.clientId,
      redirectUri: body.redirectUri,
    });
    res.json({ success: true, data: { oauthUrl, state } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingIntegration connect error:', err);
    res.status(500).json({ success: false, message: 'Failed to start OAuth' });
  }
}

export async function callback(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { kind } = req.params as { kind: string };
    if (!isKind(kind)) {
      res.status(400).json({ success: false, message: 'Invalid kind' });
      return;
    }
    const code = (req.query.code as string | undefined) ?? '';
    if (!code) {
      res.status(400).json({ success: false, message: 'Authorization code required' });
      return;
    }

    const intKind = kind as IntegrationKind;
    const existing = await findAccountingIntegration(userId, intKind, tenantId);
    if (!existing) {
      res.status(404).json({ success: false, message: 'Start connect before OAuth callback' });
      return;
    }

    const provider = getProvider(intKind);
    const tokens = await provider.exchangeCode(code, existing.config);

    const updated = await prisma.accountingIntegration.update({
      where: { id: existing.id },
      data: {
        enabled: true,
        ...(tenantId && !existing.tenantId ? { tenantId } : {}),
        config: {
          ...((existing.config as Record<string, unknown>) ?? {}),
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          // Provider org/realm id (Xero); not FastBillings workspace tenantId.
          tenantId: tokens.tenantId,
          connectedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
        syncStatus: 'CONNECTED',
        errorMessage: null,
      },
    });

    res.json({
      success: true,
      message: 'OAuth complete',
      data: { integration: { id: updated.id, kind: updated.kind, enabled: updated.enabled } },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingIntegration callback error:', err);
    res.status(500).json({ success: false, message: 'OAuth callback failed' });
  }
}

export async function syncNow(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { kind } = req.params as { kind: string };
    if (!isKind(kind)) {
      res.status(400).json({ success: false, message: 'Invalid kind' });
      return;
    }
    const intKind = kind as IntegrationKind;
    const integration = await findAccountingIntegration(userId, intKind, tenantId);
    if (!integration || !integration.enabled) {
      res.status(400).json({ success: false, message: 'Integration not connected' });
      return;
    }

    const provider = getProvider(intKind);
    try {
      const result = await provider.syncInvoices(integration.config);
      await prisma.accountingIntegration.update({
        where: { id: integration.id },
        data: { lastSyncedAt: new Date(), syncStatus: 'SUCCESS', errorMessage: null },
      });
      res.json({
        success: true,
        message: `Synced: pushed=${result.pushed}, pulled=${result.pulled}`,
        data: result,
      });
    } catch (e) {
      await prisma.accountingIntegration.update({
        where: { id: integration.id },
        data: { syncStatus: 'ERROR', errorMessage: e instanceof Error ? e.message : String(e) },
      });
      res.status(500).json({ success: false, message: e instanceof Error ? e.message : 'Sync failed' });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingIntegration syncNow error:', err);
    res.status(500).json({ success: false, message: 'Failed to sync' });
  }
}

export async function disconnect(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { kind } = req.params as { kind: string };
    if (!isKind(kind)) {
      res.status(400).json({ success: false, message: 'Invalid kind' });
      return;
    }
    const intKind = kind as IntegrationKind;
    const existing = await findAccountingIntegration(userId, intKind, tenantId);
    if (existing) {
      await prisma.accountingIntegration.delete({ where: { id: existing.id } });
    }
    res.json({ success: true, message: 'Disconnected' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('accountingIntegration disconnect error:', err);
    res.status(500).json({ success: false, message: 'Failed to disconnect' });
  }
}

const handlers = { list, connect, callback, syncNow, disconnect };
module.exports = handlers;
module.exports.default = handlers;
