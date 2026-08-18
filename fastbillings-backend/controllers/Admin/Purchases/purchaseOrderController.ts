import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderPaymentMode,
  PurchaseOrderSignType,
  PurchaseOrderConvertType,
} from '@prisma/client';

import { prisma } from '../../../lib/prisma';
import { overlayPartySelling, fetchPartyRateMap } from '../../../lib/partyRate';
import { dualUomApiFromProduct } from '../../../lib/dualUom';
import {
  optionalTenantId,
  requireTenantId,
  requireUserId,
  customFieldScope,
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

// utils/mailer is still JS; static require is fine here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mailerModule: {
  sendMail: (opts: Record<string, unknown>) => Promise<void>;
  hasEnvSmtpCredentials: () => boolean;
  envSmtpFrom: () => string;
} = require('../../../utils/mailer');

type Tx = Prisma.TransactionClient;

const VALID_STATUSES = new Set<PurchaseOrderStatus>(['new', 'pending', 'completed', 'cancelled']);
const VALID_SIGN_TYPES = new Set<PurchaseOrderSignType>(['none', 'digitalSignature', 'eSignature']);
const VALID_CONVERT_TYPES = new Set<PurchaseOrderConvertType>(['purchase', 'estimate', 'invoice']);
const VALID_PAYMENT_MODES = new Set<PurchaseOrderPaymentMode>([
  'CASH',
  'CREDIT',
  'CHECK',
  'BANK_TRANSFER',
  'OTHER',
]);

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
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  tax_group_id?: string;
  discount_type?: string;
  discount_value?: number;
  amount?: number;
}

function normaliseItems(raw: unknown): IncomingItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as IncomingItem[]).map((item) => ({
    id: item.id,
    name: item.name ?? '',
    unit: item.unit,
    qty: asNumber(item.qty, 0),
    rate: asNumber(item.rate, 0),
    discount: asNumber(item.discount, 0),
    tax: asNumber(item.tax, 0),
    tax_group_id: item.tax_group_id,
    discount_type: item.discount_type,
    discount_value: asNumber(item.discount_value, 0),
    amount: asNumber(item.amount, asNumber(item.rate, 0) * asNumber(item.qty, 0)),
  }));
}

function calcTotals(items: IncomingItem[]): {
  taxable: number;
  discount: number;
  vat: number;
  total: number;
} {
  const taxable = items.reduce(
    (sum, i) => sum + asNumber(i.amount, asNumber(i.rate, 0) * asNumber(i.qty, 0)),
    0,
  );
  const discount = items.reduce((sum, i) => sum + asNumber(i.discount, 0), 0);
  const vat = items.reduce((sum, i) => sum + asNumber(i.tax, 0), 0);
  return { taxable, discount, vat, total: taxable };
}

async function generateNextPurchaseOrderId(tx: Tx, prefix = 'PO-'): Promise<string> {
  const last = await tx.purchaseOrder.findFirst({
    where: { purchaseOrderId: { not: null } },
    orderBy: { purchaseOrderId: 'desc' },
    select: { purchaseOrderId: true },
  });
  let lastNumber = 0;
  if (last?.purchaseOrderId) {
    const match = last.purchaseOrderId.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }
  return `${prefix}${String(lastNumber + 1).padStart(6, '0')}`;
}

async function insertCustomFieldValues(
  tx: Tx,
  recordId: string,
  userId: string,
  customFieldsRaw: unknown,
  files: Express.Multer.File[],
): Promise<void> {
  let customFields = customFieldsRaw;
  if (typeof customFields === 'string') {
    try {
      customFields = JSON.parse(customFields);
    } catch {
      return;
    }
  }
  if (!Array.isArray(customFields) || customFields.length === 0) return;

  const records: Prisma.CustomFieldValueCreateManyInput[] = customFields.map((field) => {
    const f = field as { fieldId: string; value?: string };
    let value: Prisma.InputJsonValue = f.value ?? '';
    const fileMatch = files.find((file) => file.fieldname === `customField_${f.fieldId}`);
    if (fileMatch) value = fileMatch.path;
    return {
      customFieldId: f.fieldId,
      module: 'purchaseOrder',
      recordId,
      value,
      createdBy: userId,
    };
  });

  await tx.customFieldValue.createMany({ data: records });
}

// =============================================================================
// createPurchaseOrder
// =============================================================================

