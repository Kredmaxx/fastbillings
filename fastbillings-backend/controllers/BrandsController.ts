import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireTenantId, UnauthorizedError } from '../lib/tenantScope';

function withImageUrl<T extends { brand_image: string | null }>(req: Request, b: T) {
  return {
    ...b,
    brandImageUrl: b.brand_image
      ? `${req.protocol}://${req.get('host')}/uploads/${b.brand_image}`
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

export async function createBrand(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { brand_name, status } = req.body as {
      brand_name?: string;
      status?: boolean | string;
    };
    const brand_image = req.file ? req.file.filename : null;

    const brand = await prisma.brand.create({
      data: {
        tenantId,
        brand_name: brand_name as string,
        brand_image,
        status: typeof status === 'string' ? status === 'true' : (status ?? true),
      },
    });

    res.status(201).json({ message: 'Brand created', data: withImageUrl(req, brand) });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getAllBrands(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.BrandWhereInput = { tenantId };
    if (search) {
      where.brand_name = { contains: search, mode: 'insensitive' };
    }

    const [total, brands] = await Promise.all([
      prisma.brand.count({ where }),
      prisma.brand.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.status(200).json({
      message: 'Brands fetched successfully',
      data: {
        brands: brands.map((b) => withImageUrl(req, b)),
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
      message: 'Error fetching brands',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getBrandById(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const brand = await prisma.brand.findFirst({ where: { id, tenantId } });
    if (!brand) {
      res.status(404).json({ error: 'Brand not found' });
      return;
    }
    res.json(withImageUrl(req, brand));
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function updateBrand(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const { brand_name, status } = req.body as {
      brand_name?: string;
      status?: boolean | string;
    };

    const existing = await prisma.brand.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Brand not found' });
      return;
    }

    const data: Prisma.BrandUpdateInput = {};
    if (brand_name) data.brand_name = brand_name;
    if (status !== undefined) {
      data.status = typeof status === 'string' ? status === 'true' : status;
    }
    if (req.file) data.brand_image = req.file.filename;

    const brand = await prisma.brand.update({
      where: { id: existing.id },
      data,
    });

    res.json({ message: 'Brand updated', data: withImageUrl(req, brand) });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function deleteBrand(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.brand.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ error: 'Brand not found' });
      return;
    }
    await prisma.brand.delete({ where: { id: existing.id } });
    res.json({ message: 'Brand deleted' });
  } catch (err) {
    if (handleAuth(res, err)) return;
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}

module.exports = {
  createBrand,
  getAllBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
};
module.exports.createBrand = createBrand;
module.exports.getAllBrands = getAllBrands;
module.exports.getBrandById = getBrandById;
module.exports.updateBrand = updateBrand;
module.exports.deleteBrand = deleteBrand;
