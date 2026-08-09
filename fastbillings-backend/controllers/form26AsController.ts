import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import { userDocScope } from '../lib/gstReportUtils';

interface ImportLine {
  pan?: string | null;
  name?: string | null;
  section: string;
  amount: number;
  date?: string | null;
  challanNo?: string | null;
}

type MatchReason = 'challan' | 'pan' | 'amount';

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function amountClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1;
}

function parseLines(raw: unknown): ImportLine[] {
  let arr: unknown[] = [];
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw) as unknown[];
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }
  const out: ImportLine[] = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const section = String(r.section ?? '').trim().toUpperCase();
    const amount = Number(r.amount);
    if (!section || !Number.isFinite(amount) || amount === 0) continue;
    out.push({
      pan: r.pan != null ? String(r.pan).trim().toUpperCase() || null : null,
      name: r.name != null ? String(r.name).trim() || null : null,
      section,
      amount: round(amount),
      date: r.date != null ? String(r.date).slice(0, 10) : null,
      challanNo: r.challanNo != null ? String(r.challanNo).trim() || null : null,
    });
  }
  return out;
}

function formatImport(row: {
  id: string;
  periodFrom: Date;
  periodTo: Date;
  label: string | null;
  lines: Prisma.JsonValue;
  notes: string | null;
  createdAt: Date;
}) {
  const lines = Array.isArray(row.lines) ? row.lines : [];
  return {
    id: row.id,
    periodFrom: row.periodFrom.toISOString().slice(0, 10),
    periodTo: row.periodTo.toISOString().slice(0, 10),
    label: row.label,
    notes: row.notes,
    lineCount: lines.length,
    lines,
    createdAt: row.createdAt,
  };
}

function sectionOk(bookSection: string, lineSection: string): boolean {
  return bookSection === lineSection || lineSection === '—';
}

/** India FY quarters that overlap [from, to] (inclusive calendar days). */
function fyQuartersOverlapping(
  from: Date,
  to: Date,
): Array<{ fyLabel: string; quarter: string }> {
  const out = new Map<string, { fyLabel: string; quarter: string }>();
  const cur = new Date(from);
  cur.setHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setHours(12, 0, 0, 0);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const startYear = m >= 3 ? y : y - 1;
    const fyLabel = `${startYear}-${String(startYear + 1).slice(-2)}`;
    let quarter: string;
    if (m >= 3 && m <= 5) quarter = 'Q1';
    else if (m >= 6 && m <= 8) quarter = 'Q2';
    else if (m >= 9 && m <= 11) quarter = 'Q3';
    else quarter = 'Q4';
    out.set(`${fyLabel}|${quarter}`, { fyLabel, quarter });
    cur.setMonth(cur.getMonth() + 1);
  }
  // Ensure end date's quarter is included even if loop stepped past
  const y = end.getFullYear();
  const m = end.getMonth();
  const startYear = m >= 3 ? y : y - 1;
  const fyLabel = `${startYear}-${String(startYear + 1).slice(-2)}`;
  let quarter: string;
  if (m >= 3 && m <= 5) quarter = 'Q1';
  else if (m >= 6 && m <= 8) quarter = 'Q2';
  else if (m >= 9 && m <= 11) quarter = 'Q3';
  else quarter = 'Q4';
  out.set(`${fyLabel}|${quarter}`, { fyLabel, quarter });
  return [...out.values()];
}

