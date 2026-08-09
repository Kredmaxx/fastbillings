import type { Request, Response } from 'express';
import type { Prisma, Product } from '@prisma/client';

import type { GstSupplyType } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  requireTenantId,
  requireUserId,
  tenantOrUserFilter,
  UnauthorizedError,
} from '../lib/tenantScope';

function parseGstSupplyType(raw: unknown): GstSupplyType | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const v = String(raw).toUpperCase().replace(/[\s-]+/g, '_');
  if (v === 'TAXABLE' || v === 'NIL_RATED' || v === 'EXEMPT' || v === 'NON_GST') {
    return v as GstSupplyType;
  }
  return null;
}

// PC.1: resolve the company default currency code (ISO string).
async function resolveDefaultCurrencyCode(): Promise<string | null> {
  const defaultCurrency = await prisma.currency.findFirst({
    where: { isDefault: true, isDeleted: false },
    select: { code: true },
  });
  return defaultCurrency?.code ?? null;
}

interface UploadedFiles {
  product_image?: Express.Multer.File[];
  gallery_images?: Express.Multer.File[];
}

function uploadPath(file?: Express.Multer.File): string | null {
  return file ? `/uploads/products/${file.filename}` : null;
}

function formatProductResponse(
  product: Product & {
    category?: { id: string; category_name: string } | null;
    brand?: { id: string; brand_name: string } | null;
    unit?: { id: string; unit_name: string; short_name: string } | null;
    taxGroup?:
      | ({
          id: string;
          tax_name: string;
          tax_rates: { id: string; name: string; rate: Prisma.Decimal; isActive: boolean }[];
        })
      | null;
  },
  productImage: string | null,
  galleryImages: string[],
): Record<string, unknown> {
  const taxRates = product.taxGroup?.tax_rates ?? [];
  const totalTaxRate = taxRates.reduce((sum, t) => sum + Number(t.rate ?? 0), 0);
  const sellingPrice = Number(product.selling_price);
  const purchasePrice = Number(product.purchase_price);
  return {
    id: product.id,
    item_type: product.item_type,
    name: product.name,
    code: product.code,
    category: product.category
      ? { id: product.category.id, name: product.category.category_name }
      : null,
    brand: product.brand
      ? { id: product.brand.id, name: product.brand.brand_name }
      : null,
    unit: product.unit
      ? { id: product.unit.id, name: product.unit.short_name }
      : null,
    prices: {
      selling: sellingPrice,
      purchase: purchasePrice,
      selling_with_tax: sellingPrice + (sellingPrice * totalTaxRate) / 100,
      purchase_with_tax: purchasePrice + (purchasePrice * totalTaxRate) / 100,
    },
    discount: {
      type: product.discount_type,
      value: Number(product.discount_value),
    },
    tax: {
      group_id: product.taxGroup?.id,
      group_name: product.taxGroup?.tax_name,
      total_rate: totalTaxRate,
      components: taxRates.map((t) => ({
        rate_id: t.id,
        name: t.name,
        rate: Number(t.rate),
        status: t.isActive,
      })),
    },
    barcode: product.barcode,
    hsnSac: product.hsnSac ?? null,
    gstSupplyType: product.gstSupplyType ?? 'TAXABLE',
    valuationMethod: product.valuationMethod ?? 'WAC',
    trackingMode: product.trackingMode ?? 'NONE',
    stock: {
      enable_inventory: product.enable_inventory,
      quantity: product.stock,
      alert_quantity: product.alert_quantity,
    },
    description: product.description,
    images: {
      main: productImage,
      gallery: galleryImages,
    },
    status: product.status,
    currencyCode: product.currencyCode ?? null, // PC.1
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export async function createProduct(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const files = (req.files ?? {}) as UploadedFiles;
    const product_image = uploadPath(files.product_image?.[0]);
    const gallery_images = (files.gallery_images ?? []).map((f) => uploadPath(f)).filter(Boolean) as string[];

    const body = req.body as Record<string, string | undefined>;

    const itemType = body.item_type as Product['item_type'];
    const isService = itemType === 'Service';

    // P3.5: validate valuationMethod — WAC or FIFO only.
    const rawValuationMethod = body.valuationMethod as string | undefined;
    if (rawValuationMethod !== undefined && rawValuationMethod !== 'WAC' && rawValuationMethod !== 'FIFO') {
      res.status(400).json({ message: 'Invalid valuationMethod. Must be WAC or FIFO.' });
      return;
    }
    const rawTrackingMode = body.trackingMode as string | undefined;
    if (
      rawTrackingMode !== undefined &&
      rawTrackingMode !== 'NONE' &&
      rawTrackingMode !== 'BATCH' &&
      rawTrackingMode !== 'SERIAL'
    ) {
      res.status(400).json({ message: 'Invalid trackingMode. Must be NONE, BATCH, or SERIAL.' });
      return;
    }

    // Ensure brand/category/unit belong to this tenant (prevents cross-tenant FK use).
    const [brandOk, categoryOk, unitOk] = await Promise.all([
      prisma.brand.findFirst({ where: { id: body.brand as string, tenantId }, select: { id: true } }),
      prisma.category.findFirst({ where: { id: body.category as string, tenantId }, select: { id: true } }),
      prisma.unit.findFirst({ where: { id: body.unit as string, tenantId }, select: { id: true } }),
    ]);
    if (!brandOk || !categoryOk || !unitOk) {
      res.status(400).json({ message: 'Brand, category, and unit must belong to your workspace.' });
      return;
    }

    // PC.1: use caller-supplied currencyCode or fall back to the company default.
    const productCurrencyCode =
      (typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null) ??
      (await resolveDefaultCurrencyCode());

    const created = await prisma.product.create({
      data: {
        tenantId,
        item_type: itemType,
        name: body.name as string,
        code: body.code as string,
        categoryId: body.category as string,
        brandId: body.brand as string,
        unitId: body.unit as string,
        selling_price: Number(body.selling_price ?? 0),
        purchase_price: Number(body.purchase_price ?? 0),
        discount_type: (body.discount_type as string) ?? '',
        discount_value: Number(body.discount_value ?? 0),
        taxGroupId: body.tax as string,
        barcode: body.barcode as string,
        alert_quantity: isService ? 0 : Number(body.alert_quantity ?? 0),
        description: (body.description as string) ?? '',
        hsnSac: (typeof body.hsnSac === 'string' && body.hsnSac.trim()
          ? body.hsnSac.trim()
          : typeof body.hsn === 'string' && body.hsn.trim()
            ? body.hsn.trim()
            : null) as string | null,
        gstSupplyType: parseGstSupplyType(body.gstSupplyType) ?? 'TAXABLE',
        product_image: product_image ?? '',
        gallery_images: gallery_images,
        // Services are consumable: never tracked in inventory.
        enable_inventory: isService
          ? false
          : body.enable_inventory === 'true' || body.enable_inventory === '1',
        stock: isService ? 0 : Number(body.stock ?? 0),
        status: body.status !== 'false',
        // P3.5: valuation method (WAC default → unchanged for existing products)
        ...(rawValuationMethod ? { valuationMethod: rawValuationMethod } : {}),
        ...(rawTrackingMode ? { trackingMode: rawTrackingMode } : {}),
        // PC.1: currency the product is priced in
        ...(productCurrencyCode ? { currencyCode: productCurrencyCode } : {}),
      },
    });

    // Inventory side-effect: create an Inventory row only when enable_inventory and stock > 0.
    if (created.enable_inventory && created.stock > 0 && req.user) {
      await prisma.inventory.create({
        data: {
          productId: created.id,
          quantity: created.stock,
          userId: req.user,
          tenantId,
          inventory_history: [
            {
              unitId: created.unitId,
              quantity: created.stock,
              type: 'stock_in',
              adjustment: created.stock,
              notes: 'Initial stock entry',
              createdBy: req.user,
            },
          ] as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const populated = await prisma.product.findUnique({
      where: { id: created.id },
      include: {
        category: { select: { id: true, category_name: true } },
        brand: { select: { id: true, brand_name: true } },
        unit: { select: { id: true, unit_name: true, short_name: true } },
        taxGroup: {
          include: {
            tax_rates: { select: { id: true, name: true, rate: true, isActive: true } },
          },
        },
      },
    });

    res.status(201).json({
      message: 'Product created successfully',
      data: populated
        ? formatProductResponse(populated, product_image, gallery_images)
        : null,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    console.error('Product creation error:', err);
    res.status(500).json({
      message: 'Server error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getAllProducts(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);
    const search = ((req.query.search as string) ?? '').trim();

    const where: Prisma.ProductWhereInput = { tenantId };
    const itemTypeFilter = req.query.item_type as string | undefined;
    if (itemTypeFilter === 'Product' || itemTypeFilter === 'Service') {
      where.item_type = itemTypeFilter;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
        { brand: { brand_name: { contains: search, mode: 'insensitive' } } },
        { category: { category_name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: {
          category: { select: { id: true, category_name: true } },
          brand: { select: { id: true, brand_name: true } },
          unit: { select: { id: true, unit_name: true, short_name: true } },
          taxGroup: { select: { id: true, tax_name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.status(200).json({
      success: true,
      message: 'Products fetched successfully',
      data: {
        products,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ success: false, message: err.message });
      return;
    }
    console.error('Error fetching products:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error:
        process.env.NODE_ENV === 'development'
          ? err instanceof Error
            ? err.message
            : String(err)
          : 'Internal server error',
    });
  }
}

export async function getProductById(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };

    const product = await prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        brand: true,
        unit: true,
        taxGroup: {
          include: { tax_rates: true },
        },
      },
    });

    if (!product) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    res.status(200).json(product);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    res.status(500).json({
      message: 'Server error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateProduct(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.product.findFirst({ where: { id, tenantId } });

    if (!existing) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }

    const files = (req.files ?? {}) as UploadedFiles;
    const body = req.body as Record<string, unknown>;

    let newProductImagePath = existing.product_image;
    if (files.product_image && files.product_image.length > 0) {
      const path = uploadPath(files.product_image[0]);
      if (path) newProductImagePath = path;
    }

    let galleryImages = Array.isArray(existing.gallery_images)
      ? (existing.gallery_images as string[])
      : [];

    const uploadedGallery = files.gallery_images ?? [];
    if (uploadedGallery.length > 0) {
      const newPaths = uploadedGallery.map((f) => uploadPath(f)).filter(Boolean) as string[];
      galleryImages = [...galleryImages, ...newPaths];
    }

    const imagesToRemove = body.images_to_remove;
    const toRemoveList: string[] = Array.isArray(imagesToRemove)
      ? (imagesToRemove as string[])
      : typeof imagesToRemove === 'string'
        ? [imagesToRemove]
        : [];
    if (toRemoveList.length > 0) {
      galleryImages = galleryImages.filter((p) => !toRemoveList.includes(p));
    }

    const data: Prisma.ProductUpdateInput = {
      product_image: newProductImagePath,
      gallery_images: galleryImages,
    };

    // Apply scalar field updates if present.
    const setIfPresent = (key: string, target: keyof Prisma.ProductUpdateInput, transform?: (v: unknown) => unknown) => {
      if (body[key] !== undefined) {
        (data as Record<string, unknown>)[target as string] = transform ? transform(body[key]) : body[key];
      }
    };
    setIfPresent('name', 'name');
    setIfPresent('code', 'code');
    setIfPresent('selling_price', 'selling_price', (v) => Number(v));
    setIfPresent('purchase_price', 'purchase_price', (v) => Number(v));
    setIfPresent('discount_type', 'discount_type');
    setIfPresent('discount_value', 'discount_value', (v) => Number(v));
    setIfPresent('barcode', 'barcode');
    setIfPresent('description', 'description');
    if (body.hsnSac !== undefined || body.hsn !== undefined) {
      const raw = (body.hsnSac ?? body.hsn) as string | null | undefined;
      data.hsnSac =
        typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    }
    if (body.gstSupplyType !== undefined) {
      const parsed = parseGstSupplyType(body.gstSupplyType);
      if (!parsed) {
        res.status(400).json({
          message: 'Invalid gstSupplyType. Must be TAXABLE, NIL_RATED, EXEMPT, or NON_GST.',
        });
        return;
      }
      data.gstSupplyType = parsed;
    }

    // If item_type is being set to Service (or already is, when not being changed),
    // force inventory-related fields to zero regardless of incoming body values.
    const incomingType = (body.item_type as string | undefined) ?? existing.item_type;
    const isService = incomingType === 'Service';

    if (isService) {
      data.item_type = 'Service';
      data.alert_quantity = 0;
      data.stock = 0;
      data.enable_inventory = false;
    } else {
      setIfPresent('item_type', 'item_type');
      setIfPresent('alert_quantity', 'alert_quantity', (v) => Number(v));
      setIfPresent('stock', 'stock', (v) => Number(v));
      if (body.enable_inventory !== undefined) {
        data.enable_inventory =
          body.enable_inventory === 'true' || body.enable_inventory === true || body.enable_inventory === '1';
      }
    }
    if (body.status !== undefined) {
      data.status = body.status !== 'false' && body.status !== false;
    }
    // P3.5: allow updating valuationMethod (WAC|FIFO).
    if (body.valuationMethod !== undefined) {
      const vm = body.valuationMethod as string;
      if (vm !== 'WAC' && vm !== 'FIFO') {
        res.status(400).json({ message: 'Invalid valuationMethod. Must be WAC or FIFO.' });
        return;
      }
      (data as Record<string, unknown>)['valuationMethod'] = vm;
    }
    if (body.trackingMode !== undefined) {
      const tm = body.trackingMode as string;
      if (tm !== 'NONE' && tm !== 'BATCH' && tm !== 'SERIAL') {
        res.status(400).json({ message: 'Invalid trackingMode. Must be NONE, BATCH, or SERIAL.' });
        return;
      }
      (data as Record<string, unknown>)['trackingMode'] = tm;
    }
    // PC.1: allow updating currencyCode (null clears it back to legacy/unset).
    if (body.currencyCode !== undefined) {
      (data as Record<string, unknown>)['currencyCode'] =
        typeof body.currencyCode === 'string' && body.currencyCode ? body.currencyCode : null;
    }
    if (body.category !== undefined) {
      data.category = { connect: { id: body.category as string } };
    }
    if (body.brand !== undefined) {
      data.brand = { connect: { id: body.brand as string } };
    }
    if (body.unit !== undefined) {
      data.unit = { connect: { id: body.unit as string } };
    }
    if (body.tax !== undefined) {
      data.taxGroup = { connect: { id: body.tax as string } };
    }

    const updated = await prisma.product.update({ where: { id }, data });

    res.status(200).json({
      message: 'Product updated successfully',
      data: {
        ...updated,
        currencyCode: updated.currencyCode ?? null, // PC.1
      },
    });
  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({
      message: 'Server error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deleteProduct(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.product.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ message: 'Product not found' });
      return;
    }
    // Cascade-delete dependent rows (Inventory) before the product. The
    // Mongoose original was a `findByIdAndDelete` (no FK constraints); Postgres
    // enforces them. We mirror the original "hard delete" semantic by
    // wiping the dependent inventory rows first inside a transaction.
    await prisma.$transaction([
      prisma.inventory.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
    res.status(200).json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({
      message: 'Server error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

interface ListQuery {
  search?: string;
  status?: string;
}

function buildImageUrl(req: Request, image: string | null): string | null {
  if (!image) return null;
  const baseUrl = `${req.protocol}://${req.get('host')}/`;
  return `${baseUrl}uploads/${image.replace(/\\/g, '/')}`;
}

export async function getAllProductCategories(req: Request, res: Response): Promise<void> {
  try {
    const { search = '', status } = req.query as ListQuery;
    const where: Prisma.CategoryWhereInput = {};

    if (search) where.category_name = { contains: search, mode: 'insensitive' };
    if (status === undefined) where.status = true;
    else where.status = status === 'true';

    const categories = await prisma.category.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: search ? undefined : 10,
    });

    const formatted = categories.map((c) => ({
      id: c.id,
      categoryName: c.category_name,
      categoryImage: buildImageUrl(req, c.category_image),
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: search ? 'Search results for categories' : 'Last 10 categories retrieved',
      data: formatted,
      count: formatted.length,
    });
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching categories',
      error:
        process.env.NODE_ENV === 'development'
          ? err instanceof Error
            ? err.message
            : String(err)
          : 'Internal server error',
    });
  }
}

export async function getAllProductBrands(req: Request, res: Response): Promise<void> {
  try {
    const { search = '', status } = req.query as ListQuery;
    const where: Prisma.BrandWhereInput = {};
    if (search) where.brand_name = { contains: search, mode: 'insensitive' };
    if (status === undefined) where.status = true;
    else where.status = status === 'true';

    const brands = await prisma.brand.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: search ? undefined : 10,
    });

    const formatted = brands.map((b) => ({
      id: b.id,
      brandName: b.brand_name,
      brandImage: buildImageUrl(req, b.brand_image),
      status: b.status,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: search ? 'Search results for brands' : 'Last 10 brands retrieved',
      data: formatted,
      count: formatted.length,
    });
  } catch (err) {
    console.error('Error fetching brands:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching brands',
      error:
        process.env.NODE_ENV === 'development'
          ? err instanceof Error
            ? err.message
            : String(err)
          : 'Internal server error',
    });
  }
}

export async function getAllUnits(req: Request, res: Response): Promise<void> {
  try {
    const { search = '', status } = req.query as ListQuery;
    const where: Prisma.UnitWhereInput = {};
    if (search) {
      where.OR = [
        { unit_name: { contains: search, mode: 'insensitive' } },
        { short_name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status === undefined) where.status = true;
    else where.status = status === 'true';

    const units = await prisma.unit.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: search ? undefined : 10,
    });

    const formatted = units.map((u) => ({
      id: u.id,
      unitName: u.unit_name,
      shortName: u.short_name,
      status: u.status,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: search ? 'Search results for units' : 'Last 10 units retrieved',
      data: formatted,
      count: formatted.length,
    });
  } catch (err) {
    console.error('Error fetching units:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching units',
      error:
        process.env.NODE_ENV === 'development'
          ? err instanceof Error
            ? err.message
            : String(err)
          : 'Internal server error',
    });
  }
}

export async function getAllTaxGroups(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { search = '', status } = req.query as ListQuery;
    const where: Prisma.TaxGroupWhereInput = {
      AND: [
        {
          OR: [...tenantOrUserFilter(req).OR, { tenantId: null, userId: null }],
        },
      ],
    };
    if (search) where.tax_name = { contains: search, mode: 'insensitive' };
    if (status === undefined) where.status = true;
    else where.status = status === 'true';

    const taxes = await prisma.taxGroup.findMany({
      where,
      include: { tax_rates: true },
      orderBy: { createdAt: 'desc' },
      take: search ? undefined : 10,
    });

    const formatted = taxes.map((tax) => ({
      id: tax.id,
      taxGroupName: tax.tax_name,
      taxRate: tax.tax_rates,
      status: tax.status,
      createdAt: tax.createdAt,
      updatedAt: tax.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: search ? 'Search results for tax groups' : 'Last 10 tax groups retrieved',
      data: formatted,
      count: formatted.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('Error fetching tax groups:', err);
    res.status(500).json({
      success: false,
      message: 'Error fetching tax groups',
      error:
        process.env.NODE_ENV === 'development'
          ? err instanceof Error
            ? err.message
            : String(err)
          : 'Internal server error',
    });
  }
}

// =============================================================================
// P3.5 — GET /inventory/cost-layers?productId=<id>
// Returns open FIFO cost layers for a product (transparency endpoint).
// =============================================================================

export async function listCostLayers(req: Request, res: Response): Promise<void> {
  try {
    const { productId } = req.query as { productId?: string };

    if (!productId) {
      res.status(400).json({ message: 'productId query parameter is required' });
      return;
    }

    requireUserId(req);

    const layers = await prisma.inventoryCostLayer.findMany({
      where: {
        productId,
        isDeleted: false,
        ...tenantOrUserFilter(req),
      },
      orderBy: { receivedAt: 'asc' },
    });

    res.status(200).json({
      success: true,
      message: 'Cost layers retrieved successfully',
      data: layers,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('Error fetching cost layers:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes
module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getAllProductCategories,
  getAllProductBrands,
  getAllUnits,
  getAllTaxGroups,
  listCostLayers,
};
module.exports.createProduct = createProduct;
module.exports.getAllProducts = getAllProducts;
module.exports.getProductById = getProductById;
module.exports.updateProduct = updateProduct;
module.exports.deleteProduct = deleteProduct;
module.exports.getAllProductCategories = getAllProductCategories;
module.exports.getAllProductBrands = getAllProductBrands;
module.exports.getAllUnits = getAllUnits;
module.exports.getAllTaxGroups = getAllTaxGroups;
module.exports.listCostLayers = listCostLayers;
