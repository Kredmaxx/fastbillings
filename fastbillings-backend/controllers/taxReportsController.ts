import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { requireUserId, UnauthorizedError } from '../lib/tenantScope';
import { getGstSummary } from '../lib/financialQueries';

function defaultMonthRange(req: Request): { fromDate: Date; toDate: Date } {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const toDate = to ? new Date(to) : new Date();
  // Default: current month
  const fromDate = from ? new Date(from) : new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  toDate.setHours(23, 59, 59, 999);
  fromDate.setHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

interface ItemTaxLine {
  taxRateId?: string;
  name?: string;
  kind?: string | null;
  percent?: number;
  amount?: number;
}

interface InvoiceItem {
  qty?: number;
  rate?: number;
  taxes?: ItemTaxLine[];
  totalTax?: number;
}

/**
 * GET /api/admin/reports/tax-summary?from=&to=&regime=
 */
export async function taxSummary(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);

    // Shared with the AI co-pilot's get_gst_summary tool via
    // lib/financialQueries so the human report and the AI answer agree.
    const gst = await getGstSummary(userId, fromDate, toDate);

    res.json({
      success: true,
      data: {
        period: { from: gst.from, to: gst.to },
        outwardTaxes: { ...gst.outwardByKind, TOTAL: gst.outwardTotal },
        inwardTaxes: { ...gst.inwardByKind, TOTAL: gst.inwardTotal },
        netTaxLiability: { ...gst.netByKind, TOTAL: gst.netTotal },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('taxSummary error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute tax summary' });
  }
}

/**
 * GET /api/admin/reports/gstr-1?from=&to=
 * GSTR-1: outward supplies summary. B2B = customers with GSTIN; B2C = everyone else.
 */
export async function gstr1(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);

    const invoices = await prisma.invoice.findMany({
      where: {
        userId,
        isDeleted: false,
        invoiceType: 'INVOICE',
        invoiceDate: { gte: fromDate, lte: toDate },
      },
      include: {
        billToCustomer: { select: { id: true, name: true, gstin: true, billingAddress: true } },
      },
      orderBy: { invoiceDate: 'asc' },
    });

    interface B2BRow {
      gstin: string;
      customerName: string;
      invoiceNumber: string | null;
      date: Date;
      taxableValue: number;
      igst: number;
      cgst: number;
      sgst: number;
      cess: number;
      total: number;
    }
    const b2b: B2BRow[] = [];
    interface B2CBucket {
      placeOfSupply: string;
      invoiceCount: number;
      taxableValue: number;
      tax: number;
    }
    const b2cMap = new Map<string, B2CBucket>();

    let totalTaxableValue = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0, totalCess = 0;

    for (const inv of invoices) {
      const items = (inv.items as unknown as InvoiceItem[] | null) ?? [];
      let invTaxable = Number(inv.taxableAmount ?? 0);
      let invCgst = 0, invSgst = 0, invIgst = 0, invCess = 0;
      for (const item of items) {
        const taxes = item.taxes ?? [];
        for (const t of taxes) {
          const amt = Number(t.amount ?? 0);
          if (t.kind === 'CGST') invCgst += amt;
          else if (t.kind === 'SGST' || t.kind === 'UTGST') invSgst += amt;
          else if (t.kind === 'IGST') invIgst += amt;
          else if (t.kind === 'CESS') invCess += amt;
        }
      }
      if (invCgst === 0 && invSgst === 0 && invIgst === 0 && inv.vat) {
        // fallback: treat as IGST when we can't decompose
        invIgst = Number(inv.vat ?? 0);
      }

      const gstin = inv.billToCustomer?.gstin?.trim();
      totalTaxableValue += invTaxable;
      totalCgst += invCgst;
      totalSgst += invSgst;
      totalIgst += invIgst;
      totalCess += invCess;

      if (gstin) {
        b2b.push({
          gstin,
          customerName: inv.billToCustomer?.name ?? '',
          invoiceNumber: inv.invoiceNumber,
          date: inv.invoiceDate,
          taxableValue: invTaxable,
          igst: invIgst,
          cgst: invCgst,
          sgst: invSgst,
          cess: invCess,
          total: invTaxable + invCgst + invSgst + invIgst + invCess,
        });
      } else {
        // B2C: bucket by place of supply (use customer.billingAddress.state or "Unknown")
        const addr = inv.billToCustomer?.billingAddress as { state?: string } | null;
        const place = addr?.state ?? 'Unknown';
        const cur = b2cMap.get(place);
        const tax = invCgst + invSgst + invIgst + invCess;
        if (cur) {
          cur.invoiceCount += 1;
          cur.taxableValue += invTaxable;
          cur.tax += tax;
        } else {
          b2cMap.set(place, { placeOfSupply: place, invoiceCount: 1, taxableValue: invTaxable, tax });
        }
      }
    }

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        b2b: b2b.sort((a, b) => a.date.getTime() - b.date.getTime()),
        b2c: Array.from(b2cMap.values()),
        summary: {
          totalInvoices: invoices.length,
          totalTaxableValue,
          totalCgst,
          totalSgst,
          totalIgst,
          totalCess,
          totalTax: totalCgst + totalSgst + totalIgst + totalCess,
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr1 error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute GSTR-1' });
  }
}

