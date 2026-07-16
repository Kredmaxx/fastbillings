import type { Request, Response } from 'express';
import type { GatewayKind, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireUserId, UnauthorizedError } from '../lib/tenantScope';

const KINDS = ['RAZORPAY', 'STRIPE', 'OFFLINE'] as const;
type Kind = typeof KINDS[number];

function isKind(s: string | undefined): s is Kind {
  return !!s && (KINDS as readonly string[]).includes(s);
}

function redact(config: unknown): unknown {
  if (!config || typeof config !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
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

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const reveal = req.query.reveal === 'true';
    const rows = await prisma.gatewayConfig.findMany({ where: { userId } });
    res.json({
      success: true,
      data: {
        gatewayConfigs: rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          enabled: r.enabled,
          livemode: r.livemode,
          config: reveal ? r.config : redact(r.config),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gatewayConfig list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list gateway configs' });
  }
}

export async function get(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { kind } = req.params as { kind: string };
    if (!isKind(kind)) {
      res.status(400).json({ success: false, message: 'Invalid kind' });
      return;
    }
    const reveal = req.query.reveal === 'true';
    const row = await prisma.gatewayConfig.findUnique({ where: { userId_kind: { userId, kind: kind as GatewayKind } } });
    if (!row) {
      res.status(404).json({ success: false, message: 'Gateway not configured' });
      return;
    }
    res.json({
      success: true,
      data: {
        gatewayConfig: {
          id: row.id,
          kind: row.kind,
          enabled: row.enabled,
          livemode: row.livemode,
          config: reveal ? row.config : redact(row.config),
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gatewayConfig get error:', err);
    res.status(500).json({ success: false, message: 'Failed to get gateway config' });
  }
}

export async function upsert(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { kind } = req.params as { kind: string };
    if (!isKind(kind)) {
      res.status(400).json({ success: false, message: 'Invalid kind' });
      return;
    }
    const body = req.body as { enabled?: boolean; livemode?: boolean; config?: Prisma.JsonValue };
    const data = {
      enabled: body.enabled === true,
      livemode: body.livemode === true,
      config: (body.config ?? {}) as Prisma.InputJsonValue,
    };
    const updated = await prisma.gatewayConfig.upsert({
      where: { userId_kind: { userId, kind: kind as GatewayKind } },
      update: data,
      create: { userId, kind: kind as GatewayKind, ...data },
    });
    res.json({
      success: true,
      message: 'Gateway config saved',
      data: { gatewayConfig: { id: updated.id, kind: updated.kind, enabled: updated.enabled, livemode: updated.livemode } },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gatewayConfig upsert error:', err);
    res.status(500).json({ success: false, message: 'Failed to save gateway config' });
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { kind } = req.params as { kind: string };
    if (!isKind(kind)) {
      res.status(400).json({ success: false, message: 'Invalid kind' });
      return;
    }
    await prisma.gatewayConfig.deleteMany({ where: { userId, kind: kind as GatewayKind } });
    res.json({ success: true, message: 'Gateway config removed' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gatewayConfig remove error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove gateway config' });
  }
}

const handlers = { list, get, upsert, remove };
module.exports = handlers;
module.exports.default = handlers;
