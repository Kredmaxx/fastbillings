-- Phase 72: AiConfig workspace uniqueness (one BYOK config per tenant)

ALTER TABLE "AiConfig" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "AiConfig" a
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE a."tenantId" IS NULL AND tm."userId" = a."userId";

UPDATE "AiConfig" a
SET "tenantId" = 'tenant_' || a."userId"
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || a."userId");

UPDATE "AiConfig" a
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Dedupe: keep newest row per tenantId
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
  FROM "AiConfig"
  WHERE "tenantId" IS NOT NULL
)
UPDATE "AiConfig" a
SET "tenantId" = NULL
FROM ranked r
WHERE a.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "AiConfig_tenantId_key"
  ON "AiConfig"("tenantId");

ALTER TABLE "AiConfig" DROP CONSTRAINT IF EXISTS "AiConfig_tenantId_fkey";
ALTER TABLE "AiConfig"
  ADD CONSTRAINT "AiConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
