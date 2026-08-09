// Prisma-backed placeholder replacement for reminder crons (no Mongo).
const { prisma } = require('../lib/prisma');

function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function money(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

function applyMap(template, map) {
  if (!template) return template;
  let result = String(template);
  for (const [key, value] of Object.entries(map)) {
    result = result.split(key).join(value == null ? '' : String(value));
  }
  return result;
}

/**
 * @param {string} template
 * @param {object} invoice Prisma invoice with customer / user relations
 */
async function replaceInvoicePlaceholders(template, invoice) {
  if (!template || !invoice) return template;

  const payments = await prisma.invoicePayment.findMany({
    where: { invoiceId: invoice.id },
    select: { amount: true },
  });
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const total = Number(invoice.TotalAmount || 0);
  const balance = total - totalPaid;
  const overdueDays = invoice.dueDate
    ? Math.max(0, Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000))
    : 0;

  const customer = invoice.customer || invoice.billToCustomer;
  const createdBy = invoice.user || invoice.billFromUser;
  const createdByName = createdBy
    ? `${createdBy.firstName || ''} ${createdBy.lastName || ''}`.trim() || createdBy.email || ''
    : '';

  const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';

  return applyMap(template, {
    '%CustomerName%': customer?.name || '',
    '%CustomerEmail%': customer?.email || '',
    '%InvoiceNumber%': invoice.invoiceNumber || '',
    '%InvoiceDate%': formatDate(invoice.invoiceDate),
    '%DueDate%': formatDate(invoice.dueDate),
    '%OverdueDays%': String(overdueDays),
    '%Balance%': money(balance),
    '%Total%': money(total),
    '%Subject%': invoice.referenceNo || '',
    '%ReferenceNo%': invoice.referenceNo || '',
    '%Vat%': money(invoice.vat),
    '%TotalDiscount%': money(invoice.totalDiscount),
    '%TaxableAmount%': money(invoice.taxableAmount),
    '%CreatedBy%': createdByName,
    '%InvoiceUrl%': `${baseUrl}/admin/view-invoice/${invoice.id}`,
    '%PaymentLink%': `${baseUrl}/pay/${invoice.id}`,
  });
}

/**
 * @param {string} template
 * @param {object} quotation Prisma quotation with customer relations
 */
function replaceQuotationPlaceholders(template, quotation) {
  if (!template || !quotation) return template;

  const customer = quotation.customer || quotation.billToCustomer;
  const createdBy = quotation.user || quotation.billFromUser;
  const createdByName = createdBy
    ? `${createdBy.firstName || ''} ${createdBy.lastName || ''}`.trim() || createdBy.email || ''
    : '';
  const baseUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:3000';
  const total = Number(quotation.TotalAmount || 0);

  return applyMap(template, {
    '%CustomerName%': customer?.name || '',
    '%CustomerEmail%': customer?.email || '',
    '%QuotationNumber%': quotation.quotationId || '',
    '%InvoiceNumber%': quotation.quotationId || '',
    '%QuotationDate%': formatDate(quotation.quotationDate),
    '%InvoiceDate%': formatDate(quotation.quotationDate),
    '%ExpiryDate%': formatDate(quotation.expiryDate),
    '%DueDate%': formatDate(quotation.expiryDate),
    '%Total%': money(total),
    '%Balance%': money(total),
    '%ReferenceNo%': quotation.referenceNo || '',
    '%CreatedBy%': createdByName,
    '%QuotationUrl%': `${baseUrl}/admin/view-quotation/${quotation.id}`,
    '%InvoiceUrl%': `${baseUrl}/admin/view-quotation/${quotation.id}`,
  });
}

module.exports = {
  replaceInvoicePlaceholders,
  replaceQuotationPlaceholders,
};
