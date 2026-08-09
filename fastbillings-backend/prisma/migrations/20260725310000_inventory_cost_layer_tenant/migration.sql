-- AlterTable
ALTER TABLE "InventoryCostLayer" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InventoryCostLayer_tenantId_productId_receivedAt_idx"
  ON "InventoryCostLayer"("tenantId", "productId", "receivedAt");

-- AddForeignKey (userId may already lack FK)
ALTER TABLE "InventoryCostLayer" DROP CONSTRAINT IF EXISTS "InventoryCostLayer_userId_fkey";
ALTER TABLE "InventoryCostLayer"
  ADD CONSTRAINT "InventoryCostLayer_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryCostLayer" DROP CONSTRAINT IF EXISTS "InventoryCostLayer_tenantId_fkey";
ALTER TABLE "InventoryCostLayer"
  ADD CONSTRAINT "InventoryCostLayer_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