export async function createPurchaseOrder(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as Record<string, unknown>;
    const items = normaliseItems(body.items);

    const billFromId = body.billFrom as string;
    const billToId = body.billTo as string;
    // Never trust body.userId — ownership is always the authenticated caller.
    const bodyUserId = userId;

    const [user, billFromUser, billToUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: bodyUserId } }),
      billFromId ? prisma.user.findUnique({ where: { id: billFromId } }) : Promise.resolve(null),
      billToId ? prisma.user.findUnique({ where: { id: billToId } }) : Promise.resolve(null),
    ]);

    if (!user) throw new Error('Invalid user ID');
    if (!billFromUser || !billToUser) throw new Error('Invalid bill from or bill to user ID');
    // billTo is a supplier-type user (user_type=2); reject arbitrary non-vendor accounts.
    if (Number(billToUser.user_type) !== 2) {
      throw new Error('Bill to must be a supplier user');
    }

    // Never trust body.vendorId — vendor always tracks billTo (purchase parity).
    const vendorId = billToId;

    const signType = ((body.sign_type as string) ?? 'none') as PurchaseOrderSignType;
    if (!VALID_SIGN_TYPES.has(signType)) {
      throw new Error('Invalid signature type');
    }
    if (signType === 'eSignature') {
      if (!req.file) throw new Error('Signature image is required for eSignature');
      if (!body.signatureName) throw new Error('Signature name is required for eSignature');
    }

    let signatureId: string | null = null;
    if (signType === 'digitalSignature' && body.signatureId) {
      const sig = await prisma.signature.findFirst({
        where: { id: body.signatureId as string, ...tenantOrUserScope(req) },
      });
      if (!sig) throw new Error('Digital Signature not found');
      signatureId = sig.id;
    }
    const bankId = (body.bank as string) || null;
    if (bankId) {
      const bank = await prisma.bankDetail.findFirst({
        where: { id: bankId, ...tenantOrUserScope(req) },
      });
      if (!bank) throw new Error('Bank account not found');
    }

    const totals = calcTotals(items);

    const status = ((body.status as string) ?? 'new') as PurchaseOrderStatus;
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const paymentModeRaw = body.paymentMode as string | undefined;
    let paymentMode: PurchaseOrderPaymentMode | null = null;
    if (paymentModeRaw) {
      if (!VALID_PAYMENT_MODES.has(paymentModeRaw as PurchaseOrderPaymentMode)) {
        throw new Error(`Invalid payment mode: ${paymentModeRaw}`);
      }
      paymentMode = paymentModeRaw as PurchaseOrderPaymentMode;
    }

    const convertType = ((body.convert_type as string) ?? 'purchase') as PurchaseOrderConvertType;
    if (!VALID_CONVERT_TYPES.has(convertType)) {
      throw new Error(`Invalid convert type: ${convertType}`);
    }

    // C.1: per-document currency — use caller-supplied code or fall back to company default.
    const docCurrencyCode =
      (typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null) ??
      (await resolveDefaultCurrencyCode());

    const orderDate = safeDate(body.orderDate) ?? new Date();
    const dueDate = safeDate(body.dueDate) ?? orderDate;

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const purchaseOrder = await prisma.$transaction(async (tx) => {
      const purchaseOrderId = await generateNextPurchaseOrderId(tx);
      const created = await tx.purchaseOrder.create({
        data: {
          purchaseOrderId,
          vendorId,
          purchaseOrderDate: orderDate,
          dueDate,
          referenceNo: (body.referenceNo as string) ?? '',
          items: items as unknown as Prisma.InputJsonValue,
          status,
          paymentMode,
          taxableAmount: toDecimal(asNumber(body.subTotal, asNumber(body.taxableAmount, totals.taxable))),
          totalDiscount: toDecimal(asNumber(body.totalDiscount, totals.discount)),
          vat: toDecimal(asNumber(body.totalTax, asNumber(body.vat, totals.vat))),
          roundOff: Boolean(body.roundOff),
          TotalAmount: toDecimal(asNumber(body.grandTotal, asNumber(body.TotalAmount, totals.total))),
          bankId,
          notes: (body.notes as string) ?? '',
          termsAndCondition: (body.termsAndCondition as string) ?? '',
          sign_type: signType,
          signatureId,
          signatureImage: signType === 'eSignature' && req.file ? req.file.path : null,
          signatureName: signType === 'eSignature' ? ((body.signatureName as string) ?? null) : null,
          userId: bodyUserId,
          tenantId: optionalTenantId(req),
          billFrom: billFromId,
          billTo: billToId,
          convert_type: convertType,
          // C.1: persist document currency
          ...(docCurrencyCode ? { currencyCode: docCurrencyCode } : {}),
        },
      });

      await insertCustomFieldValues(tx, created.id, bodyUserId, body.customFields, files);

      return created;
    });

    res.status(200).json({
      message: 'Purchase order created successfully',
      data: purchaseOrder,
    });

    if (billToUser?.email && mailerModule.hasEnvSmtpCredentials()) {
      mailerModule
        .sendMail({
          from: `"Your Company" <${mailerModule.envSmtpFrom()}>`,
          to: billToUser.email,
          subject: 'New Purchase Order Created',
          html: `
                    <h3>Hello ${billToUser.firstName ?? ''} ${billToUser.lastName ?? ''},</h3>
                    <p>A new purchase order has been created for you.</p>
                    <p><strong>Reference No:</strong> ${purchaseOrder.referenceNo}</p>
                    <p><strong>Total Amount:</strong> ${purchaseOrder.TotalAmount}</p>
                    <p>Due Date: ${new Date(purchaseOrder.dueDate).toLocaleDateString()}</p>
                    <br>
                    <p>Best Regards,<br>Your Company</p>
                `,
          tenantId: purchaseOrder.tenantId ?? optionalTenantId(req),
          userId: purchaseOrder.userId,
        })
        .catch((err: unknown) => {
          console.error(
            'Failed to send purchase order email:',
            err instanceof Error ? err.message : err,
          );
        });
    }
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Create purchase order error:', err);
    res.status(500).json({
      message: 'Error creating purchase order',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// listUsersByType
// =============================================================================

export async function listUsersByType(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const tenantId = requireTenantId(req);
    const { type } = req.params as { type: string };
    const { search } = req.query as { search?: string };

    if (![1, 2].includes(Number(type))) {
      res.status(400).json({
        success: false,
        message: 'Invalid user type. Must be 1 (regular) or 2 (supplier)',
      });
      return;
    }

    // Never dump the global User table — only workspace members.
    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId },
      select: { userId: true },
    });
    const memberIds = memberships.map((m) => m.userId);

    const where: Prisma.UserWhereInput = {
      user_type: Number(type),
      id: { in: memberIds },
    };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const baseUrl = buildBaseUrl(req);

    res.status(200).json({
      success: true,
      count: users.length,
      data: users.map((user) => ({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        user_type: user.user_type,
        profileImage: user.profileImage
          ? `${baseUrl}${user.profileImage.replace(/\\/g, '/')}`
          : null,
        address: user.address,
        balance: Number(user.balance),
        balance_type: user.balance_type,
        createdAt: user.createdAt,
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error('Error listing users:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users',
      error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : String(err)) : undefined,
    });
  }
}

// =============================================================================
// getUserById
// =============================================================================

export async function getUserById(req: Request, res: Response): Promise<void> {
  try {
    const callerId = requireUserId(req);
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    // Self is always readable; otherwise must be a member of this workspace.
    if (id !== callerId) {
      const membership = await prisma.tenantMembership.findFirst({
        where: { tenantId, userId: id },
        select: { userId: true },
      });
      if (!membership) {
        res.status(404).json({
          success: false,
          message: 'User not found',
        });
        return;
      }
    }

    const user = await prisma.user.findUnique({ where: { id } });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    const baseUrl = buildBaseUrl(req);

    const responseData = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      user_type: user.user_type,
      profileImage: user.profileImage
        ? `${baseUrl}${user.profileImage.replace(/\\/g, '/')}`
        : null,
      address: user.address,
      country: user.countryId,
      state: user.stateId,
      city: user.cityId,
      postalCode: user.postalCode,
      gender: user.gender,
      dateOfBirth: user.dateOfBirth,
      balance: Number(user.balance),
      balance_type: user.balance_type,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      data: responseData,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error('Error fetching user:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user details',
      error: process.env.NODE_ENV === 'development' ? (err instanceof Error ? err.message : String(err)) : undefined,
    });
  }
}

