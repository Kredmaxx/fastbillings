-- Phase 2: HSN/SAC on Product for India GST line reporting
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "hsnSac" TEXT;
CREATE INDEX IF NOT EXISTS "Product_tenantId_hsnSac_idx" ON "Product"("tenantId", "hsnSac");
