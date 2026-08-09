require('dotenv').config();
const cron = require('node-cron');
const { prisma } = require('./lib/prisma');
const { sendMail, isMailConfigured, envSmtpFrom } = require('./utils/mailer');
const { replaceInvoicePlaceholders } = require('./utils/placeholderHelperPrisma');

function calculateTargetDate(referenceDate, days, timing) {
  const targetDate = new Date(referenceDate);
  const n = Number(days) || 0;
  if (timing === 'before') {
    targetDate.setDate(targetDate.getDate() - n);
  } else {
    targetDate.setDate(targetDate.getDate() + n);
  }
  return targetDate;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function alreadySentToday(lastSent) {
  if (!lastSent) return false;
  return startOfDay(lastSent).getTime() === startOfDay(new Date()).getTime();
}

async function sendReminderEmail(reminder, invoice, customer) {
  if (!customer?.email) {
    console.log(`[invoice-reminder] skip ${invoice.invoiceNumber} — no customer email`);
    return false;
  }

  const emailConfig = reminder.emailConfig || {};
  const subject = await replaceInvoicePlaceholders(
    emailConfig.subject || `Payment reminder: ${invoice.invoiceNumber}`,
    invoice,
  );
  const body = await replaceInvoicePlaceholders(
    emailConfig.body || `<p>Dear %CustomerName%, your invoice %InvoiceNumber% for %Total% is due on %DueDate%.</p>`,
    invoice,
  );

  await sendMail({
    from: emailConfig.fromEmail || envSmtpFrom(),
    to: customer.email,
    cc: emailConfig.cc,
    bcc: emailConfig.bcc,
    subject,
    html: body,
    tenantId: invoice.tenantId || reminder.tenantId || null,
    userId: invoice.userId || reminder.createdBy || null,
  });

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { lastSent: new Date() },
  });
  console.log(`[invoice-reminder] sent ${invoice.invoiceNumber} → ${customer.email}`);
  return true;
}

function invoiceMatchesCriteria(invoice, reminder) {
  if (['PAID', 'CANCELLED', 'DRAFT'].includes(invoice.status)) return false;

  let referenceDate;
  switch (reminder.remindEvent) {
    case 'due_date':
      referenceDate = invoice.dueDate;
      break;
    case 'invoice_date':
      referenceDate = invoice.invoiceDate;
      break;
    default:
      return false;
  }
  if (!referenceDate) return false;

  const target = startOfDay(
    calculateTargetDate(referenceDate, reminder.remindDays, reminder.remindTiming || 'after'),
  );
  return target.getTime() === startOfDay(new Date()).getTime();
}

async function runReminderCron() {
  console.log(`[invoice-reminder] run at ${new Date().toISOString()}`);

  try {
    if (!(await isMailConfigured())) {
      console.log('[invoice-reminder] skipped — email not configured');
      return;
    }

    const reminders = await prisma.reminder.findMany({
      where: {
        type: { in: ['automatic', 'automatic_Purchase'] },
        isEnabled: true,
        status: 'active',
      },
    });

    if (reminders.length === 0) {
      console.log('[invoice-reminder] no active automatic reminders');
      return;
    }

    for (const reminder of reminders) {
      try {
        if (alreadySentToday(reminder.lastSent)) {
          console.log(`[invoice-reminder] "${reminder.name}" already sent today, skip`);
          continue;
        }

        const invoices = await prisma.invoice.findMany({
          where: {
            isDeleted: false,
            status: { in: ['UNPAID', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
            ...(reminder.tenantId
              ? { tenantId: reminder.tenantId }
              : { userId: reminder.createdBy }),
          },
          include: {
            customer: { select: { id: true, name: true, email: true } },
            billToCustomer: { select: { id: true, name: true, email: true } },
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            billFromUser: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        });

        let sent = 0;
        for (const invoice of invoices) {
          if (!invoiceMatchesCriteria(invoice, reminder)) continue;
          const customer = invoice.customer || invoice.billToCustomer;
          if (!customer) continue;
          const ok = await sendReminderEmail(reminder, invoice, customer);
          if (ok) sent += 1;
        }
        console.log(`[invoice-reminder] "${reminder.name}" sent ${sent}`);
      } catch (err) {
        console.error(`[invoice-reminder] error on "${reminder.name}":`, err.message);
      }
    }

    console.log('[invoice-reminder] completed');
  } catch (error) {
    console.error('[invoice-reminder] fatal:', error);
  }
}

cron.schedule('0 9 * * *', runReminderCron);
console.log('[invoice-reminder] scheduled daily 09:00');

module.exports = { runReminderCron };
