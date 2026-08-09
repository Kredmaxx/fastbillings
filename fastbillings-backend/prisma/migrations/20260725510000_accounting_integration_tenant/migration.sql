-- Phase 82: AccountingIntegration workspace uniqueness (one Xero/QB per tenant + kind)

ALTER TABLE "AccountingIntegration" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "AccountingIntegration" a
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE a."tenantId" IS NULL AND tm."userId" = a."userId";

UPDATE "AccountingIntegration" a
SET "tenantId" = 'tenant_' || a."userId"
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || a."userId");

UPDATE "AccountingIntegration" a
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Dedupe: keep newest row per (tenantId, kind)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "tenantId", kind
           ORDER BY "updatedAt" DESC, "createdAt" DESC
         ) AS rn
  FROM "AccountingIntegration"
  WHERE "tenantId" IS NOT NULL
)
DELETE FROM "AccountingIntegration" a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "accounting_integration_tenant_kind_unique"
  ON "AccountingIntegration"("tenantId", "kind");

CREATE INDEX IF NOT EXISTS "AccountingIntegration_tenantId_idx"
  ON "AccountingIntegration"("tenantId");

ALTER TABLE "AccountingIntegration" DROP CONSTRAINT IF EXISTS "AccountingIntegration_tenantId_fkey";
ALTER TABLE "AccountingIntegration"
  ADD CONSTRAINT "AccountingIntegration_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
