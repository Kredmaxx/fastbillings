import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';

const REASONS = new Set(['RULE_42', 'RULE_43', 'OTHER']);

function money(n: Prisma.Decimal | number): number {
  return Math.round(Number(n) * 100) / 100;
}

function formatRow(r: {
  id: string;
  reversalDate: Date;
  reason: string;
  description: string | null;
  cgst: Prisma.Decimal | number;
  sgst: Prisma.Decimal | number;
  igst: Prisma.Decimal | number;
  cess: Prisma.Decimal | number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    reversalDate: r.reversalDate.toISOString().slice(0, 10),
    reason: r.reason,
    description: r.description,
    cgst: money(r.cgst),
    sgst: money(r.sgst),
    igst: money(r.igst),
    cess: money(r.cess),
    total: money(Number(r.cgst) + Number(r.sgst) + Number(r.igst) + Number(r.cess)),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

function parseAmount(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function listItcReversals(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const from = (req.query.from as string | undefined)?.trim();
    const to = (req.query.to as string | undefined)?.trim();
    const where: Prisma.ItcReversalWhereInput = {
      isDeleted: false,
      AND: [{ OR: tenantOrUserScope(req).OR }],
    };
    if (from || to) {
      where.reversalDate = {
        ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
      };
    }

    const rows = await prisma.itcReversal.findMany({
      where,
      orderBy: { reversalDate: 'desc' },
      take: 200,
    });

    res.json({
      success: true,
      data: { reversals: rows.map(formatRow) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listItcReversals error:', err);
    res.status(500).json({ success: false, message: 'Failed to list ITC reversals' });
  }
}

export async function createItcReversal(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const dateStr = String(body.reversalDate ?? '').trim();
    if (!dateStr) {
      res.status(400).json({ success: false, message: 'reversalDate is required' });
      return;
    }
    const reason = String(body.reason ?? 'OTHER').trim().toUpperCase();
    if (!REASONS.has(reason)) {
      res.status(400).json({ success: false, message: 'reason must be RULE_42, RULE_43, or OTHER' });
      return;
    }
    const cgst = parseAmount(body.cgst);
    const sgst = parseAmount(body.sgst);
    const igst = parseAmount(body.igst);
    const cess = parseAmount(body.cess);
    if (cgst + sgst + igst + cess <= 0) {
      res.status(400).json({ success: false, message: 'At least one tax amount must be greater than 0' });
      return;
    }

    const created = await prisma.itcReversal.create({
      data: {
        userId,
        tenantId: optionalTenantId(req),
        reversalDate: new Date(`${dateStr}T00:00:00.000Z`),
        reason,
        description: body.description != null ? String(body.description).trim() || null : null,
        cgst: new Prisma.Decimal(cgst),
        sgst: new Prisma.Decimal(sgst),
        igst: new Prisma.Decimal(igst),
        cess: new Prisma.Decimal(cess),
      },
    });

    res.status(201).json({
      success: true,
      message: 'ITC reversal created',
      data: { reversal: formatRow(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createItcReversal error:', err);
    res.status(500).json({ success: false, message: 'Failed to create ITC reversal' });
  }
}

export async function deleteItcReversal(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.itcReversal.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'ITC reversal not found' });
      return;
    }
    await prisma.itcReversal.update({
      where: { id },
      data: { isDeleted: true },
    });
    res.json({ success: true, message: 'ITC reversal deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteItcReversal error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete ITC reversal' });
  }
}

const handlers = {
  listItcReversals,
  createItcReversal,
  deleteItcReversal,
};
module.exports = handlers;
module.exports.default = handlers;
