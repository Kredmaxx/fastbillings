-- Phase 12: batch / serial inventory tracking

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "trackingMode" TEXT NOT NULL DEFAULT 'NONE';

CREATE TABLE IF NOT EXISTS "InventoryBatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "lotNumber" TEXT NOT NULL,
  "expiryDate" TIMESTAMP(3),
  "qtyOnHand" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(18,4),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryBatch_userId_productId_warehouseId_lotNumber_key"
  ON "InventoryBatch"("userId", "productId", "warehouseId", "lotNumber");
CREATE INDEX IF NOT EXISTS "InventoryBatch_tenantId_idx" ON "InventoryBatch"("tenantId");
CREATE INDEX IF NOT EXISTS "InventoryBatch_productId_warehouseId_idx" ON "InventoryBatch"("productId", "warehouseId");
CREATE INDEX IF NOT EXISTS "InventoryBatch_expiryDate_idx" ON "InventoryBatch"("expiryDate");

DO $$ BEGIN
  ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "InventorySerial" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "productId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "batchId" TEXT,
  "serialNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "unitCost" DECIMAL(18,4),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "soldAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventorySerial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventorySerial_userId_productId_serialNumber_key"
  ON "InventorySerial"("userId", "productId", "serialNumber");
CREATE INDEX IF NOT EXISTS "InventorySerial_tenantId_idx" ON "InventorySerial"("tenantId");
CREATE INDEX IF NOT EXISTS "InventorySerial_productId_status_idx" ON "InventorySerial"("productId", "status");
CREATE INDEX IF NOT EXISTS "InventorySerial_warehouseId_status_idx" ON "InventorySerial"("warehouseId", "status");

DO $$ BEGIN
  ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_batchId_fkey"
    FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
