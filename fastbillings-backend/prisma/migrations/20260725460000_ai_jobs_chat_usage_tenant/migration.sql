-- Phase 73: AiExtractionJob / AiChatSession / AiUsageLog workspace scope

ALTER TABLE "AiExtractionJob" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AiChatSession" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AiUsageLog" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "AiExtractionJob" a
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE a."tenantId" IS NULL AND tm."userId" = a."userId";

UPDATE "AiChatSession" a
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE a."tenantId" IS NULL AND tm."userId" = a."userId";

UPDATE "AiUsageLog" a
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE a."tenantId" IS NULL AND tm."userId" = a."userId";

UPDATE "AiExtractionJob" a
SET "tenantId" = 'tenant_' || a."userId"
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || a."userId");

UPDATE "AiChatSession" a
SET "tenantId" = 'tenant_' || a."userId"
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || a."userId");

UPDATE "AiUsageLog" a
SET "tenantId" = 'tenant_' || a."userId"
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || a."userId");

UPDATE "AiExtractionJob" a
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

UPDATE "AiChatSession" a
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

UPDATE "AiUsageLog" a
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE a."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "AiExtractionJob_tenantId_status_idx"
  ON "AiExtractionJob"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "AiChatSession_tenantId_updatedAt_idx"
  ON "AiChatSession"("tenantId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiUsageLog_tenantId_createdAt_idx"
  ON "AiUsageLog"("tenantId", "createdAt");

ALTER TABLE "AiExtractionJob" DROP CONSTRAINT IF EXISTS "AiExtractionJob_tenantId_fkey";
ALTER TABLE "AiExtractionJob"
  ADD CONSTRAINT "AiExtractionJob_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiChatSession" DROP CONSTRAINT IF EXISTS "AiChatSession_tenantId_fkey";
ALTER TABLE "AiChatSession"
  ADD CONSTRAINT "AiChatSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiUsageLog" DROP CONSTRAINT IF EXISTS "AiUsageLog_tenantId_fkey";
ALTER TABLE "AiUsageLog"
  ADD CONSTRAINT "AiUsageLog_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
