import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireTenantId, requireUserId, tenantOrUserScope, UnauthorizedError } from '../lib/tenantScope';
import { findProductInventory, resolveWarehouseId } from '../lib/warehouseStock';
import { buildPosInvoiceLine } from '../lib/posInvoiceLine';
import { posInvoiceReference } from '../lib/posClientSale';
import { billedQtyToPrimary, dualUomApiFromProduct, parseBillingUnit } from '../lib/dualUom';
import { createInvoice } from './Admin/Invoice/invoiceController';

const WALK_IN_SOURCE = 'POS';
const WALK_IN_REF = 'WALK_IN';

type PosLineInput = { productId?: string; qty?: number; rate?: number; unitKind?: string };

async function ensureWalkInCustomer(opts: {
  userId: string;
  tenantId: string;
}): Promise<{ id: string; name: string }> {
  const existing = await prisma.customer.findFirst({
    where: {
      tenantId: opts.tenantId,
      isDeleted: false,
      externalSource: WALK_IN_SOURCE,
      externalRef: WALK_IN_REF,
    },
    select: { id: true, name: true },
  });
  if (existing) return existing;

  const email = `pos-walkin@${opts.tenantId.slice(0, 8)}.local`;
  const created = await prisma.customer.create({
    data: {
      name: 'Walk-in Customer',
      email,
      userId: opts.userId,
      tenantId: opts.tenantId,
      externalSource: WALK_IN_SOURCE,
      externalRef: WALK_IN_REF,
      notes: 'Auto-created for POS counter billing',
      status: 'Active',
    },
    select: { id: true, name: true },
  });
  return created;
}

export async function bootstrap(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);

    const [walkIn, paymentModes, bank, warehouseId, company] = await Promise.all([
      ensureWalkInCustomer({ userId, tenantId }),
      prisma.paymentMode.findMany({
        where: {
          OR: [{ status: true }, { status: null }],
          AND: [
            {
              OR: [
                { isSystem: true },
                { tenantId: null, userId: null },
                { userId },
                { tenantId },
              ],
            },
          ],
        },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
      }),
      prisma.bankDetail.findFirst({
        where: { isDeleted: false, ...tenantOrUserScope(req) },
        orderBy: { createdAt: 'asc' },
        select: { id: true, bankName: true, accountNumber: true },
      }),
      resolveWarehouseId(prisma as never, { userId, tenantId }),
      prisma.companySettings.findFirst({
        where: { OR: [{ tenantId }, { userId }] },
        select: {
          companyName: true,
          gstin: true,
          address: true,
          phone: true,
          merchantUpiId: true,
          merchantName: true,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        walkInCustomer: walkIn,
        paymentModes,
        bank,
        warehouseId,
        company,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error('POS bootstrap error:', err);
    res.status(500).json({ success: false, message: 'Failed to load POS' });
  }
}

export async function catalog(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 1500), 1), 3000);

    const products = await prisma.product.findMany({
      where: { tenantId, status: true },
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        unit: { select: { id: true, unit_name: true, short_name: true } },
        secondaryUnit: { select: { id: true, unit_name: true, short_name: true } },
        taxGroup: {
          include: {
            tax_rates: {
              where: { isDeleted: false, isActive: true },
              select: { id: true, name: true, rate: true, isActive: true, taxKind: true },
            },
          },
        },
      },
    });

    const warehouseId = await resolveWarehouseId(prisma as never, { userId, tenantId });

    res.json({
      success: true,
      data: {
        warehouseId,
        syncedAt: new Date().toISOString(),
        products: products.map((product) => ({
          id: product.id,
          name: product.name,
          code: product.code,
          barcode: product.barcode,
          sellingPrice: Number(product.selling_price),
          unit: product.unit
            ? { id: product.unit.id, name: product.unit.short_name || product.unit.unit_name }
            : null,
          dualUom: dualUomApiFromProduct(product),
          hsnSac: product.hsnSac ?? null,
          gstSupplyType: product.gstSupplyType ?? 'TAXABLE',
          taxGroupId: product.taxGroup?.id ?? null,
          taxRates: (product.taxGroup?.tax_rates ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            rate: Number(t.rate),
            isActive: t.isActive,
            taxKind: t.taxKind,
          })),
          enableInventory: product.enable_inventory,
          itemType: product.item_type,
          stockQty: Number(product.stock ?? 0),
        })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error('POS catalog error:', err);
    res.status(500).json({ success: false, message: 'Failed to load POS catalog' });
  }
}

