import type { Request, Response } from 'express';
import type { ExpenseCategory, ExpenseTaxClass, Section43BNature } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { SECTION_43B_NATURES } from '../lib/section43B';
import {
  optionalTenantId,
  requireUserId,
  UnauthorizedError,
} from '../lib/tenantScope';

const TAX_CLASSES: ExpenseTaxClass[] = [
  'ALLOWABLE',
  'DISALLOWABLE',
  'CAPITAL',
  'PERSONAL',
  'UNCLASSIFIED',
];

function parseTaxClass(raw: unknown): ExpenseTaxClass | undefined {
  if (raw == null || raw === '') return undefined;
  const v = String(raw).toUpperCase() as ExpenseTaxClass;
  return TAX_CLASSES.includes(v) ? v : undefined;
}

function parseSection43BNature(raw: unknown): Section43BNature | undefined {
  if (raw == null || raw === '') return undefined;
  const v = String(raw).toUpperCase() as Section43BNature;
  return (SECTION_43B_NATURES as readonly string[]).includes(v) ? v : undefined;
}

function formatCategory(cat: ExpenseCategory) {
  return {
    id: cat.id,
    title: cat.title,
    description: cat.description,
    status: cat.status,
    taxClass: cat.taxClass,
    section43BNature: cat.section43BNature,
    createdAt: cat.createdAt,
    updatedAt: cat.updatedAt,
  };
}

function categoryScope(req: Request): Prisma.ExpenseCategoryWhereInput {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  if (tenantId) {
    return { isDeleted: false, OR: [{ tenantId }, { userId }] };
  }
  return { isDeleted: false, userId };
}

function ownedScope(req: Request): Prisma.ExpenseCategoryWhereInput {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  if (tenantId) {
    return { isDeleted: false, OR: [{ tenantId }, { userId }] };
  }
  return { isDeleted: false, userId };
}

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(401).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

export async function createExpenseCategory(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const {
      title,
      description,
      status = true,
      taxClass: taxClassRaw,
      section43BNature: section43BNatureRaw,
    } = req.body as {
      title?: string;
      description?: string;
      status?: boolean;
      taxClass?: string;
      section43BNature?: string;
    };
    const taxClass = parseTaxClass(taxClassRaw);
    if (taxClassRaw != null && taxClassRaw !== '' && !taxClass) {
      res.status(400).json({
        success: false,
        message: `taxClass must be one of: ${TAX_CLASSES.join(', ')}`,
      });
      return;
    }
    const section43BNature = parseSection43BNature(section43BNatureRaw);
    if (section43BNatureRaw != null && section43BNatureRaw !== '' && !section43BNature) {
      res.status(400).json({
        success: false,
        message: `section43BNature must be one of: ${SECTION_43B_NATURES.join(', ')}`,
      });
      return;
    }

    const category = await prisma.expenseCategory.create({
      data: {
        title: title as string,
        description: description ?? null,
        status,
        taxClass: taxClass ?? 'UNCLASSIFIED',
        section43BNature: section43BNature ?? 'NONE',
        userId,
        tenantId: optionalTenantId(req),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Expense Category created successfully',
      data: formatCategory(category),
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error creating expense category:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating expense category',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getAllExpenseCategories(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();
    const status = req.query.status as string | undefined;

    const where: Prisma.ExpenseCategoryWhereInput = {
      AND: [categoryScope(req)],
    };

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (status !== undefined) {
      where.status = status === 'true';
    }

    const [total, categories] = await Promise.all([
      prisma.expenseCategory.count({ where }),
      prisma.expenseCategory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const formatted = categories.map(formatCategory);

    res.status(200).json({
      success: true,
      message: 'Expense Categories fetched successfully',
      data: {
        categories: formatted,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching categories:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listExpenseCategories(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const search = ((req.query.search as string) ?? '').trim();
    const limit = 10;

    const where: Prisma.ExpenseCategoryWhereInput = {
      AND: [categoryScope(req)],
    };
    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    const categories = await prisma.expenseCategory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const formatted = categories.map(formatCategory);

    res.status(200).json({
      success: true,
      message: 'Expense Categories fetched successfully',
      data: formatted,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching categories:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getExpenseCategoryById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const category = await prisma.expenseCategory.findFirst({
      where: { id, AND: [categoryScope(req)] },
    });

    if (!category) {
      res.status(404).json({ success: false, message: 'Expense Category not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: formatCategory(category),
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error fetching expense category:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching expense category',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateExpenseCategory(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const {
      title,
      description,
      status,
      taxClass: taxClassRaw,
      section43BNature: section43BNatureRaw,
    } = req.body as {
      title?: string;
      description?: string;
      status?: boolean;
      taxClass?: string;
      section43BNature?: string;
    };
    const taxClass = parseTaxClass(taxClassRaw);
    if (taxClassRaw != null && taxClassRaw !== '' && !taxClass) {
      res.status(400).json({
        success: false,
        message: `taxClass must be one of: ${TAX_CLASSES.join(', ')}`,
      });
      return;
    }
    const section43BNature = parseSection43BNature(section43BNatureRaw);
    if (section43BNatureRaw != null && section43BNatureRaw !== '' && !section43BNature) {
      res.status(400).json({
        success: false,
        message: `section43BNature must be one of: ${SECTION_43B_NATURES.join(', ')}`,
      });
      return;
    }

    const existing = await prisma.expenseCategory.findFirst({
      where: { id, AND: [ownedScope(req)] },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Expense Category not found' });
      return;
    }

    const category = await prisma.expenseCategory.update({
      where: { id: existing.id },
      data: {
        title,
        status,
        description,
        ...(taxClass != null ? { taxClass } : {}),
        ...(section43BNature != null ? { section43BNature } : {}),
        ...(optionalTenantId(req) && !existing.tenantId
          ? { tenantId: optionalTenantId(req) }
          : {}),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Expense Category updated successfully',
      data: formatCategory(category),
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error updating expense category:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating expense category',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteExpenseCategory(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };

    const existing = await prisma.expenseCategory.findFirst({
      where: { id, AND: [ownedScope(req)] },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Expense Category not found' });
      return;
    }

    await prisma.expenseCategory.update({
      where: { id: existing.id },
      data: { isDeleted: true },
    });

    res.status(200).json({
      success: true,
      message: 'Expense Category deleted successfully',
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    console.error('Error deleting expense category:', err);
    res.status(500).json({
      success: false,
      message: 'Error deleting expense category',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = {
  createExpenseCategory,
  getAllExpenseCategories,
  listExpenseCategories,
  getExpenseCategoryById,
  updateExpenseCategory,
  deleteExpenseCategory,
};
module.exports.createExpenseCategory = createExpenseCategory;
module.exports.getAllExpenseCategories = getAllExpenseCategories;
module.exports.listExpenseCategories = listExpenseCategories;
module.exports.getExpenseCategoryById = getExpenseCategoryById;
module.exports.updateExpenseCategory = updateExpenseCategory;
module.exports.deleteExpenseCategory = deleteExpenseCategory;
