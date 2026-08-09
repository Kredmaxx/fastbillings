require('dotenv').config();
const cron = require('node-cron');
const { prisma } = require('./lib/prisma');
const { sendMail, isMailConfigured, envSmtpFrom } = require('./utils/mailer');
const { replaceQuotationPlaceholders } = require('./utils/placeholderHelperPrisma');

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

async function sendQuotationReminderEmail(reminder, quotation, customer) {
  if (!customer?.email) {
    console.log(`[quotation-reminder] skip ${quotation.quotationId} — no customer email`);
    return false;
  }

  const emailConfig = reminder.emailConfig || {};
  const subject = replaceQuotationPlaceholders(
    emailConfig.subject || `Quotation reminder: ${quotation.quotationId}`,
    quotation,
  );
  const body = replaceQuotationPlaceholders(
    emailConfig.body ||
      `<p>Dear %CustomerName%, please review quotation %QuotationNumber% (total %Total%), valid until %ExpiryDate%.</p>`,
    quotation,
  );

  await sendMail({
    from: emailConfig.fromEmail || envSmtpFrom(),
    to: customer.email,
    cc: emailConfig.cc,
    bcc: emailConfig.bcc,
    subject,
    html: body,
    tenantId: quotation.tenantId || reminder.tenantId || null,
    userId: quotation.userId || reminder.createdBy || null,
  });

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { lastSent: new Date() },
  });
  console.log(`[quotation-reminder] sent ${quotation.quotationId} → ${customer.email}`);
  return true;
}

function quotationMatchesCriteria(quotation, reminder) {
  if (quotation.isDeleted) return false;
  if (quotation.status === 'accepted' || quotation.status === 'declined') return false;

  let referenceDate;
  switch (reminder.remindEvent) {
    case 'quotation_date':
      referenceDate = quotation.quotationDate;
      break;
    case 'expiry_date':
      referenceDate = quotation.expiryDate;
      break;
    // Fall back for misconfigured invoice-style events on quotation reminders
    case 'due_date':
      referenceDate = quotation.expiryDate;
      break;
    case 'invoice_date':
      referenceDate = quotation.quotationDate;
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

async function runQuotationReminderCron() {
  console.log(`[quotation-reminder] run at ${new Date().toISOString()}`);

  try {
    if (!(await isMailConfigured())) {
      console.log('[quotation-reminder] skipped — email not configured');
      return;
    }

    const reminders = await prisma.reminder.findMany({
      where: {
        type: { in: ['automatic', 'automatic_quotation'] },
        isEnabled: true,
        status: 'active',
      },
    });

    if (reminders.length === 0) {
      console.log('[quotation-reminder] no active automatic quotation reminders');
      return;
    }

    for (const reminder of reminders) {
      try {
        if (alreadySentToday(reminder.lastSent)) {
          console.log(`[quotation-reminder] "${reminder.name}" already sent today, skip`);
          continue;
        }

        const quotations = await prisma.quotation.findMany({
          where: {
            isDeleted: false,
            status: { in: ['draft', 'sent'] },
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
        for (const quotation of quotations) {
          if (!quotationMatchesCriteria(quotation, reminder)) continue;
          const customer = quotation.billToCustomer || quotation.customer;
          if (!customer) continue;
          const ok = await sendQuotationReminderEmail(reminder, quotation, customer);
          if (ok) sent += 1;
        }
        console.log(`[quotation-reminder] "${reminder.name}" sent ${sent}`);
      } catch (err) {
        console.error(`[quotation-reminder] error on "${reminder.name}":`, err.message);
      }
    }

    console.log('[quotation-reminder] completed');
  } catch (err) {
    console.error('[quotation-reminder] fatal:', err);
  }
}

cron.schedule('30 9 * * *', runQuotationReminderCron);
console.log('[quotation-reminder] scheduled daily 09:30');

module.exports = { runQuotationReminderCron };
