-- Phase 56: DeliveryChallan tenant scope (close unscoped list / IDOR)

ALTER TABLE "DeliveryChallan" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill: membership → tenant_<userId> → oldest tenant
UPDATE "DeliveryChallan" t
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";

UPDATE "DeliveryChallan" t
SET "tenantId" = 'tenant_' || t."userId"
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");

UPDATE "DeliveryChallan" t
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "DeliveryChallan_tenantId_idx"
  ON "DeliveryChallan"("tenantId");

CREATE INDEX IF NOT EXISTS "DeliveryChallan_userId_isDeleted_idx"
  ON "DeliveryChallan"("userId", "isDeleted");

ALTER TABLE "DeliveryChallan" DROP CONSTRAINT IF EXISTS "DeliveryChallan_tenantId_fkey";
ALTER TABLE "DeliveryChallan"
  ADD CONSTRAINT "DeliveryChallan_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
