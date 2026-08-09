-- Phase 78: EmailSettings workspace uniqueness (one mail config per tenant)

ALTER TABLE "EmailSettings" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "EmailSettings" e
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE e."tenantId" IS NULL AND tm."userId" = e."userId";

UPDATE "EmailSettings" e
SET "tenantId" = 'tenant_' || e."userId"
WHERE e."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || e."userId");

UPDATE "EmailSettings" e
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE e."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Dedupe: keep newest row per tenantId
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
  FROM "EmailSettings"
  WHERE "tenantId" IS NOT NULL
)
DELETE FROM "EmailSettings" e
USING ranked r
WHERE e.id = r.id AND r.rn > 1;

-- Dedupe: keep newest row per userId (for userId unique)
WITH ranked_user AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
  FROM "EmailSettings"
)
DELETE FROM "EmailSettings" e
USING ranked_user r
WHERE e.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "EmailSettings_tenantId_key"
  ON "EmailSettings"("tenantId");

CREATE UNIQUE INDEX IF NOT EXISTS "EmailSettings_userId_key"
  ON "EmailSettings"("userId");

ALTER TABLE "EmailSettings" DROP CONSTRAINT IF EXISTS "EmailSettings_tenantId_fkey";
ALTER TABLE "EmailSettings"
  ADD CONSTRAINT "EmailSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
