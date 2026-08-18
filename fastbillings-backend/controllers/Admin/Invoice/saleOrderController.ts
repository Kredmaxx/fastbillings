import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { SaleOrderStatus } from '@prisma/client';

import { prisma } from '../../../lib/prisma';
import {
  optionalTenantId,
  requireTenantId,
  requireUserId,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../../../lib/tenantScope';
import { calcSaleOrderTotals, normaliseSaleOrderItems } from '../../../lib/saleOrderItems';

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<SaleOrderStatus>(['draft', 'confirmed', 'invoiced', 'cancelled']);

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDecimal(value: unknown, fallback = 0): Prisma.Decimal {
  return new Prisma.Decimal(typeof value === 'number' || typeof value === 'string' ? value : fallback);
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseItems(body: Record<string, unknown>): ReturnType<typeof normaliseSaleOrderItems> {
  let raw = body.items;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = [];
    }
  }
  return normaliseSaleOrderItems(raw);
}

async function generateNextSaleOrderId(tx: Tx, tenantId: string | null, userId: string): Promise<string> {
  const last = await tx.saleOrder.findFirst({
    where: {
      saleOrderId: { not: null },
      ...(tenantId ? { OR: [{ tenantId }, { userId }] } : { userId }),
    },
    orderBy: { createdAt: 'desc' },
    select: { saleOrderId: true },
  });
  let lastNumber = 0;
  if (last?.saleOrderId) {
    const match = last.saleOrderId.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `SO-${String(lastNumber + 1).padStart(6, '0')}`;
}

async function generateNextInvoiceNumber(tx: Tx, tenantId: string): Promise<string> {
  const prefixSetting = await tx.generalSetting.findFirst({ where: { tenantId, key: 'invoicePrefix' } });
  const prefix =
    prefixSetting && typeof prefixSetting.value === 'string' ? prefixSetting.value : 'INV-';
  const lastInvoice = await tx.invoice.findFirst({
    where: { tenantId, invoiceNumber: { not: null }, invoiceType: 'INVOICE' },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });
  let lastNumber = 0;
  if (lastInvoice?.invoiceNumber) {
    const match = lastInvoice.invoiceNumber.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `${prefix}${String(lastNumber + 1).padStart(6, '0')}`;
}

export async function createSaleOrder(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    const items = parseItems(body);
    const billFromId = String(body.billFrom ?? '');
    const billToId = String(body.billTo ?? '');

    const [billFrom, billTo] = await Promise.all([
      prisma.user.findUnique({ where: { id: billFromId } }),
      prisma.customer.findFirst({
        where: { id: billToId, isDeleted: false, ...tenantOrUserFilter(req) },
      }),
    ]);
    if (!billFrom || !billTo) {
      res.status(400).json({ success: false, message: 'Bill from and customer are required' });
      return;
    }
    if (!items.some((i) => (i.name ?? '').trim())) {
      res.status(400).json({ success: false, message: 'Add at least one item' });
      return;
    }

    const status = ((body.status as string) ?? 'draft') as SaleOrderStatus;
    if (!VALID_STATUSES.has(status) || status === 'invoiced') {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    const totals = calcSaleOrderTotals(items);
    const order = await prisma.$transaction(async (tx) => {
      const saleOrderId = await generateNextSaleOrderId(tx, tenantId, userId);
      return tx.saleOrder.create({
        data: {
          saleOrderId,
          customerId: (body.customerId as string) ?? billToId,
          orderDate: safeDate(body.orderDate) ?? new Date(),
          deliveryDate: safeDate(body.deliveryDate),
          referenceNo: (body.referenceNo as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status,
          taxableAmount: toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, totals.taxable))),
          totalDiscount: toDecimal(asNumber(body.totalDiscount, totals.discount)),
          vat: toDecimal(asNumber(body.totalTax, asNumber(body.vat, totals.vat))),
          roundOff: Boolean(body.roundOff),
          TotalAmount: toDecimal(asNumber(body.grandTotal, asNumber(body.TotalAmount, totals.total))),
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          userId,
          billFrom: billFromId,
          billTo: billToId,
          warehouseId: (body.warehouseId as string) || null,
          currencyCode: typeof body.currencyCode === 'string' ? body.currencyCode : null,
          tenantId,
        },
      });
    });

    res.status(201).json({ success: true, message: 'Sale order created', data: order });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Create sale order error:', err);
    res.status(500).json({ success: false, message: 'Error creating sale order' });
  }
}

