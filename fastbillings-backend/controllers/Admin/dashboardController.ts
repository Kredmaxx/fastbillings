import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../../lib/prisma';

interface InvoiceItemShape {
  id?: string;
  productId?: string;
  name?: string;
  qty?: number | string;
  rate?: number | string;
  amount?: number | string;
}

function toNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function imageUrl(baseUrl: string, image: string | null | undefined): string {
  if (!image) return '';
  return `${baseUrl}/${image.replace(/\\/g, '/')}`;
}

export async function getDashboard(req: Request, res: Response): Promise<void> {
  try {
    const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5000';

    // ---------- COUNTS ----------
    const [
      totalInvoiceCount,
      totalProductCount,
      totalCustomerCount,
      totalSupplierCount,
    ] = await Promise.all([
      prisma.invoice.count({ where: { isDeleted: false } }),
      prisma.product.count(),
      prisma.customer.count({ where: { isDeleted: false } }),
      prisma.user.count({ where: { user_type: 2 } }),
    ]);

    // ---------- LAST 5 CUSTOMERS ----------
    const lastFiveCustomers = await prisma.customer.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        image: true,
        createdAt: true,
      },
    });

    const formattedCustomers = lastFiveCustomers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      status: c.status,
      imageUrl: imageUrl(baseUrl, c.image),
      createdAt: c.createdAt,
    }));

    // ---------- LAST 5 SUPPLIERS ----------
    const lastFiveSuppliers = await prisma.user.findMany({
      where: { user_type: 2 },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        profileImage: true,
        createdAt: true,
      },
    });

    const formattedSuppliers = lastFiveSuppliers.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName || ''}`.trim(),
      email: s.email,
      phone: s.phone || '',
      profileImageUrl: imageUrl(baseUrl, s.profileImage),
      createdAt: s.createdAt,
    }));

    // ---------- LAST 5 INVOICES ----------
    const lastFiveInvoices = await prisma.invoice.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        TotalAmount: true,
        status: true,
        createdAt: true,
        customer: {
          select: { id: true, name: true, email: true, phone: true, image: true },
        },
        billToCustomer: {
          select: { id: true, name: true, email: true, phone: true, image: true },
        },
      },
    });

    const formattedInvoices = lastFiveInvoices.map((inv) => {
      const party = inv.customer || inv.billToCustomer;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        totalAmount: inv.TotalAmount,
        status: inv.status,
        customer: party
          ? {
              id: party.id,
              name: party.name,
              email: party.email,
              phone: party.phone,
              imageUrl: imageUrl(baseUrl, party.image),
            }
          : null,
        createdAt: inv.createdAt,
      };
    });

    // ---------- LAST 5 PURCHASES ----------
    const lastFivePurchases = await prisma.purchase.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        purchaseId: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        billToUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            profileImage: true,
            isDeleted: true,
          },
        },
      },
    });

    const formattedPurchases = lastFivePurchases.map((p) => ({
      id: p.id,
      purchaseId: p.purchaseId,
      totalAmount: p.totalAmount,
      status: p.status,
      vendor: p.billToUser
        ? {
            id: p.billToUser.id,
            name: `${p.billToUser.firstName || ''} ${p.billToUser.lastName || ''}`.trim(),
            email: p.billToUser.email,
            phone: p.billToUser.phone,
            profileImage: imageUrl(baseUrl, p.billToUser.profileImage),
            isDeleted: p.billToUser.isDeleted || false,
          }
        : null,
      createdAt: p.createdAt,
    }));

    // ---------- LAST 5 PAYMENTS ----------
    const lastFivePayments = await prisma.invoicePayment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        amount: true,
        received_on: true,
        notes: true,
        createdAt: true,
        invoice: { select: { id: true, invoiceNumber: true, TotalAmount: true } },
        receivedByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
          },
        },
        paymentMode: { select: { id: true, name: true, slug: true } },
      },
    });

    const formattedPayments = lastFivePayments.map((pay) => ({
      id: pay.id,
      amount: pay.amount,
      payment_method: pay.paymentMode
        ? {
            id: pay.paymentMode.id,
            name: pay.paymentMode.name,
            slug: pay.paymentMode.slug,
          }
        : null,
      received_on: pay.received_on,
      notes: pay.notes || '',
      invoice: pay.invoice
        ? {
            id: pay.invoice.id,
            invoiceNumber: pay.invoice.invoiceNumber,
            totalAmount: pay.invoice.TotalAmount,
          }
        : null,
      received_by: pay.receivedByUser
        ? {
            id: pay.receivedByUser.id,
            name: `${pay.receivedByUser.firstName} ${pay.receivedByUser.lastName || ''}`.trim(),
            email: pay.receivedByUser.email,
            profileImage: imageUrl(baseUrl, pay.receivedByUser.profileImage),
          }
        : null,
      createdAt: pay.createdAt,
    }));

    // ---------- SALES KPIs ----------
    const totalSalesAgg = await prisma.invoice.aggregate({
      where: { isDeleted: false },
      _sum: { TotalAmount: true },
    });
    const totalSalesAmount = toNum(totalSalesAgg._sum.TotalAmount);

    const totalDueAgg = await prisma.invoice.aggregate({
      where: {
        isDeleted: false,
        status: { in: ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID'] },
      },
      _sum: { TotalAmount: true },
    });
    const totalDueAmount = toNum(totalDueAgg._sum.TotalAmount);

    const receivedAgg = await prisma.invoicePayment.aggregate({
      _sum: { amount: true },
    });
    const receivedAmount = toNum(receivedAgg._sum.amount);

    const quotationCount = await prisma.quotation.count({ where: { isDeleted: false } });

    // ---------- PURCHASE KPIs ----------
    const totalPurchasesAgg = await prisma.purchase.aggregate({
      where: { isDeleted: false },
      _sum: { totalAmount: true },
    });
    const totalPurchasesAmount = toNum(totalPurchasesAgg._sum.totalAmount);

    const totalPaidPurchasesAgg = await prisma.supplierPayment.aggregate({
      where: { isDeleted: false },
      _sum: { paidAmount: true },
    });
    const totalPaidPurchases = toNum(totalPaidPurchasesAgg._sum.paidAmount);

    const totalDuePurchasesAgg = await prisma.purchase.aggregate({
      where: { isDeleted: false },
      _sum: { balanceAmount: true },
    });
    const totalDuePurchases = toNum(totalDuePurchasesAgg._sum.balanceAmount);

    const debitNoteCount = await prisma.debitNote.count({ where: { isDeleted: false } });

    // ---------- GRAPH 1: Top 5 Products by Sales ----------
    // Mongo $unwind pipeline → fetch items JSON + aggregate in JS, then attach product names.
    const invoicesForGraph = await prisma.invoice.findMany({
      where: { isDeleted: false },
      select: { items: true },
    });

    const productAgg = new Map<string, { totalQty: number; totalSales: number }>();
    for (const inv of invoicesForGraph) {
      const items = Array.isArray(inv.items) ? (inv.items as unknown as InvoiceItemShape[]) : [];
      for (const it of items) {
        const pid = it.id || it.productId;
        if (!pid) continue;
        const cur = productAgg.get(pid) || { totalQty: 0, totalSales: 0 };
        cur.totalQty += toNum(it.qty);
        cur.totalSales += toNum(it.amount);
        productAgg.set(pid, cur);
      }
    }

    const sortedProducts = [...productAgg.entries()]
      .sort((a, b) => b[1].totalQty - a[1].totalQty)
      .slice(0, 5);

    const productIds = sortedProducts.map(([id]) => id);
    const productRows = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true },
        })
      : [];
    const productNameMap = new Map(productRows.map((p) => [p.id, p.name]));

    const topProducts = sortedProducts
      .filter(([id]) => productNameMap.has(id))
      .map(([id, agg]) => ({
        productId: id,
        name: productNameMap.get(id) || '',
        totalQty: agg.totalQty,
        totalSales: agg.totalSales,
      }));

    // ---------- GRAPH 2: Sales & Purchases by Month ----------
    const allInvoices = await prisma.invoice.findMany({
      where: { isDeleted: false },
      select: { createdAt: true, TotalAmount: true },
    });
    const allPurchases = await prisma.purchase.findMany({
      where: { isDeleted: false },
      select: { createdAt: true, totalAmount: true },
    });

    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];

    const graph2 = monthNames.map((m) => ({ month: m, sales: 0, purchases: 0 }));

    for (const inv of allInvoices) {
      const idx = new Date(inv.createdAt).getMonth();
      graph2[idx].sales += toNum(inv.TotalAmount);
    }
    for (const p of allPurchases) {
      const idx = new Date(p.createdAt).getMonth();
      graph2[idx].purchases += toNum(p.totalAmount);
    }

    // ---------- GRAPH 3: Sales Comparison (Today vs Yesterday) ----------
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const endOfYesterday = new Date(startOfToday.getTime() - 1);

    const todayAgg = await prisma.invoice.aggregate({
      where: { isDeleted: false, createdAt: { gte: startOfToday } },
      _sum: { TotalAmount: true },
    });
    const todaySales = toNum(todayAgg._sum.TotalAmount);

    const yesterdayAgg = await prisma.invoice.aggregate({
      where: {
        isDeleted: false,
        createdAt: { gte: startOfYesterday, lte: endOfYesterday },
      },
      _sum: { TotalAmount: true },
    });
    const yesterdaySales = toNum(yesterdayAgg._sum.TotalAmount);

    let trend: 'up' | 'down' | 'equal' = 'equal';
    let percentChange = 0;
    if (yesterdaySales === 0 && todaySales > 0) {
      trend = 'up';
      percentChange = 100;
    } else if (yesterdaySales > 0) {
      const diff = todaySales - yesterdaySales;
      percentChange = Math.round((diff / yesterdaySales) * 100);
      trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'equal';
    }

    const salesComparison = {
      today: todaySales,
      yesterday: yesterdaySales,
      trend,
      percentChange,
    };

    // ---------- AGING BUCKETS + TOP DEBTORS (slice E.4) ----------
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const unpaidInvoices = await prisma.invoice.findMany({
      where: {
        isDeleted: false,
        invoiceType: 'INVOICE',
        status: { in: ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID', 'SENT'] },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        TotalAmount: true,
        billTo: true,
        billToCustomer: { select: { id: true, name: true } },
        payments: { select: { amount: true } },
      },
    });

    const agingBuckets = {
      current: 0,
      days30: 0,
      days60: 0,
      days90: 0,
      beyond90: 0,
    };
    const debtorMap = new Map<
      string,
      { customerId: string; customerName: string; outstanding: number; oldestInvoiceDays: number }
    >();

    for (const inv of unpaidInvoices) {
      const total = toNum(inv.TotalAmount);
      const paid = inv.payments.reduce((s, p) => s + toNum(p.amount), 0);
      const outstanding = total - paid;
      if (outstanding <= 0) continue;

      const due = inv.dueDate ?? inv.invoiceDate;
      const ageDays = Math.floor(
        (now.getTime() - new Date(due).getTime()) / (24 * 60 * 60 * 1000),
      );
      if (ageDays <= 0) agingBuckets.current += outstanding;
      else if (ageDays <= 30) agingBuckets.days30 += outstanding;
      else if (ageDays <= 60) agingBuckets.days60 += outstanding;
      else if (ageDays <= 90) agingBuckets.days90 += outstanding;
      else agingBuckets.beyond90 += outstanding;

      if (inv.billToCustomer) {
        const key = inv.billToCustomer.id;
        const existing = debtorMap.get(key);
        if (existing) {
          existing.outstanding += outstanding;
          existing.oldestInvoiceDays = Math.max(existing.oldestInvoiceDays, ageDays);
        } else {
          debtorMap.set(key, {
            customerId: inv.billToCustomer.id,
            customerName: inv.billToCustomer.name,
            outstanding,
            oldestInvoiceDays: ageDays,
          });
        }
      }
    }

    const topDebtors = Array.from(debtorMap.values())
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 10);

    // ---------- RESPONSE ----------
    res.status(200).json({
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        totalInvoiceCount,
        totalProductCount,
        totalCustomerCount,
        totalSupplierCount,
        lastFiveCustomers: formattedCustomers,
        lastFiveSuppliers: formattedSuppliers,
        lastFiveInvoices: formattedInvoices,
        lastFivePurchases: formattedPurchases,
        lastFivePayments: formattedPayments,
        sales: {
          totalSalesAmount,
          totalDueAmount,
          receivedAmount,
          quotationCount,
        },
        purchases: {
          totalPurchasesAmount,
          totalPaidPurchases,
          totalDuePurchases,
          debitNoteCount,
        },
        graph1: topProducts,
        graph2,
        salesComparison,
        agingBuckets,
        topDebtors,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: message,
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = { getDashboard };
module.exports.getDashboard = getDashboard;
