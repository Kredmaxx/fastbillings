-- Phase 14: BOM + manufacture orders

DO $$ BEGIN
  CREATE TYPE "ManufactureOrderStatus" AS ENUM ('DRAFT', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Bom" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "finishedProductId" TEXT NOT NULL,
  "name" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Bom_userId_finishedProductId_key" ON "Bom"("userId", "finishedProductId");
CREATE INDEX IF NOT EXISTS "Bom_tenantId_isDeleted_idx" ON "Bom"("tenantId", "isDeleted");
CREATE INDEX IF NOT EXISTS "Bom_userId_isDeleted_idx" ON "Bom"("userId", "isDeleted");

DO $$ BEGIN
  ALTER TABLE "Bom" ADD CONSTRAINT "Bom_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Bom" ADD CONSTRAINT "Bom_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "Bom" ADD CONSTRAINT "Bom_finishedProductId_fkey"
    FOREIGN KEY ("finishedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "BomLine" (
  "id" TEXT NOT NULL,
  "bomId" TEXT NOT NULL,
  "componentProductId" TEXT NOT NULL,
  "qtyPerBuild" DECIMAL(18,4) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BomLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BomLine_bomId_componentProductId_key" ON "BomLine"("bomId", "componentProductId");
CREATE INDEX IF NOT EXISTS "BomLine_bomId_idx" ON "BomLine"("bomId");

DO $$ BEGIN
  ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_bomId_fkey"
    FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_componentProductId_fkey"
    FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufactureOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "bomId" TEXT NOT NULL,
  "orderNumber" TEXT,
  "warehouseId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "status" "ManufactureOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "completedAt" TIMESTAMP(3),
  "totalBuildCost" DECIMAL(18,4),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManufactureOrder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ManufactureOrder_tenantId_status_idx" ON "ManufactureOrder"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "ManufactureOrder_userId_isDeleted_idx" ON "ManufactureOrder"("userId", "isDeleted");

DO $$ BEGIN
  ALTER TABLE "ManufactureOrder" ADD CONSTRAINT "ManufactureOrder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufactureOrder" ADD CONSTRAINT "ManufactureOrder_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufactureOrder" ADD CONSTRAINT "ManufactureOrder_bomId_fkey"
    FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufactureOrder" ADD CONSTRAINT "ManufactureOrder_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ManufactureOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
  CONSTRAINT "ManufactureOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ManufactureOrderLine_orderId_idx" ON "ManufactureOrderLine"("orderId");
CREATE INDEX IF NOT EXISTS "ManufactureOrderLine_productId_idx" ON "ManufactureOrderLine"("productId");

DO $$ BEGIN
  ALTER TABLE "ManufactureOrderLine" ADD CONSTRAINT "ManufactureOrderLine_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "ManufactureOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "ManufactureOrderLine" ADD CONSTRAINT "ManufactureOrderLine_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
