import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireUserId, tenantOrUserFilter, UnauthorizedError } from '../lib/tenantScope';

// =============================================================================
// Shared helpers
// =============================================================================

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

/** Workspace ownership for all transaction reports (tenant + legacy user). */
function reportOwnership(req: Request) {
  requireUserId(req);
  return tenantOrUserFilter(req);
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

interface RawItem {
  id?: string | null;
  name?: string | null;
  qty?: number | null;
  rate?: number | null;
  amount?: number | null;
}

function normaliseItems(raw: Prisma.JsonValue | null | undefined): RawItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((it) => {
    const i = (it ?? {}) as Record<string, unknown>;
    return {
      id: typeof i.id === 'string' ? i.id : (typeof i.productId === 'string' ? (i.productId as string) : null),
      name: typeof i.name === 'string' ? (i.name as string) : null,
      qty: asNumber(i.qty, 0),
      rate: asNumber(i.rate, 0),
      amount: asNumber(i.amount, asNumber(i.rate, 0) * asNumber(i.qty, 0)),
    };
  });
}

interface ProductLite {
  id: string;
  name: string;
  code: string;
  selling_price: number;
  product_image: string;
  category: { category_name: string } | null;
}

async function fetchProductMap(items: RawItem[][]): Promise<Record<string, ProductLite>> {
  const ids = new Set<string>();
  for (const list of items) {
    for (const it of list) {
      if (it.id) ids.add(it.id);
    }
  }
  if (ids.size === 0) return {};
  const products = await prisma.product.findMany({
    where: { id: { in: Array.from(ids) } },
    select: {
      id: true,
      name: true,
      code: true,
      selling_price: true,
      product_image: true,
      category: { select: { category_name: true } },
    },
  });
  const map: Record<string, ProductLite> = {};
  for (const p of products)
    map[p.id] = { ...p, selling_price: Number(p.selling_price) };
  return map;
}

function calculateChange(
  previous: number,
  current: number,
): { change: number | string; trend: 'up' | 'down' | 'equal' } {
  if (previous === 0 && current === 0) return { change: '0%', trend: 'equal' };
  if (previous === 0) return { change: '100%', trend: 'up' };
  const change = (((current - previous) / previous) * 100).toFixed(0);
  return {
    change: Number(change),
    trend: current > previous ? 'up' : current < previous ? 'down' : 'equal',
  };
}

function calculateChangePercentage(
  previous: number,
  current: number,
): { percentage: number; ratio: 'up' | 'down' | 'equal' } {
  if (previous === 0 && current === 0) return { percentage: 0, ratio: 'equal' };
  if (previous === 0) return { percentage: 100, ratio: 'up' };
  const percentage = (((current - previous) / previous) * 100).toFixed(0);
  return {
    percentage: Number(percentage),
    ratio: current > previous ? 'up' : current < previous ? 'down' : 'equal',
  };
}

// =============================================================================
// getInvoiceSalesReport
// =============================================================================

