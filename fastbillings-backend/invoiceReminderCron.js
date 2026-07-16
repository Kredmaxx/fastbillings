require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const Invoice = require('./models/Invoice');
const Reminder = require('./models/Reminder');
const Customer = require('./models/Customer');
const User = require('./models/User');
const InvoicePayment = require('./models/InvoicePayment');
const { sendMail } = require('./utils/mailer');
const { replacePlaceholders, replaceSubjectPlaceholders } = require('./utils/placeholderHelper');

// Check if already connected to MongoDB (if called from server.js)
const initializeCron = () => {
  // Mongo is optional/legacy — skip when no MONGO_URI is configured
  // (PostgreSQL/Prisma is the primary store). Avoids a noisy connect error.
  if (!process.env.MONGO_URI) {
    return;
  }
  if (mongoose.connection.readyState === 0) {
    // Not connected, connect now
    mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    .then(() => console.log('MongoDB connected for Invoice Reminder Cron'))
    .catch(err => console.error('MongoDB connection error:', err));
  } else {
    console.log('Using existing MongoDB connection for Invoice Reminder Cron');
  }
};

initializeCron();

/**
 * Calculate the target date based on reminder configuration
 * @param {Date} referenceDate - The base date (due date, invoice date, etc.)
 * @param {Number} days - Number of days to add/subtract
 * @param {String} timing - 'before' or 'after'
 * @returns {Date} - Calculated target date
 */
const calculateTargetDate = (referenceDate, days, timing) => {
  const targetDate = new Date(referenceDate);
  if (timing === 'before') {
    targetDate.setDate(targetDate.getDate() - days);
  } else {
    targetDate.setDate(targetDate.getDate() + days);
  }
  return targetDate;
};

/**
 * Send reminder email to customer
 * @param {Object} reminder - Reminder document
 * @param {Object} invoice - Invoice document
 * @param {Object} customer - Customer document
 */
const sendReminderEmail = async (reminder, invoice, customer) => {
  try {
    // Skip if no customer email
    if (!customer.email) {
      console.log(`Skipping invoice ${invoice.invoiceNumber} - No customer email`);
      return;
    }

    // Populate necessary fields if not already populated
    if (!invoice.customerId || typeof invoice.customerId === 'string') {
      await invoice.populate('customerId', 'name email');
    }
    if (!invoice.billTo || typeof invoice.billTo === 'string') {
      await invoice.populate('billTo', 'name email');
    }
    if (!invoice.userId || typeof invoice.userId === 'string') {
      await invoice.populate('userId', 'firstName lastName email');
    }
    if (!invoice.billFrom || typeof invoice.billFrom === 'string') {
      await invoice.populate('billFrom', 'firstName lastName email');
    }

    // Replace placeholders in subject and body
    const subject = await replaceSubjectPlaceholders(reminder.emailConfig.subject, invoice);
    const body = await replacePlaceholders(reminder.emailConfig.body, invoice);

    // Prepare email options
    const mailOptions = {
      from: reminder.emailConfig.fromEmail || process.env.SMTP_EMAIL,
      to: customer.email,
      cc: reminder.emailConfig.cc,
      bcc: reminder.emailConfig.bcc,
      subject: subject,
      html: body
    };

    // Send email
    await sendMail(mailOptions);
    console.log(`Reminder email sent successfully for invoice ${invoice.invoiceNumber} to ${customer.email}`);

    // Update reminder last sent date
    reminder.lastSent = new Date();
    await reminder.save();

  } catch (error) {
    console.error(`Error sending reminder email for invoice ${invoice.invoiceNumber}:`, error.message);
  }
};

/**
 * Check if invoice matches reminder criteria
 * @param {Object} invoice - Invoice document
 * @param {Object} reminder - Reminder document
 * @returns {Boolean} - True if invoice matches criteria
 */
const invoiceMatchesCriteria = async (invoice, reminder) => {
  // Skip if invoice is paid or cancelled
  if (['PAID', 'CANCELLED'].includes(invoice.status)) {
    return false;
  }

  // Skip if no due date
  if (!invoice.dueDate) {
    return false;
  }

  // Get reference date based on remindEvent
  let referenceDate;
  switch (reminder.remindEvent) {
    case 'due_date':
      referenceDate = invoice.dueDate;
      break;
    case 'invoice_date':
      referenceDate = invoice.invoiceDate;
      break;
    case 'payment_date':
      // For payment date, we'd need to track last payment date
      // For now, skip this type
      return false;
    default:
      return false;
  }

  // Calculate target date
  const targetDate = calculateTargetDate(referenceDate, reminder.remindDays, reminder.remindTiming);
  
  // Round to start of day for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  // Check if today matches the target date
  return target.getTime() === today.getTime();
};

/**
 * Main cron job function
 */
const runReminderCron = async () => {
  console.log(`Running invoice reminder cron at ${new Date().toISOString()}`);

  try {
    // Get all active automatic reminders
    const reminders = await Reminder.find({
      type: { $in: ['automatic', 'automatic_Purchase'] },
      isEnabled: true,
      status: 'active'
    });

    if (reminders.length === 0) {
      console.log('No active automatic reminders found');
      return;
    }

    console.log(`Found ${reminders.length} active reminder(s)`);

    // Process each reminder
    for (const reminder of reminders) {
      try {
        // Get invoices that match the reminder criteria
        const invoices = await Invoice.find({
          status: { $in: ['UNPAID', 'SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
          isDeleted: false
        })
        .populate('customerId', 'name email')
        .populate('billTo', 'name email')
        .populate('userId', 'firstName lastName email')
        .populate('billFrom', 'firstName lastName email');

        console.log(`Processing reminder "${reminder.name}" - Found ${invoices.length} invoices`);

        // Filter invoices that match criteria
        const matchingInvoices = [];
        for (const invoice of invoices) {
          const matches = await invoiceMatchesCriteria(invoice, reminder);
          if (matches) {
            matchingInvoices.push(invoice);
          }
        }

        console.log(`Found ${matchingInvoices.length} matching invoice(s) for reminder "${reminder.name}"`);

        // Send reminders for matching invoices
        for (const invoice of matchingInvoices) {
          // Get customer
          const customer = invoice.customerId || invoice.billTo;
          if (!customer) {
            console.log(`Skipping invoice ${invoice.invoiceNumber} - No customer found`);
            continue;
          }

          // Check if we already sent today (optional - you can remove this check)
          const lastSent = reminder.lastSent;
          if (lastSent) {
            const lastSentDate = new Date(lastSent);
            lastSentDate.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (lastSentDate.getTime() === today.getTime()) {
              console.log(`Reminder "${reminder.name}" already sent today, skipping`);
              continue;
            }
          }

          // Send reminder email
          await sendReminderEmail(reminder, invoice, customer);
        }

      } catch (error) {
        console.error(`Error processing reminder "${reminder.name}":`, error.message);
      }
    }

    console.log('Invoice reminder cron completed successfully');

  } catch (error) {
    console.error('Error in invoice reminder cron:', error);
  }
};

// Cron job - runs every day at 9:00 AM
// Syntax: minute hour day month day-of-week
cron.schedule('0 9 * * *', runReminderCron);

// Also run immediately when server starts (for testing)
console.log('Invoice reminder cron job scheduled (runs daily at 9:00 AM)');

// Export for manual testing via API
module.exports = { runReminderCron };

// For testing purposes, you can call runReminderCron() immediately
// runReminderCron();

