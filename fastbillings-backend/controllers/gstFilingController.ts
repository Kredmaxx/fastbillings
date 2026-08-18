import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { normalizeGstin } from '../lib/einvoicePayload';
import {
  buildGstr1PortalJson,
  validateGstr1PortalJson,
  type Gstr1WorksheetData,
} from '../lib/gstPortalJson';
import {
  gstr1 as gstr1Handler,
  gstr3b as gstr3bHandler,
  gstr9 as gstr9Handler,
  cmp08 as cmp08Handler,
} from './taxReportsController';
import { requireUserId } from '../lib/tenantScope';

interface CapturedResponse {
  status: number;
  body: unknown;
}

function captureResponse(): { res: Response; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 200, body: null };
  const fakeRes = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  };
  return { res: fakeRes as unknown as Response, captured };
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function dateCell(value: unknown): string {
  if (!value) return '';
  try {
    return new Date(value as string).toISOString().slice(0, 10);
  } catch {
    return String(value);
  }
}

function gstr1ToCsv(data: Record<string, unknown>): string {
  const b2b = (data.b2b ?? []) as Array<Record<string, unknown>>;
  const b2cl = (data.b2cl ?? []) as Array<Record<string, unknown>>;
  const b2cs = (data.b2cs ?? []) as Array<Record<string, unknown>>;
  const cdnr = (data.cdnr ?? []) as Array<Record<string, unknown>>;
  const cdnur = (data.cdnur ?? []) as Array<Record<string, unknown>>;
  const hsn = (data.hsn ?? []) as Array<Record<string, unknown>>;
  const lines: string[] = [];

  lines.push('Section,GSTIN,Customer,Invoice,Date,PlaceOfSupply,TaxableValue,IGST,CGST,SGST,CESS,Total');
  for (const r of b2b) {
    lines.push(
      [
        'B2B',
        r.gstin,
        r.customerName,
        r.invoiceNumber,
        dateCell(r.date),
        r.placeOfSupply,
        r.taxableValue,
        r.igst,
        r.cgst,
        r.sgst,
        r.cess,
        r.total,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }

  lines.push('');
  lines.push('Section,Customer,Invoice,Date,PlaceOfSupply,TaxableValue,IGST,CGST,SGST,CESS,Total');
  for (const r of b2cl) {
    lines.push(
      [
        'B2CL',
        r.customerName,
        r.invoiceNumber,
        dateCell(r.date),
        r.placeOfSupply,
        r.taxableValue,
        r.igst,
        r.cgst,
        r.sgst,
        r.cess,
        r.total,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }

  lines.push('');
  lines.push('Section,PlaceOfSupply,SupplyType,Rate,InvoiceCount,TaxableValue,IGST,CGST,SGST,CESS,Tax');
  for (const r of b2cs) {
    lines.push(
      [
        'B2CS',
        r.placeOfSupply,
        r.supplyType,
        r.rate,
        r.invoiceCount,
        r.taxableValue,
        r.igst,
        r.cgst,
        r.sgst,
        r.cess,
        r.tax,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }

  lines.push('');
  lines.push('Section,GSTIN,Customer,NoteNumber,NoteDate,Invoice,PlaceOfSupply,TaxableValue,IGST,CGST,SGST,CESS,Total');
  for (const r of cdnr) {
    lines.push(
      [
        'CDNR',
        r.gstin,
        r.customerName,
        r.noteNumber,
        dateCell(r.noteDate),
        r.invoiceNumber,
        r.placeOfSupply,
        r.taxableValue,
        r.igst,
        r.cgst,
        r.sgst,
        r.cess,
        r.total,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }

  lines.push('');
  lines.push('Section,PlaceOfSupply,NoteCount,TaxableValue,IGST,CGST,SGST,CESS,Tax');
  for (const r of cdnur) {
    lines.push(
      [
        'CDNUR',
        r.placeOfSupply,
        r.noteCount,
        r.taxableValue,
        r.igst,
        r.cgst,
        r.sgst,
        r.cess,
        r.tax,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }

  lines.push('');
  lines.push('Section,HSN,Description,UQC,Rate,Qty,TaxableValue,IGST,CGST,SGST,CESS');
  for (const r of hsn) {
    lines.push(
      [
        'HSN',
        r.hsn,
        r.description,
        r.uqc,
        r.rate,
        r.qty,
        r.taxableValue,
        r.igst,
        r.cgst,
        r.sgst,
        r.cess,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }

  const docs = (data.docs ?? []) as Array<Record<string, unknown>>;
  if (docs.length) {
    lines.push('');
    lines.push('Section,Nature,DocType,From,To,TotalNumber,Cancelled,NetIssued');
    for (const r of docs) {
      lines.push(
        ['DOCS', r.nature, r.docType, r.from, r.to, r.totalNumber, r.cancelled, r.netIssued]
          .map(escapeCsv)
          .join(','),
      );
    }
  }

  const nil = data.nilExempt as Record<string, Record<string, unknown>> | undefined;
  if (nil) {
    lines.push('');
    lines.push('Section,Kind,TaxableValue');
    for (const [kind, vals] of Object.entries(nil)) {
      lines.push(['NIL_EXEMPT', kind, vals.taxableValue].map(escapeCsv).join(','));
    }
  }

  return lines.join('\n');
}

function gstr3bToCsv(data: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push('Section,Field,Value');
  const sections = [
    '3.1_outwardSupplies',
    '3.1_inwardReverseCharge',
    '3.1_exemptInward',
    '3.2_interStateUnregistered',
    '4_itcEligible',
    '6.1_taxPayable',
  ];
  for (const s of sections) {
    const section = data[s] as Record<string, unknown> | undefined;
    if (!section) continue;
    for (const [k, v] of Object.entries(section)) {
      lines.push([s, k, v].map(escapeCsv).join(','));
    }
  }

  const outward = data.outwardSupplies as Record<string, Record<string, unknown>> | undefined;
  if (outward) {
    for (const [bucket, vals] of Object.entries(outward)) {
      for (const [k, v] of Object.entries(vals)) {
        lines.push([`outwardSupplies.${bucket}`, k, v].map(escapeCsv).join(','));
      }
    }
  }
  const itc = data.eligibleItc as Record<string, Record<string, unknown>> | undefined;
  if (itc) {
    for (const [bucket, vals] of Object.entries(itc)) {
      for (const [k, v] of Object.entries(vals)) {
        lines.push([`eligibleItc.${bucket}`, k, v].map(escapeCsv).join(','));
      }
    }
  }

  return lines.join('\n');
}

export async function exportGstr1(req: Request, res: Response): Promise<void> {
  const { res: fakeRes, captured } = captureResponse();
  await gstr1Handler(req, fakeRes);
  if (captured.status !== 200) {
    res.status(captured.status).json(captured.body);
    return;
  }
  const body = captured.body as { success: boolean; data: Record<string, unknown> };
  const format = (req.query.format as string | undefined) ?? 'json';
  const from = (req.query.from as string | undefined) ?? '';
  const to = (req.query.to as string | undefined) ?? '';
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gstr1_worksheet_${from}_${to}.csv"`);
    res.send(gstr1ToCsv(body.data));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gstr1_worksheet_${from}_${to}.json"`);
    res.send(JSON.stringify(body.data, null, 2));
  }
}

async function loadSupplierGstin(req: Request): Promise<string | null> {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  const company = tenantId
    ? await prisma.companySettings.findFirst({
        where: { OR: [{ tenantId }, { userId }] },
        select: { gstin: true },
      })
    : await prisma.companySettings.findUnique({
        where: { userId },
        select: { gstin: true },
      });
  const gstin = normalizeGstin(company?.gstin ?? '');
  return gstin || null;
}

export async function exportGstr1PortalJson(req: Request, res: Response): Promise<void> {
  const { res: fakeRes, captured } = captureResponse();
  await gstr1Handler(req, fakeRes);
  if (captured.status !== 200) {
    res.status(captured.status).json(captured.body);
    return;
  }
  const body = captured.body as { success: boolean; data: Gstr1WorksheetData };
  const supplierGstin = await loadSupplierGstin(req);
  if (!supplierGstin) {
    res.status(422).json({
      success: false,
      message: 'Company GSTIN is required in Company Settings before exporting portal JSON.',
      validationIssues: [
        {
          code: 'MISSING_SUPPLIER_GSTIN',
          message: 'Add a valid GSTIN under Settings → Company Settings.',
          section: 'header',
        },
      ],
    });
    return;
  }

  const portal = buildGstr1PortalJson({
    worksheet: body.data,
    supplierGstin,
    grossTurnover: body.data.summary?.totalTaxableValue,
  });
  const validationIssues = validateGstr1PortalJson(portal);
  if (validationIssues.length > 0) {
    res.status(422).json({
      success: false,
      message: 'Portal JSON validation failed. Fix the issues below and retry.',
      validationIssues,
      data: portal,
    });
    return;
  }

  const from = (req.query.from as string | undefined) ?? '';
  const to = (req.query.to as string | undefined) ?? '';
  const filename = `gstr1_portal_${supplierGstin}_${portal.fp}_${from}_${to}.json`;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(portal, null, 2));
}

export async function exportGstr3b(req: Request, res: Response): Promise<void> {
  const { res: fakeRes, captured } = captureResponse();
  await gstr3bHandler(req, fakeRes);
  if (captured.status !== 200) {
    res.status(captured.status).json(captured.body);
    return;
  }
  const body = captured.body as { success: boolean; data: Record<string, unknown> };
  const format = (req.query.format as string | undefined) ?? 'json';
  const from = (req.query.from as string | undefined) ?? '';
  const to = (req.query.to as string | undefined) ?? '';
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gstr3b_worksheet_${from}_${to}.csv"`);
    res.send(gstr3bToCsv(body.data));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gstr3b_worksheet_${from}_${to}.json"`);
    res.send(JSON.stringify(body.data, null, 2));
  }
}

function gstr9ToCsv(data: Record<string, unknown>): string {
  const lines: string[] = ['Section,Key,Value'];
  const period = data.period as Record<string, unknown> | undefined;
  if (period) {
    for (const [k, v] of Object.entries(period)) {
      lines.push(['period', k, v].map(escapeCsv).join(','));
    }
  }
  const pushBlock = (section: string, block: unknown) => {
    if (!block || typeof block !== 'object') return;
    for (const [k, v] of Object.entries(block as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          lines.push([`${section}.${k}`, sk, sv].map(escapeCsv).join(','));
        }
      } else {
        lines.push([section, k, v].map(escapeCsv).join(','));
      }
    }
  };
  pushBlock('table4_outward', data.table4_outward);
  pushBlock('table6_itc', data.table6_itc);
  pushBlock('table9_taxPaidApprox', data.table9_taxPaidApprox);
  pushBlock('documentCounts', data.documentCounts);

  lines.push('');
  lines.push('HSN,Description,Qty,TaxableValue,CGST,SGST,IGST,CESS');
  for (const row of (data.hsnAnnual ?? []) as Array<Record<string, unknown>>) {
    lines.push(
      [row.hsn, row.description, row.qty, row.taxableValue, row.cgst, row.sgst, row.igst, row.cess]
        .map(escapeCsv)
        .join(','),
    );
  }

  lines.push('');
  lines.push(
    'Month,OutTaxable,OutCGST,OutSGST,OutIGST,ItcTaxable,ItcCGST,ItcSGST,ItcIGST,PayCGST,PaySGST,PayIGST,Invoices,Purchases',
  );
  for (const m of (data.monthlyBreakdown ?? []) as Array<Record<string, unknown>>) {
    const out = (m.outward ?? {}) as Record<string, unknown>;
    const itc = (m.itc ?? {}) as Record<string, unknown>;
    const pay = (m.taxPayable ?? {}) as Record<string, unknown>;
    lines.push(
      [
        m.month,
        out.taxableValue,
        out.cgst,
        out.sgst,
        out.igst,
        itc.taxableValue,
        itc.cgst,
        itc.sgst,
        itc.igst,
        pay.cgst,
        pay.sgst,
        pay.igst,
        m.invoiceCount,
        m.purchaseCount,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }
  return lines.join('\n');
}

export async function exportGstr9(req: Request, res: Response): Promise<void> {
  const { res: fakeRes, captured } = captureResponse();
  await gstr9Handler(req, fakeRes);
  if (captured.status !== 200) {
    res.status(captured.status).json(captured.body);
    return;
  }
  const body = captured.body as { success: boolean; data: Record<string, unknown> };
  const format = (req.query.format as string | undefined) ?? 'json';
  const fy =
    (req.query.fy as string | undefined) ||
    ((body.data.period as { fy?: string } | undefined)?.fy ?? 'annual');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gstr9_${fy}.csv"`);
    res.send(gstr9ToCsv(body.data));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gstr9_${fy}.json"`);
    res.send(JSON.stringify(body.data, null, 2));
  }
}

function cmp08ToCsv(data: Record<string, unknown>): string {
  const lines: string[] = ['Section,Key,Value'];
  const push = (section: string, block: unknown) => {
    if (!block || typeof block !== 'object') return;
    for (const [k, v] of Object.entries(block as Record<string, unknown>)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
          lines.push([`${section}.${k}`, sk, sv].map(escapeCsv).join(','));
        }
      } else {
        lines.push([section, k, v].map(escapeCsv).join(','));
      }
    }
  };
  push('period', data.period);
  lines.push(['meta', 'isComposition', data.isComposition].map(escapeCsv).join(','));
  lines.push(['meta', 'compositionRatePercent', data.compositionRatePercent].map(escapeCsv).join(','));
  push('outwardSupplies', data.outwardSupplies);
  push('inwardSupplies', data.inwardSupplies);
  push('taxPayable', data.taxPayable);
  lines.push('');
  lines.push('Month,OutwardTaxable,Invoices,CreditNotes,SalesDebitNotes,Purchases');
  for (const m of (data.monthlyBreakdown ?? []) as Array<Record<string, unknown>>) {
    lines.push(
      [
        m.month,
        m.outwardTaxable,
        m.invoiceCount,
        m.creditNoteCount,
        m.salesDebitNoteCount ?? 0,
        m.purchaseCount,
      ]
        .map(escapeCsv)
        .join(','),
    );
  }
  return lines.join('\n');
}

export async function exportCmp08(req: Request, res: Response): Promise<void> {
  const { res: fakeRes, captured } = captureResponse();
  await cmp08Handler(req, fakeRes);
  if (captured.status !== 200) {
    res.status(captured.status).json(captured.body);
    return;
  }
  const body = captured.body as { success: boolean; data: Record<string, unknown> };
  const format = (req.query.format as string | undefined) ?? 'json';
  const quarter =
    (req.query.quarter as string | undefined) ||
    ((body.data.period as { quarter?: string } | undefined)?.quarter ?? 'quarter');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cmp08_${quarter}.csv"`);
    res.send(cmp08ToCsv(body.data));
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="cmp08_${quarter}.json"`);
    res.send(JSON.stringify(body.data, null, 2));
  }
}

const handlers = {
  exportGstr1,
  exportGstr1PortalJson,
  exportGstr3b,
  exportGstr9,
  exportCmp08,
};
module.exports = handlers;
module.exports.default = handlers;
