import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { body, validationResult, ValidationChain } from 'express-validator';

import { prisma } from '../lib/prisma';
import { PHONE_REGEX, PHONE_ERROR, POSTAL_CODE_REGEX, POSTAL_CODE_ERROR } from '../utils/validation';

const handleValidationResult: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors: Record<string, string> = {};
    for (const err of errors.array()) {
      const field = (err as unknown as { path: string }).path;
      if (!formattedErrors[field]) {
        formattedErrors[field] = err.msg;
      }
    }
    res.status(422).json({
      message: 'Validation failed',
      errors: formattedErrors,
    });
    return;
  }
  next();
};

export const updateProfileValidator: (ValidationChain | RequestHandler)[] = [
  body('firstName')
    .notEmpty()
    .withMessage('First name is required')
    .isLength({ min: 3 })
    .withMessage('First name must be at least 2 characters')
    .isLength({ max: 30 })
    .withMessage('First name cannot exceed 30 characters'),

  body('lastName')
    .notEmpty()
    .withMessage('Last name is required')
    .isLength({ min: 2 })
    .withMessage('Last name must be at least 2 characters')
    .isLength({ max: 30 })
    .withMessage('Last name cannot exceed 30 characters'),

  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email')
    .custom(async (value: string, { req }) => {
      const user = await prisma.user.findUnique({ where: { email: value } });
      const currentUserId =
        typeof (req as Request).user === 'string' ? ((req as Request).user as string) : '';
      if (user && user.id !== currentUserId) {
        throw new Error('Email already exists');
      }
      return true;
    }),

  body('phone')
    .optional()
    .trim()
    .matches(PHONE_REGEX)
    .withMessage(PHONE_ERROR),

  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),

  body('dateOfBirth').optional().isDate().withMessage('Invalid date format'),

  body('profileImage')
    .optional()
    .custom((value: unknown, { req }) => {
      if (!(req as Request).file && value === '') {
        throw new Error('Profile image cannot be empty if provided');
      }
      return true;
    }),

  body('address')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Address cannot exceed 100 characters'),

  body('country').notEmpty().withMessage('Country is required'),
  body('state').notEmpty().withMessage('State is required'),
  body('city').notEmpty().withMessage('City is required'),

  body('postalCode')
    .notEmpty()
    .withMessage('Postal code is required')
    .trim()
    .matches(POSTAL_CODE_REGEX)
    .withMessage(POSTAL_CODE_ERROR),

  handleValidationResult,
];

// CommonJS interop for legacy JS routes
module.exports = { updateProfileValidator };
module.exports.updateProfileValidator = updateProfileValidator;
