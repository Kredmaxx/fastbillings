import type { Expense } from '@prisma/client';

import { prisma } from './prisma';
import { getNextRecurringDate } from './recurringInvoiceRunner';

interface CloneResult {
  source: Expense;
  newExpenseId: string;
}

export async function runRecurringForExpense(expenseId: string): Promise<CloneResult> {
  return await prisma.$transaction(async (tx) => {
    const source = await tx.expense.findFirst({
      where: { id: expenseId, isRecurring: true, isDeleted: false },
    });
    if (!source) throw new Error('SOURCE_NOT_FOUND');
    if (source.stopped) throw new Error('SOURCE_STOPPED');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const {
      id: _id,
      createdAt: _ca,
      updatedAt: _ua,
      parentExpense: _pe,
      lastRecurringDate: _lr,
      nextRecurringDate: _nr,
      ...rest
    } = source;

    const created = await tx.expense.create({
      data: {
        ...rest,
        parentExpense: source.id,
        expenseDate: today,
        isRecurring: false,
        lastRecurringDate: null,
        nextRecurringDate: null,
      },
    });

    await tx.expense.update({
      where: { id: source.id },
      data: {
        lastRecurringDate: today,
        nextRecurringDate: getNextRecurringDate(today, source),
      },
    });

    return { source, newExpenseId: created.id };
  });
}

export async function runDueRecurringExpenses(): Promise<{
  processed: number;
  successes: string[];
  failures: Array<{ id: string; error: string }>;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = await prisma.expense.findMany({
    where: {
      isRecurring: true,
      isDeleted: false,
      stopped: false,
      parentExpense: null,
      nextRecurringDate: { lte: today },
      OR: [
        { neverExpire: true },
        { endsOn: null },
        { endsOn: { gte: today } },
      ],
    },
    select: { id: true, referenceNo: true },
  });

  const successes: string[] = [];
  const failures: Array<{ id: string; error: string }> = [];

  for (const exp of due) {
    try {
      const out = await runRecurringForExpense(exp.id);
      successes.push(`${exp.referenceNo ?? exp.id} → ${out.newExpenseId}`);
    } catch (err) {
      failures.push({ id: exp.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed: due.length, successes, failures };
}