export async function createSale(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const body = req.body as {
      lines?: PosLineInput[];
      paymentModeId?: string;
      customerId?: string;
      warehouseId?: string;
      bankId?: string;
      clientSaleId?: string;
    };

    const clientSaleId = String(body.clientSaleId ?? '')
      .trim()
      .slice(0, 64);
    const posReference = posInvoiceReference(clientSaleId);

    if (clientSaleId) {
      const existing = await prisma.invoice.findFirst({
        where: { tenantId, referenceNo: posReference, isDeleted: false },
        select: { id: true, invoiceNumber: true, TotalAmount: true },
      });
      if (existing) {
        res.json({
          success: true,
          message: 'POS sale already recorded',
          data: {
            invoiceId: existing.id,
            invoiceNumber: existing.invoiceNumber,
            total: existing.TotalAmount,
            paymentMode: null,
            replayed: true,
          },
        });
        return;
      }
    }

    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    if (rawLines.length === 0) {
      res.status(400).json({ success: false, message: 'Add at least one item' });
      return;
    }
    if (!body.paymentModeId) {
      res.status(400).json({ success: false, message: 'Payment mode is required' });
      return;
    }

    const paymentMode = await prisma.paymentMode.findFirst({
      where: {
        id: body.paymentModeId,
        OR: [{ isSystem: true }, { tenantId }, { userId }, { tenantId: null, userId: null }],
      },
      select: { id: true, slug: true, name: true },
    });
    if (!paymentMode) {
      res.status(400).json({ success: false, message: 'Invalid payment mode' });
      return;
    }

    const walkIn = await ensureWalkInCustomer({ userId, tenantId });
    const customerId = body.customerId || walkIn.id;
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, isDeleted: false, tenantId },
      select: { id: true },
    });
    if (!customer) {
      res.status(400).json({ success: false, message: 'Invalid customer' });
      return;
    }

    const warehouseId = await resolveWarehouseId(prisma as never, {
      userId,
      tenantId,
      warehouseId: body.warehouseId ?? null,
    });

    const bank =
      (body.bankId
        ? await prisma.bankDetail.findFirst({
            where: { id: body.bankId, isDeleted: false, ...tenantOrUserScope(req) },
            select: { id: true },
          })
        : null) ??
      (await prisma.bankDetail.findFirst({
        where: { isDeleted: false, ...tenantOrUserScope(req) },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }));
    if (!bank) {
      res.status(422).json({
        success: false,
        message: 'Add a bank account under Settings → Bank Accounts before taking POS payments.',
      });
      return;
    }

    const items = [];
    for (const line of rawLines) {
      const productId = String(line.productId ?? '');
      const qty = Number(line.qty ?? 0);
      if (!productId || qty <= 0) {
        res.status(400).json({ success: false, message: 'Each line needs productId and qty > 0' });
        return;
      }

      const product = await prisma.product.findFirst({
        where: { id: productId, tenantId },
        include: {
          unit: { select: { short_name: true, unit_name: true } },
          secondaryUnit: { select: { short_name: true, unit_name: true } },
          taxGroup: {
            include: {
              tax_rates: {
                where: { isDeleted: false, isActive: true },
                select: { id: true, name: true, rate: true, isActive: true, taxKind: true },
              },
            },
          },
        },
      });
      if (!product) {
        res.status(400).json({ success: false, message: `Product not found: ${productId}` });
        return;
      }

      const dual = dualUomApiFromProduct(product);
      const unitKind = parseBillingUnit(line.unitKind ?? dual.billingUnit);
      const stockNeed = billedQtyToPrimary(qty, unitKind, dual.conversion);

      if (product.item_type !== 'Service' && product.enable_inventory) {
        const inventory = await findProductInventory(prisma as never, {
          productId: product.id,
          userId,
          warehouseId,
        });
        const onHand = inventory
          ? Number(inventory.quantityOnHand ?? inventory.quantity ?? 0)
          : Number(product.stock ?? 0);
        if (onHand < stockNeed) {
          res.status(409).json({
            success: false,
            message: `Insufficient stock for ${product.name} (have ${onHand}, need ${stockNeed})`,
          });
          return;
        }
      }

      const rate = line.rate != null ? Number(line.rate) : Number(product.selling_price);
      const unitName =
        unitKind === 'SECONDARY' && dual.secondary
          ? dual.secondary.name
          : dual.primary?.name || product.unit?.short_name || product.unit?.unit_name;
      items.push(
        buildPosInvoiceLine({
          productId: product.id,
          name: product.name,
          qty,
          rate,
          unit: unitName,
          unitKind,
          secondaryToPrimaryQty: dual.conversion,
          hsnSac: product.hsnSac,
          gstSupplyType: product.gstSupplyType,
          taxGroupId: product.taxGroup?.id,
          taxRates: (product.taxGroup?.tax_rates ?? []).map((t) => ({
            id: t.id,
            name: t.name,
            rate: Number(t.rate),
            isActive: t.isActive,
            taxKind: t.taxKind,
          })),
        }),
      );
    }

    const taxable = items.reduce((s, i) => s + i.rate * i.qty, 0);
    const vat = items.reduce((s, i) => s + i.totalTax, 0);
    const total = Math.round((taxable + vat) * 100) / 100;

    req.body = {
      invoiceDate: new Date().toISOString(),
      invoiceType: 'INVOICE',
      status: 'PAID',
      items,
      billFrom: userId,
      billTo: customer.id,
      payment_method: paymentMode.id,
      payment_date: new Date().toISOString(),
      payment_notes: `POS ${paymentMode.name}`,
      bank: bank.id,
      warehouseId,
      notes: clientSaleId ? `POS counter sale ${clientSaleId}` : 'POS counter sale',
      subTotal: taxable,
      taxableAmount: taxable,
      totalTax: vat,
      vat,
      grandTotal: total,
      TotalAmount: total,
      totalDiscount: 0,
      referenceNo: posReference,
    };

    const origJson = res.json.bind(res);
    res.json = ((payload: unknown) => {
      const p = payload as { message?: string; data?: { id?: string; invoiceNumber?: string; TotalAmount?: unknown } };
      if (p?.data?.id) {
        return origJson({
          success: true,
          message: 'POS sale recorded',
          data: {
            invoiceId: p.data.id,
            invoiceNumber: p.data.invoiceNumber,
            total: p.data.TotalAmount,
            paymentMode: paymentMode.slug,
            replayed: false,
          },
        });
      }
      return origJson(payload);
    }) as Response['json'];

    await createInvoice(req, res);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('POS sale prisma error:', err);
    }
    console.error('POS sale error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to record POS sale' });
    }
  }
}

const handlers = { bootstrap, catalog, createSale };
module.exports = handlers;
module.exports.bootstrap = bootstrap;
module.exports.catalog = catalog;
module.exports.createSale = createSale;
