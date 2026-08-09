-- Phase 68: BankTransaction + InvoiceTemplate tenant scope; close bankAccountId list IDOR

ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "InvoiceTemplate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- BankTransaction: backfill via bank account tenant, then bank account owner membership
UPDATE "BankTransaction" bt
SET "tenantId" = bd."tenantId"
FROM "BankDetail" bd
WHERE bt."tenantId" IS NULL
  AND bd."id" = bt."bankAccountId"
  AND bd."tenantId" IS NOT NULL;

UPDATE "BankTransaction" bt
SET "tenantId" = tm."tenantId"
FROM "BankDetail" bd
JOIN "TenantMembership" tm ON tm."userId" = bd."userId"
WHERE bt."tenantId" IS NULL
  AND bd."id" = bt."bankAccountId";

UPDATE "BankTransaction" bt
SET "tenantId" = 'tenant_' || bd."userId"
FROM "BankDetail" bd
WHERE bt."tenantId" IS NULL
  AND bd."id" = bt."bankAccountId"
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || bd."userId");

UPDATE "BankTransaction" bt
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE bt."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

-- InvoiceTemplate: membership → tenant_<userId> → oldest
UPDATE "InvoiceTemplate" t
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";

UPDATE "InvoiceTemplate" t
SET "tenantId" = 'tenant_' || t."userId"
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");

UPDATE "InvoiceTemplate" t
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE t."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "BankTransaction_tenantId_isDeleted_idx"
  ON "BankTransaction"("tenantId", "isDeleted");

CREATE INDEX IF NOT EXISTS "InvoiceTemplate_tenantId_idx"
  ON "InvoiceTemplate"("tenantId");

CREATE INDEX IF NOT EXISTS "InvoiceTemplate_userId_idx"
  ON "InvoiceTemplate"("userId");

ALTER TABLE "BankTransaction" DROP CONSTRAINT IF EXISTS "BankTransaction_tenantId_fkey";
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceTemplate" DROP CONSTRAINT IF EXISTS "InvoiceTemplate_tenantId_fkey";
ALTER TABLE "InvoiceTemplate"
  ADD CONSTRAINT "InvoiceTemplate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
