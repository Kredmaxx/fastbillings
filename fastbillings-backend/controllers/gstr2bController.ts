import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  UnauthorizedError,
} from '../lib/tenantScope';
import { extractTaxes, userDocScope } from '../lib/gstReportUtils';
import type { DocItem } from '../lib/gstReportUtils';
import {
  booksDateWindow,
  matchPortalLine,
  parseGstr2bPayload,
  recountStatuses,
  type BooksDocRow,
  type Portal2bLine,
} from '../lib/gstr2bReconcile';

async function loadSupplierGstinByEmail(req: Request): Promise<Map<string, string>> {
  const userId = requireUserId(req);
  const tenantId = optionalTenantId(req);
  const suppliers = await prisma.supplier.findMany({
    where: {
      isDeleted: false,
      ...(tenantId
        ? { OR: [{ tenantId }, { user_id: userId }] }
        : { user_id: userId }),
    },
    select: { supplier_email: true, gstin: true },
  });
  const map = new Map<string, string>();
  for (const s of suppliers) {
    if (s.gstin && s.supplier_email) {
      map.set(s.supplier_email.trim().toLowerCase(), s.gstin.trim().toUpperCase());
    }
  }
  return map;
}

async function loadBooksDocs(req: Request, periodMonth: string): Promise<BooksDocRow[]> {
  const { fromDate, toDate } = booksDateWindow(periodMonth, 1);
  const gstinByEmail = await loadSupplierGstinByEmail(req);

  const [purchases, debitNotes] = await Promise.all([
    prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        purchaseDate: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        purchaseId: true,
        referenceNo: true,
        purchaseDate: true,
        taxableAmount: true,
        totalTax: true,
        items: true,
        billToUser: { select: { email: true } },
      },
    }),
    prisma.debitNote.findMany({
      where: {
        ...userDocScope(req),
        debitNoteDate: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        debitNoteId: true,
        referenceNo: true,
        debitNoteDate: true,
        taxableAmount: true,
        totalTax: true,
        items: true,
        billToUser: { select: { email: true } },
      },
    }),
  ]);

  const books: BooksDocRow[] = [];
  for (const p of purchases) {
    const tax = extractTaxes(p.items as unknown as DocItem[], p.taxableAmount, p.totalTax);
    const email = p.billToUser?.email?.trim().toLowerCase() ?? '';
    books.push({
      id: p.id,
      kind: 'purchase',
      documentNumber: p.purchaseId,
      referenceNo: p.referenceNo,
      docDate: p.purchaseDate,
      taxable: tax.taxable,
      igst: tax.igst,
      cgst: tax.cgst,
      sgst: tax.sgst,
      cess: tax.cess,
      supplierGstin: email ? gstinByEmail.get(email) ?? null : null,
    });
  }
  for (const d of debitNotes) {
    const tax = extractTaxes(d.items as unknown as DocItem[], d.taxableAmount, d.totalTax);
    const email = d.billToUser?.email?.trim().toLowerCase() ?? '';
    books.push({
      id: d.id,
      kind: 'debit_note',
      documentNumber: d.debitNoteId,
      referenceNo: d.referenceNo,
      docDate: d.debitNoteDate,
      taxable: tax.taxable,
      igst: tax.igst,
      cgst: tax.cgst,
      sgst: tax.sgst,
      cess: tax.cess,
      supplierGstin: email ? gstinByEmail.get(email) ?? null : null,
    });
  }
  return books;
}

function reconcileLines(lines: Portal2bLine[], books: BooksDocRow[]) {
  const used = new Set<string>();
  const matchedLines = lines.map((line) => ({ line, match: matchPortalLine(line, books, used) }));
  let matchedCount = 0;
  let partialCount = 0;
  let missingCount = 0;
  for (const { match } of matchedLines) {
    if (match.matchStatus === 'MATCHED') matchedCount += 1;
    else if (match.matchStatus === 'PARTIAL') partialCount += 1;
    else missingCount += 1;
  }
  const excessInBooks = books
    .filter((b) => !used.has(`${b.kind}:${b.id}`))
    .map((b) => ({
      kind: b.kind,
      id: b.id,
      documentNumber: b.documentNumber || b.referenceNo || b.id.slice(0, 8),
      docDate: b.docDate,
      taxable: b.taxable,
      igst: b.igst,
      cgst: b.cgst,
      sgst: b.sgst,
      supplierGstin: b.supplierGstin ?? null,
    }));
  return { matchedLines, matchedCount, partialCount, missingCount, excessInBooks };
}

async function refreshImportCounts(importId: string): Promise<void> {
  const statuses = await prisma.gstr2bLine.findMany({
    where: { importId },
    select: { matchStatus: true },
  });
  const counts = recountStatuses(statuses.map((s) => s.matchStatus));
  await prisma.gstr2bImport.update({
    where: { id: importId },
    data: counts,
  });
}

