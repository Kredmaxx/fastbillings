import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  UnauthorizedError,
} from '../lib/tenantScope';
import {
  getEInvoiceRuntime,
  resolveEInvoiceProvider,
} from '../lib/gstProviders/resolve';
import { isGstProviderName } from '../lib/gstProviders/types';
import { invoiceScope } from '../lib/gstReportUtils';
import type { DocItem } from '../lib/gstReportUtils';
import {
  buildEInvoicePayload,
  EInvoiceValidationError,
} from '../lib/einvoicePayload';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
    const where: Prisma.EInvoiceRecordWhereInput = { ...tenantOrUserFilter(req) };
    const status = req.query.status as string | undefined;
    if (status) where.status = status as Prisma.EInvoiceRecordWhereInput['status'];

    const [rows, total] = await Promise.all([
      prisma.eInvoiceRecord.findMany({
        where,
        include: { invoice: { select: { id: true, invoiceNumber: true, TotalAmount: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.eInvoiceRecord.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        eInvoices: rows.map((r) => ({
          id: r.id,
          irn: r.irn,
          ackNo: r.ackNo,
          ackDate: r.ackDate,
          status: r.status,
          provider: r.provider,
          errorMessage: r.errorMessage,
          invoice: r.invoice
            ? {
                id: r.invoice.id,
                invoiceNumber: r.invoice.invoiceNumber,
                totalAmount: r.invoice.TotalAmount,
              }
            : null,
          createdAt: r.createdAt,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('eInvoice list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list e-invoices' });
  }
}

export async function getByInvoice(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { invoiceId } = req.params as { invoiceId: string };

    const row = await prisma.eInvoiceRecord.findFirst({
      where: { invoiceId, ...tenantOrUserFilter(req) },
      orderBy: { createdAt: 'desc' },
      include: { invoice: { select: { id: true, invoiceNumber: true } } },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'No e-invoice record for this invoice' });
      return;
    }
    res.json({ success: true, data: { eInvoice: { ...row } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('eInvoice getByInvoice error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch e-invoice' });
  }
}

export async function generate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { invoiceId } = req.params as { invoiceId: string };

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...invoiceScope(req) },
      include: {
        billToCustomer: {
          select: { name: true, gstin: true, billingAddress: true },
        },
      },
    });
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
      res.status(400).json({
        success: false,
        message: 'E-invoice cannot be generated for draft or cancelled invoices',
      });
      return;
    }

    // Idempotency: workspace-scoped — avoids cross-tenant leak of GENERATED rows
    const existing = await prisma.eInvoiceRecord.findFirst({
      where: { invoiceId, status: 'GENERATED', ...tenantOrUserFilter(req) },
    });
    if (existing) {
      res.json({ success: true, message: 'IRN already generated', data: { eInvoice: { ...existing } } });
      return;
    }

    const authTenantId = optionalTenantId(req);
    const stampTenantId = authTenantId ?? invoice.tenantId ?? null;
    const company = authTenantId
      ? await prisma.companySettings.findFirst({
          where: { OR: [{ tenantId: authTenantId }, { userId }] },
          select: { gstin: true, isComposition: true, companyName: true, state: true },
        })
      : await prisma.companySettings.findUnique({
          where: { userId },
          select: { gstin: true, isComposition: true, companyName: true, state: true },
        });

    if (company?.isComposition) {
      res.status(400).json({
        success: false,
        message: 'E-invoice IRN is not applicable for composition dealers',
      });
      return;
    }

    if (invoice.isReverseCharge) {
      res.status(400).json({
        success: false,
        message: 'E-invoice generation is blocked for reverse-charge invoices',
      });
      return;
    }

    let payload;
    try {
      payload = buildEInvoicePayload({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber ?? invoice.id.slice(0, 8),
        invoiceDate: invoice.invoiceDate,
        sellerGstin: company?.gstin ?? '',
        sellerName: company?.companyName ?? null,
        buyerGstin: invoice.billToCustomer?.gstin,
        buyerName: invoice.billToCustomer?.name ?? null,
        buyerBillingAddress: invoice.billToCustomer?.billingAddress,
        companyState: company?.state ?? null,
        totalAmount: Number(invoice.TotalAmount ?? 0),
        taxableAmount: Number(invoice.taxableAmount ?? 0),
        vat: Number(invoice.vat ?? 0),
        items: (invoice.items as unknown as DocItem[] | null) ?? [],
      });
    } catch (e) {
      if (e instanceof EInvoiceValidationError) {
        res.status(400).json({
          success: false,
          message: e.message,
          errors: e.errors,
        });
        return;
      }
      throw e;
    }

    const { provider, config } = await getEInvoiceRuntime(userId, stampTenantId);
    let result;
    try {
      result = await provider.generate(payload, config);
    } catch (e) {
      const record = await prisma.eInvoiceRecord.create({
        data: {
          userId,
          tenantId: stampTenantId,
          invoiceId: invoice.id,
          provider: provider.name,
          status: 'FAILED',
          errorMessage: e instanceof Error ? e.message : String(e),
        },
      });
      res.status(500).json({ success: false, message: 'IRN generation failed', data: { eInvoice: record } });
      return;
    }

    const created = await prisma.eInvoiceRecord.create({
      data: {
        userId,
        tenantId: stampTenantId,
        invoiceId: invoice.id,
        provider: provider.name,
        status: 'GENERATED',
        irn: result.irn,
        ackNo: result.ackNo,
        ackDate: result.ackDate,
        signedInvoice: result.signedInvoice,
        signedQRCode: result.signedQRCode,
        metadata: (result.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    res.status(201).json({ success: true, message: 'IRN generated', data: { eInvoice: { ...created } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Error && err.message.includes('GST compliance integrations are disabled')) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('eInvoice generate error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate IRN' });
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string };

    const record = await prisma.eInvoiceRecord.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
    });
    if (!record) {
      res.status(404).json({ success: false, message: 'E-invoice record not found' });
      return;
    }
    if (record.status === 'CANCELLED') {
      res.status(400).json({ success: false, message: 'Already cancelled' });
      return;
    }
    if (record.status !== 'GENERATED' || !record.irn) {
      res.status(400).json({ success: false, message: 'Only GENERATED records can be cancelled' });
      return;
    }

    const { config, settings } = await getEInvoiceRuntime(userId, optionalTenantId(req));
    const providerName = isGstProviderName(record.provider)
      ? record.provider
      : settings.eInvoiceProvider;
    const provider = resolveEInvoiceProvider(providerName);
    const result = await provider.cancel(record.irn, body.reason ?? 'No reason given', config);

    const updated = await prisma.eInvoiceRecord.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: result.cancelledAt,
        cancelReason: body.reason ?? null,
      },
    });

    res.json({ success: true, message: 'IRN cancelled', data: { eInvoice: { ...updated } } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('eInvoice cancel error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel IRN' });
  }
}

const handlers = { list, getByInvoice, generate, cancel };
module.exports = handlers;
module.exports.default = handlers;
