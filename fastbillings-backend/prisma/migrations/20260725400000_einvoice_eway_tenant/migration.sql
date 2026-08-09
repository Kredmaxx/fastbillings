-- Phase 65: EInvoiceRecord / EWayBillRecord tenant scope (workspace share + IDOR)

ALTER TABLE "EInvoiceRecord" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "EWayBillRecord" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill via parent invoice tenant, then membership, then tenant_<userId>, then oldest
UPDATE "EInvoiceRecord" r
SET "tenantId" = i."tenantId"
FROM "Invoice" i
WHERE r."tenantId" IS NULL
  AND i."id" = r."invoiceId"
  AND i."tenantId" IS NOT NULL;

UPDATE "EWayBillRecord" r
SET "tenantId" = i."tenantId"
FROM "Invoice" i
WHERE r."tenantId" IS NULL
  AND i."id" = r."invoiceId"
  AND i."tenantId" IS NOT NULL;

UPDATE "EInvoiceRecord" r
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE r."tenantId" IS NULL AND tm."userId" = r."userId";

UPDATE "EWayBillRecord" r
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE r."tenantId" IS NULL AND tm."userId" = r."userId";

UPDATE "EInvoiceRecord" r
SET "tenantId" = 'tenant_' || r."userId"
WHERE r."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || r."userId");

UPDATE "EWayBillRecord" r
SET "tenantId" = 'tenant_' || r."userId"
WHERE r."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || r."userId");

UPDATE "EInvoiceRecord" r
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE r."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

UPDATE "EWayBillRecord" r
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE r."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "EInvoiceRecord_tenantId_status_idx"
  ON "EInvoiceRecord"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "EWayBillRecord_tenantId_status_idx"
  ON "EWayBillRecord"("tenantId", "status");

ALTER TABLE "EInvoiceRecord" DROP CONSTRAINT IF EXISTS "EInvoiceRecord_tenantId_fkey";
ALTER TABLE "EInvoiceRecord"
  ADD CONSTRAINT "EInvoiceRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EWayBillRecord" DROP CONSTRAINT IF EXISTS "EWayBillRecord_tenantId_fkey";
ALTER TABLE "EWayBillRecord"
  ADD CONSTRAINT "EWayBillRecord_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
