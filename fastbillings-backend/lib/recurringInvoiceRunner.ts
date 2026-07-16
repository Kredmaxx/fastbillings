import type {
  Invoice,
  RecurrenceFrequency,
  RecurrenceCustomIntervalType,
  Prisma,
} from '@prisma/client';

import { prisma } from './prisma';

export type RecurringInvoiceCadence = Pick<
  Invoice,
  'repeatEvery' | 'customIntervalNumber' | 'customIntervalType'
>;

/**
 * Pure: compute the next recurrence date.
 * Day/week/month/year add the natural unit. Custom uses customIntervalNumber + customIntervalType.
 */
export function getNextRecurringDate(currentDate: Date, cadence: RecurringInvoiceCadence): Date {
  const newDate = new Date(currentDate);
  let interval = 1;
  let type: RecurrenceFrequency | RecurrenceCustomIntervalType = cadence.repeatEvery ?? 'month';

  if (cadence.repeatEvery === 'custom') {
    interval = cadence.customIntervalNumber ?? 1;
    type = cadence.customIntervalType ?? 'month';
  }

  switch (type) {
    case 'day':
      newDate.setDate(newDate.getDate() + interval);
      break;
    case 'week':
      newDate.setDate(newDate.getDate() + 7 * interval);
      break;
    case 'month':
      newDate.setMonth(newDate.getMonth() + interval);
      break;
    case 'year':
      newDate.setFullYear(newDate.getFullYear() + interval);
      break;
    default:
      newDate.setMonth(newDate.getMonth() + interval);
  }

  return newDate;
}

interface CloneResult {
  source: Invoice;
  newInvoiceId: string;
  newInvoiceNumber: string | null;
}

export async function runRecurringForInvoice(invoiceId: string): Promise<CloneResult> {
  return await prisma.$transaction(async (tx) => {
    const source = await tx.invoice.findFirst({
      where: { id: invoiceId, isRecurring: true, isDeleted: false },
    });
    if (!source) throw new Error('SOURCE_NOT_FOUND');
    if (source.stopped) throw new Error('SOURCE_STOPPED');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const prefixSetting = await tx.generalSetting.findFirst({
      where: { tenantId: source.tenantId, key: 'invoicePrefix' },
    });
    const prefix =
      prefixSetting && typeof prefixSetting.value === 'string' ? prefixSetting.value : 'INV-';
    const lastInvoice = await tx.invoice.findFirst({
      where: { tenantId: source.tenantId, invoiceNumber: { not: null }, invoiceType: 'INVOICE' },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });
    let lastNumber = 0;
    if (lastInvoice?.invoiceNumber) {
      const m = lastInvoice.invoiceNumber.match(/\d+$/);
      if (m) lastNumber = parseInt(m[0], 10);
    }
    const newInvoiceNumber = `${prefix}${String(lastNumber + 1).padStart(6, '0')}`;

    const {
      id: _id,
      createdAt: _ca,
      updatedAt: _ua,
      invoiceNumber: _in,
      parentInvoice: _pi,
      convertedFromId: _cf,
      convertedAt: _cAt,
      lastRecurringDate: _lr,
      nextRecurringDate: _nr,
      ...rest
    } = source;

    const newDue = source.dueDate
      ? getNextRecurringDate(source.dueDate, source)
      : getNextRecurringDate(today, source);

    const created = await tx.invoice.create({
      data: {
        ...rest,
        items: (rest.items ?? null) as Prisma.InputJsonValue,
        invoiceNumber: newInvoiceNumber,
        parentInvoice: source.id,
        invoiceDate: today,
        dueDate: newDue,
        status: 'UNPAID',
        isRecurring: false,
        lastRecurringDate: null,
        nextRecurringDate: null,
      },
    });

    await tx.invoice.update({
      where: { id: source.id },
      data: {
        lastRecurringDate: today,
        nextRecurringDate: getNextRecurringDate(today, source),
      },
    });

    return { source, newInvoiceId: created.id, newInvoiceNumber: created.invoiceNumber };
  });
}

export async function runDueRecurringInvoices(): Promise<{
  processed: number;
  successes: string[];
  failures: Array<{ id: string; error: string }>;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = await prisma.invoice.findMany({
    where: {
      isRecurring: true,
      isDeleted: false,
      stopped: false,
      parentInvoice: null,
      nextRecurringDate: { lte: today },
      OR: [{ neverExpire: true }, { endsOn: null }, { endsOn: { gte: today } }],
    },
    select: { id: true, invoiceNumber: true },
  });

  const successes: string[] = [];
  const failures: Array<{ id: string; error: string }> = [];

  for (const inv of due) {
    try {
      const out = await runRecurringForInvoice(inv.id);
      successes.push(`${inv.invoiceNumber ?? inv.id} → ${out.newInvoiceNumber}`);
    } catch (err) {
      failures.push({ id: inv.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed: due.length, successes, failures };
}