export async function listForm26AsImports(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const rows = await prisma.form26AsImport.findMany({
      where: { isDeleted: false, AND: [{ OR: tenantOrUserScope(req).OR }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({
      success: true,
      data: { imports: rows.map(formatImport) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('listForm26AsImports error:', err);
    res.status(500).json({ success: false, message: 'Failed to list Form 26AS imports' });
  }
}

export async function createForm26AsImport(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const from = String(body.periodFrom ?? '').trim();
    const to = String(body.periodTo ?? '').trim();
    if (!from || !to) {
      res.status(400).json({ success: false, message: 'periodFrom and periodTo are required' });
      return;
    }
    const lines = parseLines(body.lines);
    if (lines.length === 0) {
      res.status(400).json({
        success: false,
        message: 'lines must be a non-empty array of { section, amount, pan?, name?, date?, challanNo? }',
      });
      return;
    }

    const created = await prisma.form26AsImport.create({
      data: {
        userId,
        tenantId: optionalTenantId(req),
        periodFrom: new Date(`${from}T00:00:00.000Z`),
        periodTo: new Date(`${to}T23:59:59.999Z`),
        label: body.label != null ? String(body.label).trim() || null : null,
        notes: body.notes != null ? String(body.notes).trim() || null : null,
        lines: lines as unknown as Prisma.InputJsonValue,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Form 26AS import saved',
      data: { import: formatImport(created) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('createForm26AsImport error:', err);
    res.status(500).json({ success: false, message: 'Failed to create Form 26AS import' });
  }
}

export async function deleteForm26AsImport(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.form26AsImport.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Import not found' });
      return;
    }
    await prisma.form26AsImport.update({
      where: { id },
      data: { isDeleted: true },
    });
    res.json({ success: true, message: 'Import deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('deleteForm26AsImport error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete import' });
  }
}

/**
 * GET /api/admin/form-26as/reconcile?importId=
 * Matches imported rows to purchase/salary TDS + invoice TCS by challan → PAN → section+amount (±₹1).
 */
export async function reconcileForm26As(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const importId = (req.query.importId as string | undefined)?.trim();
    const imp = importId
      ? await prisma.form26AsImport.findFirst({
          where: { id: importId, isDeleted: false, ...tenantOrUserScope(req) },
        })
      : await prisma.form26AsImport.findFirst({
          where: { isDeleted: false, AND: [{ OR: tenantOrUserScope(req).OR }] },
          orderBy: { createdAt: 'desc' },
        });

    if (!imp) {
      res.status(404).json({
        success: false,
        message: 'No Form 26AS import found. Create an import first.',
      });
      return;
    }

    const fromDate = imp.periodFrom;
    const toDate = imp.periodTo;
    const purchases = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        purchaseDate: { gte: fromDate, lte: toDate },
        status: { not: 'cancelled' },
        tdsAmount: { gt: 0 },
      },
      select: {
        id: true,
        purchaseId: true,
        purchaseDate: true,
        tdsSection: true,
        tdsAmount: true,
        billToUser: { select: { firstName: true, lastName: true, email: true } },
        vendor: { select: { firstName: true, lastName: true, email: true } },
      },
      take: 500,
    });

    const salaryDeductions = await prisma.salaryTdsDeduction.findMany({
      where: {
        isDeleted: false,
        ...tenantOrUserScope(req),
        payDate: { gte: fromDate, lte: toDate },
        tdsAmount: { gt: 0 },
      },
      include: {
        employee: { select: { name: true, pan: true, employeeCode: true } },
      },
      take: 500,
    });

    const tcsInvoices = await prisma.invoice.findMany({
      where: {
        ...userDocScope(req),
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { not: 'CANCELLED' },
        tcsAmount: { gt: 0 },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        tcsSection: true,
        tcsAmount: true,
        customer: { select: { name: true, pan: true } },
      },
      take: 500,
    });

    const suppliers = await prisma.supplier.findMany({
      where: {
        isDeleted: false,
        OR: tenantId ? [{ tenantId }, { user_id: userId }] : [{ user_id: userId }],
      },
      select: { supplier_email: true, supplier_name: true, pan: true },
    });
    const panByEmail = new Map<string, string>();
    const panByName = new Map<string, string>();
    for (const s of suppliers) {
      if (!s.pan) continue;
      const email = (s.supplier_email || '').trim().toLowerCase();
      if (email) panByEmail.set(email, s.pan.trim().toUpperCase());
      const nameKey = (s.supplier_name || '').trim().toLowerCase();
      if (nameKey) panByName.set(nameKey, s.pan.trim().toUpperCase());
    }

    const periodQuarters = fyQuartersOverlapping(fromDate, toDate);
    const challans = await prisma.taxDepositChallan.findMany({
      where: {
        isDeleted: false,
        kind: { in: ['TDS', 'TCS'] },
        AND: [
          { OR: tenantOrUserScope(req).OR },
          {
            OR: [
              { depositDate: { gte: fromDate, lte: toDate } },
              ...periodQuarters.map((q) => ({
                fyLabel: q.fyLabel,
                quarter: q.quarter,
              })),
            ],
          },
        ],
      },
      select: { challanNo: true, amount: true, section: true, kind: true },
    });
    const challanNos = new Set(
      challans.map((c) => c.challanNo.trim().toUpperCase()).filter(Boolean),
    );
    const tdsChallanCount = challans.filter((c) => c.kind === 'TDS').length;
    const tcsChallanCount = challans.filter((c) => c.kind === 'TCS').length;

    type BookRow = {
      sourceType: 'PURCHASE' | 'SALARY' | 'INVOICE';
      purchaseId: string;
      purchaseNumber: string | null;
      date: string;
      section: string;
      amount: number;
      vendorName: string;
      vendorPan: string | null;
      matched: boolean;
    };

    const books: BookRow[] = [
      ...purchases.map((p) => {
        const vendorName =
          [p.billToUser?.firstName, p.billToUser?.lastName].filter(Boolean).join(' ').trim() ||
          [p.vendor?.firstName, p.vendor?.lastName].filter(Boolean).join(' ').trim() ||
          p.billToUser?.email ||
          p.vendor?.email ||
          '—';
        const email = (p.vendor?.email || p.billToUser?.email || '').trim().toLowerCase();
        const vendorPan =
          (email && panByEmail.get(email)) ||
          panByName.get(vendorName.trim().toLowerCase()) ||
          null;
        return {
          sourceType: 'PURCHASE' as const,
          purchaseId: p.id,
          purchaseNumber: p.purchaseId,
          date: p.purchaseDate.toISOString().slice(0, 10),
          section: (p.tdsSection || '—').toUpperCase(),
          amount: round(Number(p.tdsAmount ?? 0)),
          vendorName,
          vendorPan,
          matched: false,
        };
      }),
      ...salaryDeductions.map((d) => ({
        sourceType: 'SALARY' as const,
        purchaseId: d.id,
        purchaseNumber: d.employee.employeeCode || 'SALARY',
        date: d.payDate.toISOString().slice(0, 10),
        section: (d.section || '192').toUpperCase(),
        amount: round(Number(d.tdsAmount)),
        vendorName: d.employee.name,
        vendorPan: d.employee.pan?.trim().toUpperCase() || null,
        matched: false,
      })),
      ...tcsInvoices.map((inv) => ({
        sourceType: 'INVOICE' as const,
        purchaseId: inv.id,
        purchaseNumber: inv.invoiceNumber,
        date: inv.invoiceDate.toISOString().slice(0, 10),
        section: (inv.tcsSection || '206C(1H)').toUpperCase(),
        amount: round(Number(inv.tcsAmount ?? 0)),
        vendorName: inv.customer?.name || '—',
        vendorPan: inv.customer?.pan?.trim().toUpperCase() || null,
        matched: false,
      })),
    ];

    const importLines = parseLines(imp.lines);
    const usedBook = new Set<number>();
    const matched: Array<{
      import: ImportLine;
      book: BookRow | null;
      status: 'matched' | 'unmatched_import';
      matchReason: MatchReason | null;
    }> = [];

    for (const line of importLines) {
      let bestIdx = -1;
      let bestReason: MatchReason | null = null;
      let bestDiff = Infinity;

      const pick = (reason: MatchReason, allow: (b: BookRow) => boolean) => {
        let idx = -1;
        let diff = Infinity;
        for (let i = 0; i < books.length; i++) {
          if (usedBook.has(i)) continue;
          const b = books[i];
          if (!allow(b)) continue;
          if (!sectionOk(b.section, line.section)) continue;
          if (!amountClose(b.amount, line.amount)) continue;
          const d = Math.abs(b.amount - line.amount);
          if (d < diff) {
            diff = d;
            idx = i;
          }
        }
        if (idx >= 0) {
          bestIdx = idx;
          bestReason = reason;
          bestDiff = diff;
        }
      };

      const lineChallan = line.challanNo?.trim().toUpperCase() || null;
      if (lineChallan && challanNos.has(lineChallan)) {
        pick('challan', () => true);
      }
      if (bestIdx < 0 && line.pan) {
        pick('pan', (b) => Boolean(b.vendorPan && b.vendorPan === line.pan));
      }
      if (bestIdx < 0) {
        pick('amount', () => true);
      }

      if (bestIdx >= 0 && bestReason) {
        usedBook.add(bestIdx);
        books[bestIdx].matched = true;
        matched.push({
          import: line,
          book: books[bestIdx],
          status: 'matched',
          matchReason: bestReason,
        });
      } else {
        matched.push({
          import: line,
          book: null,
          status: 'unmatched_import',
          matchReason: null,
        });
      }
      void bestDiff;
    }

    const unmatchedBooks = books.filter((b) => !b.matched);
    const byReason = {
      challan: matched.filter((m) => m.matchReason === 'challan').length,
      pan: matched.filter((m) => m.matchReason === 'pan').length,
      amount: matched.filter((m) => m.matchReason === 'amount').length,
    };
    const purchaseCount = books.filter((b) => b.sourceType === 'PURCHASE').length;
    const salaryCount = books.filter((b) => b.sourceType === 'SALARY').length;
    const tcsCount = books.filter((b) => b.sourceType === 'INVOICE').length;

    res.json({
      success: true,
      data: {
        notes:
          'Books stub: imported rows matched to purchase + salary TDS + invoice TCS by challan no → party PAN → section+amount (±₹1). Not a substitute for AIS / Form 26AS filing.',
        import: formatImport(imp),
        summary: {
          importLines: importLines.length,
          booksTdsRows: books.length,
          booksPurchaseRows: purchaseCount,
          booksSalaryRows: salaryCount,
          booksTcsRows: tcsCount,
          matched: matched.filter((m) => m.status === 'matched').length,
          unmatchedImport: matched.filter((m) => m.status === 'unmatched_import').length,
          unmatchedBooks: unmatchedBooks.length,
          importTotal: round(importLines.reduce((s, l) => s + l.amount, 0)),
          booksTotal: round(books.reduce((s, b) => s + b.amount, 0)),
          matchedByReason: byReason,
          tdsChallansInPeriod: tdsChallanCount,
          tcsChallansInPeriod: tcsChallanCount,
        },
        matches: matched,
        unmatchedBooks,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('reconcileForm26As error:', err);
    res.status(500).json({ success: false, message: 'Failed to reconcile Form 26AS' });
  }
}

const handlers = {
  listForm26AsImports,
  createForm26AsImport,
  deleteForm26AsImport,
  reconcileForm26As,
};
module.exports = handlers;
module.exports.default = handlers;
