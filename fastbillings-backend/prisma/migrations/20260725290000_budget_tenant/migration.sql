-- AlterTable
ALTER TABLE "Budget" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Budget_tenantId_accountId_periodStart_idx"
  ON "Budget"("tenantId", "accountId", "periodStart");

-- AddForeignKey
ALTER TABLE "Budget" DROP CONSTRAINT IF EXISTS "Budget_tenantId_fkey";
ALTER TABLE "Budget"
  ADD CONSTRAINT "Budget_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