// =============================================================================
// getRecentProductsWithSearch
// =============================================================================

export async function getRecentProductsWithSearch(req: Request, res: Response): Promise<void> {
  try {
    const { search = '', limit = '10', currencyCode: queryCur, customerId } = req.query as {
      search?: string;
      limit?: string;
      currencyCode?: string;
      customerId?: string;
    };
    const numLimit = parseInt(limit, 10);
    const trimmed = search.trim();

    // PC.1: build search sub-clause.
    const searchClause: Prisma.ProductWhereInput = trimmed
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    // PC.1: build currency sub-clause (only when caller passes currencyCode).
    let currencyClause: Prisma.ProductWhereInput = {};
    if (queryCur) {
      const companyDefault = await resolveDefaultCurrencyCode();
      currencyClause = {
        OR: [
          { currencyCode: queryCur },
          // Treat null-currency legacy products as the company default.
          ...(queryCur === companyDefault ? [{ currencyCode: null }] : []),
        ],
      };
    }

    // Merge search + currency with AND semantics.
    const where: Prisma.ProductWhereInput =
      queryCur
        ? { AND: [searchClause, currencyClause] }
        : searchClause;

    const products = await prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, category_name: true } },
        brand: { select: { id: true, brand_name: true } },
        unit: { select: { id: true, unit_name: true, short_name: true } },
        secondaryUnit: { select: { id: true, unit_name: true, short_name: true } },
        taxGroup: {
          include: {
            tax_rates: { select: { id: true, name: true, rate: true, isActive: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: trimmed ? undefined : numLimit,
    });

    const formattedProducts = products.map((product) => {
      let totalTaxRate = 0;
      let taxDetails: Record<string, unknown> | null = null;

      if (product.taxGroup) {
        totalTaxRate = product.taxGroup.tax_rates.reduce(
          (total, rate) => total + Number(rate.rate ?? 0),
          0,
        );

        taxDetails = {
          group_id: product.taxGroup.id,
          group_name: product.taxGroup.tax_name,
          total_rate: totalTaxRate,
          components: product.taxGroup.tax_rates.map((rate) => ({
            rate_id: rate.id,
            name: rate.name,
            rate: rate.rate,
            status: rate.isActive,
          })),
        };
      }

      return {
        id: product.id,
        item_type: product.item_type,
        name: product.name,
        code: product.code,
        category: {
          id: product.category?.id,
          name: product.category?.category_name,
        },
        brand: {
          id: product.brand?.id,
          name: product.brand?.brand_name,
        },
        unit: {
          id: product.unit?.id,
          name: product.unit?.short_name,
        },
        dualUom: dualUomApiFromProduct(product),
        prices: {
          // Number(): these are Prisma Decimal (serialize as strings) since the
          // Float→Decimal migration; the FE expects numbers (e.g. .toFixed()).
          selling: Number(product.selling_price),
          purchase: Number(product.purchase_price),
          selling_with_tax: Number(product.selling_price) * (1 + totalTaxRate / 100),
          purchase_with_tax: Number(product.purchase_price) * (1 + totalTaxRate / 100),
          partyRateApplied: false,
          listPrice: Number(product.selling_price),
        },
        discount: {
          type: product.discount_type,
          value: Number(product.discount_value),
        },
        tax: taxDetails,
        barcode: product.barcode,
        stock: {
          quantity: product.stock,
          alert_quantity: product.alert_quantity,
        },
        description: product.description,
        images: {
          main: product.product_image,
          gallery: product.gallery_images ?? [],
        },
        status: product.status,
        currencyCode: product.currencyCode ?? null, // PC.1
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      };
    });

    const tenantId = req.auth?.tenantId;
    if (customerId && tenantId) {
      const rateMap = await fetchPartyRateMap({
        tenantId,
        customerId,
        productIds: formattedProducts.map((p) => p.id),
      });
      for (const product of formattedProducts) {
        const overlay = overlayPartySelling(product.prices.selling, rateMap.get(product.id));
        const taxRate = Number((product.tax as { total_rate?: number } | null)?.total_rate ?? 0);
        product.prices.selling = overlay.selling;
        product.prices.selling_with_tax = overlay.selling * (1 + taxRate / 100);
        product.prices.partyRateApplied = overlay.partyRateApplied;
        product.prices.listPrice = overlay.listPrice;
      }
    }

    res.status(200).json({
      success: true,
      message: trimmed ? 'Product search results' : `Last ${numLimit} products retrieved`,
      data: formattedProducts,
      count: formattedProducts.length,
      pagination: {
        limit: numLimit,
        returned: formattedProducts.length,
      },
    });
  } catch (error) {
    console.error('Product fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching products',
      error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : null,
    });
  }
}

// =============================================================================
// listBankDetails
// =============================================================================

