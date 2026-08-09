-- BankDetail: tenant scope + per-user account number uniqueness
ALTER TABLE "BankDetail" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

DROP INDEX IF EXISTS "BankDetail_accountNumber_key";

CREATE UNIQUE INDEX IF NOT EXISTS "BankDetail_userId_accountNumber_key"
  ON "BankDetail"("userId", "accountNumber");

CREATE INDEX IF NOT EXISTS "BankDetail_tenantId_isDeleted_idx"
  ON "BankDetail"("tenantId", "isDeleted");

ALTER TABLE "BankDetail" DROP CONSTRAINT IF EXISTS "BankDetail_tenantId_fkey";
ALTER TABLE "BankDetail"
  ADD CONSTRAINT "BankDetail_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- PaymentMode: tenant/user ownership for custom modes; system modes shared
ALTER TABLE "PaymentMode" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PaymentMode" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "PaymentMode" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Existing rows are platform/system modes (cash, bank-transfer, …)
UPDATE "PaymentMode" SET "isSystem" = true WHERE "tenantId" IS NULL;

-- name is no longer globally unique (custom modes can reuse display names across tenants)
DROP INDEX IF EXISTS "PaymentMode_name_key";

CREATE INDEX IF NOT EXISTS "PaymentMode_tenantId_idx" ON "PaymentMode"("tenantId");
CREATE INDEX IF NOT EXISTS "PaymentMode_userId_idx" ON "PaymentMode"("userId");
CREATE INDEX IF NOT EXISTS "PaymentMode_isSystem_idx" ON "PaymentMode"("isSystem");

ALTER TABLE "PaymentMode" DROP CONSTRAINT IF EXISTS "PaymentMode_userId_fkey";
ALTER TABLE "PaymentMode"
  ADD CONSTRAINT "PaymentMode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentMode" DROP CONSTRAINT IF EXISTS "PaymentMode_tenantId_fkey";
ALTER TABLE "PaymentMode"
  ADD CONSTRAINT "PaymentMode_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
