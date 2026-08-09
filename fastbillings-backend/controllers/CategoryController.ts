import type { Request, Response } from 'express';
import type { IncomeTaxClass } from '@prisma/client';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireTenantId, UnauthorizedError } from '../lib/tenantScope';

const INCOME_TAX_CLASSES: IncomeTaxClass[] = [
  'BUSINESS',
  'EXEMPT',
  'CAPITAL',
  'OTHER',
  'UNCLASSIFIED',
];

function parseIncomeTaxClass(raw: unknown): IncomeTaxClass | undefined {
  if (raw == null || raw === '') return undefined;
  const v = String(raw).toUpperCase() as IncomeTaxClass;
  return INCOME_TAX_CLASSES.includes(v) ? v : undefined;
}

function withImageUrl<T extends { category_image: string | null }>(req: Request, c: T) {
  return {
    ...c,
    categoryImageUrl: c.category_image
      ? `${req.protocol}://${req.get('host')}/uploads/${c.category_image}`
      : null,
  };
}

function handleAuth(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ error: err.message });
    return true;
  }
  return false;
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { category_name, slug, status, taxClass: taxClassRaw } = req.body as {
      category_name?: string;
      slug?: string;
      status?: boolean | string;
      taxClass?: string;
    };
    const taxClass = parseIncomeTaxClass(taxClassRaw);
    if (taxClassRaw != null && taxClassRaw !== '' && !taxClass) {
      res.status(400).json({
        error: `taxClass must be one of: ${INCOME_TAX_CLASSES.join(', ')}`,
      });
      return;
    }

    const category_image = req.file ? req.file.filename : null;

    const category = await prisma.category.create({
      data: {
        tenantId,
        category_name: category_name as string,
        slug: slug as string,
        category_image,
        taxClass: taxClass ?? 'UNCLASSIFIED',
        status: typeof status === 'string' ? status === 'true' : (status ?? true),
      },
    });

    res.status(201).json({ message: 'Category created', data: withImageUrl(req, category) });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getAllCategories(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.CategoryWhereInput = { tenantId };
    if (search) {
      where.category_name = { contains: search, mode: 'insensitive' };
    }

    const [total, categories] = await Promise.all([
      prisma.category.count({ where }),
      prisma.category.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.status(200).json({
      message: 'Categories fetched successfully',
      data: {
        categories: categories.map((c) => withImageUrl(req, c)),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({
      message: 'Error fetching categories',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getCategoryById(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const category = await prisma.category.findFirst({ where: { id, tenantId } });
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(withImageUrl(req, category));
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const { category_name, slug, status, taxClass: taxClassRaw } = req.body as {
      category_name?: string;
      slug?: string;
      status?: boolean | string;
      taxClass?: string;
    };
    const taxClass = parseIncomeTaxClass(taxClassRaw);
    if (taxClassRaw != null && taxClassRaw !== '' && !taxClass) {
      res.status(400).json({
        error: `taxClass must be one of: ${INCOME_TAX_CLASSES.join(', ')}`,
      });
      return;
    }

    const existing = await prisma.category.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (category_name) data.category_name = category_name;
    if (slug) data.slug = slug;
    if (status !== undefined) {
      data.status = typeof status === 'string' ? status === 'true' : status;
    }
    if (taxClass != null) data.taxClass = taxClass;
    if (req.file) data.category_image = req.file.filename;

    const category = await prisma.category.update({
      where: { id: existing.id },
      data,
    });

    res.json({ message: 'Category updated', data: withImageUrl(req, category) });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.category.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    await prisma.category.delete({ where: { id: existing.id } });
    res.json({ message: 'Category deleted' });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
module.exports.createCategory = createCategory;
module.exports.getAllCategories = getAllCategories;
module.exports.getCategoryById = getCategoryById;
module.exports.updateCategory = updateCategory;
module.exports.deleteCategory = deleteCategory;
