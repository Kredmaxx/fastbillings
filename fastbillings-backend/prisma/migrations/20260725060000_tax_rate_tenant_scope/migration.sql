-- Phase 3: tenant-scope TaxRate library

ALTER TABLE "TaxRate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill from membership of owning user
UPDATE "TaxRate" tr
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE tr."tenantId" IS NULL
  AND tm."userId" = tr."userId";

-- Fallback: single-tenant owner pattern tenant_<userId>
UPDATE "TaxRate" tr
SET "tenantId" = 'tenant_' || tr."userId"
WHERE tr."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = 'tenant_' || tr."userId");

-- Last resort: oldest tenant (keeps rows visible after cutover)
UPDATE "TaxRate" tr
SET "tenantId" = (SELECT t."id" FROM "Tenant" t ORDER BY t."createdAt" ASC LIMIT 1)
WHERE tr."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TaxRate_tenantId_fkey'
  ) THEN
    ALTER TABLE "TaxRate"
      ADD CONSTRAINT "TaxRate_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TaxRate_tenantId_isDeleted_regime_idx"
  ON "TaxRate" ("tenantId", "isDeleted", "regime");
