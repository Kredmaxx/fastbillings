-- Phase 70: InvoicePayment tenant scope + payment-path IDOR hardening

ALTER TABLE "InvoicePayment" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill via parent invoice tenant, then received_by membership, then tenant_<received_by>
UPDATE "InvoicePayment" ip
SET "tenantId" = i."tenantId"
FROM "Invoice" i
WHERE ip."tenantId" IS NULL
  AND i."id" = ip."invoiceId"
  AND i."tenantId" IS NOT NULL;

UPDATE "InvoicePayment" ip
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE ip."tenantId" IS NULL AND tm."userId" = ip."received_by";

UPDATE "InvoicePayment" ip
SET "tenantId" = 'tenant_' || ip."received_by"
WHERE ip."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || ip."received_by");

UPDATE "InvoicePayment" ip
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE ip."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

CREATE INDEX IF NOT EXISTS "InvoicePayment_tenantId_idx"
  ON "InvoicePayment"("tenantId");

CREATE INDEX IF NOT EXISTS "InvoicePayment_invoiceId_idx"
  ON "InvoicePayment"("invoiceId");

CREATE INDEX IF NOT EXISTS "InvoicePayment_received_by_idx"
  ON "InvoicePayment"("received_by");

ALTER TABLE "InvoicePayment" DROP CONSTRAINT IF EXISTS "InvoicePayment_tenantId_fkey";
ALTER TABLE "InvoicePayment"
  ADD CONSTRAINT "InvoicePayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
