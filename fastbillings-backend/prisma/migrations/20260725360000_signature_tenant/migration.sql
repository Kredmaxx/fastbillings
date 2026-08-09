-- Phase 58: Signature tenant scope (workspace-shared marks)

ALTER TABLE "Signature" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill: membership → tenant_<userId> → oldest tenant
UPDATE "Signature" t
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";

UPDATE "Signature" t
SET "tenantId" = 'tenant_' || t."userId"
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");

UPDATE "Signature" t
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "Signature_tenantId_idx"
  ON "Signature"("tenantId");

CREATE INDEX IF NOT EXISTS "Signature_userId_isDeleted_idx"
  ON "Signature"("userId", "isDeleted");

ALTER TABLE "Signature" DROP CONSTRAINT IF EXISTS "Signature_tenantId_fkey";
ALTER TABLE "Signature"
  ADD CONSTRAINT "Signature_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
