-- Phase 1: tenant-scope catalog (Brand/Category/Unit/Product) + Inventory.tenantId

-- 1) Add nullable tenantId columns
ALTER TABLE "Brand" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Category" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Unit" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- 2) Drop global unique constraints (names may vary slightly by Postgres/Prisma)
ALTER TABLE "Brand" DROP CONSTRAINT IF EXISTS "Brand_brand_name_key";
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_category_name_key";
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_slug_key";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_name_key";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_code_key";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_barcode_key";

-- 3) Backfill Inventory.tenantId from membership
UPDATE "Inventory" i
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE i."tenantId" IS NULL
  AND tm."userId" = i."userId";

-- Fallback: owner tenant id pattern from SaaS foundation
UPDATE "Inventory" i
SET "tenantId" = 'tenant_' || i."userId"
WHERE i."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = 'tenant_' || i."userId");

-- 4) Backfill Product.tenantId from inventory (first membership-linked row)
UPDATE "Product" p
SET "tenantId" = sub."tenantId"
FROM (
  SELECT DISTINCT ON (i."productId") i."productId", i."tenantId"
  FROM "Inventory" i
  WHERE i."tenantId" IS NOT NULL
  ORDER BY i."productId", i."createdAt" ASC
) sub
WHERE p."id" = sub."productId"
  AND p."tenantId" IS NULL;

-- Remaining products → oldest tenant (keeps rows visible to someone after cutover)
UPDATE "Product" p
SET "tenantId" = (SELECT t."id" FROM "Tenant" t ORDER BY t."createdAt" ASC LIMIT 1)
WHERE p."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- 5) Backfill Brand / Category / Unit from products
UPDATE "Brand" b
SET "tenantId" = p."tenantId"
FROM "Product" p
WHERE b."id" = p."brandId"
  AND b."tenantId" IS NULL
  AND p."tenantId" IS NOT NULL;

UPDATE "Category" c
SET "tenantId" = p."tenantId"
FROM "Product" p
WHERE c."id" = p."categoryId"
  AND c."tenantId" IS NULL
  AND p."tenantId" IS NOT NULL;

UPDATE "Unit" u
SET "tenantId" = p."tenantId"
FROM "Product" p
WHERE u."id" = p."unitId"
  AND u."tenantId" IS NULL
  AND p."tenantId" IS NOT NULL;

UPDATE "Brand" b
SET "tenantId" = (SELECT t."id" FROM "Tenant" t ORDER BY t."createdAt" ASC LIMIT 1)
WHERE b."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

UPDATE "Category" c
SET "tenantId" = (SELECT t."id" FROM "Tenant" t ORDER BY t."createdAt" ASC LIMIT 1)
WHERE c."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

UPDATE "Unit" u
SET "tenantId" = (SELECT t."id" FROM "Tenant" t ORDER BY t."createdAt" ASC LIMIT 1)
WHERE u."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Disambiguate duplicate names within a tenant before unique indexes
WITH d AS (
  SELECT id, "tenantId", brand_name,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", brand_name ORDER BY "createdAt") AS rn
  FROM "Brand"
)
UPDATE "Brand" b
SET brand_name = b.brand_name || '-' || LEFT(b.id, 6)
FROM d
WHERE b.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, "tenantId", category_name,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", category_name ORDER BY "createdAt") AS rn
  FROM "Category"
)
UPDATE "Category" c
SET category_name = c.category_name || '-' || LEFT(c.id, 6)
FROM d
WHERE c.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, "tenantId", slug,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", slug ORDER BY "createdAt") AS rn
  FROM "Category"
)
UPDATE "Category" c
SET slug = c.slug || '-' || LEFT(c.id, 6)
FROM d
WHERE c.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, "tenantId", unit_name,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", unit_name ORDER BY "createdAt") AS rn
  FROM "Unit"
)
UPDATE "Unit" u
SET unit_name = u.unit_name || '-' || LEFT(u.id, 6)
FROM d
WHERE u.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, "tenantId", short_name,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", short_name ORDER BY "createdAt") AS rn
  FROM "Unit"
)
UPDATE "Unit" u
SET short_name = u.short_name || '-' || LEFT(u.id, 6)
FROM d
WHERE u.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, "tenantId", name,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", name ORDER BY "createdAt") AS rn
  FROM "Product"
)
UPDATE "Product" p
SET name = p.name || '-' || LEFT(p.id, 6)
FROM d
WHERE p.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, "tenantId", code,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", code ORDER BY "createdAt") AS rn
  FROM "Product"
)
UPDATE "Product" p
SET code = p.code || '-' || LEFT(p.id, 6)
FROM d
WHERE p.id = d.id AND d.rn > 1;

WITH d AS (
  SELECT id, "tenantId", barcode,
    ROW_NUMBER() OVER (PARTITION BY "tenantId", barcode ORDER BY "createdAt") AS rn
  FROM "Product"
)
UPDATE "Product" p
SET barcode = p.barcode || '-' || LEFT(p.id, 6)
FROM d
WHERE p.id = d.id AND d.rn > 1;

-- 6) FKs + indexes + composite uniques
DO $$ BEGIN
  ALTER TABLE "Brand" ADD CONSTRAINT "Brand_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Unit" ADD CONSTRAINT "Unit_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Brand_tenantId_brand_name_key" ON "Brand"("tenantId", "brand_name");
CREATE UNIQUE INDEX IF NOT EXISTS "Category_tenantId_category_name_key" ON "Category"("tenantId", "category_name");
CREATE UNIQUE INDEX IF NOT EXISTS "Category_tenantId_slug_key" ON "Category"("tenantId", "slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Unit_tenantId_unit_name_key" ON "Unit"("tenantId", "unit_name");
CREATE UNIQUE INDEX IF NOT EXISTS "Unit_tenantId_short_name_key" ON "Unit"("tenantId", "short_name");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_name_key" ON "Product"("tenantId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_code_key" ON "Product"("tenantId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "Product_tenantId_barcode_key" ON "Product"("tenantId", "barcode");

CREATE INDEX IF NOT EXISTS "Brand_tenantId_idx" ON "Brand"("tenantId");
CREATE INDEX IF NOT EXISTS "Category_tenantId_idx" ON "Category"("tenantId");
CREATE INDEX IF NOT EXISTS "Unit_tenantId_idx" ON "Unit"("tenantId");
CREATE INDEX IF NOT EXISTS "Product_tenantId_idx" ON "Product"("tenantId");
CREATE INDEX IF NOT EXISTS "Inventory_userId_isDeleted_idx" ON "Inventory"("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "Inventory_tenantId_isDeleted_idx" ON "Inventory"("tenantId", "isDeleted");
CREATE INDEX IF NOT EXISTS "Inventory_productId_idx" ON "Inventory"("productId");
