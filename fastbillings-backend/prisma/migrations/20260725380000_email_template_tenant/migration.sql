-- Phase 60: EmailTemplate system vs workspace ownership

ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "EmailTemplate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Existing rows are the shared seed / pre-tenant library
UPDATE "EmailTemplate" SET "isSystem" = true WHERE "tenantId" IS NULL AND "userId" IS NULL;

CREATE INDEX IF NOT EXISTS "EmailTemplate_tenantId_idx" ON "EmailTemplate"("tenantId");
CREATE INDEX IF NOT EXISTS "EmailTemplate_userId_idx" ON "EmailTemplate"("userId");
CREATE INDEX IF NOT EXISTS "EmailTemplate_isSystem_idx" ON "EmailTemplate"("isSystem");

ALTER TABLE "EmailTemplate" DROP CONSTRAINT IF EXISTS "EmailTemplate_userId_fkey";
ALTER TABLE "EmailTemplate"
  ADD CONSTRAINT "EmailTemplate_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmailTemplate" DROP CONSTRAINT IF EXISTS "EmailTemplate_tenantId_fkey";
ALTER TABLE "EmailTemplate"
  ADD CONSTRAINT "EmailTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
