import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import {
  isClause34Form,
  isClause34Quarter,
} from '../lib/clause34Tds';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';

function formatFiling(r: {
  id: string;
  fyLabel: string;
  form: string;
  quarter: string;
  isFiled: boolean;
  filedDate: Date | null;
  acknowledgementNo: string | null;
  notes: string | null;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    fyLabel: r.fyLabel,
    form: r.form,
    quarter: r.quarter,
    isFiled: r.isFiled,
    filedDate: r.filedDate ? r.filedDate.toISOString().slice(0, 10) : null,
    acknowledgementNo: r.acknowledgementNo,
    notes: r.notes,
    updatedAt: r.updatedAt,
  };
}

/**
 * PUT /api/admin/tds-tcs-return-filings
 * Upsert books return-filed flag for form×quarter — not TRACES / CPC proof.
 */
export async function upsertTdsTcsReturnFiling(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const fyLabel = String(body.fyLabel ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(fyLabel)) {
      res.status(400).json({ success: false, message: 'fyLabel must be YYYY-YY' });
      return;
    }
    const form = String(body.form ?? '').trim().toUpperCase();
    if (!isClause34Form(form)) {
      res.status(400).json({ success: false, message: 'form must be 24Q, 26Q, 27Q, or 27EQ' });
      return;
    }
    const quarter = String(body.quarter ?? '').trim().toUpperCase();
    if (!isClause34Quarter(quarter)) {
      res.status(400).json({ success: false, message: 'quarter must be Q1–Q4' });
      return;
    }

    const isFiled = Boolean(body.isFiled);
    let filedDate: Date | null = null;
    if (body.filedDate != null && String(body.filedDate).trim()) {
      const d = String(body.filedDate).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        res.status(400).json({ success: false, message: 'filedDate must be YYYY-MM-DD' });
        return;
      }
      filedDate = new Date(`${d}T00:00:00.000Z`);
    } else if (isFiled) {
      filedDate = new Date();
    }

    const acknowledgementNo =
      body.acknowledgementNo != null ? String(body.acknowledgementNo).trim() || null : null;
    const notes = body.notes != null ? String(body.notes).trim() || null : null;
    const tenantId = optionalTenantId(req);

    const row = await prisma.tdsTcsReturnFiling.upsert({
      where: {
        userId_fyLabel_form_quarter: { userId, fyLabel, form, quarter },
      },
      create: {
        userId,
        tenantId,
        fyLabel,
        form,
        quarter,
        isFiled,
        filedDate: isFiled ? filedDate : null,
        acknowledgementNo,
        notes,
        isDeleted: false,
      },
      update: {
        tenantId,
        isFiled,
        filedDate: isFiled ? filedDate : null,
        acknowledgementNo,
        notes,
        isDeleted: false,
      },
    });

    res.json({
      success: true,
      data: {
        notes: 'Books return-filed flag only — not TRACES / CPC / e-TDS filing proof.',
        filing: formatFiling(row),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('upsertTdsTcsReturnFiling error:', err);
    res.status(500).json({ success: false, message: 'Failed to save TDS/TCS return filing flag' });
  }
}

/**
 * GET /api/admin/tds-tcs-return-filings?fy=YYYY-YY
 */
export async function listTdsTcsReturnFilings(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const fyLabel = String(req.query.fy ?? '').trim();
    if (!/^\d{4}-\d{2}$/.test(fyLabel)) {
      res.status(400).json({ success: false, message: 'fy query must be YYYY-YY' });
      return;
    }

    const rows = await prisma.tdsTcsReturnFiling.findMany({
      where: {
        isDeleted: false,
        fyLabel,
        ...tenantOrUserScope(req),
      },
      orderBy: [{ form: 'asc' }, { quarter: 'asc' }],
    });

    res.json({
      success: true,
      data: {
        notes: 'Books return-filed flags — not TRACES / CPC proof.',
        fyLabel,
        filings: rows.map(formatFiling),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listTdsTcsReturnFilings error:', err);
    res.status(500).json({ success: false, message: 'Failed to list TDS/TCS return filings' });
  }
}

const handlers = {
  upsertTdsTcsReturnFiling,
  listTdsTcsReturnFilings,
};
module.exports = handlers;
module.exports.default = handlers;
