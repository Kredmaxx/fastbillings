import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type {
  SupplierPaymentSourceType,
  PurchaseStatus,
} from '@prisma/client';
import { validationResult } from 'express-validator';

import { prisma } from '../../../lib/prisma';
import {
  tenantScope,
  requireUserId,
  UnauthorizedError,
} from '../../../lib/tenantScope';
import { handleLedgerError } from '../../../lib/httpErrors';
import {
  postSupplierPayment,
  reverseDocument,
  type PostingTx,
} from '../../../lib/ledger/ledgerPosting';

type Tx = Prisma.TransactionClient;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

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
  return new Prisma.Decimal(
    typeof value === 'number' || typeof value === 'string' ? value : fallback,
  );
}

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
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

async function generateNextPaymentNumber(
  tx: Tx,
  prefix = 'PAY-',
): Promise<string> {
  const last = await tx.supplierPayment.findFirst({
    where: { paymentId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { paymentId: true },
  });

  let lastNumber = 0;
  if (last?.paymentId) {
    const match = last.paymentId.match(/\d+$/);
    if (match) lastNumber = parseInt(match[0], 10);
  }

  return `${prefix}${String(lastNumber + 1).padStart(6, '0')}`;
}

interface PurchaseItem {
  id?: string;
  productId?: string;
  qty?: number;
  unit?: string;
}

// =============================================================================
// createSupplierPayment
// =============================================================================

export async function createSupplierPayment(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array(),
    });
    return;
  }

  try {
    const userId = requireUserId(req);
    const {
      purchaseId,
      supplierId,
      referenceNumber,
      paymentDate,
      paymentMode,
      amount,
      paidAmount,
      dueAmount,
      notes,
      sourceType,
      bankId,
    } = req.body as {
      purchaseId?: string;
      supplierId?: string;
      referenceNumber?: string;
      paymentDate?: string;
      paymentMode?: string;
      amount?: number | string;
      paidAmount?: number | string;
      dueAmount?: number | string;
      notes?: string;
      sourceType?: string;
      bankId?: string;
    };
    // G: payment-date currency/rate (optional — absent → functional path)
    const bodyRaw = req.body as Record<string, unknown>;
    const pmtCurrencyCode = typeof bodyRaw.currencyCode === 'string' && bodyRaw.currencyCode ? bodyRaw.currencyCode : undefined;
    const pmtExchangeRate = bodyRaw.exchangeRate != null ? toDecimal(bodyRaw.exchangeRate) : undefined;

    const attachment = req.file ? `uploads/${req.file.filename}` : null;

    if (!sourceType || !['BANK', 'PETTY_CASH'].includes(sourceType)) {
      res.status(400).json({
        success: false,
        message: 'Validation failed.',
        errors: {
          sourceType: 'Invalid source type. Must be BANK or PETTY_CASH.',
        },
      });
      return;
    }

    const paidAmountNum = asNumber(paidAmount, 0);

    // BANK requires bankId and paymentMode
    if (sourceType === 'BANK') {
      if (!bankId) {
        res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors: { bankId: 'Bank ID is required for BANK payments.' },
        });
        return;
      }
      if (!paymentMode) {
        res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors: { paymentMode: 'Payment mode is required for BANK payments.' },
        });
        return;
      }

      const bank = await prisma.bankDetail.findUnique({ where: { id: bankId } });
      if (!bank) {
        res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors: { bankId: 'Bank not found.' },
        });
        return;
      }

      const currentBalance = Number(bank.currentBalance ?? 0);
      if (paidAmountNum > currentBalance) {
        res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors: {
            bankId: `Insufficient balance, current balance is ${currentBalance}`,
          },
        });
        return;
      }
    }

    // PETTY_CASH balance check
    if (sourceType === 'PETTY_CASH') {
      const pettyCash = await prisma.pettyCash.findFirst({
        where: { isDeleted: false },
      });
      if (!pettyCash) {
        res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors: { sourceType: 'Petty cash not found.' },
        });
        return;
      }

      const currentBalance = Number(pettyCash.currentBalance ?? 0);
      if (paidAmountNum > currentBalance) {
        res.status(400).json({
          success: false,
          message: 'Validation failed.',
          errors: {
            sourceType: `Insufficient balance, current balance is ${currentBalance}`,
          },
        });
        return;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const paymentId = await generateNextPaymentNumber(tx);

      const savedPayment = await tx.supplierPayment.create({
        data: {
          paymentId,
          purchaseId: purchaseId as string,
          supplierId: supplierId as string,
          referenceNumber: referenceNumber ?? null,
          paymentDate: safeDate(paymentDate) ?? new Date(),
          paymentModeId:
            sourceType === 'BANK' ? (paymentMode as string) : null,
          amount: asNumber(amount, 0),
          paidAmount: paidAmountNum,
          dueAmount: asNumber(dueAmount, 0),
          notes: notes ?? null,
          attachment,
          createdBy: userId,
          sourceType: sourceType as SupplierPaymentSourceType,
          bankId: sourceType === 'BANK' ? (bankId as string) : null,
          // G: persist payment-date currency/rate
          ...(pmtCurrencyCode ? { currencyCode: pmtCurrencyCode } : {}),
          ...(pmtExchangeRate !== undefined ? { exchangeRate: pmtExchangeRate } : {}),
        },
      });

      if (sourceType === 'BANK') {
        const bank = await tx.bankDetail.findUnique({
          where: { id: bankId as string },
        });
        if (!bank) throw new Error('BANK_NOT_FOUND');

        const balanceBefore = Number(bank.currentBalance ?? 0);
        const balanceAfter = Number(
          (balanceBefore - paidAmountNum).toFixed(2),
        );

        await tx.bankDetail.update({
          where: { id: bank.id },
          data: { currentBalance: toDecimal(balanceAfter) },
        });

        await tx.bankTransaction.create({
          data: {
            bankAccountId: bank.id,
            transactionDate: new Date(),
            type: 'TRANSFER_OUT',
            amount: toDecimal(paidAmountNum),
            balanceBefore: toDecimal(balanceBefore),
            balanceAfter: toDecimal(balanceAfter),
            paymentModeId: paymentMode as string,
            referenceNo: referenceNumber || null,
            remarks: notes || `Supplier payment to ${supplierId}`,
            relatedType: 'SUPPLIER_PAYMENT',
            relatedId: savedPayment.id,
          },
        });
      } else if (sourceType === 'PETTY_CASH') {
        const pettyCash = await tx.pettyCash.findFirst({
          where: { isDeleted: false },
        });
        if (!pettyCash) throw new Error('PETTY_CASH_NOT_FOUND');

        const balanceBefore = Number(pettyCash.currentBalance ?? 0);
        const balanceAfter = Number(
          (balanceBefore - paidAmountNum).toFixed(2),
        );

        await tx.pettyCash.update({
          where: { id: pettyCash.id },
          data: { currentBalance: toDecimal(balanceAfter) },
        });

        await tx.pettyCashTransaction.create({
          data: {
            pettyCashId: pettyCash.id,
            transactionDate: new Date(),
            transactionType: 'SPEND',
            amount: toDecimal(paidAmountNum),
            balanceBefore: toDecimal(balanceBefore),
            balanceAfter: toDecimal(balanceAfter),
            remarks: notes || `Supplier payment to ${supplierId}`,
            relatedType: 'SUPPLIER_PAYMENT',
            relatedId: savedPayment.id,
          },
        });
      }

      // Inventory side-effect: only run when this is the FIRST payment
      // recorded for the purchase.
      const existingPrior = await tx.supplierPayment.findFirst({
        where: {
          purchaseId: purchaseId as string,
          id: { not: savedPayment.id },
        },
      });

      if (!existingPrior) {
        const purchase = await tx.purchase.findUnique({
          where: { id: purchaseId as string },
        });
        if (!purchase) throw new Error('PURCHASE_NOT_FOUND');

        const items = Array.isArray(purchase.items)
          ? (purchase.items as unknown as PurchaseItem[])
          : [];

        for (const item of items) {
          const productId = item.id ?? item.productId;
          if (!productId) continue;

          const productExists = await tx.product.findUnique({
            where: { id: productId },
            select: { id: true },
          });
          if (!productExists) {
            console.warn(
              `Product not found for item ID: ${productId}, skipping inventory update.`,
            );
            continue;
          }

          const qty = asNumber(item.qty, 0);
          const existingInventory = await tx.inventory.findFirst({
            where: { productId, userId },
          });

          const historyEntry = {
            unitId: item.unit ?? null,
            quantity: qty,
            notes: `Stock added from Purchase ${purchase.purchaseId}`,
            type: 'stock_in',
            adjustment: qty,
            referenceId: purchase.id,
            referenceType: 'purchase',
            createdBy: userId,
          };

          if (existingInventory) {
            const existingHistory = Array.isArray(
              existingInventory.inventory_history,
            )
              ? (existingInventory.inventory_history as unknown[])
              : [];
            await tx.inventory.update({
              where: { id: existingInventory.id },
              data: {
                quantity: existingInventory.quantity + qty,
                inventory_history: [
                  ...existingHistory,
                  historyEntry,
                ] as unknown as Prisma.InputJsonValue,
              },
            });
          } else {
            await tx.inventory.create({
              data: {
                productId,
                userId,
                quantity: qty,
                inventory_history: [
                  historyEntry,
                ] as unknown as Prisma.InputJsonValue,
              },
            });
          }
        }
      }

      const purchaseStatus: PurchaseStatus =
        asNumber(dueAmount, 0) === 0 ? 'paid' : 'partially_paid';

      await tx.purchase.update({
        where: { id: purchaseId as string },
        data: { status: purchaseStatus },
      });

      // GL: post the supplier payment (Dr AP, Cr BANK/CASH) — FX-aware when currency provided.
      {
        // Resolve payment mode slug when source is BANK
        let paymentModeSlug: string | null = null;
        if (sourceType === 'BANK' && paymentMode) {
          const pmDoc = await tx.paymentMode.findUnique({
            where: { id: paymentMode as string },
            select: { slug: true },
          });
          paymentModeSlug = pmDoc?.slug ?? null;
        }

        // G: derive documentRate from parent purchase (the rate at which AP was originally booked).
        // paymentRate: rate at payment date (pmtExchangeRate ?? documentRate).
        let documentRate: Prisma.Decimal | undefined;
        let paymentRate: Prisma.Decimal | undefined;
        if (pmtCurrencyCode) {
          const parentPurchase = await tx.purchase.findUnique({
            where: { id: purchaseId as string },
            select: { exchangeRate: true },
          });
          documentRate = parentPurchase?.exchangeRate ?? new Prisma.Decimal(1);
          paymentRate = pmtExchangeRate ?? documentRate;
        }

        await postSupplierPayment(tx as unknown as PostingTx, {
          userId,
          purchaseId: purchaseId as string,
          paymentId: savedPayment.id,
          date: savedPayment.paymentDate ?? new Date(),
          amount: String(paidAmountNum),
          sourceType: sourceType ?? null,
          paymentModeSlug,
          ...(pmtCurrencyCode ? { currencyCode: pmtCurrencyCode, paymentRate, documentRate } : {}),
        });
      }

      return { savedPayment, purchaseStatus };
    });

    const sp = result.savedPayment;
    res.status(201).json({
      success: true,
      message: 'Supplier payment created successfully',
      data: {
        payment: {
          ...sp,
          amount: Number(sp.amount),
          paidAmount: Number(sp.paidAmount),
          dueAmount: Number(sp.dueAmount),
        },
        updatedPurchaseStatus: result.purchaseStatus,
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Error creating supplier payment:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating supplier payment',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// listSupplierPayments
// =============================================================================

export async function listSupplierPayments(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const {
      page = '1',
      limit = '10',
      supplierId,
      sourceType,
      startDate,
      endDate,
      search = '',
    } = req.query as {
      page?: string;
      limit?: string;
      supplierId?: string;
      sourceType?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    };

    const pageN = Number(page);
    const limitN = Number(limit);
    const skip = (pageN - 1) * limitN;

    const where: Prisma.SupplierPaymentWhereInput = { isDeleted: false };

    if (supplierId) {
      where.supplierId = supplierId;
    }
    if (sourceType && ['BANK', 'PETTY_CASH'].includes(sourceType)) {
      where.sourceType = sourceType as SupplierPaymentSourceType;
    }
    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate)
        (where.paymentDate as Prisma.DateTimeFilter).gte = new Date(startDate);
      if (endDate)
        (where.paymentDate as Prisma.DateTimeFilter).lte = new Date(endDate);
    }
    if (search) {
      where.OR = [
        { referenceNumber: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { paymentId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, payments] = await Promise.all([
      prisma.supplierPayment.count({ where }),
      prisma.supplierPayment.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              profileImage: true,
            },
          },
          purchase: {
            select: {
              id: true,
              purchaseId: true,
              totalAmount: true,
              purchaseDate: true,
              currencyCode: true,
            },
          },
          paymentMode: { select: { id: true, name: true } },
          bank: {
            select: {
              id: true,
              bankName: true,
              accountNumber: true,
              accountHoldername: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitN,
      }),
    ]);

    const baseUrl = buildBaseUrl(req);

    const formattedPayments = payments.map((p) => {
      const supplier = p.supplier
        ? {
            id: p.supplier.id,
            name: `${p.supplier.firstName || ''} ${p.supplier.lastName || ''}`.trim(),
            email: p.supplier.email || null,
            phone: p.supplier.phone || null,
            profileImage: p.supplier.profileImage
              ? `${baseUrl}${p.supplier.profileImage.replace(/\\/g, '/')}`
              : '',
          }
        : null;

      const purchase = p.purchase
        ? {
            id: p.purchase.id,
            purchaseId: p.purchase.purchaseId,
            totalAmount: p.purchase.totalAmount,
            purchaseDate: formatDateShort(p.purchase.purchaseDate),
            currencyCode: p.purchase.currencyCode ?? null,
          }
        : null;

      let attachmentUrl: string | null = null;
      if (p.attachment) {
        const cleanPath = p.attachment.replace(/\\/g, '/');
        attachmentUrl = cleanPath.startsWith('http')
          ? cleanPath
          : `${baseUrl}${cleanPath}`;
      }

      const bank =
        p.sourceType === 'BANK' && p.bank
          ? {
              id: p.bank.id,
              bankName: p.bank.bankName,
              accountNumber: p.bank.accountNumber,
              accountHolder: p.bank.accountHoldername,
            }
          : null;

      return {
        id: p.id,
        paymentId: p.paymentId,
        referenceNumber: p.referenceNumber,
        paymentDate: formatDateShort(p.paymentDate),
        sourceType: p.sourceType,
        amount: Number(p.amount),
        paidAmount: Number(p.paidAmount),
        dueAmount: Number(p.dueAmount),
        currencyCode: p.currencyCode ?? p.purchase?.currencyCode ?? null,
        notes: p.notes,
        attachment: attachmentUrl,
        supplier,
        purchase,
        bank,
        paymentMode: p.paymentMode ? p.paymentMode.name : null,
        createdAt: formatDateShort(p.createdAt),
        updatedAt: formatDateShort(p.updatedAt),
      };
    });

    res.status(200).json({
      success: true,
      message: 'Supplier payments retrieved successfully',
      data: {
        payments: formattedPayments,
        pagination: {
          total,
          page: pageN,
          limit: limitN,
          totalPages: Math.ceil(total / limitN),
        },
      },
    });
  } catch (err) {
    console.error('Error fetching supplier payments:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching supplier payments',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// updateSupplierPayment
// =============================================================================

export async function updateSupplierPayment(
  req: Request,
  res: Response,
): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      message: 'Validation failed',
      errors: errors.array(),
    });
    return;
  }

  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const {
      purchaseId,
      supplierId,
      referenceNumber,
      paymentDate,
      paymentMode,
      amount,
      paidAmount,
      dueAmount,
      notes,
    } = req.body as {
      purchaseId?: string;
      supplierId?: string;
      referenceNumber?: string;
      paymentDate?: string;
      paymentMode?: string;
      amount?: number | string;
      paidAmount?: number | string;
      dueAmount?: number | string;
      notes?: string;
    };

    const existingPayment = await prisma.supplierPayment.findUnique({
      where: { id },
    });
    if (!existingPayment) {
      res.status(404).json({
        success: false,
        message: 'Supplier payment not found',
      });
      return;
    }

    let attachment = existingPayment.attachment;
    if (req.file) {
      attachment = `uploads/${req.file.filename}`;
    }

    const newPaidAmount = asNumber(paidAmount, Number(existingPayment.paidAmount));
    const newDueAmount = asNumber(dueAmount, Number(existingPayment.dueAmount));

    const updatedPayment = await prisma.$transaction(async (tx) => {
      const upd = await tx.supplierPayment.update({
        where: { id },
        data: {
          purchaseId: purchaseId ?? existingPayment.purchaseId,
          supplierId: supplierId ?? existingPayment.supplierId,
          referenceNumber: referenceNumber ?? existingPayment.referenceNumber,
          paymentDate:
            safeDate(paymentDate) ?? existingPayment.paymentDate,
          paymentModeId: paymentMode ?? existingPayment.paymentModeId,
          amount: asNumber(amount, Number(existingPayment.amount)),
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount,
          notes: notes ?? existingPayment.notes,
          attachment,
        },
      });

      if (
        Number(existingPayment.paidAmount) !== newPaidAmount ||
        Number(existingPayment.dueAmount) !== newDueAmount
      ) {
        const purchaseStatus: PurchaseStatus =
          newDueAmount === 0 ? 'paid' : 'partially_paid';
        await tx.purchase.update({
          where: { id: (purchaseId as string) ?? existingPayment.purchaseId },
          data: { status: purchaseStatus },
        });
      }

      // GL: reverse old payment entry and re-post with updated amount
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'SupplierPayment',
        sourceId: id,
        event: 'payment',
      });
      {
        let paymentModeSlug: string | null = null;
        const effectivePaymentModeId = paymentMode ?? existingPayment.paymentModeId;
        if (upd.sourceType === 'BANK' && effectivePaymentModeId) {
          const pmDoc = await tx.paymentMode.findUnique({
            where: { id: effectivePaymentModeId },
            select: { slug: true },
          });
          paymentModeSlug = pmDoc?.slug ?? null;
        }
        await postSupplierPayment(tx as unknown as PostingTx, {
          userId,
          purchaseId: upd.purchaseId ?? existingPayment.purchaseId,
          paymentId: upd.id,
          date: upd.paymentDate ?? new Date(),
          amount: String(newPaidAmount),
          sourceType: upd.sourceType ?? null,
          paymentModeSlug,
        });
      }

      return upd;
    });

    const samePurchase =
      (purchaseId ?? existingPayment.purchaseId) === existingPayment.purchaseId;

    res.status(200).json({
      success: true,
      message: 'Supplier payment updated successfully',
      data: {
        payment: {
          ...updatedPayment,
          amount: Number(updatedPayment.amount),
          paidAmount: Number(updatedPayment.paidAmount),
          dueAmount: Number(updatedPayment.dueAmount),
        },
        ...(samePurchase && {
          updatedPurchaseStatus:
            newDueAmount === 0 ? 'paid' : 'partially_paid',
        }),
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    console.error('Error updating supplier payment:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating supplier payment',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// deleteSupplierPayment
// =============================================================================

export async function deleteSupplierPayment(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const payment = await prisma.supplierPayment.findUnique({ where: { id } });
    if (!payment) {
      res.status(404).json({ message: 'Supplier payment not found' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      // GL: reverse the posted payment entry before hard-deleting
      await reverseDocument(tx as unknown as PostingTx, {
        userId,
        sourceType: 'SupplierPayment',
        sourceId: id,
        event: 'payment',
      });

      await tx.supplierPayment.delete({ where: { id } });

      try {
        await tx.purchase.update({
          where: { id: payment.purchaseId },
          data: { status: 'partially_paid' },
        });
      } catch (e) {
        console.warn(
          `Purchase ${payment.purchaseId} not found, but payment was deleted`,
          e,
        );
      }
    });

    res.status(200).json({
      success: true,
      message:
        'Supplier payment deleted successfully and purchase status updated to partial paid',
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    if (handleLedgerError(res, err)) return;
    res.status(500).json({
      message: 'Error deleting supplier payment',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// Avoid unused-import lint when only the namespace import is used by tests.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _scopeRef = tenantScope;

// CommonJS interop for legacy JS routes
module.exports = {
  createSupplierPayment,
  listSupplierPayments,
  updateSupplierPayment,
  deleteSupplierPayment,
};
module.exports.createSupplierPayment = createSupplierPayment;
module.exports.listSupplierPayments = listSupplierPayments;
module.exports.updateSupplierPayment = updateSupplierPayment;
module.exports.deleteSupplierPayment = deleteSupplierPayment;
