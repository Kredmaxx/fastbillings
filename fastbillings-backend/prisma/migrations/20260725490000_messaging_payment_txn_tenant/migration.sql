-- Phase 80: MessagingConfig uniqueness + PaymentTransaction/Refund tenant scope

-- ---------------------------------------------------------------------------
-- MessagingConfig
-- ---------------------------------------------------------------------------
ALTER TABLE "MessagingConfig" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "MessagingConfig" m
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE m."tenantId" IS NULL AND tm."userId" = m."userId";

UPDATE "MessagingConfig" m
SET "tenantId" = 'tenant_' || m."userId"
WHERE m."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || m."userId");

UPDATE "MessagingConfig" m
SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1)
WHERE m."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY "tenantId" ORDER BY "updatedAt" DESC, "createdAt" DESC) AS rn
  FROM "MessagingConfig"
  WHERE "tenantId" IS NOT NULL
)
UPDATE "MessagingConfig" m
SET "tenantId" = NULL
FROM ranked r
WHERE m.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "MessagingConfig_tenantId_key"
  ON "MessagingConfig"("tenantId");

ALTER TABLE "MessagingConfig" DROP CONSTRAINT IF EXISTS "MessagingConfig_tenantId_fkey";
ALTER TABLE "MessagingConfig"
  ADD CONSTRAINT "MessagingConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- PaymentTransaction
-- ---------------------------------------------------------------------------
ALTER TABLE "PaymentTransaction" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "PaymentTransaction" p
SET "tenantId" = i."tenantId"
FROM "Invoice" i
WHERE p."tenantId" IS NULL AND p."invoiceId" = i."id" AND i."tenantId" IS NOT NULL;

UPDATE "PaymentTransaction" p
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE p."tenantId" IS NULL AND tm."userId" = p."userId";

UPDATE "PaymentTransaction" p
SET "tenantId" = 'tenant_' || p."userId"
WHERE p."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || p."userId");

CREATE INDEX IF NOT EXISTS "PaymentTransaction_tenantId_status_idx"
  ON "PaymentTransaction"("tenantId", "status");

ALTER TABLE "PaymentTransaction" DROP CONSTRAINT IF EXISTS "PaymentTransaction_tenantId_fkey";
ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Refund
-- ---------------------------------------------------------------------------
ALTER TABLE "Refund" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

UPDATE "Refund" r
SET "tenantId" = p."tenantId"
FROM "PaymentTransaction" p
WHERE r."tenantId" IS NULL AND r."paymentTransactionId" = p."id" AND p."tenantId" IS NOT NULL;

UPDATE "Refund" r
SET "tenantId" = tm."tenantId"
FROM "TenantMembership" tm
WHERE r."tenantId" IS NULL AND tm."userId" = r."userId";

CREATE INDEX IF NOT EXISTS "Refund_tenantId_idx"
  ON "Refund"("tenantId");

ALTER TABLE "Refund" DROP CONSTRAINT IF EXISTS "Refund_tenantId_fkey";
ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
