-- Phase 67: SupplierPayment tenant scope (close unscoped list / IDOR)

ALTER TABLE "SupplierPayment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill via parent purchase tenant, then createdBy membership, then tenant_<createdBy>, then oldest
UPDATE "SupplierPayment" sp
SET "tenantId" = p."tenantId"
FROM "Purchase" p
WHERE sp."tenantId" IS NULL
  AND p."id" = sp."purchaseId"
  AND p."tenantId" IS NOT NULL;

UPDATE "SupplierPayment" sp
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE sp."tenantId" IS NULL
  AND sp."createdBy" IS NOT NULL
  AND tm."userId" = sp."createdBy";

UPDATE "SupplierPayment" sp
SET "tenantId" = 'tenant_' || sp."createdBy"
WHERE sp."tenantId" IS NULL
  AND sp."createdBy" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || sp."createdBy");

UPDATE "SupplierPayment" sp
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE sp."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "SupplierPayment_tenantId_isDeleted_idx"
  ON "SupplierPayment"("tenantId", "isDeleted");

CREATE INDEX IF NOT EXISTS "SupplierPayment_createdBy_isDeleted_idx"
  ON "SupplierPayment"("createdBy", "isDeleted");

CREATE INDEX IF NOT EXISTS "SupplierPayment_purchaseId_idx"
  ON "SupplierPayment"("purchaseId");

ALTER TABLE "SupplierPayment" DROP CONSTRAINT IF EXISTS "SupplierPayment_tenantId_fkey";
ALTER TABLE "SupplierPayment"
  ADD CONSTRAINT "SupplierPayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
