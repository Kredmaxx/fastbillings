import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { DeliveryChallanStatus } from '@prisma/client';
import { validationResult } from 'express-validator';

import { prisma } from '../../../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserFilter,
  tenantOrUserScope,
  UnauthorizedError,
} from '../../../lib/tenantScope';

// C.1: resolve the company default currency code (ISO string).
async function resolveDefaultCurrencyCode(): Promise<string | null> {
  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true, isDeleted: false },
    select: { code: true },
  });
  return defaultCurrency?.code ?? null;
}

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<DeliveryChallanStatus>(['PENDING', 'DELIVERED', 'CANCELLED', 'DRAFT']);

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

function buildBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get('host')}/`;
}

function formatDateShort(d: Date | null | undefined): string | null {
  if (!d) return null;
  const day = d.getDate().toString().padStart(2, '0');
  const month = d.toLocaleString('default', { month: 'short' });
  return `${day}, ${month} ${d.getFullYear()}`;
}

interface IncomingItem {
  id?: string;
  name?: string;
  unit?: string;
  unitKind?: string;
  secondaryToPrimaryQty?: number | null;
  qtyPrimary?: number;
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  amount?: number;
  discount_type?: string;
  discount_value?: number;
}

function normaliseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => ({
    id: item.id,
    name: item.name ?? '',
    unit: item.unit ?? '',
    unitKind: item.unitKind,
    secondaryToPrimaryQty: item.secondaryToPrimaryQty ?? null,
    qtyPrimary: item.qtyPrimary,
    qty: asNumber(item.qty, 0),
    rate: asNumber(item.rate, 0),
    discount: asNumber(item.discount, 0),
    tax: asNumber(item.tax, 0),
    tax_group_id: item.tax_group_id ?? undefined,
    amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
    discount_type: item.discount_type ?? 'Fixed',
    discount_value: asNumber(item.discount_value, 0),
  }));
}

async function generateNextChallanNumber(
  tx: Tx,
  tenantId: string | null,
  userId: string,
): Promise<string> {
  const last = await tx.deliveryChallan.findFirst({
    where: {
      challanNumber: { not: null },
      ...(tenantId ? { OR: [{ tenantId }, { userId }] } : { userId }),
    },
    orderBy: { createdAt: 'desc' },
    select: { challanNumber: true },
  });
  let lastNumber = 0;
  if (last?.challanNumber) {
    const match = last.challanNumber.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `DC-${String(lastNumber + 1).padStart(6, '0')}`;
}

// =============================================================================
// createDeliveryChallan
// =============================================================================

export async function createDeliveryChallan(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as Record<string, unknown>;
    const items = normaliseItems(body.items);

    const billToId = body.billTo as string;
    const billFromId = body.billFrom as string;

    const [customer, user] = await Promise.all([
      prisma.customer.findFirst({
        where: { id: billToId, isDeleted: false, ...tenantOrUserFilter(req) },
      }),
      prisma.user.findUnique({ where: { id: userId } }),
    ]);
    if (!customer) {
      res.status(404).json({ message: 'Customer not found' });
      return;
    }
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const signType = (body.sign_type as string) ?? 'none';
    let signatureImage: string | null = null;
    let signatureId: string | null = null;
    if (signType === 'eSignature' && req.file) signatureImage = req.file.path;
    if (signType === 'digitalSignature' && body.signatureId) {
      const sig = await prisma.signature.findFirst({
        where: { id: body.signatureId as string, ...tenantOrUserScope(req) },
      });
      if (!sig) {
        res.status(404).json({ message: 'Digital Signature not found' });
        return;
      }
      signatureId = sig.id;
    }
    const bankId = (body.bank as string) || null;
    if (bankId) {
      const bank = await prisma.bankDetail.findFirst({
        where: { id: bankId, ...tenantOrUserScope(req) },
      });
      if (!bank) {
        res.status(404).json({ message: 'Bank account not found' });
        return;
      }
    }

    // Never attach a foreign-workspace invoice (cross-tenant document link IDOR).
    const invoiceId = (body.invoiceId as string) || null;
    if (invoiceId) {
      const invoice = await prisma.invoice.findFirst({
        where: { id: invoiceId, ...tenantOrUserScope(req) },
        select: { id: true },
      });
      if (!invoice) {
        res.status(404).json({ message: 'Invoice not found' });
        return;
      }
    }

    const status = ((body.status as string) ?? 'PENDING') as DeliveryChallanStatus;
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({ message: `Invalid status: ${status}` });
      return;
    }

    // C.1: per-document currency — use caller-supplied code or fall back to company default.
    const docCurrencyCode =
      (typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null) ??
      (await resolveDefaultCurrencyCode());

    const challan = await prisma.$transaction(async (tx) => {
      const challanNumber = await generateNextChallanNumber(tx, tenantId, userId);
      return tx.deliveryChallan.create({
        data: {
          challanNumber,
          invoiceId,
          customerId: billToId,
          challanDate: safeDate(body.challanDate) ?? new Date(),
          referenceNo: (body.referenceNo as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status,
          bankId,
          taxableAmount: toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, 0))),
          totalAmount: toDecimal(asNumber(body.grandTotal, asNumber(body.totalAmount, 0))),
          vat: toDecimal(asNumber(body.totalTax, asNumber(body.vat, 0))),
          totalDiscount: toDecimal(asNumber(body.totalDiscount, 0)),
          roundOff: Boolean(body.roundOff),
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          sign_type: signType as 'none' | 'digitalSignature' | 'eSignature',
          signatureName: signType === 'eSignature' ? ((body.signatureName as string) ?? null) : null,
          signatureImage,
          signatureId,
          receivedBy: (body.receivedBy as string) ?? '',
          userId,
          billFrom: billFromId,
          billTo: billToId,
          tenantId,
          // C.1: persist document currency
          ...(docCurrencyCode ? { currencyCode: docCurrencyCode } : {}),
        },
      });
    });

    res.status(201).json({ message: 'Delivery challan created successfully', data: challan });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Create delivery challan error:', err);
    res.status(500).json({
      message: 'Error creating delivery challan',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateDeliveryStatus
// =============================================================================

export async function updateDeliveryStatus(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const { status, receivedBy, receivedDate } = req.body as {
      status?: string;
      receivedBy?: string;
      receivedDate?: string;
    };

    const existing = await prisma.deliveryChallan.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ message: 'Delivery challan not found' });
      return;
    }

    const next = (status ?? '').toUpperCase() as DeliveryChallanStatus;
    if (!VALID_STATUSES.has(next)) {
      res.status(400).json({ message: `Invalid status: ${status}` });
      return;
    }

    const data: Prisma.DeliveryChallanUpdateInput = { status: next };
    if (next === 'DELIVERED') {
      data.receivedBy = receivedBy ?? '';
      data.receivedDate = safeDate(receivedDate) ?? new Date();
    } else if (next === 'CANCELLED') {
      data.receivedBy = '';
      data.receivedDate = null;
    }

    const updated = await prisma.deliveryChallan.update({ where: { id }, data });
    res.status(200).json({ message: 'Delivery status updated successfully', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Update delivery status error:', err);
    res.status(500).json({
      message: 'Error updating delivery status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateDeliveryChallan
// =============================================================================

export async function updateDeliveryChallan(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return;
  }

  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const existing = await prisma.deliveryChallan.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ message: 'Delivery challan not found' });
      return;
    }

    let signatureImage = existing.signatureImage;
    let signatureId = existing.signatureId;
    if (body.sign_type === 'eSignature' && req.file) {
      signatureImage = req.file.path;
      signatureId = null;
    } else if (body.sign_type === 'digitalSignature' && body.signatureId) {
      const sig = await prisma.signature.findFirst({
        where: { id: body.signatureId as string, ...tenantOrUserScope(req) },
      });
      if (!sig) {
        res.status(404).json({ message: 'Digital Signature not found' });
        return;
      }
      signatureId = sig.id;
      signatureImage = null;
    }

    const data: Prisma.DeliveryChallanUpdateInput = {};
    if (body.invoiceId !== undefined) {
      if (body.invoiceId) {
        const invoice = await prisma.invoice.findFirst({
          where: { id: body.invoiceId as string, ...tenantOrUserScope(req) },
          select: { id: true },
        });
        if (!invoice) {
          res.status(404).json({ message: 'Invoice not found' });
          return;
        }
        data.invoice = { connect: { id: invoice.id } };
      } else {
        data.invoice = { disconnect: true };
      }
    }
    if (body.billTo !== undefined) {
      const billToCustomer = await prisma.customer.findFirst({
        where: { id: body.billTo as string, isDeleted: false, ...tenantOrUserFilter(req) },
        select: { id: true },
      });
      if (!billToCustomer) {
        res.status(404).json({ message: 'Customer not found' });
        return;
      }
      data.customer = { connect: { id: billToCustomer.id } };
      data.billToCustomer = { connect: { id: billToCustomer.id } };
    }
    if (body.billFrom !== undefined) data.billFromUser = { connect: { id: body.billFrom as string } };
    if (body.challanDate !== undefined) data.challanDate = safeDate(body.challanDate) ?? existing.challanDate;
    if (body.referenceNo !== undefined) data.referenceNo = (body.referenceNo as string) ?? '';
    if (body.items !== undefined) {
      data.items = normaliseItems(body.items) as unknown as Prisma.InputJsonValue;
    }
    if (body.status !== undefined) {
      const next = body.status as DeliveryChallanStatus;
      if (VALID_STATUSES.has(next)) data.status = next;
    }
    if (body.bank !== undefined) {
      if (body.bank) {
        const bank = await prisma.bankDetail.findFirst({
          where: { id: body.bank as string, ...tenantOrUserScope(req) },
        });
        if (!bank) {
          res.status(404).json({ message: 'Bank account not found' });
          return;
        }
        data.bank = { connect: { id: bank.id } };
      } else {
        data.bank = { disconnect: true };
      }
    }
    if (body.subTotal !== undefined || body.taxableAmount !== undefined) {
      data.taxableAmount = toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, Number(existing.taxableAmount ?? 0))));
    }
    if (body.grandTotal !== undefined || body.totalAmount !== undefined) {
      data.totalAmount = toDecimal(asNumber(body.grandTotal, asNumber(body.totalAmount, Number(existing.totalAmount ?? 0))));
    }
    if (body.totalTax !== undefined || body.vat !== undefined) {
      data.vat = toDecimal(asNumber(body.totalTax, asNumber(body.vat, Number(existing.vat ?? 0))));
    }
    if (body.totalDiscount !== undefined) data.totalDiscount = toDecimal(asNumber(body.totalDiscount, Number(existing.totalDiscount ?? 0)));
    if (body.roundOff !== undefined) data.roundOff = Boolean(body.roundOff);
    if (body.notes !== undefined) data.notes = (body.notes as string) ?? '';
    if (body.termsAndCondition !== undefined) data.termsAndCondition = (body.termsAndCondition as string) ?? '';
    if (body.sign_type !== undefined) data.sign_type = body.sign_type as 'none' | 'digitalSignature' | 'eSignature';
    data.signatureName = body.sign_type === 'eSignature' ? ((body.signatureName as string) ?? null) : null;
    data.signatureImage = signatureImage;
    if (signatureId) data.signature = { connect: { id: signatureId } };
    else if (body.sign_type === 'eSignature') data.signature = { disconnect: true };
    if (body.receivedBy !== undefined) data.receivedBy = (body.receivedBy as string) ?? '';
    // C.1: update currencyCode if provided (freely editable on delivery challans)
    if (body.currencyCode !== undefined) {
      data.currencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null;
    }

    const updated = await prisma.deliveryChallan.update({ where: { id }, data });
    res.status(200).json({ message: 'Delivery challan updated successfully', data: updated });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Update delivery challan error:', err);
    res.status(500).json({
      message: 'Error updating delivery challan',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getDeliveryChallans
// =============================================================================

interface ListQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  customerId?: string;
  startDate?: string;
  endDate?: string;
}

export async function getDeliveryChallans(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { page = '1', limit = '10', status, search = '', customerId, startDate, endDate } = req.query as ListQuery;
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const andFilters: Prisma.DeliveryChallanWhereInput[] = [tenantOrUserFilter(req)];
    if (status && VALID_STATUSES.has(status as DeliveryChallanStatus)) {
      andFilters.push({ status: status as DeliveryChallanStatus });
    }
    if (customerId) andFilters.push({ customerId });
    if (startDate || endDate) {
      const challanDate: Prisma.DateTimeFilter = {};
      if (startDate) challanDate.gte = new Date(startDate);
      if (endDate) challanDate.lte = new Date(endDate);
      andFilters.push({ challanDate });
    }
    if (search) {
      andFilters.push({
        OR: [
          { challanNumber: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { referenceNo: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.DeliveryChallanWhereInput = { isDeleted: false, AND: andFilters };

    const baseUrl = buildBaseUrl(req);

    const [total, rows] = await Promise.all([
      prisma.deliveryChallan.count({ where }),
      prisma.deliveryChallan.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true, image: true, billingAddress: true } },
          billFromUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true, address: true } },
          billToCustomer: { select: { id: true, name: true, email: true, phone: true, billingAddress: true, shippingAddress: true, image: true } },
          invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, TotalAmount: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const formatted = rows.map((challan) => {
      const customer = challan.customer
        ? {
            id: challan.customer.id,
            name: challan.customer.name || '',
            email: challan.customer.email || null,
            phone: challan.customer.phone || null,
            billingAddress: challan.customer.billingAddress || null,
            image: challan.customer.image ? `${baseUrl}${challan.customer.image.replace(/\\/g, '/')}` : '',
          }
        : null;
      const billFrom = challan.billFromUser
        ? {
            id: challan.billFromUser.id,
            name: `${challan.billFromUser.firstName || ''} ${challan.billFromUser.lastName || ''}`.trim(),
            email: challan.billFromUser.email || null,
            phone: challan.billFromUser.phone || null,
            address: challan.billFromUser.address || null,
            image: challan.billFromUser.profileImage ? `${baseUrl}${challan.billFromUser.profileImage.replace(/\\/g, '/')}` : '',
          }
        : null;
      const billTo = challan.billToCustomer
        ? {
            id: challan.billToCustomer.id,
            name: challan.billToCustomer.name || '',
            email: challan.billToCustomer.email || null,
            phone: challan.billToCustomer.phone || null,
            billingAddress: challan.billToCustomer.billingAddress || null,
            shippingAddress: challan.billToCustomer.shippingAddress || null,
            image: challan.billToCustomer.image ? `${baseUrl}${challan.billToCustomer.image.replace(/\\/g, '/')}` : '',
          }
        : null;
      const invoice = challan.invoice
        ? {
            id: challan.invoice.id,
            invoiceNumber: challan.invoice.invoiceNumber,
            invoiceDate: formatDateShort(challan.invoice.invoiceDate),
            totalAmount: challan.invoice.TotalAmount,
            status: challan.invoice.status,
          }
        : null;
      const itemsCount = Array.isArray(challan.items) ? challan.items.length : 0;
      return {
        id: challan.id,
        challanNumber: challan.challanNumber,
        referenceNo: challan.referenceNo,
        challanDate: challan.challanDate,
        status: challan.status,
        notes: challan.notes,
        taxableAmount: challan.taxableAmount,
        totalDiscount: challan.totalDiscount,
        vat: challan.vat,
        totalAmount: challan.totalAmount,
        items: challan.items,
        itemsCount,
        customer,
        billFrom,
        billTo,
        invoice,
        currencyCode: challan.currencyCode ?? null, // C.1
        createdAt: challan.createdAt,
        updatedAt: challan.updatedAt,
      };
    });

    res.status(200).json({
      success: true,
      message: 'Delivery challans retrieved successfully',
      data: {
        deliveryChallans: formatted,
        pagination: {
          total,
          page: pageN,
          limit: limitN,
          totalPages: Math.ceil(total / limitN),
        },
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Get delivery challans error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching delivery challans',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getDeliveryChallanById
// =============================================================================

export async function getDeliveryChallanById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const baseUrl = buildBaseUrl(req);

    const challan = await prisma.deliveryChallan.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      include: {
        customer: { select: { id: true, name: true, email: true, phone: true, billingAddress: true, shippingAddress: true, image: true } },
        billFromUser: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true, address: true } },
        billToCustomer: { select: { id: true, name: true, email: true, phone: true, billingAddress: true, shippingAddress: true, image: true } },
        invoice: { select: { id: true, invoiceNumber: true, invoiceDate: true, TotalAmount: true, status: true } },
        bank: { select: { id: true, accountHoldername: true, bankName: true, branchName: true, accountNumber: true, IFSCCode: true } },
        signature: { select: { id: true, signatureName: true, signatureImage: true, createdAt: true } },
      },
    });

    if (!challan) {
      res.status(404).json({ success: false, message: 'Delivery challan not found' });
      return;
    }

    let signature: Record<string, unknown> | null = null;
    if (challan.sign_type === 'eSignature') {
      signature = {
        name: challan.signatureName || null,
        image: challan.signatureImage ? `${baseUrl}${challan.signatureImage.replace(/\\/g, '/')}` : null,
      };
    } else if (challan.sign_type === 'digitalSignature' && challan.signature) {
      signature = {
        id: challan.signature.id,
        name: challan.signature.signatureName || null,
        image: challan.signature.signatureImage ? `${baseUrl}${challan.signature.signatureImage.replace(/\\/g, '/')}` : null,
        createdAt: formatDateShort(challan.signature.createdAt),
      };
    }

    res.status(200).json({
      success: true,
      message: 'Delivery challan retrieved successfully',
      data: {
        id: challan.id,
        challanNumber: challan.challanNumber,
        referenceNo: challan.referenceNo,
        challanDate: formatDateShort(challan.challanDate),
        status: challan.status,
        notes: challan.notes || '',
        termsAndCondition: challan.termsAndCondition || '',
        items: challan.items || [],
        itemsCount: Array.isArray(challan.items) ? challan.items.length : 0,
        customer: challan.customer,
        billFrom: challan.billFromUser,
        billTo: challan.billToCustomer,
        invoice: challan.invoice,
        bank: challan.bank,
        sign_type: challan.sign_type,
        signature,
        taxableAmount: challan.taxableAmount,
        totalAmount: challan.totalAmount,
        totalDiscount: challan.totalDiscount,
        vat: challan.vat || '',
        currencyCode: challan.currencyCode ?? null, // C.1
        createdAt: challan.createdAt,
        updatedAt: challan.updatedAt,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Get delivery challan error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching delivery challan details',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// deleteDeliveryChallan (soft)
// =============================================================================

export async function deleteDeliveryChallan(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.deliveryChallan.findFirst({
      where: { id, ...tenantOrUserScope(req) },
    });
    if (!existing) {
      res.status(404).json({ message: 'Delivery challan not found' });
      return;
    }
    await prisma.deliveryChallan.update({ where: { id }, data: { isDeleted: true } });
    res.status(200).json({ message: 'Delivery challan deleted successfully' });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Delete delivery challan error:', err);
    res.status(500).json({
      message: 'Error deleting delivery challan',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  createDeliveryChallan,
  updateDeliveryStatus,
  updateDeliveryChallan,
  getDeliveryChallans,
  getDeliveryChallanById,
  deleteDeliveryChallan,
};
module.exports.createDeliveryChallan = createDeliveryChallan;
module.exports.updateDeliveryStatus = updateDeliveryStatus;
module.exports.updateDeliveryChallan = updateDeliveryChallan;
module.exports.getDeliveryChallans = getDeliveryChallans;
module.exports.getDeliveryChallanById = getDeliveryChallanById;
module.exports.deleteDeliveryChallan = deleteDeliveryChallan;