/**
 * GET /api/admin/reports/gstr-3b?from=&to=
 */
export async function gstr3b(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { fromDate, toDate } = defaultMonthRange(req);

    // Outward: from invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        userId,
        isDeleted: false,
        invoiceType: 'INVOICE',
        invoiceDate: { gte: fromDate, lte: toDate },
      },
      select: { items: true, vat: true, taxableAmount: true, billToCustomer: { select: { gstin: true, billingAddress: true } } },
    });

    let outwardTaxable = 0, outwardCgst = 0, outwardSgst = 0, outwardIgst = 0, outwardCess = 0;
    let interStateUnregistered = 0;

    for (const inv of invoices) {
      const items = (inv.items as unknown as InvoiceItem[] | null) ?? [];
      const taxable = Number(inv.taxableAmount ?? 0);
      outwardTaxable += taxable;
      let invIgst = 0;
      for (const item of items) {
        const taxes = item.taxes ?? [];
        for (const t of taxes) {
          const amt = Number(t.amount ?? 0);
          if (t.kind === 'CGST') outwardCgst += amt;
          else if (t.kind === 'SGST' || t.kind === 'UTGST') outwardSgst += amt;
          else if (t.kind === 'IGST') { outwardIgst += amt; invIgst += amt; }
          else if (t.kind === 'CESS') outwardCess += amt;
        }
      }

      // Inter-state to unregistered = customer has no GSTIN AND invoice has IGST
      if (!inv.billToCustomer?.gstin?.trim() && invIgst > 0) {
        interStateUnregistered += taxable;
      }
    }

    // Inward (ITC eligible): from purchases
    const purchases = await prisma.purchase.findMany({
      where: { userId, isDeleted: false, purchaseDate: { gte: fromDate, lte: toDate } },
      select: { items: true, taxableAmount: true, totalTax: true },
    });
    let inwardTaxable = 0, inwardCgst = 0, inwardSgst = 0, inwardIgst = 0, inwardCess = 0;
    for (const p of purchases) {
      const items = (p.items as unknown as InvoiceItem[] | null) ?? [];
      inwardTaxable += Number(p.taxableAmount ?? 0);
      for (const item of items) {
        const taxes = item.taxes ?? [];
        for (const t of taxes) {
          const amt = Number(t.amount ?? 0);
          if (t.kind === 'CGST') inwardCgst += amt;
          else if (t.kind === 'SGST' || t.kind === 'UTGST') inwardSgst += amt;
          else if (t.kind === 'IGST') inwardIgst += amt;
          else if (t.kind === 'CESS') inwardCess += amt;
        }
      }
    }

    const taxPayable = {
      cgst: Math.max(0, outwardCgst - inwardCgst),
      sgst: Math.max(0, outwardSgst - inwardSgst),
      igst: Math.max(0, outwardIgst - inwardIgst),
      cess: Math.max(0, outwardCess - inwardCess),
    };

    res.json({
      success: true,
      data: {
        period: { from: fromDate, to: toDate },
        '3.1_outwardSupplies': {
          taxableValue: outwardTaxable,
          cgst: outwardCgst,
          sgst: outwardSgst,
          igst: outwardIgst,
          cess: outwardCess,
        },
        '3.2_interStateUnregistered': {
          taxableValue: interStateUnregistered,
        },
        '4_itcEligible': {
          taxableValue: inwardTaxable,
          cgst: inwardCgst,
          sgst: inwardSgst,
          igst: inwardIgst,
          cess: inwardCess,
        },
        '6.1_taxPayable': taxPayable,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('gstr3b error:', err);
    res.status(500).json({ success: false, message: 'Failed to compute GSTR-3B' });
  }
}

const handlers = { taxSummary, gstr1, gstr3b };
module.exports = handlers;
module.exports.default = handlers;
