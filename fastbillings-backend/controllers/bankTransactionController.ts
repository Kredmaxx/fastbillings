import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { BankTransactionType } from '@prisma/client';
import { parse } from 'csv-parse/sync';

import { prisma } from '../lib/prisma';
import { requireUserId, UnauthorizedError } from '../lib/tenantScope';

import { matchBankTransaction, type MatchCandidate } from '../lib/reconciliationMatcher';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function toNumber(v: Prisma.Decimal | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isDebitType(t: string): boolean {
  return t === 'WITHDRAWAL' || t === 'TRANSFER_OUT' || t === 'PAYMENT';
}

/**
 * Ensures a PaymentMode exists that we can attach to CSV-imported transactions.
 * BankTransaction.paymentModeId is non-nullable in the schema, but CSV rows
 * typically don't carry an explicit payment mode, so we lazily create an
 * "Other" sentinel and reuse it.
 */
async function getOrCreateDefaultPaymentMode(
  tx: Prisma.TransactionClient,
): Promise<{ id: string; name: string; slug: string }> {
  const slug = 'other';
  const existing = await tx.paymentMode.findUnique({ where: { slug } });
  if (existing) {
    return { id: existing.id, name: existing.name, slug: existing.slug };
  }
  const created = await tx.paymentMode.create({
    data: { name: 'Other', slug, status: true },
  });
  return { id: created.id, name: created.name, slug: created.slug };
}

// =============================================================================
// list
// =============================================================================

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));

    // Only see transactions on bank accounts owned by this user.
    const accounts = await prisma.bankDetail.findMany({
      where: { userId, isDeleted: false },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const where: Prisma.BankTransactionWhereInput = {
      bankAccountId: { in: accountIds },
      isDeleted: false,
    };
    const bankAccountIdFilter = req.query.bankAccountId as string | undefined;
    if (bankAccountIdFilter) where.bankAccountId = bankAccountIdFilter;
    const type = req.query.type as string | undefined;
    if (type) where.type = type as BankTransactionType;
    const isReconciled = req.query.isReconciled as string | undefined;
    if (isReconciled === 'true' || isReconciled === 'false') {
      where.isReconciled = isReconciled === 'true';
    }
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    if (from || to) {
      where.transactionDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: {
            select: {
              id: true,
              bankName: true,
              accountNumber: true,
              accountHoldername: true,
            },
          },
          paymentMode: { select: { id: true, name: true, slug: true } },
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bankTransaction.count({ where }),
    ]);

    const transformed = rows.map((r) => ({
      id: r.id,
      bankAccountId: r.bankAccountId,
      bankAccount: r.bankAccount
        ? {
            id: r.bankAccount.id,
            bankName: r.bankAccount.bankName,
            accountNumber: r.bankAccount.accountNumber,
            accountHoldername: r.bankAccount.accountHoldername,
          }
        : null,
      transactionDate: r.transactionDate,
      type: r.type,
      amount: toNumber(r.amount),
      balanceBefore: toNumber(r.balanceBefore),
      balanceAfter: toNumber(r.balanceAfter),
      paymentMode: r.paymentMode
        ? { id: r.paymentMode.id, name: r.paymentMode.name, slug: r.paymentMode.slug }
        : null,
      referenceNo: r.referenceNo,
      remarks: r.remarks,
      relatedType: r.relatedType,
      relatedId: r.relatedId,
      isReconciled: r.isReconciled,
      reconciledBy: r.reconciledBy,
      reconciliationDate: r.reconciliationDate,
    }));

    res.json({
      success: true,
      data: {
        bankTransactions: transformed,
        // Back-compat for the older `finance-and-accounting/BankTransactionList`
        // page which still consumes `data.transactions`.
        transactions: transformed,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list bank transactions' });
  }
}

// =============================================================================
// getById
// =============================================================================

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const row = await prisma.bankTransaction.findFirst({
      where: { id, bankAccount: { userId, isDeleted: false }, isDeleted: false },
      include: {
        bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
        paymentMode: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'Bank transaction not found' });
      return;
    }
    res.json({
      success: true,
      data: {
        bankTransaction: {
          ...row,
          amount: toNumber(row.amount),
          balanceBefore: toNumber(row.balanceBefore),
          balanceAfter: toNumber(row.balanceAfter),
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction getById error:', err);
    res.status(500).json({ success: false, message: 'Failed to load bank transaction' });
  }
}

// =============================================================================
// create — manual entry
// =============================================================================

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as {
      bankAccountId?: string;
      transactionDate?: string;
      type?: string;
      amount?: number | string;
      paymentModeId?: string;
      referenceNo?: string;
      remarks?: string;
    };

    if (!body.bankAccountId || !body.amount || !body.type) {
      res.status(400).json({
        success: false,
        message: 'bankAccountId, type, amount required',
      });
      return;
    }

    const account = await prisma.bankDetail.findFirst({
      where: { id: body.bankAccountId, userId, isDeleted: false },
    });
    if (!account) {
      res.status(404).json({ success: false, message: 'Bank account not found' });
      return;
    }

    const amount = new Prisma.Decimal(Number(body.amount));
    const balanceBefore = new Prisma.Decimal(
      (account.currentBalance ?? new Prisma.Decimal(0)).toString(),
    );
    const balanceAfter = isDebitType(body.type)
      ? balanceBefore.minus(amount)
      : balanceBefore.plus(amount);

    const created = await prisma.$transaction(async (tx) => {
      // BankTransaction.paymentModeId is non-nullable; fall back to the
      // "Other" sentinel if the caller didn't supply one.
      let paymentModeId = body.paymentModeId;
      if (!paymentModeId) {
        const pm = await getOrCreateDefaultPaymentMode(tx);
        paymentModeId = pm.id;
      }

      const t = await tx.bankTransaction.create({
        data: {
          bankAccountId: body.bankAccountId!,
          transactionDate: body.transactionDate ? new Date(body.transactionDate) : new Date(),
          type: body.type as BankTransactionType,
          amount,
          balanceBefore,
          balanceAfter,
          paymentModeId,
          referenceNo: body.referenceNo || '',
          remarks: body.remarks || '',
          relatedType: 'MANUAL',
          relatedId: null,
        },
      });
      await tx.bankDetail.update({
        where: { id: body.bankAccountId! },
        data: { currentBalance: balanceAfter },
      });
      return t;
    });

    res.status(201).json({
      success: true,
      message: 'Bank transaction created',
      data: {
        bankTransaction: {
          ...created,
          amount: toNumber(created.amount),
          balanceBefore: toNumber(created.balanceBefore),
          balanceAfter: toNumber(created.balanceAfter),
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create bank transaction' });
  }
}

// =============================================================================
// remove — soft delete
// =============================================================================

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.bankTransaction.findFirst({
      where: { id, bankAccount: { userId, isDeleted: false }, isDeleted: false },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Bank transaction not found' });
      return;
    }
    await prisma.bankTransaction.update({ where: { id }, data: { isDeleted: true } });
    res.json({ success: true, message: 'Bank transaction deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction remove error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete bank transaction' });
  }
}

// =============================================================================
// importPreview — parse CSV, return preview rows without persisting
// =============================================================================

interface PreviewRow {
  date: string;
  description: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  error?: string;
}

export async function importPreview(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ success: false, message: 'CSV file required' });
      return;
    }

    const csvText = file.buffer.toString('utf-8');
    let records: Array<Record<string, string>>;
    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>;
    } catch (e) {
      res.status(400).json({
        success: false,
        message: `CSV parse error: ${e instanceof Error ? e.message : String(e)}`,
      });
      return;
    }

    const previewRows: PreviewRow[] = records.map((row) => {
      const date = row.date || row.Date || row.transaction_date || '';
      const description =
        row.description || row.Description || row.narration || row.remarks || '';
      const amountStr = row.amount || row.Amount || '';
      const typeStr = (row.type || row.Type || '').toUpperCase();

      const errors: string[] = [];
      if (!date || isNaN(new Date(date).getTime())) errors.push('invalid date');
      const amt = Number(amountStr);
      if (!Number.isFinite(amt) || amt === 0) errors.push('invalid amount');

      let inferredType: 'DEPOSIT' | 'WITHDRAWAL' = 'DEPOSIT';
      if (typeStr === 'WITHDRAWAL' || typeStr === 'DEBIT' || amt < 0) {
        inferredType = 'WITHDRAWAL';
      }

      return {
        date,
        description,
        amount: Math.abs(amt) || 0,
        type: inferredType,
        ...(errors.length ? { error: errors.join('; ') } : {}),
      };
    });

    res.json({
      success: true,
      data: {
        previewRows,
        validCount: previewRows.filter((r) => !r.error).length,
        invalidCount: previewRows.filter((r) => r.error).length,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction importPreview error:', err);
    res.status(500).json({ success: false, message: 'Failed to parse CSV' });
  }
}

// =============================================================================
// importConfirm — bulk insert reviewed rows, maintain running balance
// =============================================================================

export async function importConfirm(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const body = req.body as {
      bankAccountId?: string;
      rows?: Array<{
        date: string;
        description: string;
        amount: number;
        type: 'DEPOSIT' | 'WITHDRAWAL';
      }>;
    };

    if (!body.bankAccountId || !Array.isArray(body.rows) || body.rows.length === 0) {
      res.status(400).json({
        success: false,
        message: 'bankAccountId + non-empty rows[] required',
      });
      return;
    }

    const account = await prisma.bankDetail.findFirst({
      where: { id: body.bankAccountId, userId, isDeleted: false },
    });
    if (!account) {
      res.status(404).json({ success: false, message: 'Bank account not found' });
      return;
    }

    let runningBalance = new Prisma.Decimal(
      (account.currentBalance ?? new Prisma.Decimal(0)).toString(),
    );

    const created = await prisma.$transaction(async (tx) => {
      const pm = await getOrCreateDefaultPaymentMode(tx);
      const out: Array<{ id: string }> = [];
      for (const row of body.rows!) {
        const amount = new Prisma.Decimal(row.amount);
        const before = runningBalance;
        const isDebit = row.type === 'WITHDRAWAL';
        const after = isDebit ? before.minus(amount) : before.plus(amount);
        runningBalance = after;

        const t = await tx.bankTransaction.create({
          data: {
            bankAccountId: body.bankAccountId!,
            transactionDate: new Date(row.date),
            type: row.type === 'WITHDRAWAL' ? 'WITHDRAWAL' : 'DEPOSIT',
            amount,
            balanceBefore: before,
            balanceAfter: after,
            paymentModeId: pm.id,
            referenceNo: '',
            remarks: row.description,
            relatedType: 'MANUAL',
            relatedId: null,
          },
        });
        out.push({ id: t.id });
      }
      await tx.bankDetail.update({
        where: { id: body.bankAccountId! },
        data: { currentBalance: runningBalance },
      });
      return out;
    });

    res.status(201).json({
      success: true,
      message: `${created.length} bank transactions imported`,
      data: { ids: created.map((c) => c.id) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction importConfirm error:', err);
    res.status(500).json({ success: false, message: 'Failed to import bank transactions' });
  }
}

// =============================================================================
// suggestMatches — return ranked candidate matches for an unreconciled bank txn
// =============================================================================

export async function suggestMatches(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const txn = await prisma.bankTransaction.findFirst({
      where: {
        id,
        bankAccount: { userId, isDeleted: false },
        isDeleted: false,
        isReconciled: false,
      },
    });
    if (!txn) {
      res
        .status(404)
        .json({ success: false, message: 'Bank transaction not found or already reconciled' });
      return;
    }

    const txnAmount = Number(txn.amount);
    const isInbound =
      txn.type === 'DEPOSIT' || txn.type === 'TRANSFER_IN' || txn.type === 'RECEIPT';

    let candidates: MatchCandidate[] = [];

    if (isInbound) {
      // Match against InvoicePayments (customer payments incoming)
      const payments = await prisma.invoicePayment.findMany({
        where: {
          invoice: { userId, isDeleted: false },
          paymentTransactionId: null, // not already linked to a gateway txn
        },
        include: {
          invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: { received_on: 'desc' },
        take: 100,
      });
      candidates = payments.map((p) => ({
        id: p.id,
        kind: 'INVOICE_PAYMENT' as const,
        amount: Number(p.amount),
        date: p.received_on,
        reference: p.notes ?? '',
        parentLabel: p.invoice?.invoiceNumber ?? p.invoiceId,
      }));
    } else {
      // Match against SupplierPayments (outgoing payments to vendors)
      const payments = await prisma.supplierPayment.findMany({
        where: { createdBy: userId, isDeleted: false },
        include: {
          purchase: { select: { id: true, purchaseId: true } },
        },
        orderBy: { paymentDate: 'desc' },
        take: 100,
      });
      candidates = payments.map((p) => ({
        id: p.id,
        kind: 'SUPPLIER_PAYMENT' as const,
        amount: Number(p.paidAmount ?? p.amount),
        date: p.paymentDate,
        reference: p.referenceNumber ?? '',
        parentLabel: p.purchase?.purchaseId ?? p.purchaseId,
      }));
    }

    const matches = matchBankTransaction({
      txnAmount,
      txnDate: txn.transactionDate,
      txnReference: txn.referenceNo ?? '',
      candidates,
    });

    res.json({
      success: true,
      data: {
        bankTransactionId: txn.id,
        matches: matches.slice(0, 10).map((m) => ({
          candidateId: m.candidate.id,
          kind: m.candidate.kind,
          amount: m.candidate.amount,
          date: m.candidate.date,
          reference: m.candidate.reference,
          parentLabel: m.candidate.parentLabel,
          score: m.score,
          reasons: m.reasons,
        })),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction suggestMatches error:', err);
    res.status(500).json({ success: false, message: 'Failed to suggest matches' });
  }
}

// =============================================================================
// link — mark a bank transaction as reconciled against a payment candidate
// =============================================================================

export async function link(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      relatedType?: 'INVOICE_PAYMENT' | 'SUPPLIER_PAYMENT';
      relatedId?: string;
      note?: string;
    };

    if (!body.relatedType || !body.relatedId) {
      res
        .status(400)
        .json({ success: false, message: 'relatedType + relatedId required' });
      return;
    }

    const txn = await prisma.bankTransaction.findFirst({
      where: { id, bankAccount: { userId, isDeleted: false }, isDeleted: false },
    });
    if (!txn) {
      res.status(404).json({ success: false, message: 'Bank transaction not found' });
      return;
    }

    const updated = await prisma.bankTransaction.update({
      where: { id },
      data: {
        relatedType: body.relatedType,
        relatedId: body.relatedId,
        isReconciled: true,
        reconciledBy: userId,
        reconciliationDate: new Date(),
        reconciliationNote: body.note ?? null,
      },
    });

    res.json({
      success: true,
      message: 'Linked + reconciled',
      data: { bankTransaction: { ...updated } },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction link error:', err);
    res.status(500).json({ success: false, message: 'Failed to link' });
  }
}

// =============================================================================
// unlink — reset reconciliation state back to MANUAL/unreconciled
// =============================================================================

export async function unlink(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { id } = req.params as { id: string };

    const txn = await prisma.bankTransaction.findFirst({
      where: { id, bankAccount: { userId, isDeleted: false }, isDeleted: false },
    });
    if (!txn) {
      res.status(404).json({ success: false, message: 'Bank transaction not found' });
      return;
    }

    const updated = await prisma.bankTransaction.update({
      where: { id },
      data: {
        relatedType: 'MANUAL',
        relatedId: null,
        isReconciled: false,
        reconciledBy: null,
        reconciliationDate: null,
        reconciliationNote: null,
      },
    });

    res.json({
      success: true,
      message: 'Unlinked',
      data: { bankTransaction: { ...updated } },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bankTransaction unlink error:', err);
    res.status(500).json({ success: false, message: 'Failed to unlink' });
  }
}

// CommonJS interop for adminRoutes.js which uses `require(...)`.
const handlers = {
  list,
  getById,
  create,
  remove,
  importPreview,
  importConfirm,
  suggestMatches,
  link,
  unlink,
};
module.exports = handlers;
module.exports.default = handlers;