export async function listImports(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const periodMonth = req.query.periodMonth as string | undefined;
    const where: Prisma.Gstr2bImportWhereInput = {
      AND: [
        tenantOrUserFilter(req),
        ...(periodMonth && /^\d{4}-\d{2}$/.test(periodMonth) ? [{ periodMonth }] : []),
      ],
    };
    const rows = await prisma.gstr2bImport.findMany({
      where,
      orderBy: { importedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        periodMonth: true,
        sourceLabel: true,
        importedAt: true,
        lineCount: true,
        matchedCount: true,
        partialCount: true,
        missingCount: true,
      },
    });
    res.json({ success: true, data: { imports: rows } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr2b listImports error:', err);
    res.status(500).json({ success: false, message: 'Failed to list GSTR-2B imports' });
  }
}

export async function getImport(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const row = await prisma.gstr2bImport.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
      include: {
        lines: { orderBy: [{ matchStatus: 'asc' }, { invoiceNumber: 'asc' }] },
      },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Import not found' });
      return;
    }

    const purchaseIds = row.lines.map((l) => l.matchedPurchaseId).filter(Boolean) as string[];
    const dnIds = row.lines.map((l) => l.matchedDebitNoteId).filter(Boolean) as string[];
    const [purchases, debitNotes] = await Promise.all([
      purchaseIds.length
        ? prisma.purchase.findMany({
            where: { id: { in: purchaseIds } },
            select: { id: true, purchaseId: true, referenceNo: true },
          })
        : Promise.resolve([]),
      dnIds.length
        ? prisma.debitNote.findMany({
            where: { id: { in: dnIds } },
            select: { id: true, debitNoteId: true, referenceNo: true },
          })
        : Promise.resolve([]),
    ]);
    const purchaseMap = new Map(purchases.map((p) => [p.id, p]));
    const dnMap = new Map(debitNotes.map((d) => [d.id, d]));

    const eligibleItc = row.lines
      .filter((l) => l.itcEligible && (l.matchStatus === 'MATCHED' || l.matchStatus === 'PARTIAL'))
      .reduce(
        (s, l) =>
          s + Number(l.igst) + Number(l.cgst) + Number(l.sgst) + Number(l.cess),
        0,
      );

    res.json({
      success: true,
      data: {
        import: {
          ...row,
          lines: row.lines.map((l) => ({
            ...l,
            matchedPurchase: l.matchedPurchaseId
              ? purchaseMap.get(l.matchedPurchaseId) ?? null
              : null,
            matchedDebitNote: l.matchedDebitNoteId
              ? dnMap.get(l.matchedDebitNoteId) ?? null
              : null,
          })),
        },
        itcEligibleTax: eligibleItc,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr2b getImport error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch GSTR-2B import' });
  }
}

export async function importAndReconcile(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    const { periodMonth, lines } = parseGstr2bPayload(body);

    if (!periodMonth || !/^\d{4}-\d{2}$/.test(periodMonth)) {
      res.status(400).json({
        success: false,
        message: 'periodMonth required as YYYY-MM (or provide portal period / invoice dates)',
      });
      return;
    }
    if (lines.length === 0) {
      res.status(400).json({
        success: false,
        message:
          'No invoice lines found. Send { lines: [...] } or portal-style { b2b / cdnr / cdnur }',
      });
      return;
    }

    const books = await loadBooksDocs(req, periodMonth);
    const { matchedLines, matchedCount, partialCount, missingCount, excessInBooks } =
      reconcileLines(lines, books);

    const created = await prisma.gstr2bImport.create({
      data: {
        userId,
        tenantId,
        periodMonth,
        sourceLabel: typeof body.sourceLabel === 'string' ? body.sourceLabel : 'manual-json',
        lineCount: lines.length,
        matchedCount,
        partialCount,
        missingCount,
        metadata: {
          excessInBooksCount: excessInBooks.length,
          excessInBooks,
          booksWindowMonths: 1,
        } as Prisma.InputJsonValue,
        lines: {
          create: matchedLines.map(({ line, match }) => ({
            docType: line.docType ?? 'B2B',
            supplierGstin: line.supplierGstin ?? null,
            supplierName: line.supplierName ?? null,
            invoiceNumber: line.invoiceNumber,
            invoiceDate: line.invoiceDate ?? null,
            taxableValue: new Prisma.Decimal(line.taxableValue),
            igst: new Prisma.Decimal(line.igst ?? 0),
            cgst: new Prisma.Decimal(line.cgst ?? 0),
            sgst: new Prisma.Decimal(line.sgst ?? 0),
            cess: new Prisma.Decimal(line.cess ?? 0),
            invoiceValue:
              line.invoiceValue != null ? new Prisma.Decimal(line.invoiceValue) : null,
            matchStatus: match.matchStatus,
            matchedPurchaseId: match.matchedPurchaseId,
            matchedDebitNoteId: match.matchedDebitNoteId,
            matchNotes: match.matchNotes,
          })),
        },
      },
      include: { lines: true },
    });

    res.status(201).json({
      success: true,
      message: 'GSTR-2B imported and reconciled',
      data: {
        import: created,
        summary: {
          periodMonth,
          portalLines: lines.length,
          matched: matchedCount,
          partial: partialCount,
          missingInBooks: missingCount,
          excessInBooks: excessInBooks.length,
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr2b importAndReconcile error:', err);
    res.status(500).json({ success: false, message: 'Failed to import GSTR-2B' });
  }
}

export async function deleteImport(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.gstr2bImport.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Import not found' });
      return;
    }
    await prisma.gstr2bImport.delete({ where: { id } });
    res.json({ success: true, message: 'Import deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr2b deleteImport error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete import' });
  }
}

export async function updateLine(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { importId, lineId } = req.params as { importId: string; lineId: string };
    const body = req.body as {
      purchaseId?: string | null;
      debitNoteId?: string | null;
      unmatch?: boolean;
      itcEligible?: boolean;
    };

    const imp = await prisma.gstr2bImport.findFirst({
      where: { id: importId, ...tenantOrUserFilter(req) },
      select: { id: true },
    });
    if (!imp) {
      res.status(404).json({ success: false, message: 'Import not found' });
      return;
    }

    const line = await prisma.gstr2bLine.findFirst({
      where: { id: lineId, importId },
    });
    if (!line) {
      res.status(404).json({ success: false, message: 'Line not found' });
      return;
    }

    const data: Prisma.Gstr2bLineUpdateInput = {};

    if (body.itcEligible !== undefined) {
      data.itcEligible = body.itcEligible === true;
    }

    if (body.unmatch === true || body.purchaseId === null || body.debitNoteId === null) {
      if (body.unmatch === true || body.purchaseId === null) {
        data.matchedPurchaseId = null;
      }
      if (body.unmatch === true || body.debitNoteId === null) {
        data.matchedDebitNoteId = null;
      }
      if (body.unmatch === true) {
        data.matchStatus = 'UNMATCHED';
        data.matchNotes = 'Manually unmatched';
      }
    }

    if (typeof body.purchaseId === 'string' && body.purchaseId) {
      const purchase = await prisma.purchase.findFirst({
        where: { id: body.purchaseId, ...userDocScope(req) },
        select: { id: true, purchaseId: true },
      });
      if (!purchase) {
        res.status(400).json({ success: false, message: 'Purchase not found' });
        return;
      }
      data.matchedPurchaseId = purchase.id;
      data.matchedDebitNoteId = null;
      data.matchStatus = 'MATCHED';
      data.matchNotes = `Manual link → ${purchase.purchaseId || purchase.id.slice(0, 8)}`;
    }

    if (typeof body.debitNoteId === 'string' && body.debitNoteId) {
      const dn = await prisma.debitNote.findFirst({
        where: { id: body.debitNoteId, ...userDocScope(req) },
        select: { id: true, debitNoteId: true },
      });
      if (!dn) {
        res.status(400).json({ success: false, message: 'Debit note not found' });
        return;
      }
      data.matchedDebitNoteId = dn.id;
      data.matchedPurchaseId = null;
      data.matchStatus = 'MATCHED';
      data.matchNotes = `Manual link → DN ${dn.debitNoteId || dn.id.slice(0, 8)}`;
    }

    const updated = await prisma.gstr2bLine.update({
      where: { id: lineId },
      data,
    });
    await refreshImportCounts(importId);

    res.json({ success: true, message: 'Line updated', data: { line: updated } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr2b updateLine error:', err);
    res.status(500).json({ success: false, message: 'Failed to update line' });
  }
}

export async function reReconcile(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const keepManual = req.body?.keepManual !== false;

    const imp = await prisma.gstr2bImport.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
      include: { lines: true },
    });
    if (!imp) {
      res.status(404).json({ success: false, message: 'Import not found' });
      return;
    }

    const books = await loadBooksDocs(req, imp.periodMonth);
    const used = new Set<string>();

    // Reserve docs already manually linked
    if (keepManual) {
      for (const l of imp.lines) {
        if (l.matchNotes?.startsWith('Manual') && l.matchedPurchaseId) {
          used.add(`purchase:${l.matchedPurchaseId}`);
        }
        if (l.matchNotes?.startsWith('Manual') && l.matchedDebitNoteId) {
          used.add(`debit_note:${l.matchedDebitNoteId}`);
        }
      }
    }

    for (const l of imp.lines) {
      if (keepManual && l.matchNotes?.startsWith('Manual')) continue;
      const portal: Portal2bLine = {
        docType: (l.docType as Portal2bLine['docType']) ?? 'B2B',
        supplierGstin: l.supplierGstin,
        supplierName: l.supplierName,
        invoiceNumber: l.invoiceNumber,
        invoiceDate: l.invoiceDate,
        taxableValue: Number(l.taxableValue),
        igst: Number(l.igst),
        cgst: Number(l.cgst),
        sgst: Number(l.sgst),
        cess: Number(l.cess),
        invoiceValue: l.invoiceValue != null ? Number(l.invoiceValue) : null,
      };
      const match = matchPortalLine(portal, books, used);
      await prisma.gstr2bLine.update({
        where: { id: l.id },
        data: {
          matchStatus: match.matchStatus,
          matchedPurchaseId: match.matchedPurchaseId,
          matchedDebitNoteId: match.matchedDebitNoteId,
          matchNotes: match.matchNotes,
        },
      });
    }

    const excessInBooks = books
      .filter((b) => !used.has(`${b.kind}:${b.id}`))
      .map((b) => ({
        kind: b.kind,
        id: b.id,
        documentNumber: b.documentNumber || b.referenceNo || b.id.slice(0, 8),
        docDate: b.docDate,
        taxable: b.taxable,
        igst: b.igst,
        cgst: b.cgst,
        sgst: b.sgst,
        supplierGstin: b.supplierGstin ?? null,
      }));

    await refreshImportCounts(id);
    await prisma.gstr2bImport.update({
      where: { id },
      data: {
        metadata: {
          excessInBooksCount: excessInBooks.length,
          excessInBooks,
          booksWindowMonths: 1,
          reReconciledAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    res.json({ success: true, message: 'Re-reconciled against current books' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr2b reReconcile error:', err);
    res.status(500).json({ success: false, message: 'Failed to re-reconcile' });
  }
}

export async function exportMismatchesCsv(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const row = await prisma.gstr2bImport.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
      include: {
        lines: {
          where: { matchStatus: { in: ['PARTIAL', 'MISSING_IN_BOOKS', 'UNMATCHED'] } },
          orderBy: { invoiceNumber: 'asc' },
        },
      },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Import not found' });
      return;
    }

    const header = [
      'docType',
      'supplierGstin',
      'invoiceNumber',
      'invoiceDate',
      'taxableValue',
      'cgst',
      'sgst',
      'igst',
      'cess',
      'matchStatus',
      'itcEligible',
      'matchedPurchaseId',
      'matchedDebitNoteId',
      'matchNotes',
    ];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [
      header.join(','),
      ...row.lines.map((l) =>
        [
          l.docType,
          l.supplierGstin,
          l.invoiceNumber,
          l.invoiceDate ? l.invoiceDate.toISOString().slice(0, 10) : '',
          Number(l.taxableValue),
          Number(l.cgst),
          Number(l.sgst),
          Number(l.igst),
          Number(l.cess),
          l.matchStatus,
          l.itcEligible,
          l.matchedPurchaseId,
          l.matchedDebitNoteId,
          l.matchNotes,
        ]
          .map(esc)
          .join(','),
      ),
    ];

    // Append excess-in-books from metadata
    const meta = row.metadata as { excessInBooks?: Array<Record<string, unknown>> } | null;
    if (meta?.excessInBooks?.length) {
      lines.push('');
      lines.push('"EXCESS_IN_BOOKS"');
      lines.push(['kind', 'id', 'documentNumber', 'taxable', 'supplierGstin'].join(','));
      for (const e of meta.excessInBooks) {
        lines.push(
          [e.kind, e.id, e.documentNumber, e.taxable, e.supplierGstin].map(esc).join(','),
        );
      }
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="gstr2b-mismatches-${row.periodMonth}.csv"`,
    );
    res.send(lines.join('\n'));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr2b exportMismatchesCsv error:', err);
    res.status(500).json({ success: false, message: 'Failed to export CSV' });
  }
}

export async function searchPurchases(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const q = String(req.query.q ?? '').trim();
    if (q.length < 1) {
      res.json({ success: true, data: { purchases: [] } });
      return;
    }
    const rows = await prisma.purchase.findMany({
      where: {
        ...userDocScope(req),
        OR: [
          { purchaseId: { contains: q, mode: 'insensitive' } },
          { referenceNo: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        purchaseId: true,
        referenceNo: true,
        purchaseDate: true,
        taxableAmount: true,
      },
      take: 20,
      orderBy: { purchaseDate: 'desc' },
    });
    res.json({ success: true, data: { purchases: rows } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to search purchases' });
  }
}

const handlers = {
  listImports,
  getImport,
  importAndReconcile,
  deleteImport,
  updateLine,
  reReconcile,
  exportMismatchesCsv,
  searchPurchases,
};
module.exports = handlers;
module.exports.default = handlers;
