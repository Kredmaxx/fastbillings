import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { body, param, validationResult, ValidationChain } from 'express-validator';

import { prisma } from '../lib/prisma';

const productValidationRules = (): ValidationChain[] => [
  body('item_type')
    .notEmpty().withMessage('Item type is required')
    .isIn(['Product', 'Service']).withMessage('Invalid item type'),
  body('name')
    .notEmpty().withMessage('Product name is required')
    .isLength({ min: 2 }).withMessage('Product name must be at least 2 characters')
    .isLength({ max: 50 }).withMessage('Product name cannot exceed 50 characters'),
  body('code').notEmpty().withMessage('Product code is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('brand').notEmpty().withMessage('Brand is required'),
  body('unit').notEmpty().withMessage('Unit is required'),
  body('selling_price')
    .notEmpty().withMessage('Selling price is required')
    .isFloat({ gt: 0 }).withMessage('Selling price must be greater than 0'),
  body('purchase_price')
    .notEmpty().withMessage('Purchase price is required')
    .isFloat({ gt: 0 }).withMessage('Purchase price must be greater than 0'),
  body('selling_price').custom((value, { req }) => {
    const sellingPrice = parseFloat(String(value));
    const purchasePrice = parseFloat(String(req.body.purchase_price));
    if (Number.isNaN(sellingPrice) || Number.isNaN(purchasePrice)) {
      throw new Error('Selling price and purchase price must be valid numbers.');
    }
    if (sellingPrice <= purchasePrice) {
      throw new Error('Selling price must be greater than purchase price');
    }
    return true;
  }),
  body('discount_type')
    .notEmpty().withMessage('Discount type is required')
    .isIn(['Percentage', 'Fixed']).withMessage('Invalid discount type'),
  body('discount_value')
    .notEmpty().withMessage('Discount value is required')
    .isFloat({ min: 0 }).withMessage('Discount value must be a non-negative number'),
  body('tax').notEmpty().withMessage('Tax group is required'),
  body('barcode').notEmpty().withMessage('Barcode is required'),
  body('alert_quantity')
    .notEmpty().withMessage('Alert quantity is required')
    .isInt({ min: 0 }).withMessage('Alert quantity must be a non-negative integer'),
  body('description')
    .notEmpty().withMessage('Product description is required')
    .isLength({ max: 500 }).withMessage('Product description cannot exceed 500 characters'),
];

const commonErrorHandler: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    next();
    return;
  }
  const formatted: Record<string, string> = {};
  for (const err of errors.array()) {
    const path = (err as unknown as { path?: string; param?: string }).path
      ?? (err as unknown as { param?: string }).param
      ?? 'general';
    if (!formatted[path]) formatted[path] = err.msg;
  }
  res.status(422).json({ message: 'Validation failed', errors: formatted });
};

export const createProductValidator: (ValidationChain | RequestHandler)[] = [
  ...productValidationRules(),
  body('name').custom(async (value) => {
    const existing = await prisma.product.findFirst({ where: { name: String(value) } });
    if (existing) throw new Error('Product name already exists');
    return true;
  }),
  body('code').custom(async (value) => {
    const existing = await prisma.product.findFirst({ where: { code: String(value) } });
    if (existing) throw new Error('Product code already exists');
    return true;
  }),
  body('barcode').custom(async (value) => {
    const existing = await prisma.product.findFirst({ where: { barcode: String(value) } });
    if (existing) throw new Error('Barcode already exists');
    return true;
  }),
  // Product image is optional — products can be created without an image.
  commonErrorHandler,
];

export const updateProductValidator: (ValidationChain | RequestHandler)[] = [
  ...productValidationRules(),
  param('id').notEmpty().withMessage('Product ID is required'),
  body('name').custom(async (value, { req }) => {
    const id = req.params?.id as string | undefined;
    const existing = await prisma.product.findFirst({
      where: { name: String(value), NOT: id ? { id } : undefined },
    });
    if (existing) throw new Error('Product name already exists');
    return true;
  }),
  body('code').custom(async (value, { req }) => {
    const id = req.params?.id as string | undefined;
    const existing = await prisma.product.findFirst({
      where: { code: String(value), NOT: id ? { id } : undefined },
    });
    if (existing) throw new Error('Product code already exists');
    return true;
  }),
  body('barcode').custom(async (value, { req }) => {
    const id = req.params?.id as string | undefined;
    const existing = await prisma.product.findFirst({
      where: { barcode: String(value), NOT: id ? { id } : undefined },
    });
    if (existing) throw new Error('Barcode already exists');
    return true;
  }),
  commonErrorHandler,
];

// CommonJS interop for legacy JS routes
module.exports = { createProductValidator, updateProductValidator };
module.exports.createProductValidator = createProductValidator;
module.exports.updateProductValidator = updateProductValidator;
