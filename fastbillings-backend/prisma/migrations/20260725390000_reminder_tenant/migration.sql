-- Phase 61: Reminder workspace tenant scope

ALTER TABLE "Reminder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill via company settings tenant, then membership, then tenant_<createdBy>, then oldest
UPDATE "Reminder" r
SET "tenantId" = cs."tenantId"
FROM "CompanySettings" cs
WHERE r."tenantId" IS NULL
  AND cs."id" = r."companyId"
  AND cs."tenantId" IS NOT NULL;

UPDATE "Reminder" r
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE r."tenantId" IS NULL AND tm."userId" = r."createdBy";

UPDATE "Reminder" r
SET "tenantId" = 'tenant_' || r."createdBy"
WHERE r."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || r."createdBy");

UPDATE "Reminder" r
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE r."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "Reminder_tenantId_status_idx"
  ON "Reminder"("tenantId", "status");

ALTER TABLE "Reminder" DROP CONSTRAINT IF EXISTS "Reminder_tenantId_fkey";
ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
