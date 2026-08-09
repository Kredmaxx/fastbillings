-- Phase 59: CustomField tenant/user scope (was global catalog)

ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "CustomField" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Existing definitions: attach to oldest tenant (no creator column historically)
UPDATE "CustomField"
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "CustomField_tenantId_idx" ON "CustomField"("tenantId");
CREATE INDEX IF NOT EXISTS "CustomField_userId_idx" ON "CustomField"("userId");

ALTER TABLE "CustomField" DROP CONSTRAINT IF EXISTS "CustomField_userId_fkey";
ALTER TABLE "CustomField"
  ADD CONSTRAINT "CustomField_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomField" DROP CONSTRAINT IF EXISTS "CustomField_tenantId_fkey";
ALTER TABLE "CustomField"
  ADD CONSTRAINT "CustomField_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
