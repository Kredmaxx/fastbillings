-- Phase 79: GatewayConfig workspace uniqueness (one config per tenant + kind)

ALTER TABLE "GatewayConfig" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "GatewayConfig" g
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE g."tenantId" IS NULL AND tm."userId" = g."userId";

UPDATE "GatewayConfig" g
SET "tenantId" = 'tenant_' || g."userId"
WHERE g."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || g."userId");

UPDATE "GatewayConfig" g
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE g."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- Dedupe: keep newest row per (tenantId, kind)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "tenantId", kind
           ORDER BY "updatedAt" DESC, "createdAt" DESC
         ) AS rn
  FROM "GatewayConfig"
  WHERE "tenantId" IS NOT NULL
)
DELETE FROM "GatewayConfig" g
USING ranked r
WHERE g.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "gateway_tenant_kind_unique"
  ON "GatewayConfig"("tenantId", "kind");

CREATE INDEX IF NOT EXISTS "GatewayConfig_tenantId_idx"
  ON "GatewayConfig"("tenantId");

ALTER TABLE "GatewayConfig" DROP CONSTRAINT IF EXISTS "GatewayConfig_tenantId_fkey";
ALTER TABLE "GatewayConfig"
  ADD CONSTRAINT "GatewayConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