export async function getSaleOrderById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const order = await prisma.saleOrder.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
      include: {
        customer: true,
        billToCustomer: true,
        billFromUser: { select: { id: true, firstName: true, lastName: true } },
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
    });
    if (!order) {
      res.status(404).json({ success: false, message: 'Sale order not found' });
      return;
    }
    res.json({ success: true, data: order });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Get sale order error:', err);
    res.status(500).json({ success: false, message: 'Error fetching sale order' });
  }
}

export async function updateSaleOrder(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.saleOrder.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Sale order not found' });
      return;
    }
    if (existing.status === 'invoiced' || existing.invoiceId) {
      res.status(409).json({ success: false, message: 'Cannot edit a sale order that has been invoiced' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const items = parseItems(body);
    const totals = calcSaleOrderTotals(items);
    const status = body.status != null ? (body.status as SaleOrderStatus) : existing.status;
    if (!VALID_STATUSES.has(status) || status === 'invoiced') {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    const updated = await prisma.saleOrder.update({
      where: { id },
      data: {
        customerId: (body.customerId as string) ?? existing.customerId,
        orderDate: safeDate(body.orderDate) ?? existing.orderDate,
        deliveryDate: safeDate(body.deliveryDate),
        referenceNo: (body.referenceNo as string) ?? existing.referenceNo,
        items: items.length ? (items as unknown as Prisma.InputJsonValue) : existing.items ?? Prisma.JsonNull,
        status,
        taxableAmount: toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, totals.taxable || Number(existing.taxableAmount)))),
        totalDiscount: toDecimal(asNumber(body.totalDiscount, totals.discount)),
        vat: toDecimal(asNumber(body.totalTax, asNumber(body.vat, totals.vat))),
        roundOff: body.roundOff != null ? Boolean(body.roundOff) : existing.roundOff,
        TotalAmount: toDecimal(asNumber(body.grandTotal, asNumber(body.TotalAmount, totals.total || Number(existing.TotalAmount)))),
        notes: (body.notes as string) ?? existing.notes,
        termsAndCondition: (body.termsAndCondition as string) ?? existing.termsAndCondition,
        billFrom: (body.billFrom as string) || existing.billFrom,
        billTo: (body.billTo as string) || existing.billTo,
        warehouseId: body.warehouseId !== undefined ? ((body.warehouseId as string) || null) : existing.warehouseId,
        currencyCode: typeof body.currencyCode === 'string' ? body.currencyCode : existing.currencyCode,
      },
    });
    res.json({ success: true, message: 'Sale order updated', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Update sale order error:', err);
    res.status(500).json({ success: false, message: 'Error updating sale order' });
  }
}

export async function deleteSaleOrder(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.saleOrder.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Sale order not found' });
      return;
    }
    if (existing.invoiceId) {
      res.status(409).json({ success: false, message: 'Cannot delete a sale order that has been invoiced' });
      return;
    }
    await prisma.saleOrder.update({ where: { id }, data: { isDeleted: true } });
    res.json({ success: true, message: 'Sale order deleted' });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Delete sale order error:', err);
    res.status(500).json({ success: false, message: 'Error deleting sale order' });
  }
}

