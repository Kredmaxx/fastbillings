-- AlterTable
ALTER TABLE "FixedAsset" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FixedAsset_tenantId_status_isDeleted_idx"
  ON "FixedAsset"("tenantId", "status", "isDeleted");

-- AddForeignKey
ALTER TABLE "FixedAsset" DROP CONSTRAINT IF EXISTS "FixedAsset_tenantId_fkey";
ALTER TABLE "FixedAsset"
  ADD CONSTRAINT "FixedAsset_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
