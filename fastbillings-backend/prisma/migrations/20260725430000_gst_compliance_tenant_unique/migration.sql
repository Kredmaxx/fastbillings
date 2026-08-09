-- Phase 69: GstComplianceConfig workspace uniqueness (one config per tenant)

-- Backfill tenantId via membership / tenant_<userId> / oldest
UPDATE "GstComplianceConfig" g
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE g."tenantId" IS NULL AND tm."userId" = g."userId";

UPDATE "GstComplianceConfig" g
SET "tenantId" = 'tenant_' || g."userId"
WHERE g."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || g."userId");

UPDATE "GstComplianceConfig" g
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE g."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Dedupe: keep newest row per tenantId; clear tenantId on older duplicates
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
  FROM "GstComplianceConfig"
  WHERE "tenantId" IS NOT NULL
)
UPDATE "GstComplianceConfig" g
SET "tenantId" = NULL
FROM ranked r
WHERE g.id = r.id AND r.rn > 1;

DROP INDEX IF EXISTS "GstComplianceConfig_tenantId_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "GstComplianceConfig_tenantId_key"
  ON "GstComplianceConfig"("tenantId");

ALTER TABLE "GstComplianceConfig" DROP CONSTRAINT IF EXISTS "GstComplianceConfig_tenantId_fkey";
ALTER TABLE "GstComplianceConfig"
  ADD CONSTRAINT "GstComplianceConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
