-- Phase 57: Quotation tenant scope (close get-by-id / mutate IDOR)

ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill: membership → tenant_<userId> → oldest tenant
UPDATE "Quotation" t
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";

UPDATE "Quotation" t
SET "tenantId" = 'tenant_' || t."userId"
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");

UPDATE "Quotation" t
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "Quotation_tenantId_idx"
  ON "Quotation"("tenantId");

CREATE INDEX IF NOT EXISTS "Quotation_userId_isDeleted_idx"
  ON "Quotation"("userId", "isDeleted");

ALTER TABLE "Quotation" DROP CONSTRAINT IF EXISTS "Quotation_tenantId_fkey";
ALTER TABLE "Quotation"
  ADD CONSTRAINT "Quotation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
