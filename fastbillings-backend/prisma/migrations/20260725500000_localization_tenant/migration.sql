-- Phase 81: Localization unique per tenant (workspace timezone / date format)

ALTER TABLE "Localization" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "Localization" l
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE l."tenantId" IS NULL AND tm."userId" = l."userId";

UPDATE "Localization" l
SET "tenantId" = 'tenant_' || l."userId"
WHERE l."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || l."userId");

UPDATE "Localization" l
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE l."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Keep newest active row per tenant; clear tenantId on duplicates so unique holds
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
  FROM "Localization"
  WHERE "tenantId" IS NOT NULL
)
UPDATE "Localization" l
SET "tenantId" = NULL
FROM ranked r
WHERE l.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Localization_tenantId_key"
  ON "Localization"("tenantId");

ALTER TABLE "Localization" DROP CONSTRAINT IF EXISTS "Localization_tenantId_fkey";
ALTER TABLE "Localization"
  ADD CONSTRAINT "Localization_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
