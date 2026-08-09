import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  UnauthorizedError,
} from '../lib/tenantScope';
import { getEWayRuntime, resolveEWayProvider } from '../lib/gstProviders/resolve';
import { isGstProviderName } from '../lib/gstProviders/types';
import { invoiceScope } from '../lib/gstReportUtils';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
    const where: Prisma.EWayBillRecordWhereInput = { ...tenantOrUserFilter(req) };
    const status = req.query.status as string | undefined;
    if (status) where.status = status as Prisma.EWayBillRecordWhereInput['status'];

    const [rows, total] = await Promise.all([
      prisma.eWayBillRecord.findMany({
        where,
        include: { invoice: { select: { id: true, invoiceNumber: true, TotalAmount: true, ewayBillNo: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.eWayBillRecord.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        eWayBills: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('eWayBill list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list e-way bills' });
  }
}

export async function getByInvoice(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { invoiceId } = req.params as { invoiceId: string };

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...invoiceScope(req) },
      select: {
        id: true,
        invoiceNumber: true,
        ewayBillNo: true,
        ewayBillDate: true,
        transporterGstin: true,
        transporterName: true,
        transportDistanceKm: true,
        vehicleNo: true,
        dispatchFromPincode: true,
        dispatchToPincode: true,
      },
    });
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const record = await prisma.eWayBillRecord.findFirst({
      where: { invoiceId, ...tenantOrUserFilter(req) },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: {
        transport: invoice,
        eWayBill: record,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('eWayBill getByInvoice error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch e-way bill' });
  }
}

export async function updateTransport(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { invoiceId } = req.params as { invoiceId: string };
    const body = req.body as {
      transporterGstin?: string | null;
      transporterName?: string | null;
      transportDistanceKm?: number | null;
      vehicleNo?: string | null;
      dispatchFromPincode?: string | null;
      dispatchToPincode?: string | null;
      ewayBillNo?: string | null;
      ewayBillDate?: string | null;
    };

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...invoiceScope(req) },
    });
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        transporterGstin: body.transporterGstin !== undefined ? (body.transporterGstin?.trim() || null) : undefined,
        transporterName: body.transporterName !== undefined ? (body.transporterName?.trim() || null) : undefined,
        transportDistanceKm:
          body.transportDistanceKm !== undefined
            ? body.transportDistanceKm == null
              ? null
              : Number(body.transportDistanceKm)
            : undefined,
        vehicleNo: body.vehicleNo !== undefined ? (body.vehicleNo?.trim() || null) : undefined,
        dispatchFromPincode:
          body.dispatchFromPincode !== undefined ? (body.dispatchFromPincode?.trim() || null) : undefined,
        dispatchToPincode:
          body.dispatchToPincode !== undefined ? (body.dispatchToPincode?.trim() || null) : undefined,
        ewayBillNo: body.ewayBillNo !== undefined ? (body.ewayBillNo?.trim() || null) : undefined,
        ewayBillDate:
          body.ewayBillDate !== undefined
            ? body.ewayBillDate
              ? new Date(body.ewayBillDate)
              : null
            : undefined,
      },
      select: {
        id: true,
        ewayBillNo: true,
        ewayBillDate: true,
        transporterGstin: true,
        transporterName: true,
        transportDistanceKm: true,
        vehicleNo: true,
        dispatchFromPincode: true,
        dispatchToPincode: true,
      },
    });

    res.json({ success: true, message: 'Transport details saved', data: { transport: updated } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('eWayBill updateTransport error:', err);
    res.status(500).json({ success: false, message: 'Failed to save transport details' });
  }
}

