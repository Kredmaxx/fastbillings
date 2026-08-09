-- Phase 6: warehouses, stock transfers, FY close flags

CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "isClosed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3);
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "closedBy" TEXT;
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "closingJournalId" TEXT;

CREATE TABLE IF NOT EXISTS "StockTransfer" (
  "id" TEXT NOT NULL,
  "transferNumber" TEXT,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "fromWarehouseId" TEXT NOT NULL,
  "toWarehouseId" TEXT NOT NULL,
  "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StockTransferLine" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
  CONSTRAINT "StockTransferLine_pkey" PRIMARY KEY ("id")
);

-- Create a default warehouse per distinct inventory owner (userId + tenantId)
INSERT INTO "Warehouse" ("id", "userId", "tenantId", "name", "code", "isDefault", "isDeleted", "createdAt", "updatedAt")
SELECT
  md5(COALESCE(i."tenantId", '') || ':' || i."userId" || ':default-wh'),
  i."userId",
  i."tenantId",
  'Main Warehouse',
  'MAIN',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "userId", "tenantId" FROM "Inventory" WHERE "isDeleted" = false
) i
WHERE NOT EXISTS (
  SELECT 1 FROM "Warehouse" w
  WHERE w."userId" = i."userId"
    AND w."isDefault" = true
    AND w."isDeleted" = false
    AND ((w."tenantId" IS NULL AND i."tenantId" IS NULL) OR w."tenantId" = i."tenantId")
);

-- Also ensure tenants with memberships get a default warehouse even without inventory
INSERT INTO "Warehouse" ("id", "userId", "tenantId", "name", "code", "isDefault", "isDeleted", "createdAt", "updatedAt")
SELECT
  md5(tm."tenantId" || ':' || tm."userId" || ':default-wh'),
  tm."userId",
  tm."tenantId",
  'Main Warehouse',
  'MAIN',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "TenantMembership" tm
WHERE NOT EXISTS (
  SELECT 1 FROM "Warehouse" w
  WHERE w."tenantId" = tm."tenantId" AND w."isDefault" = true AND w."isDeleted" = false
);

UPDATE "Inventory" i
SET "warehouseId" = w."id"
FROM "Warehouse" w
WHERE i."warehouseId" IS NULL
  AND w."userId" = i."userId"
  AND w."isDefault" = true
  AND w."isDeleted" = false
  AND ((w."tenantId" IS NULL AND i."tenantId" IS NULL) OR w."tenantId" = i."tenantId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Warehouse_userId_fkey') THEN
    ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Warehouse_tenantId_fkey') THEN
    ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Inventory_warehouseId_fkey') THEN
    ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_warehouseId_fkey"
      FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_userId_fkey') THEN
    ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_tenantId_fkey') THEN
    ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_fromWarehouseId_fkey') THEN
    ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_fromWarehouseId_fkey"
      FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransfer_toWarehouseId_fkey') THEN
    ALTER TABLE "StockTransfer" ADD CONSTRAINT "StockTransfer_toWarehouseId_fkey"
      FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransferLine_transferId_fkey') THEN
    ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_transferId_fkey"
      FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockTransferLine_productId_fkey') THEN
    ALTER TABLE "StockTransferLine" ADD CONSTRAINT "StockTransferLine_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Deduplicate inventory rows that would violate unique (keep oldest)
DELETE FROM "Inventory" a
USING "Inventory" b
WHERE a."userId" = b."userId"
  AND a."productId" = b."productId"
  AND a."warehouseId" IS NOT DISTINCT FROM b."warehouseId"
  AND a."createdAt" > b."createdAt"
  AND a."isDeleted" = false
  AND b."isDeleted" = false;

CREATE UNIQUE INDEX IF NOT EXISTS "Inventory_userId_productId_warehouseId_key"
  ON "Inventory" ("userId", "productId", "warehouseId");

CREATE INDEX IF NOT EXISTS "Warehouse_tenantId_isDeleted_idx" ON "Warehouse" ("tenantId", "isDeleted");
CREATE INDEX IF NOT EXISTS "Warehouse_userId_isDeleted_idx" ON "Warehouse" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "Inventory_warehouseId_idx" ON "Inventory" ("warehouseId");
CREATE INDEX IF NOT EXISTS "StockTransfer_tenantId_transferDate_idx" ON "StockTransfer" ("tenantId", "transferDate");
CREATE INDEX IF NOT EXISTS "StockTransfer_userId_isDeleted_idx" ON "StockTransfer" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "StockTransferLine_transferId_idx" ON "StockTransferLine" ("transferId");
CREATE INDEX IF NOT EXISTS "StockTransferLine_productId_idx" ON "StockTransferLine" ("productId");
