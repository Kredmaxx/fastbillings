import { body, ValidationChain } from 'express-validator';

export const purchaseOrderValidator: ValidationChain[] = [
  body('orderDate')
    .notEmpty().withMessage('order date is required')
    .isISO8601().withMessage('Invalid date format')
    .toDate(),

  body('items')
    .isArray({ min: 1 }).withMessage('At least one item is required'),

  // body('items.*.name')
  //   .notEmpty().withMessage('Item name is required')
  //   .isString().withMessage('Item name must be a string'),

  body('items.*.id')
    .notEmpty().withMessage('Product ID is required'),

  body('items.*.qty')
    .notEmpty().withMessage('Quantity is required')
    .isNumeric().withMessage('Quantity must be a number')
    .toFloat(),

  body('items.*.rate')
    .notEmpty().withMessage('Rate is required')
    .isNumeric().withMessage('Rate must be a number')
    .toFloat(),

  // body('paymentMode')
  //   .notEmpty().withMessage('Payment mode is required')
  //   .isIn(['CASH', 'CREDIT', 'CHECK', 'BANK_TRANSFER', 'OTHER'])
  //   .withMessage('Invalid payment mode'),

  body('userId')
    .notEmpty().withMessage('User ID is required'),

  body('billFrom')
    .notEmpty().withMessage('Bill from user ID is required'),

  body('billTo')
    .notEmpty().withMessage('Bill to user ID is required'),

  // Optional fields
  body('referenceNo').optional().isString(),
  body('notes').optional().isString(),
  body('termsAndCondition').optional().isString(),
  body('sign_type').optional().isIn(['manualSignature', 'digitalSignature', 'none']),
  body('signatureId').optional().isString(),
  body('bank').optional().isString(),
  body('convert_type').optional().isIn(['purchase', 'estimate', 'invoice']),
];

// Update validator - makes most fields optional
export const updatePurchaseOrderValidator: ValidationChain[] = [
  body('vendorId')
    .optional()
    .isString().withMessage('Invalid Vendor ID format'),

  body('dueDate')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .toDate(),

  body('items')
    .optional()
    .isArray({ min: 1 }).withMessage('At least one item is required'),

  body('items.*.name')
    .optional()
    .isString().withMessage('Item name must be a string'),

  body('items.*.productId')
    .optional()
    .isString().withMessage('Invalid Product ID format'),

  body('items.*.quantity')
    .optional()
    .isNumeric().withMessage('Quantity must be a number')
    .toFloat(),

  body('items.*.rate')
    .optional()
    .isNumeric().withMessage('Rate must be a number')
    .toFloat(),

  body('items.*.discount')
    .optional()
    .isNumeric().withMessage('Discount must be a number')
    .toFloat(),

  body('items.*.tax')
    .optional()
    .isNumeric().withMessage('Tax must be a number')
    .toFloat(),

  body('paymentMode')
    .optional()
    .isIn(['CASH', 'CREDIT', 'CHECK', 'BANK_TRANSFER', 'OTHER'])
    .withMessage('Invalid payment mode'),

  body('status')
    .optional()
    .isIn(['new', 'pending', 'completed', 'cancelled'])
    .withMessage('Invalid status'),

  body('billFrom')
    .optional()
    .isString().withMessage('Invalid Bill from user ID format'),

  body('billTo')
    .optional()
    .isString().withMessage('Invalid Bill to user ID format'),

  // Optional fields
  body('referenceNo').optional().isString(),
  body('notes').optional().isString(),
  body('termsAndCondition').optional().isString(),
  body('sign_type').optional().isIn(['manualSignature', 'digitalSignature', 'none']),
  body('signatureId').optional().isString(),
  body('bank').optional().isString(),
  body('convert_type').optional().isIn(['purchase', 'estimate', 'invoice']),
  body('roundOff').optional().isBoolean(),
  body('taxableAmount').optional().isNumeric(),
  body('totalDiscount').optional().isNumeric(),
  body('vat').optional().isNumeric(),
  body('TotalAmount').optional().isNumeric(),
];

// CommonJS interop for legacy JS routes
module.exports = { purchaseOrderValidator, updatePurchaseOrderValidator };
module.exports.purchaseOrderValidator = purchaseOrderValidator;
module.exports.updatePurchaseOrderValidator = updatePurchaseOrderValidator;