export async function listBankDetails(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { status, search = '' } = req.query as {
      status?: string;
      search?: string;
    };

    const where: Prisma.BankDetailWhereInput = {
      isDeleted: false,
      AND: [tenantOrUserFilter(req)],
    };

    if (status !== undefined) {
      where.status = status === 'true';
    }

    if (search) {
      where.AND = [
        tenantOrUserFilter(req),
        {
          OR: [
            { accountHoldername: { contains: search, mode: 'insensitive' } },
            { bankName: { contains: search, mode: 'insensitive' } },
            { branchName: { contains: search, mode: 'insensitive' } },
            { accountNumber: { contains: search, mode: 'insensitive' } },
            { IFSCCode: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const bankDetails = await prisma.bankDetail.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: search ? undefined : 10,
    });

    const transformedDetails = bankDetails.map((detail) => ({
      id: detail.id,
      accountHoldername: detail.accountHoldername,
      bankName: detail.bankName,
      branchName: detail.branchName,
      accountNumber: detail.accountNumber,
      IFSCCode: detail.IFSCCode,
      accountType: detail.accountType,
      openingBalance: detail.openingBalance ? parseFloat(detail.openingBalance.toString()) : 0,
      currentBalance: detail.currentBalance ? parseFloat(detail.currentBalance.toString()) : 0,
      asOnDate: detail.asOnDate,
      status: detail.status,
      userId: detail.userId,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: search ? 'Search results for bank details' : 'Last 10 bank details retrieved',
      data: transformedDetails,
      count: transformedDetails.length,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List bank details error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching bank details',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getUserSignatures
// =============================================================================

export async function getUserSignatures(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { search = '', status } = req.query as { search?: string; status?: string };

    const where: Prisma.SignatureWhereInput = {
      isDeleted: false,
      AND: [tenantOrUserFilter(req)],
    };

    if (search) {
      where.signatureName = { contains: search, mode: 'insensitive' };
    }

    if (status !== undefined) {
      where.status = status === 'true';
    }

    const signatures = await prisma.signature.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: search ? undefined : 10,
    });

    const baseUrl = buildBaseUrl(req);

    const formattedSignatures = signatures.map((sig) => ({
      id: sig.id,
      signatureName: sig.signatureName,
      signatureImage: sig.signatureImage
        ? `${baseUrl}${sig.signatureImage.replace(/\\/g, '/')}`
        : null,
      status: sig.status,
      markAsDefault: sig.markAsDefault,
      createdAt: sig.createdAt,
      updatedAt: sig.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: search ? 'Search results for signatures' : 'Last 10 signatures retrieved',
      data: formattedSignatures,
      count: formattedSignatures.length,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching signatures:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching signatures',
      error:
        process.env.NODE_ENV === 'development'
          ? err instanceof Error ? err.message : String(err)
          : 'Internal server error',
    });
  }
}

// =============================================================================
// listPurchaseOrders
// =============================================================================

interface ListPurchaseOrdersQuery {
  page?: string;
  limit?: string;
  status?: string;
  search?: string;
  vendorId?: string;
  startDate?: string;
  endDate?: string;
}

export async function listPurchaseOrders(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      status,
      search = '',
      vendorId,
      startDate,
      endDate,
    } = req.query as ListPurchaseOrdersQuery;

    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const where: Prisma.PurchaseOrderWhereInput = {
      isDeleted: false,
      AND: [tenantOrUserFilter(req)],
    };

    if (status) {
      const normalised = status.toLowerCase() as PurchaseOrderStatus;
      if (VALID_STATUSES.has(normalised)) {
        where.status = normalised;
      }
    }

    if (vendorId) where.vendorId = vendorId;

    if (startDate || endDate) {
      where.purchaseOrderDate = {};
      if (startDate) (where.purchaseOrderDate as Prisma.DateTimeFilter).gte = new Date(startDate);
      if (endDate) (where.purchaseOrderDate as Prisma.DateTimeFilter).lte = new Date(endDate);
    }

    if (search) {
      (where.AND as Prisma.PurchaseOrderWhereInput[]).push({
        OR: [
          { purchaseOrderId: { contains: search, mode: 'insensitive' } },
          { referenceNo: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    const [total, purchaseOrders] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        include: {
          vendor: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          signature: { select: { id: true, signatureName: true } },
          billToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              profileImage: true,
              phone: true,
            },
          },
          bank: {
            select: {
              id: true,
              bankName: true,
              accountNumber: true,
              accountHoldername: true,
              IFSCCode: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    // Module + custom fields (showInTable)
    const purchaseOrderModule = await prisma.module.findFirst({
      where: { moduleSlug: 'purchase-orders' },
    });

    let tableFields: { id: string; fieldSlug: string; labelName: string }[] = [];
    if (purchaseOrderModule) {
      tableFields = await prisma.customField.findMany({
        where: {
          moduleId: purchaseOrderModule.id,
          showInTable: true,
          ...customFieldScope(req),
        },
        select: { id: true, fieldSlug: true, labelName: true },
      });
    }

    const purchaseOrderIds = purchaseOrders.map((po) => po.id);
    const customValues = await prisma.customFieldValue.findMany({
      where: { module: 'purchaseOrder', recordId: { in: purchaseOrderIds } },
    });

    const customValueMap: Record<string, Record<string, Prisma.JsonValue | null>> = {};
    customValues.forEach((val) => {
      if (!customValueMap[val.recordId]) customValueMap[val.recordId] = {};
      customValueMap[val.recordId][val.customFieldId] = val.value;
    });

    // Next purchase order id
    const lastPurchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { purchaseOrderId: { not: null } },
      orderBy: { purchaseOrderId: 'desc' },
      select: { purchaseOrderId: true },
    });

    let nextPurchaseOrderId = 'PO-000001';
    if (lastPurchaseOrder?.purchaseOrderId) {
      const m = lastPurchaseOrder.purchaseOrderId.match(/(\D*)(\d+)$/);
      if (m) {
        nextPurchaseOrderId = `${m[1]}${String(parseInt(m[2], 10) + 1).padStart(6, '0')}`;
      }
    }

    const baseUrl = buildBaseUrl(req);

    const formattedOrders = await Promise.all(
      purchaseOrders.map(async (order) => {
        const signatureImage = order.signatureImage
          ? `${baseUrl}${order.signatureImage.replace(/\\/g, '/')}`
          : null;

        const vendorDetails = order.vendor
          ? {
              id: order.vendor.id,
              name: `${order.vendor.firstName || ''} ${order.vendor.lastName || ''}`.trim(),
              email: order.vendor.email || null,
              phone: order.vendor.phone || null,
            }
          : null;

        const billToDetails = order.billToUser
          ? {
              id: order.billToUser.id,
              name: `${order.billToUser.firstName || ''} ${order.billToUser.lastName || ''}`.trim(),
              email: order.billToUser.email || null,
              phone: order.billToUser.phone || null,
              profileImage: order.billToUser.profileImage
                ? `${baseUrl}${order.billToUser.profileImage.replace(/\\/g, '/')}`
                : '',
            }
          : null;

        const bankDetails = order.bank
          ? {
              id: order.bank.id,
              name: order.bank.bankName || null,
              accountNumber: order.bank.accountNumber || null,
              accountHolderName: order.bank.accountHoldername || null,
              ifscCode: order.bank.IFSCCode || null,
            }
          : null;

        let signatureDetails: Record<string, unknown> | null = null;
        if (order.sign_type === 'eSignature') {
          signatureDetails = {
            name: order.signatureName || null,
            image: signatureImage,
          };
        } else if (order.signature) {
          signatureDetails = {
            id: order.signature.id,
            name: order.signature.signatureName || null,
          };
        }

        // Custom fields for this purchase order
        const customFieldsObject: Record<string, Prisma.JsonValue | null> = {};
        const orderValues = customValueMap[order.id] || {};
        tableFields.forEach((field) => {
          customFieldsObject[field.fieldSlug] = orderValues[field.id] ?? null;
        });

        const convertedPurchase = await prisma.purchase.findFirst({
          where: { purchaseOrderId: order.id },
          select: { id: true },
        });

        const itemsArr = Array.isArray(order.items) ? order.items : [];

        return {
          id: order.id,
          purchaseOrderId: order.purchaseOrderId,
          vendor: vendorDetails,
          purchaseOrderDate: formatDateShort(order.purchaseOrderDate),
          dueDate: formatDateShort(order.dueDate),
          referenceNo: order.referenceNo,
          status: order.status,
          paymentMode: order.paymentMode,
          taxableAmount: order.taxableAmount,
          totalDiscount: order.totalDiscount,
          vat: order.vat,
          TotalAmount: order.TotalAmount,
          itemsCount: itemsArr.length,
          billFrom: order.billFrom,
          billTo: billToDetails,
          notes: order.notes,
          sign_type: order.sign_type,
          signature: signatureDetails,
          bank: bankDetails,
          convert_type: order.convert_type,
          convertedToPurchase: convertedPurchase ? true : false,
          currencyCode: order.currencyCode ?? null, // C.1

          customFields: customFieldsObject,

          createdAt: formatDateShort(order.createdAt),
          updatedAt: formatDateShort(order.updatedAt),
        };
      }),
    );

    res.status(200).json({
      success: true,
      message: 'Purchase orders retrieved successfully',
      data: {
        purchaseOrders: formattedOrders,
        nextPurchaseOrderId,
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
    console.error('List purchase orders error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase orders',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// listPurchaseOrdersMinimal
// =============================================================================

export async function listPurchaseOrdersMinimal(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { search = '' } = req.query as { search?: string };
    const ownership = tenantOrUserFilter(req);

    // Step 1: get all purchaseOrderIds already used in Purchase (workspace-scoped)
    const usedPurchases = await prisma.purchase.findMany({
      where: { isDeleted: false, purchaseOrderId: { not: null }, ...ownership },
      select: { purchaseOrderId: true },
    });
    const usedIds = usedPurchases
      .map((p) => p.purchaseOrderId)
      .filter((v): v is string => Boolean(v));

    const where: Prisma.PurchaseOrderWhereInput = {
      isDeleted: false,
      status: { in: ['new', 'completed'] },
      AND: [ownership],
    };

    if (usedIds.length > 0) {
      where.id = { notIn: usedIds };
    }

    if (search) {
      where.purchaseOrderId = { contains: search, mode: 'insensitive' };
    }

    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where,
      select: { id: true, purchaseOrderId: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      message: 'Purchase orders retrieved successfully',
      data: purchaseOrders.map((order) => ({
        id: order.id,
        purchaseOrderId: order.purchaseOrderId,
      })),
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('List minimal purchase orders error:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching purchase orders',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getPurchaseOrderById
// =============================================================================

export async function getPurchaseOrderById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserFilter(req) },
      include: {
        vendor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
          },
        },
        signature: { select: { id: true, signatureName: true, signatureImage: true } },
        billFromUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            profileImage: true,
          },
        },
        billToUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            address: true,
            profileImage: true,
          },
        },
        bank: {
          select: {
            id: true,
            bankName: true,
            accountNumber: true,
            IFSCCode: true,
            accountHoldername: true,
            branchName: true,
          },
        },
      },
    });

    if (!purchaseOrder) {
      res.status(404).json({ message: 'Purchase order not found' });
      return;
    }

    // Custom field values
    const purchaseOrderModule = await prisma.module.findFirst({
      where: { moduleSlug: 'purchase-orders' },
    });

    const customFieldsObject: Record<string, Prisma.JsonValue | null> = {};

    if (purchaseOrderModule) {
      const fields = await prisma.customField.findMany({
        where: { moduleId: purchaseOrderModule.id, ...customFieldScope(req) },
        select: { id: true, fieldSlug: true, labelName: true },
      });

      const values = await prisma.customFieldValue.findMany({
        where: { module: 'purchaseOrder', recordId: purchaseOrder.id },
      });

      const valueMap: Record<string, Prisma.JsonValue | null> = {};
      values.forEach((v) => {
        valueMap[v.customFieldId] = v.value;
      });

      fields.forEach((field) => {
        customFieldsObject[field.fieldSlug] = valueMap[field.id] ?? null;
      });
    }

    const baseUrl = buildBaseUrl(req);

    const formatUserDetails = (
      user:
        | {
            id: string;
            firstName: string;
            lastName: string | null;
            email: string;
            phone: string | null;
            address: string | null;
            profileImage: string | null;
          }
        | null
        | undefined,
    ) => {
      if (!user) return null;
      return {
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email || null,
        phone: user.phone || null,
        address: user.address || null,
        profileImage: user.profileImage
          ? `${baseUrl}${user.profileImage.replace(/\\/g, '/')}`
          : '',
      };
    };

    let signature: Record<string, unknown> | null = null;
    if (purchaseOrder.sign_type === 'eSignature') {
      signature = {
        name: purchaseOrder.signatureName,
        image: purchaseOrder.signatureImage
          ? `${baseUrl}${purchaseOrder.signatureImage.replace(/\\/g, '/')}`
          : null,
      };
    } else if (purchaseOrder.sign_type === 'digitalSignature' && purchaseOrder.signature) {
      signature = {
        id: purchaseOrder.signature.id,
        name: purchaseOrder.signature.signatureName,
        image: purchaseOrder.signature.signatureImage
          ? `${baseUrl}${purchaseOrder.signature.signatureImage.replace(/\\/g, '/')}`
          : null,
      };
    }

    const bankDetails = purchaseOrder.bank
      ? {
          id: purchaseOrder.bank.id,
          bankName: purchaseOrder.bank.bankName,
          accountNumber: purchaseOrder.bank.accountNumber,
          accountHolderName: purchaseOrder.bank.accountHoldername,
          branchName: purchaseOrder.bank.branchName,
          ifscCode: purchaseOrder.bank.IFSCCode,
        }
      : null;

    const vendorDetails = purchaseOrder.vendor
      ? {
          id: purchaseOrder.vendor.id,
          name: `${purchaseOrder.vendor.firstName || ''} ${purchaseOrder.vendor.lastName || ''}`.trim(),
          email: purchaseOrder.vendor.email,
          phone: purchaseOrder.vendor.phone,
          address: purchaseOrder.vendor.address,
        }
      : null;

    const itemsArr = Array.isArray(purchaseOrder.items)
      ? (purchaseOrder.items as unknown as IncomingItem[])
      : [];

    const formattedItems = itemsArr.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      rate: item.rate,
      discount: item.discount,
      tax: item.tax,
      tax_group_id: item.tax_group_id,
      discount_type: item.discount_type,
      discount_value: item.discount_value,
      amount: item.amount,
    }));

    const responseData = {
      id: purchaseOrder.id,
      purchaseOrderId: purchaseOrder.purchaseOrderId,
      vendor: vendorDetails,
      purchaseOrderDate: purchaseOrder.purchaseOrderDate,
      dueDate: purchaseOrder.dueDate,
      referenceNo: purchaseOrder.referenceNo,
      status: purchaseOrder.status,
      paymentMode: purchaseOrder.paymentMode,
      taxableAmount: purchaseOrder.taxableAmount,
      totalDiscount: purchaseOrder.totalDiscount,
      vat: purchaseOrder.vat,
      roundOff: purchaseOrder.roundOff,
      TotalAmount: purchaseOrder.TotalAmount,
      items: formattedItems,
      billFrom: formatUserDetails(purchaseOrder.billFromUser),
      billTo: formatUserDetails(purchaseOrder.billToUser),
      notes: purchaseOrder.notes,
      termsAndCondition: purchaseOrder.termsAndCondition,
      sign_type: purchaseOrder.sign_type,
      signature,
      bank: bankDetails,
      convert_type: purchaseOrder.convert_type,
      currencyCode: purchaseOrder.currencyCode ?? null, // C.1

      customFields: customFieldsObject,

      createdAt: formatDateShort(purchaseOrder.createdAt),
      updatedAt: formatDateShort(purchaseOrder.updatedAt),
    };

    res.status(200).json({
      message: 'Purchase order retrieved successfully',
      data: responseData,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error fetching purchase order',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updatePurchaseOrder
// =============================================================================

export async function updatePurchaseOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const userId = requireUserId(req);

    const existingOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserFilter(req) },
    });
    if (!existingOrder) {
      res.status(404).json({ message: 'Purchase order not found' });
      return;
    }

    // Keep document owner; never reassign via body.userId.
    const bodyUserId = existingOrder.userId;
    const user = await prisma.user.findUnique({ where: { id: bodyUserId } });
    if (!user) {
      res.status(422).json({ message: 'Invalid user ID' });
      return;
    }

    const billFrom = body.billFrom as string | undefined;
    const billTo = body.billTo as string | undefined;

    if (billFrom || billTo) {
      const [billFromUser, billToUser] = await Promise.all([
        billFrom ? prisma.user.findUnique({ where: { id: billFrom } }) : Promise.resolve(null),
        billTo ? prisma.user.findUnique({ where: { id: billTo } }) : Promise.resolve(null),
      ]);

      if ((billFrom && !billFromUser) || (billTo && !billToUser)) {
        res.status(422).json({ message: 'Invalid bill from or bill to user ID' });
        return;
      }
      if (billTo && billToUser && Number(billToUser.user_type) !== 2) {
        res.status(422).json({ message: 'Bill to must be a supplier user' });
        return;
      }
    }

    const signTypeRaw = body.sign_type as string | undefined;
    if (signTypeRaw && !VALID_SIGN_TYPES.has(signTypeRaw as PurchaseOrderSignType)) {
      res.status(400).json({ message: 'Invalid signature type' });
      return;
    }
    const signType = (signTypeRaw as PurchaseOrderSignType | undefined) ?? existingOrder.sign_type;

    if (signType === 'eSignature') {
      if (!req.file && !existingOrder.signatureImage) {
        res.status(400).json({ message: 'Signature image is required for eSignature' });
        return;
      }
      if (!body.signatureName && !existingOrder.signatureName) {
        res.status(400).json({ message: 'Signature name is required for eSignature' });
        return;
      }
    }

    const statusRaw = body.status as string | undefined;
    if (statusRaw && !VALID_STATUSES.has(statusRaw as PurchaseOrderStatus)) {
      res.status(400).json({ message: `Invalid status: ${statusRaw}` });
      return;
    }

    const paymentModeRaw = body.paymentMode as string | undefined;
    if (paymentModeRaw && !VALID_PAYMENT_MODES.has(paymentModeRaw as PurchaseOrderPaymentMode)) {
      res.status(400).json({ message: `Invalid payment mode: ${paymentModeRaw}` });
      return;
    }

    const convertTypeRaw = body.convert_type as string | undefined;
    if (convertTypeRaw && !VALID_CONVERT_TYPES.has(convertTypeRaw as PurchaseOrderConvertType)) {
      res.status(400).json({ message: `Invalid convert type: ${convertTypeRaw}` });
      return;
    }

    // Totals
    let taxableAmount = Number(existingOrder.taxableAmount);
    let totalDiscount = Number(existingOrder.totalDiscount);
    let vat = Number(existingOrder.vat);
    let totalAmount = Number(existingOrder.TotalAmount);
    let items: IncomingItem[] | undefined;

    if (Array.isArray(body.items)) {
      items = normaliseItems(body.items);
      const totals = calcTotals(items);
      taxableAmount = totals.taxable;
      totalDiscount = totals.discount;
      vat = totals.vat;
      totalAmount = totals.total;
    }

    const updateData: Prisma.PurchaseOrderUpdateInput = {
      purchaseOrderDate: body.orderDate
        ? safeDate(body.orderDate) ?? existingOrder.purchaseOrderDate
        : existingOrder.purchaseOrderDate,
      dueDate: body.dueDate ? safeDate(body.dueDate) ?? existingOrder.dueDate : existingOrder.dueDate,
      referenceNo: (body.referenceNo as string) ?? existingOrder.referenceNo,
      status: (statusRaw as PurchaseOrderStatus) ?? existingOrder.status,
      paymentMode: (paymentModeRaw as PurchaseOrderPaymentMode | undefined) ?? existingOrder.paymentMode,
      taxableAmount: toDecimal(asNumber(body.subTotal, taxableAmount)),
      totalDiscount: toDecimal(asNumber(body.totalDiscount, totalDiscount)),
      vat: toDecimal(asNumber(body.totalTax, vat)),
      TotalAmount: toDecimal(asNumber(body.grandTotal, totalAmount)),
      notes: (body.notes as string) ?? existingOrder.notes,
      termsAndCondition: (body.termsAndCondition as string) ?? existingOrder.termsAndCondition,
      sign_type: signType,
      convert_type:
        (convertTypeRaw as PurchaseOrderConvertType | undefined) ?? existingOrder.convert_type,
    };

    if (items) {
      updateData.items = items as unknown as Prisma.InputJsonValue;
    }

    if (billFrom) {
      updateData.billFromUser = { connect: { id: billFrom } };
    }
    if (billTo) {
      updateData.billToUser = { connect: { id: billTo } };
      // Keep vendor in sync with billTo — never bare-connect body.vendorId.
      updateData.vendor = { connect: { id: billTo } };
    } else if (body.vendorId !== undefined) {
      // Allow clear only; non-null vendorId must match existing billTo.
      if (!body.vendorId) {
        updateData.vendor = { disconnect: true };
      } else if (body.vendorId !== existingOrder.billTo) {
        res.status(400).json({ message: 'vendorId must match billTo' });
        return;
      } else {
        updateData.vendor = { connect: { id: existingOrder.billTo } };
      }
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
        updateData.bank = { connect: { id: bank.id } };
      } else {
        updateData.bank = { disconnect: true };
      }
    }

    // Signature handling
    if (signType === 'eSignature') {
      updateData.signatureImage = req.file?.path ?? existingOrder.signatureImage;
      updateData.signatureName = (body.signatureName as string) ?? existingOrder.signatureName;
      if (body.signatureId !== undefined) {
        if (body.signatureId) {
          const sig = await prisma.signature.findFirst({
            where: { id: body.signatureId as string, ...tenantOrUserScope(req) },
          });
          if (!sig) {
            res.status(404).json({ message: 'Digital Signature not found' });
            return;
          }
          updateData.signature = { connect: { id: sig.id } };
        } else {
          updateData.signature = { disconnect: true };
        }
      }
    } else if (signType === 'digitalSignature') {
      updateData.signatureImage = null;
      updateData.signatureName = null;
      if (body.signatureId !== undefined) {
        if (body.signatureId) {
          const sig = await prisma.signature.findFirst({
            where: { id: body.signatureId as string, ...tenantOrUserScope(req) },
          });
          if (!sig) {
            res.status(404).json({ message: 'Digital Signature not found' });
            return;
          }
          updateData.signature = { connect: { id: sig.id } };
        } else {
          updateData.signature = { disconnect: true };
        }
      }
    } else {
      // none
      updateData.signatureImage = null;
      updateData.signatureName = null;
      updateData.signature = { disconnect: true };
    }

    if (body.roundOff !== undefined) {
      updateData.roundOff = Boolean(body.roundOff);
    }

    // C.1: update currencyCode if provided (freely editable on purchase orders)
    if (body.currencyCode !== undefined) {
      updateData.currencyCode = typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null;
    }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    const updatedOrder = await prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseOrder.update({ where: { id }, data: updateData });

      // Custom field values
      let customFields = body.customFields;
      if (typeof customFields === 'string') {
        try {
          customFields = JSON.parse(customFields);
        } catch {
          customFields = [];
        }
      }
      if (Array.isArray(customFields) && customFields.length > 0) {
        await tx.customFieldValue.deleteMany({
          where: { module: 'purchaseOrder', recordId: id },
        });
        await insertCustomFieldValues(tx, id, bodyUserId, customFields, files);
      }

      return updated;
    });

    const updatedItemsArr = Array.isArray(updatedOrder.items)
      ? (updatedOrder.items as unknown as IncomingItem[])
      : [];

    res.status(200).json({
      message: 'Purchase order updated successfully',
      data: {
        purchaseOrder: {
          id: updatedOrder.id,
          purchaseOrderId: updatedOrder.purchaseOrderId,
          purchaseOrderDate: updatedOrder.purchaseOrderDate,
          dueDate: updatedOrder.dueDate,
          status: updatedOrder.status,
          TotalAmount: updatedOrder.TotalAmount,
          billFrom: updatedOrder.billFrom,
          billTo: updatedOrder.billTo,
          sign_type: updatedOrder.sign_type,
          signatureName: updatedOrder.signatureName,
          currencyCode: updatedOrder.currencyCode ?? null, // C.1
          items: updatedItemsArr.map((item) => ({
            id: item.id,
            name: item.name,
            unit: item.unit,
            qty: item.qty,
            rate: item.rate,
            discount: item.discount,
            tax: item.tax,
            tax_group_id: item.tax_group_id,
            discount_type: item.discount_type,
            discount_value: item.discount_value,
            amount: item.amount,
          })),
        },
      },
    });
    // userId param is acknowledged but not used after permission check
    void userId;
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error(err);
    res.status(500).json({
      message: 'Error updating purchase order',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// deletePurchaseOrder (soft delete)
// =============================================================================

export async function deletePurchaseOrder(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params as { id: string };
    requireUserId(req);

    const purchaseOrder = await prisma.purchaseOrder.findFirst({
      where: { id, isDeleted: false, ...tenantOrUserFilter(req) },
    });

    if (!purchaseOrder) {
      res.status(404).json({
        success: false,
        message: 'Purchase order not found or already deleted',
        error: 'PO_NOT_FOUND',
      });
      return;
    }

    if (purchaseOrder.status === 'completed') {
      res.status(403).json({
        success: false,
        message: 'Cannot delete a completed or paid purchase order',
        error: 'INVALID_PO_STATUS',
      });
      return;
    }

    const deletedPO = await prisma.purchaseOrder.update({
      where: { id },
      data: { isDeleted: true },
    });

    res.status(200).json({
      success: true,
      message: 'Purchase order deleted successfully',
      data: {
        id: deletedPO.id,
        purchaseOrderId: deletedPO.purchaseOrderId,
        deletedAt: new Date(),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Delete purchase order error:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting purchase order',
      error:
        process.env.NODE_ENV === 'development'
          ? err instanceof Error ? err.message : String(err)
          : 'INTERNAL_SERVER_ERROR',
      errorCode: 'SERVER_ERROR',
    });
  }
}

// =============================================================================
// getAllTaxGroupsDetails
// =============================================================================

export async function getAllTaxGroupsDetails(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { search } = req.query as { search?: string };

    const where: Prisma.TaxGroupWhereInput = {
      AND: [
        {
          OR: [...tenantOrUserFilter(req).OR, { tenantId: null, userId: null }],
        },
      ],
    };
    if (search) {
      where.tax_name = { contains: search, mode: 'insensitive' };
    }

    const taxGroups = await prisma.taxGroup.findMany({
      where,
      include: {
        tax_rates: {
          select: {
            id: true,
            name: true,
            rate: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = taxGroups.map((taxGroup) => {
      const totalTaxRate = taxGroup.tax_rates.reduce(
        (sum, rate) => sum + Number(rate.rate ?? 0),
        0,
      );

      return {
        id: taxGroup.id,
        tax_name: taxGroup.tax_name,
        status: taxGroup.status,
        created_on: taxGroup.created_on,
        createdAt: taxGroup.createdAt,
        updatedAt: taxGroup.updatedAt,
        total_tax_rate: totalTaxRate,
        tax_rates: taxGroup.tax_rates.map((rate) => ({
          id: rate.id,
          tax_name: rate.name,
          tax_rate: rate.rate,
          status: rate.isActive,
          createdAt: rate.createdAt,
          updatedAt: rate.updatedAt,
        })),
      };
    });

    res.status(200).json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tax groups',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Touch type reference so unused-imports lint doesn't fail (PurchaseOrder type kept for clarity)
export type { PurchaseOrder };

// CommonJS interop for legacy JS routes
module.exports = {
  createPurchaseOrder,
  listUsersByType,
  getUserById,
  getRecentProductsWithSearch,
  listBankDetails,
  listPurchaseOrdersMinimal,
  getUserSignatures,
  listPurchaseOrders,
  getPurchaseOrderById,
  updatePurchaseOrder,
  deletePurchaseOrder,
  getAllTaxGroupsDetails,
};
module.exports.createPurchaseOrder = createPurchaseOrder;
module.exports.listUsersByType = listUsersByType;
module.exports.getUserById = getUserById;
module.exports.getRecentProductsWithSearch = getRecentProductsWithSearch;
module.exports.listBankDetails = listBankDetails;
module.exports.listPurchaseOrdersMinimal = listPurchaseOrdersMinimal;
module.exports.getUserSignatures = getUserSignatures;
module.exports.listPurchaseOrders = listPurchaseOrders;
module.exports.getPurchaseOrderById = getPurchaseOrderById;
module.exports.updatePurchaseOrder = updatePurchaseOrder;
module.exports.deletePurchaseOrder = deletePurchaseOrder;
module.exports.getAllTaxGroupsDetails = getAllTaxGroupsDetails;
