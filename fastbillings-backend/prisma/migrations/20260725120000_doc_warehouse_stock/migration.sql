-- Phase 9: document-level warehouse for invoice issue / purchase receipt

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;

CREATE INDEX IF NOT EXISTS "Invoice_warehouseId_idx" ON "Invoice"("warehouseId");
CREATE INDEX IF NOT EXISTS "Purchase_warehouseId_idx" ON "Purchase"("warehouseId");

DO $$ BEGIN
  ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_warehouseId_fkey"
    FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Claim legacy null-warehouse inventory onto each owner's default warehouse when unique allows
UPDATE "Inventory" i
SET "warehouseId" = w."id",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Warehouse" w
WHERE i."warehouseId" IS NULL
  AND i."isDeleted" = false
  AND w."isDefault" = true
  AND w."isDeleted" = false
  AND w."userId" = i."userId"
  AND ((w."tenantId" IS NULL AND i."tenantId" IS NULL) OR w."tenantId" = i."tenantId")
  AND NOT EXISTS (
    SELECT 1 FROM "Inventory" x
    WHERE x."userId" = i."userId"
      AND x."productId" = i."productId"
      AND x."warehouseId" = w."id"
      AND x."isDeleted" = false
  );