export async function getInvoiceSalesReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      startDate,
      endDate,
      search,
    } = req.query as {
      page?: string;
      limit?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;
    const now = new Date();
    const ownership = reportOwnership(req);

    // Build filters dynamically (ownership always AND'd so search OR cannot widen scope)
    const andFilters: Prisma.InvoiceWhereInput[] = [ownership];
    const filters: Prisma.InvoiceWhereInput = { isDeleted: false, AND: andFilters };

    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      filters.invoiceDate = dateFilter;
    }

    if (search) {
      andFilters.push({
        OR: [{ invoiceNumber: { contains: search, mode: 'insensitive' } }],
      });
    }

    // Month ranges
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const totalInvoices = await prisma.invoice.count({ where: filters });

    const invoiceInclude = {
      billToCustomer: {
        select: { id: true, name: true, email: true, phone: true, image: true },
      },
    } satisfies Prisma.InvoiceInclude;

    const [currentInvoices, previousInvoices, allInvoices] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          invoiceDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
          isDeleted: false,
          ...ownership,
        },
        include: invoiceInclude,
      }),
      prisma.invoice.findMany({
        where: {
          invoiceDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
          isDeleted: false,
          ...ownership,
        },
        include: invoiceInclude,
      }),
      prisma.invoice.findMany({
        where: filters,
        include: invoiceInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    // Build a global product map for all three result sets
    const productMap = await fetchProductMap([
      ...currentInvoices.map((i) => normaliseItems(i.items)),
      ...previousInvoices.map((i) => normaliseItems(i.items)),
      ...allInvoices.map((i) => normaliseItems(i.items)),
    ]);

    // Pre-fetch payments for all invoices we touch
    const allInvoiceIds = [
      ...currentInvoices.map((i) => i.id),
      ...previousInvoices.map((i) => i.id),
      ...allInvoices.map((i) => i.id),
    ];
    const payments = allInvoiceIds.length
      ? await prisma.invoicePayment.findMany({
          where: { invoiceId: { in: allInvoiceIds } },
          select: {
            invoiceId: true,
            amount: true,
            paymentMode: { select: { name: true } },
          },
        })
      : [];
    const paymentsByInvoice: Record<
      string,
      { amount: number; payment_method: string | null }[]
    > = {};
    for (const p of payments) {
      const list = paymentsByInvoice[p.invoiceId] ?? (paymentsByInvoice[p.invoiceId] = []);
      list.push({
        amount: Number(p.amount ?? 0),
        payment_method: p.paymentMode?.name ?? null,
      });
    }

    interface InvoiceProductAgg {
      id: string;
      name: string;
      sku: string;
      category: string;
      sellingPrice: number;
      image: string;
      soldQuantity: number;
      revenue: number;
    }

    type InvoiceRow = (typeof currentInvoices)[number];

    const processInvoices = (
      invoices: InvoiceRow[],
    ): {
      report: Record<string, unknown>[];
      totalRevenue: number;
      productMap: Record<string, InvoiceProductAgg>;
    } => {
      const report: Record<string, unknown>[] = [];
      const localProducts: Record<string, InvoiceProductAgg> = {};
      let totalRevenue = 0;

      for (const invoice of invoices) {
        const items = normaliseItems(invoice.items);
        let invoiceRevenue = 0;

        items.forEach((item) => {
          const product = item.id ? productMap[item.id] ?? null : null;
          const qty = item.qty ?? 0;
          const revenue = item.amount ?? qty * (item.rate ?? 0);
          invoiceRevenue += revenue;
          totalRevenue += revenue;

          if (product) {
            if (!localProducts[product.id]) {
              localProducts[product.id] = {
                id: product.id,
                name: product.name,
                sku: product.code,
                category: product.category?.category_name ?? '-',
                sellingPrice: Number(product.selling_price),
                image: product.product_image
                  ? `${process.env.BASE_URL}${product.product_image}`
                  : '',
                soldQuantity: 0,
                revenue: 0,
              };
            }
            localProducts[product.id].soldQuantity += qty;
            localProducts[product.id].revenue += revenue;
          }
        });

        // Payments
        const invoicePayments = paymentsByInvoice[invoice.id] ?? [];
        const paidAmount = invoicePayments.reduce((sum, p) => sum + p.amount, 0);
        const paymentModes = [
          ...new Set(invoicePayments.map((p) => p.payment_method).filter((v): v is string => Boolean(v))),
        ];

        const totalAmount = Number(invoice.TotalAmount ?? 0);
        let status = 'UNPAID';
        if (paidAmount >= totalAmount) status = 'PAID';
        else if (paidAmount > 0) status = 'PARTIALLY_PAID';

        report.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          customer: {
            name: invoice.billToCustomer?.name || '-',
            email: invoice.billToCustomer?.email || '',
            phone: invoice.billToCustomer?.phone || '',
            image: invoice.billToCustomer?.image
              ? `${process.env.BASE_URL}/${invoice.billToCustomer.image}`
              : '',
          },
          amount: totalAmount || 0,
          currencyCode: invoice.currencyCode ?? null,
          paidAmount,
          remainingBalance: (totalAmount || 0) - paidAmount,
          paymentModes,
          createdAt: invoice.createdAt,
          status,
          invoiceDate: invoice.invoiceDate,
          revenue: invoiceRevenue,
          products: items.map((item) => {
            const product = item.id ? productMap[item.id] ?? null : null;
            return {
              id: product?.id ?? null,
              name: product?.name || '-',
              sku: product?.code || '-',
              sellingPrice: Number(product?.selling_price ?? 0),
              categoryName: product?.category?.category_name || '-',
              soldQuantity: item.qty || 0,
              revenue:
                item.amount || (item.qty ?? 0) * (item.rate ?? 0) || 0,
              image: product?.product_image
                ? `${process.env.BASE_URL}${product.product_image}`
                : '',
            };
          }),
        });
      }

      return { report, totalRevenue, productMap: localProducts };
    };

    const { totalRevenue: currentTotal, productMap: currentProducts } =
      processInvoices(currentInvoices);
    const { totalRevenue: previousTotal, productMap: previousProducts } =
      processInvoices(previousInvoices);
    const { report: allReport } = processInvoices(allInvoices);

    const getBestSelling = (
      products: Record<string, InvoiceProductAgg>,
    ): { name: string; soldQuantity: number } => {
      const productArray = Object.values(products);
      if (!productArray.length) return { name: '-', soldQuantity: 0 };
      return productArray.reduce((max, p) => (p.soldQuantity > max.soldQuantity ? p : max));
    };

    const bestCurrent = getBestSelling(currentProducts);
    const bestPrevious = getBestSelling(previousProducts);

    res.status(200).json({
      success: true,
      message: 'Invoice sales report fetched successfully',
      data: {
        TotalRevenue: {
          currentMonthAmount: currentTotal,
          previousMonthAmount: previousTotal,
          ...calculateChange(previousTotal, currentTotal),
        },
        ActiveInvoices: {
          currentMonthCount: currentInvoices.length,
          previousMonthCount: previousInvoices.length,
          ...calculateChange(previousInvoices.length, currentInvoices.length),
        },
        BestSellingProduct: {
          name: bestCurrent.name,
          currentMonthQty: bestCurrent.soldQuantity || 0,
          previousMonthQty: bestPrevious.soldQuantity || 0,
          ...calculateChange(bestPrevious.soldQuantity || 0, bestCurrent.soldQuantity || 0),
        },
      },
      records: allReport,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
      },
      pagination: {
        total: totalInvoices,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(totalInvoices / limitN),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching invoice sales report:', err);
    res.status(500).json({
      message: 'Error generating report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getCreditNoteSalesReport
// =============================================================================

export async function getCreditNoteSalesReport(req: Request, res: Response): Promise<void> {
  try {
    const { page = '1', limit = '10' } = req.query as { page?: string; limit?: string };
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;
    const now = new Date();
    const ownership = reportOwnership(req);
    const scoped: Prisma.CreditNoteWhereInput = { isDeleted: false, ...ownership };

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const totalCreditNotes = await prisma.creditNote.count({ where: scoped });

    const noteInclude = {
      billToCustomer: {
        select: { id: true, name: true, email: true, phone: true, image: true },
      },
    } satisfies Prisma.CreditNoteInclude;

    const [currentNotes, previousNotes, allNotes] = await Promise.all([
      prisma.creditNote.findMany({
        where: {
          creditNoteDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
          ...scoped,
        },
        include: noteInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.creditNote.findMany({
        where: {
          creditNoteDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
          ...scoped,
        },
        include: noteInclude,
      }),
      prisma.creditNote.findMany({
        where: scoped,
        include: noteInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const productMap = await fetchProductMap([
      ...currentNotes.map((n) => normaliseItems(n.items)),
      ...previousNotes.map((n) => normaliseItems(n.items)),
      ...allNotes.map((n) => normaliseItems(n.items)),
    ]);

    interface CreditProductAgg {
      id: string;
      name: string;
      sku: string;
      category: string;
      sellingPrice: number;
      image: string;
      returnedQuantity: number;
      refundAmount: number;
    }

    type CreditNoteRow = (typeof currentNotes)[number];

    const processCreditNotes = (
      notes: CreditNoteRow[],
    ): {
      report: Record<string, unknown>[];
      totalRefund: number;
      productMap: Record<string, CreditProductAgg>;
    } => {
      const report: Record<string, unknown>[] = [];
      const localProducts: Record<string, CreditProductAgg> = {};
      let totalRefund = 0;

      for (const note of notes) {
        const noteRefund = Number(note.totalAmount ?? 0);
        totalRefund += noteRefund;

        const items = normaliseItems(note.items);

        items.forEach((item) => {
          const product = item.id ? productMap[item.id] ?? null : null;
          const qty = item.qty ?? 0;
          const amount = item.amount ?? qty * (item.rate ?? 0);

          if (product) {
            if (!localProducts[product.id]) {
              localProducts[product.id] = {
                id: product.id,
                name: product.name,
                sku: product.code,
                category: product.category?.category_name ?? '-',
                sellingPrice: Number(product.selling_price),
                image: product.product_image
                  ? `${process.env.BASE_URL}${product.product_image}`
                  : '',
                returnedQuantity: 0,
                refundAmount: 0,
              };
            }
            localProducts[product.id].returnedQuantity += qty;
            localProducts[product.id].refundAmount += amount;
          }
        });

        report.push({
          creditNoteId: note.id,
          creditNoteNumber: note.creditNoteNumber,
          customer: {
            name: note.billToCustomer?.name || '-',
            email: note.billToCustomer?.email || '',
            phone: note.billToCustomer?.phone || '',
            image: note.billToCustomer?.image
              ? `${process.env.BASE_URL}/${note.billToCustomer.image}`
              : '',
          },
          refundAmount: Number(note.totalAmount ?? 0) || 0,
          currencyCode: note.currencyCode ?? null,
          reason: note.reason,
          status: note.status,
          creditNoteDate: note.creditNoteDate,
          createdAt: note.createdAt,
          items: items.map((item) => {
            const product = item.id ? productMap[item.id] ?? null : null;
            return {
              id: product?.id ?? null,
              name: product?.name || item.name,
              sku: product?.code || '-',
              sellingPrice: Number(product?.selling_price ?? 0),
              categoryName: product?.category?.category_name || '-',
              returnedQuantity: item.qty || 0,
              refundAmount:
                item.amount || (item.qty ?? 0) * (item.rate ?? 0) || 0,
              image: product?.product_image
                ? `${process.env.BASE_URL}${product.product_image}`
                : '',
            };
          }),
        });
      }

      return { report, totalRefund, productMap: localProducts };
    };

    const { totalRefund: currentTotalRefund, productMap: currentProducts } =
      processCreditNotes(currentNotes);
    const { totalRefund: previousTotalRefund, productMap: previousProducts } =
      processCreditNotes(previousNotes);
    const { report: allReport } = processCreditNotes(allNotes);

    const getMostReturned = (
      products: Record<string, CreditProductAgg>,
    ): { name: string; returnedQuantity: number } => {
      const productArray = Object.values(products);
      if (!productArray.length) return { name: '-', returnedQuantity: 0 };
      return productArray.reduce((max, p) =>
        p.returnedQuantity > max.returnedQuantity ? p : max,
      );
    };

    const bestCurrent = getMostReturned(currentProducts);
    const bestPrevious = getMostReturned(previousProducts);

    res.status(200).json({
      success: true,
      message: 'Credit note sales return report fetched successfully',
      data: {
        TotalRefund: {
          currentMonthAmount: currentTotalRefund,
          previousMonthAmount: previousTotalRefund,
          ...calculateChange(previousTotalRefund, currentTotalRefund),
        },
        ActiveCreditNotes: {
          currentMonthCount: currentNotes.length,
          previousMonthCount: previousNotes.length,
          ...calculateChange(previousNotes.length, currentNotes.length),
        },
        MostReturnedProduct: {
          name: bestCurrent.name,
          currentMonthQty: bestCurrent.returnedQuantity || 0,
          previousMonthQty: bestPrevious.returnedQuantity || 0,
          ...calculateChange(
            bestPrevious.returnedQuantity || 0,
            bestCurrent.returnedQuantity || 0,
          ),
        },
      },
      records: allReport,
      pagination: {
        total: totalCreditNotes,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(totalCreditNotes / limitN),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching credit note sales return report:', err);
    res.status(500).json({
      message: 'Error generating report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getPurchaseReport
// =============================================================================

export async function getPurchaseReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      startDate,
      endDate,
      search,
    } = req.query as {
      page?: string;
      limit?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;
    const now = new Date();
    const ownership = reportOwnership(req);

    const andFilters: Prisma.PurchaseWhereInput[] = [ownership];
    const filters: Prisma.PurchaseWhereInput = { isDeleted: false, AND: andFilters };

    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      filters.purchaseDate = dateFilter;
    }

    if (search) {
      andFilters.push({ OR: [{ purchaseId: { contains: search, mode: 'insensitive' } }] });
    }

    const totalPurchases = await prisma.purchase.count({ where: filters });

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const purchaseInclude = {
      vendor: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true },
      },
    } satisfies Prisma.PurchaseInclude;

    const [currentPurchases, previousPurchases, allPurchases] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          purchaseDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
          isDeleted: false,
          ...ownership,
        },
        include: purchaseInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchase.findMany({
        where: {
          purchaseDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
          isDeleted: false,
          ...ownership,
        },
        include: purchaseInclude,
      }),
      prisma.purchase.findMany({
        where: filters,
        include: purchaseInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const productMap = await fetchProductMap([
      ...currentPurchases.map((p) => normaliseItems(p.items)),
      ...previousPurchases.map((p) => normaliseItems(p.items)),
      ...allPurchases.map((p) => normaliseItems(p.items)),
    ]);

    // Pre-fetch all supplier payments
    const purchaseIds = [
      ...currentPurchases.map((p) => p.id),
      ...previousPurchases.map((p) => p.id),
      ...allPurchases.map((p) => p.id),
    ];
    const supplierPayments = purchaseIds.length
      ? await prisma.supplierPayment.findMany({
          where: { purchaseId: { in: purchaseIds }, isDeleted: false },
          select: { purchaseId: true, paidAmount: true },
        })
      : [];
    const paymentsByPurchase: Record<string, number> = {};
    for (const sp of supplierPayments) {
      paymentsByPurchase[sp.purchaseId] =
        (paymentsByPurchase[sp.purchaseId] ?? 0) + Number(sp.paidAmount ?? 0);
    }

    type PurchaseRow = (typeof currentPurchases)[number];

    const processPurchases = (
      purchases: PurchaseRow[],
    ): {
      report: Record<string, unknown>[];
      totalAmount: number;
    } => {
      const report: Record<string, unknown>[] = [];
      let totalAmount = 0;

      for (const purchase of purchases) {
        const purchaseTotal = Number(purchase.totalAmount ?? 0);
        totalAmount += purchaseTotal;

        const items = normaliseItems(purchase.items);
        const paidAmount = paymentsByPurchase[purchase.id] ?? 0;
        const balance = purchaseTotal - paidAmount;

        let status = 'UNPAID';
        if (paidAmount >= purchaseTotal) status = 'PAID';
        else if (paidAmount > 0) status = 'PARTIALLY_PAID';

        report.push({
          purchaseId: purchase.purchaseId,
          vendor: purchase.vendor
            ? {
                name: `${purchase.vendor.firstName || ''} ${purchase.vendor.lastName || ''}`.trim(),
                email: purchase.vendor.email,
                phone: purchase.vendor.phone,
                image: purchase.vendor.profileImage
                  ? `${process.env.BASE_URL}/${purchase.vendor.profileImage}`
                  : '',
              }
            : null,
          totalAmount: purchaseTotal,
          currencyCode: purchase.currencyCode ?? null,
          paidAmount,
          balance,
          status,
          purchaseDate: purchase.purchaseDate,
          items: items.map((item) => {
            const product = item.id ? productMap[item.id] ?? null : null;
            return {
              name: item.name,
              sku: product?.code || '-',
              quantity: item.qty || 0,
              amount: item.amount || 0,
              image: product?.product_image
                ? `${process.env.BASE_URL}${product.product_image}`
                : '',
            };
          }),
        });
      }

      return { report, totalAmount };
    };

    processPurchases(currentPurchases);
    const { report: allReport } = processPurchases(allPurchases);

    const responseData = {
      totalPurchases: {
        count: totalPurchases,
        totalAmount: allPurchases.reduce(
          (sum, purchase) => sum + Number(purchase.totalAmount ?? 0),
          0,
        ),
      },
      completedOrders: {
        count: allPurchases.filter((p) => String(p.status).toLowerCase() === 'paid').length,
        totalAmount: allPurchases
          .filter((p) => String(p.status).toLowerCase() === 'paid')
          .reduce((sum, purchase) => sum + Number(purchase.totalAmount ?? 0), 0),
      },
      cancelledOrders: {
        count: allPurchases.filter((p) => String(p.status).toLowerCase() === 'cancelled').length,
        totalAmount: allPurchases
          .filter((p) => String(p.status).toLowerCase() === 'cancelled')
          .reduce((sum, purchase) => sum + Number(purchase.totalAmount ?? 0), 0),
      },
      pendingOrders: {
        count: allPurchases.filter((p) =>
          ['unpaid', 'partially_paid'].includes(String(p.status).toLowerCase()),
        ).length,
        totalAmount: allPurchases
          .filter((p) =>
            ['unpaid', 'partially_paid'].includes(String(p.status).toLowerCase()),
          )
          .reduce((sum, purchase) => sum + Number(purchase.totalAmount ?? 0), 0),
      },
    };

    res.status(200).json({
      success: true,
      message: 'Purchase report fetched successfully',
      data: responseData,
      records: allReport,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
      },
      pagination: {
        total: totalPurchases,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(totalPurchases / limitN),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching purchase report:', err);
    res.status(500).json({
      message: 'Error generating purchase report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getPurchaseOrderReport
// =============================================================================

export async function getPurchaseOrderReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      startDate,
      endDate,
      search,
    } = req.query as {
      page?: string;
      limit?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;
    const now = new Date();
    const ownership = reportOwnership(req);

    const andFilters: Prisma.PurchaseOrderWhereInput[] = [ownership];
    const filters: Prisma.PurchaseOrderWhereInput = { isDeleted: false, AND: andFilters };

    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      filters.purchaseOrderDate = dateFilter;
    }

    if (search) {
      andFilters.push({ OR: [{ purchaseOrderId: { contains: search, mode: 'insensitive' } }] });
    }

    const totalOrders = await prisma.purchaseOrder.count({ where: filters });

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const orderInclude = {
      billToUser: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true },
      },
    } satisfies Prisma.PurchaseOrderInclude;

    const [currentOrders, previousOrders, allOrders] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: {
          purchaseOrderDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
          isDeleted: false,
          ...ownership,
        },
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchaseOrder.findMany({
        where: {
          purchaseOrderDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
          isDeleted: false,
          ...ownership,
        },
        include: orderInclude,
      }),
      prisma.purchaseOrder.findMany({
        where: filters,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const productMap = await fetchProductMap([
      ...currentOrders.map((o) => normaliseItems(o.items)),
      ...previousOrders.map((o) => normaliseItems(o.items)),
      ...allOrders.map((o) => normaliseItems(o.items)),
    ]);

    type OrderRow = (typeof currentOrders)[number];

    const processOrders = (
      orders: OrderRow[],
    ): {
      report: Record<string, unknown>[];
      totalAmount: number;
    } => {
      const report: Record<string, unknown>[] = [];
      let totalAmount = 0;

      orders.forEach((order) => {
        const orderTotal = Number(order.TotalAmount ?? 0);
        totalAmount += orderTotal;

        const items = normaliseItems(order.items);

        report.push({
          purchaseOrderId: order.purchaseOrderId,
          vendor: order.billToUser
            ? {
                name: `${order.billToUser.firstName || ''} ${order.billToUser.lastName || ''}`.trim(),
                email: order.billToUser.email,
                phone: order.billToUser.phone,
                image: order.billToUser.profileImage
                  ? `${process.env.BASE_URL}/${order.billToUser.profileImage}`
                  : '',
              }
            : null,
          totalAmount: orderTotal,
          currencyCode: order.currencyCode ?? null,
          status: order.status,
          purchaseOrderDate: order.purchaseOrderDate,
          items: items.map((item) => {
            const product = item.id ? productMap[item.id] ?? null : null;
            return {
              name: item.name,
              sku: product?.code || '-',
              quantity: item.qty || 0,
              amount: item.amount || 0,
              image: product?.product_image
                ? `${process.env.BASE_URL}${product.product_image}`
                : '',
            };
          }),
        });
      });

      return { report, totalAmount };
    };

    processOrders(currentOrders);
    const { report: allReport } = processOrders(allOrders);

    const responseData = {
      totalOrders: {
        count: totalOrders,
        totalAmount: allOrders.reduce(
          (sum, order) => sum + Number(order.TotalAmount ?? 0),
          0,
        ),
      },
      completedOrders: {
        count: allOrders.filter((o) => String(o.status).toLowerCase() === 'completed').length,
        totalAmount: allOrders
          .filter((o) => String(o.status).toLowerCase() === 'completed')
          .reduce((sum, order) => sum + Number(order.TotalAmount ?? 0), 0),
      },
      cancelledOrders: {
        count: allOrders.filter((o) => String(o.status).toLowerCase() === 'cancelled').length,
        totalAmount: allOrders
          .filter((o) => String(o.status).toLowerCase() === 'cancelled')
          .reduce((sum, order) => sum + Number(order.TotalAmount ?? 0), 0),
      },
      pendingOrders: {
        count: allOrders.filter((o) =>
          ['pending', 'new'].includes(String(o.status).toLowerCase()),
        ).length,
        totalAmount: allOrders
          .filter((o) =>
            ['pending', 'new'].includes(String(o.status).toLowerCase()),
          )
          .reduce((sum, order) => sum + Number(order.TotalAmount ?? 0), 0),
      },
    };

    res.status(200).json({
      success: true,
      message: 'Purchase order report fetched successfully',
      data: responseData,
      records: allReport,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
      },
      pagination: {
        total: totalOrders,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(totalOrders / limitN),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching purchase order report:', err);
    res.status(500).json({
      message: 'Error generating purchase order report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getDebitNoteReport
// =============================================================================

export async function getDebitNoteReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      startDate,
      endDate,
      search,
    } = req.query as {
      page?: string;
      limit?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;
    const now = new Date();
    const ownership = reportOwnership(req);

    const andFilters: Prisma.DebitNoteWhereInput[] = [ownership];
    const filters: Prisma.DebitNoteWhereInput = { isDeleted: false, AND: andFilters };

    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      filters.debitNoteDate = dateFilter;
    }

    if (search) {
      andFilters.push({ OR: [{ debitNoteId: { contains: search, mode: 'insensitive' } }] });
    }

    const totalAllNotes = await prisma.debitNote.count({ where: filters });

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const noteInclude = {
      vendor: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, profileImage: true },
      },
    } satisfies Prisma.DebitNoteInclude;

    const [currentNotes, previousNotes, allNotesPaginated, allNotes] = await Promise.all([
      prisma.debitNote.findMany({
        where: {
          debitNoteDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
          isDeleted: false,
          ...ownership,
        },
        include: noteInclude,
      }),
      prisma.debitNote.findMany({
        where: {
          debitNoteDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
          isDeleted: false,
          ...ownership,
        },
        include: noteInclude,
      }),
      prisma.debitNote.findMany({
        where: filters,
        include: noteInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
      prisma.debitNote.findMany({ where: filters }),
    ]);

    const productMap = await fetchProductMap([
      ...currentNotes.map((n) => normaliseItems(n.items)),
      ...previousNotes.map((n) => normaliseItems(n.items)),
      ...allNotesPaginated.map((n) => normaliseItems(n.items)),
    ]);

    interface DebitVendorAgg {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      image: string | null;
      totalAmount: number;
    }

    interface DebitProductAgg {
      id: string;
      name: string;
      sku: string;
      category: string;
      quantity: number;
      totalAmount: number;
      image: string;
    }

    type DebitNoteRow = (typeof currentNotes)[number];

    const processNotes = (
      notes: DebitNoteRow[],
    ): {
      report: Record<string, unknown>[];
      totalAmount: number;
      vendorMap: Record<string, DebitVendorAgg>;
      productMap: Record<string, DebitProductAgg>;
    } => {
      const report: Record<string, unknown>[] = [];
      const vendorMap: Record<string, DebitVendorAgg> = {};
      const localProducts: Record<string, DebitProductAgg> = {};
      let totalAmount = 0;

      notes.forEach((note) => {
        const noteTotal = Number(note.totalAmount ?? 0);
        totalAmount += noteTotal;

        if (note.vendor) {
          const vendorId = note.vendor.id;
          if (!vendorMap[vendorId]) {
            vendorMap[vendorId] = {
              id: vendorId,
              name: `${note.vendor.firstName || ''} ${note.vendor.lastName || ''}`.trim(),
              email: note.vendor.email || null,
              phone: note.vendor.phone || null,
              image: note.vendor.profileImage || null,
              totalAmount: 0,
            };
          }
          vendorMap[vendorId].totalAmount += noteTotal;
        }

        const items = normaliseItems(note.items);
        items.forEach((item) => {
          const product = item.id ? productMap[item.id] ?? null : null;
          if (product) {
            const productId = product.id;
            if (!localProducts[productId]) {
              localProducts[productId] = {
                id: productId,
                name: product.name,
                sku: product.code,
                category: product.category?.category_name ?? '-',
                quantity: 0,
                totalAmount: 0,
                image: product.product_image
                  ? `${process.env.BASE_URL}${product.product_image}`
                  : '',
              };
            }
            localProducts[productId].quantity += item.qty || 0;
            localProducts[productId].totalAmount += item.amount || 0;
          }
        });

        report.push({
          Id: note.id,
          debitNoteId: note.debitNoteId,
          vendor: note.vendor
            ? {
                name: `${note.vendor.firstName || ''} ${note.vendor.lastName || ''}`.trim(),
                email: note.vendor.email,
                phone: note.vendor.phone,
                image: note.vendor.profileImage
                  ? `${process.env.BASE_URL}/${note.vendor.profileImage}`
                  : '',
              }
            : null,
          totalAmount: noteTotal,
          currencyCode: note.currencyCode ?? null,
          status: note.status,
          debitNoteDate: note.debitNoteDate,
          items: items.map((item) => {
            const product = item.id ? productMap[item.id] ?? null : null;
            return {
              name: item.name,
              sku: product?.code || '-',
              quantity: item.qty || 0,
              amount: item.amount || 0,
              image: product?.product_image
                ? `${process.env.BASE_URL}${product.product_image}`
                : '',
            };
          }),
        });
      });

      return { report, totalAmount, vendorMap, productMap: localProducts };
    };

    const { totalAmount: currentTotal, vendorMap: currentVendors, productMap: currentProducts } =
      processNotes(currentNotes);
    const { totalAmount: previousTotal } = processNotes(previousNotes);
    const { report: allNotesReport } = processNotes(allNotesPaginated);
    // For total across all filtered (no include needed for paginated report),
    // we can compute amount directly from `allNotes` without product/vendor maps.
    const allFilteredTotal = allNotes.reduce(
      (sum, n) => sum + Number(n.totalAmount ?? 0),
      0,
    );

    const bestVendor = Object.values(currentVendors).reduce<DebitVendorAgg | { totalAmount: number; name?: string }>(
      (max, v) => (v.totalAmount > (max.totalAmount ?? 0) ? v : max),
      { totalAmount: 0 },
    );
    const bestProduct = Object.values(currentProducts).reduce<DebitProductAgg | { quantity: number; name?: string }>(
      (max, p) => (p.quantity > (max.quantity ?? 0) ? p : max),
      { quantity: 0 },
    );

    res.status(200).json({
      success: true,
      message: 'Debit note report fetched successfully',
      data: {
        TotalDebit: {
          currentMonthAmount: currentTotal,
          previousMonthAmount: previousTotal,
          allFilteredAmount: allFilteredTotal,
          ...calculateChange(previousTotal, currentTotal),
        },
        ActiveDebitNotes: {
          currentMonthCount: currentNotes.length,
          previousMonthCount: previousNotes.length,
          ...calculateChange(previousNotes.length, currentNotes.length),
        },
        BestVendor: {
          name: bestVendor.name || '-',
          currentMonthAmount: bestVendor.totalAmount || 0,
        },
        BestProduct: {
          name: bestProduct.name || '-',
          currentMonthQty: bestProduct.quantity || 0,
        },
      },
      records: allNotesReport,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
      },
      pagination: {
        total: totalAllNotes,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(totalAllNotes / limitN),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching debit note report:', err);
    res.status(500).json({
      message: 'Error generating debit note report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// getQuotationSalesReport
// =============================================================================

export async function getQuotationSalesReport(req: Request, res: Response): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      startDate,
      endDate,
      search,
    } = req.query as {
      page?: string;
      limit?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };
    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;
    const now = new Date();
    const ownership = reportOwnership(req);

    const andFilters: Prisma.QuotationWhereInput[] = [ownership];
    const filters: Prisma.QuotationWhereInput = { isDeleted: false, AND: andFilters };

    if (startDate || endDate) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      filters.quotationDate = dateFilter;
    }

    if (search) {
      andFilters.push({ OR: [{ quotationId: { contains: search, mode: 'insensitive' } }] });
    }

    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const totalQuotations = await prisma.quotation.count({ where: filters });

    const quotationInclude = {
      billToCustomer: {
        select: { id: true, name: true, email: true, phone: true, image: true },
      },
    } satisfies Prisma.QuotationInclude;

    const [currentQuotations, previousQuotations, allQuotations] = await Promise.all([
      prisma.quotation.findMany({
        where: {
          quotationDate: { gte: startOfCurrentMonth, lte: endOfCurrentMonth },
          isDeleted: false,
          ...ownership,
        },
        include: quotationInclude,
      }),
      prisma.quotation.findMany({
        where: {
          quotationDate: { gte: startOfPreviousMonth, lte: endOfPreviousMonth },
          isDeleted: false,
          ...ownership,
        },
        include: quotationInclude,
      }),
      prisma.quotation.findMany({
        where: filters,
        include: quotationInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const productMap = await fetchProductMap([
      ...currentQuotations.map((q) => normaliseItems(q.items)),
      ...previousQuotations.map((q) => normaliseItems(q.items)),
      ...allQuotations.map((q) => normaliseItems(q.items)),
    ]);

    type QuotationRow = (typeof currentQuotations)[number];

    const processQuotations = (
      quotations: QuotationRow[],
    ): {
      report: Record<string, unknown>[];
      totalAmount: number;
    } => {
      const report: Record<string, unknown>[] = [];
      let totalAmount = 0;

      quotations.forEach((quotation) => {
        const qTotal = Number(quotation.TotalAmount ?? 0);
        totalAmount += qTotal;

        const items = normaliseItems(quotation.items);

        report.push({
          quotationId: quotation.quotationId,
          customer: quotation.billToCustomer
            ? {
                name: quotation.billToCustomer.name,
                email: quotation.billToCustomer.email,
                phone: quotation.billToCustomer.phone,
                image: quotation.billToCustomer.image
                  ? `${process.env.BASE_URL}/${quotation.billToCustomer.image}`
                  : '',
              }
            : null,
          totalAmount: qTotal,
          currencyCode: quotation.currencyCode ?? null,
          status: quotation.status,
          quotationDate: quotation.quotationDate,
          expiryDate: quotation.expiryDate,
          items: items.map((item) => {
            const product = item.id ? productMap[item.id] ?? null : null;
            return {
              name: item.name,
              sku: product?.code || '-',
              quantity: item.qty || 0,
              amount: item.amount || 0,
              image: product?.product_image
                ? `${process.env.BASE_URL}${product.product_image}`
                : '',
            };
          }),
        });
      });

      return { report, totalAmount };
    };

    const { totalAmount: currentTotal } = processQuotations(currentQuotations);
    const { totalAmount: previousTotal } = processQuotations(previousQuotations);
    const { report: allReport } = processQuotations(allQuotations);

    const getStatusCount = (quotations: QuotationRow[], status: string): number =>
      quotations.filter((q) => String(q.status) === status).length;

    const stats = {
      total: {
        current: currentTotal,
        previous: previousTotal,
        ...calculateChangePercentage(previousTotal, currentTotal),
      },
      pending: {
        current: getStatusCount(currentQuotations, 'pending'),
        previous: getStatusCount(previousQuotations, 'pending'),
        ...calculateChangePercentage(
          getStatusCount(previousQuotations, 'pending'),
          getStatusCount(currentQuotations, 'pending'),
        ),
      },
      completed: {
        current: getStatusCount(currentQuotations, 'completed'),
        previous: getStatusCount(previousQuotations, 'completed'),
        ...calculateChangePercentage(
          getStatusCount(previousQuotations, 'completed'),
          getStatusCount(currentQuotations, 'completed'),
        ),
      },
      cancelled: {
        current: getStatusCount(currentQuotations, 'cancelled'),
        previous: getStatusCount(previousQuotations, 'cancelled'),
        ...calculateChangePercentage(
          getStatusCount(previousQuotations, 'cancelled'),
          getStatusCount(currentQuotations, 'cancelled'),
        ),
      },
    };

    res.status(200).json({
      success: true,
      message: 'Quotation sales report fetched successfully',
      data: stats,
      records: allReport,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
      },
      pagination: {
        total: totalQuotations,
        page: pageN,
        limit: limitN,
        totalPages: Math.ceil(totalQuotations / limitN),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching quotation sales report:', err);
    res.status(500).json({
      success: false,
      message: 'Error generating quotation sales report',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  getInvoiceSalesReport,
  getCreditNoteSalesReport,
  getPurchaseReport,
  getPurchaseOrderReport,
  getDebitNoteReport,
  getQuotationSalesReport,
};
module.exports.getInvoiceSalesReport = getInvoiceSalesReport;
module.exports.getCreditNoteSalesReport = getCreditNoteSalesReport;
module.exports.getPurchaseReport = getPurchaseReport;
module.exports.getPurchaseOrderReport = getPurchaseOrderReport;
module.exports.getDebitNoteReport = getDebitNoteReport;
module.exports.getQuotationSalesReport = getQuotationSalesReport;

// Silence unused-import warnings for util that is re-exported via type-only paths
void safeDate;
