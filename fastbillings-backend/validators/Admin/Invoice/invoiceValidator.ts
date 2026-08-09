import { body, param, ValidationChain } from 'express-validator';

export const createInvoiceValidator: ValidationChain[] = [
  body('invoiceDate')
    .notEmpty().withMessage('Invoice date is required')
    .isISO8601().withMessage('Invalid date format'),

  body('items')
    .isArray({ min: 1 }).withMessage('At least one item is required'),

  body('billFrom')
    .notEmpty().withMessage('Bill from is required'),

  body('billTo')
    .notEmpty().withMessage('Bill to is required'),
];

// Existence/ownership is enforced in the controller with tenant scope — do not
// probe invoices by bare id here (global findUnique was an existence oracle).
export const updateInvoiceValidator: ValidationChain[] = [
  param('id').notEmpty().withMessage('Invoice ID is required'),

  ...createInvoiceValidator,
];

// CommonJS interop for legacy JS routes
module.exports = { createInvoiceValidator, updateInvoiceValidator };
module.exports.createInvoiceValidator = createInvoiceValidator;
module.exports.updateInvoiceValidator = updateInvoiceValidator;
