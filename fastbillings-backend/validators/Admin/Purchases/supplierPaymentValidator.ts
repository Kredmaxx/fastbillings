import { body } from 'express-validator';
import type { ValidationChain } from 'express-validator';

import { prisma } from '../../../lib/prisma';

export const supplierPaymentValidator: ValidationChain[] = [
  body('purchaseId')
    .notEmpty()
    .withMessage('Purchase ID is required')
    .bail()
    .custom(async (value: string) => {
      const exists = await prisma.purchase.findUnique({
        where: { id: value },
        select: { id: true },
      });
      if (!exists) throw new Error('Purchase not found');
      return true;
    }),

  body('supplierId')
    .notEmpty()
    .withMessage('Supplier ID is required')
    .bail()
    .custom(async (value: string) => {
      const exists = await prisma.user.findUnique({
        where: { id: value },
        select: { id: true },
      });
      if (!exists) throw new Error('Supplier not found');
      return true;
    }),

  body('paymentDate')
    .notEmpty()
    .withMessage('Payment date is required')
    .bail()
    .isISO8601()
    .withMessage('Invalid date format')
    .toDate(),

  body('amount')
    .notEmpty()
    .withMessage('Amount is required')
    .bail()
    .isNumeric()
    .withMessage('Amount must be a number')
    .toFloat(),

  body('paidAmount')
    .notEmpty()
    .withMessage('Paid amount is required')
    .bail()
    .isNumeric()
    .withMessage('Paid amount must be a number')
    .toFloat(),

  body('dueAmount')
    .notEmpty()
    .withMessage('Due amount is required')
    .bail()
    .isNumeric()
    .withMessage('Due amount must be a number')
    .toFloat(),

  // Optional fields
  body('referenceNumber').optional().isString(),
  body('notes').optional().isString(),
  body('attachment').optional().isString(),
];

// CommonJS interop for legacy JS routes
module.exports = {
  supplierPaymentValidator,
};
module.exports.supplierPaymentValidator = supplierPaymentValidator;