export async function generate(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { invoiceId } = req.params as { invoiceId: string };

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ...invoiceScope(req) },
      include: { billToCustomer: { select: { gstin: true } } },
    });
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    const existing = await prisma.eWayBillRecord.findFirst({
      where: { invoiceId, status: 'GENERATED', ...tenantOrUserFilter(req) },
    });
    if (existing) {
      res.json({ success: true, message: 'E-way bill already generated', data: { eWayBill: existing } });
      return;
    }

    const authTenantId = optionalTenantId(req);
    const stampTenantId = authTenantId ?? invoice.tenantId ?? null;
    const company = authTenantId
      ? await prisma.companySettings.findFirst({
          where: { OR: [{ tenantId: authTenantId }, { userId }] },
          select: { gstin: true, isComposition: true },
        })
      : await prisma.companySettings.findUnique({
          where: { userId },
          select: { gstin: true, isComposition: true },
        });

    if (company?.isComposition) {
      res.status(400).json({
        success: false,
        message: 'E-way bill is not applicable for composition dealers',
      });
      return;
    }

    const sellerGstin = (company?.gstin || '').trim();
    if (!sellerGstin) {
      res.status(400).json({
        success: false,
        message: 'Set company GSTIN in settings before generating e-way bill',
      });
      return;
    }

    if (!invoice.vehicleNo?.trim() && !invoice.transporterGstin?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Save vehicle number or transporter GSTIN before generating e-way bill',
      });
      return;
    }

    const { provider, config } = await getEWayRuntime(userId, stampTenantId);
    const payload = {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? invoice.id.slice(0, 8),
      invoiceDate: invoice.invoiceDate,
      sellerGstin,
      buyerGstin: invoice.billToCustomer?.gstin ?? null,
      totalAmount: Number(invoice.TotalAmount ?? 0),
      taxableAmount: Number(invoice.taxableAmount ?? 0),
      transporterGstin: invoice.transporterGstin,
      transporterName: invoice.transporterName,
      distanceKm: invoice.transportDistanceKm,
      vehicleNo: invoice.vehicleNo,
      fromPincode: invoice.dispatchFromPincode,
      toPincode: invoice.dispatchToPincode,
    };

    let result;
    try {
      result = await provider.generate(payload, config);
    } catch (e) {
      const failed = await prisma.eWayBillRecord.create({
        data: {
          userId,
          tenantId: stampTenantId,
          invoiceId: invoice.id,
          provider: provider.name,
          status: 'FAILED',
          errorMessage: e instanceof Error ? e.message : String(e),
          transporterGstin: invoice.transporterGstin,
          transporterName: invoice.transporterName,
          distanceKm: invoice.transportDistanceKm,
          vehicleNo: invoice.vehicleNo,
          fromPincode: invoice.dispatchFromPincode,
          toPincode: invoice.dispatchToPincode,
        },
      });
      res.status(500).json({ success: false, message: 'E-way generation failed', data: { eWayBill: failed } });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.eWayBillRecord.create({
        data: {
          userId,
          tenantId: stampTenantId,
          invoiceId: invoice.id,
          provider: provider.name,
          status: 'GENERATED',
          ewayBillNo: result.ewayBillNo,
          ewayBillDate: result.ewayBillDate,
          validUpto: result.validUpto,
          transporterGstin: invoice.transporterGstin,
          transporterName: invoice.transporterName,
          distanceKm: invoice.transportDistanceKm,
          vehicleNo: invoice.vehicleNo,
          fromPincode: invoice.dispatchFromPincode,
          toPincode: invoice.dispatchToPincode,
          metadata: (result.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          ewayBillNo: result.ewayBillNo,
          ewayBillDate: result.ewayBillDate,
        },
      });
      return row;
    });

    res.status(201).json({ success: true, message: 'E-way bill generated', data: { eWayBill: created } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Error && err.message.includes('GST compliance integrations are disabled')) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }
    console.error('eWayBill generate error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate e-way bill' });
  }
}

export async function cancel(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { reason?: string };

    const record = await prisma.eWayBillRecord.findFirst({
      where: { id, ...tenantOrUserFilter(req) },
    });
    if (!record) {
      res.status(404).json({ success: false, message: 'E-way bill record not found' });
      return;
    }
    if (record.status === 'CANCELLED') {
      res.status(400).json({ success: false, message: 'Already cancelled' });
      return;
    }
    if (record.status !== 'GENERATED' || !record.ewayBillNo) {
      res.status(400).json({ success: false, message: 'Only GENERATED records can be cancelled' });
      return;
    }

    const { config, settings } = await getEWayRuntime(userId, optionalTenantId(req));
    const providerName = isGstProviderName(record.provider)
      ? record.provider
      : settings.eWayProvider;
    const provider = resolveEWayProvider(providerName);
    const result = await provider.cancel(record.ewayBillNo, body.reason ?? 'No reason given', config);

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.eWayBillRecord.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: result.cancelledAt,
          cancelReason: body.reason ?? null,
        },
      });
      await tx.invoice.update({
        where: { id: record.invoiceId },
        data: { ewayBillNo: null, ewayBillDate: null },
      });
      return row;
    });

    res.json({ success: true, message: 'E-way bill cancelled', data: { eWayBill: updated } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('eWayBill cancel error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel e-way bill' });
  }
}

const handlers = { list, getByInvoice, updateTransport, generate, cancel };
module.exports = handlers;
module.exports.default = handlers;
