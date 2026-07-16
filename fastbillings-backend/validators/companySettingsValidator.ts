import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { body, validationResult, ValidationChain } from 'express-validator';

import { PHONE_REGEX, PHONE_ERROR } from '../utils/validation';

function formatValidationErrors(errorsArr: unknown[]): Record<string, string> {
  const formatted: Record<string, string> = {};
  for (const err of errorsArr) {
    const e = err as { path: string; msg: string };
    if (!formatted[e.path]) {
      formatted[e.path] = e.msg;
    }
  }
  return formatted;
}

const validate: RequestHandler = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      message: 'Validation failed',
      errors: formatValidationErrors(errors.array()),
    });
    return;
  }
  next();
};

const updateChains: ValidationChain[] = [
  body('companyName')
    .trim()
    .notEmpty()
    .withMessage('Company name is required')
    .isLength({ max: 100 })
    .withMessage('Company name cannot exceed 100 characters'),

  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Invalid email address'),

  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .matches(PHONE_REGEX)
    .withMessage(PHONE_ERROR),

  body('address').trim().notEmpty().withMessage('Address is required'),

  body('city').notEmpty().withMessage('City is required'),

  body('state').notEmpty().withMessage('State is required'),

  body('country').notEmpty().withMessage('Country is required'),

  body('pincode').trim().notEmpty().withMessage('Pincode is required'),
];

export const updateCompanySettingsValidator: (ValidationChain | RequestHandler)[] = [
  ...updateChains,
  validate,
];

// CommonJS interop for legacy JS routes that still use module-alias requires.
module.exports = { updateCompanySettingsValidator };
module.exports.updateCompanySettingsValidator = updateCompanySettingsValidator;