export async function listSaleOrders(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { page = '1', limit = '10', status, search = '' } = req.query as {
      page?: string;
      limit?: string;
      status?: string;
      search?: string;
    };
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const andFilters: Prisma.SaleOrderWhereInput[] = [tenantOrUserFilter(req)];
    if (status && VALID_STATUSES.has(status as SaleOrderStatus)) {
      andFilters.push({ status: status as SaleOrderStatus });
    }
    if (search) {
      andFilters.push({
        OR: [
          { saleOrderId: { contains: search, mode: 'insensitive' } },
          { referenceNo: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.SaleOrderWhereInput = { isDeleted: false, AND: andFilters };

    const [total, rows] = await prisma.$transaction([
      prisma.saleOrder.count({ where }),
      prisma.saleOrder.findMany({
        where,
        skip,
        take: limitN,
        orderBy: { createdAt: 'desc' },
        include: {
          billToCustomer: { select: { id: true, name: true, email: true, phone: true, image: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        saleOrders: rows.map((row) => ({
          id: row.id,
          saleOrderId: row.saleOrderId,
          orderDate: row.orderDate,
          deliveryDate: row.deliveryDate,
          referenceNo: row.referenceNo,
          status: row.status,
          taxableAmount: row.taxableAmount,
          vat: row.vat,
          TotalAmount: row.TotalAmount,
          billTo: row.billToCustomer,
          invoiceId: row.invoiceId,
          invoiceNumber: row.invoice?.invoiceNumber ?? null,
          createdAt: row.createdAt,
        })),
        pagination: {
          total,
          page: pageN,
          limit: limitN,
          totalPages: Math.ceil(total / limitN) || 1,
        },
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List sale orders error:', err);
    res.status(500).json({ success: false, message: 'Error fetching sale orders' });
  }
}

/**
 * Converts a sale order into a DRAFT invoice. Stock and GL post when the user
 * issues that invoice — same path as a normal invoice, not a second ledger.
 */
export async function convertSaleOrderToInvoice(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const order = await prisma.saleOrder.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserScope(req) },
    });
    if (!order) {
      res.status(404).json({ success: false, message: 'Sale order not found' });
      return;
    }
    if (order.status === 'cancelled') {
      res.status(400).json({ success: false, message: 'Cancelled sale orders cannot be invoiced' });
      return;
    }
    if (order.invoiceId) {
      res.status(409).json({ success: false, message: 'Sale order already converted to invoice' });
      return;
    }

    const invoice = await prisma.$transaction(async (tx) => {
      const locked = await tx.saleOrder.findFirst({
        where: { id, isDeleted: false, ...tenantOrUserScope(req) },
      });
      if (!locked) throw new Error('Sale order not found');
      if (locked.invoiceId) throw new Error('Sale order already converted to invoice');

      const invoiceNumber = await generateNextInvoiceNumber(tx, tenantId);
      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          customerId: locked.customerId ?? locked.billTo,
          invoiceDate: new Date(),
          dueDate: locked.deliveryDate,
          referenceNo: locked.saleOrderId ?? locked.referenceNo ?? '',
          items: locked.items ?? Prisma.JsonNull,
          status: 'DRAFT',
          taxableAmount: locked.taxableAmount,
          TotalAmount: locked.TotalAmount,
          vat: locked.vat,
          totalDiscount: locked.totalDiscount,
          roundOff: locked.roundOff,
          notes: locked.notes
            ? `${locked.notes}\nConverted from sale order ${locked.saleOrderId ?? locked.id}`
            : `Converted from sale order ${locked.saleOrderId ?? locked.id}`,
          termsAndCondition: locked.termsAndCondition,
          billFrom: locked.billFrom,
          billTo: locked.billTo,
          userId: locked.userId || userId,
          tenantId,
          warehouseId: locked.warehouseId,
          currencyCode: locked.currencyCode,
        },
      });

      await tx.saleOrder.update({
        where: { id: locked.id },
        data: { invoiceId: created.id, status: 'invoiced' },
      });
      return created;
    });

    res.status(201).json({
      success: true,
      message: 'Sale order converted to draft invoice',
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'Sale order not found') {
      res.status(404).json({ success: false, message: msg });
      return;
    }
    if (msg === 'Sale order already converted to invoice') {
      res.status(409).json({ success: false, message: msg });
      return;
    }
    console.error('Convert sale order error:', err);
    res.status(500).json({ success: false, message: 'Error converting sale order' });
  }
}

const handlers = {
  createSaleOrder,
  getSaleOrderById,
  updateSaleOrder,
  deleteSaleOrder,
  listSaleOrders,
  convertSaleOrderToInvoice,
};
module.exports = handlers;
module.exports.createSaleOrder = createSaleOrder;
module.exports.getSaleOrderById = getSaleOrderById;
module.exports.updateSaleOrder = updateSaleOrder;
module.exports.deleteSaleOrder = deleteSaleOrder;
module.exports.listSaleOrders = listSaleOrders;
module.exports.convertSaleOrderToInvoice = convertSaleOrderToInvoice;
