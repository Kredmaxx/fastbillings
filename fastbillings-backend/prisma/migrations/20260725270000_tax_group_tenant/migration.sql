-- AlterTable
ALTER TABLE "TaxGroup" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "TaxGroup" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TaxGroup_tenantId_idx" ON "TaxGroup"("tenantId");
CREATE INDEX IF NOT EXISTS "TaxGroup_userId_idx" ON "TaxGroup"("userId");

-- AddForeignKey
ALTER TABLE "TaxGroup" DROP CONSTRAINT IF EXISTS "TaxGroup_userId_fkey";
ALTER TABLE "TaxGroup"
  ADD CONSTRAINT "TaxGroup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TaxGroup" DROP CONSTRAINT IF EXISTS "TaxGroup_tenantId_fkey";
ALTER TABLE "TaxGroup"
  ADD CONSTRAINT "TaxGroup_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
