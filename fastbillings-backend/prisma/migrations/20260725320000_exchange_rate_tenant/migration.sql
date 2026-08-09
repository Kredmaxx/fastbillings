-- AlterTable
ALTER TABLE "ExchangeRate" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExchangeRate_tenantId_fromCurrency_toCurrency_asOfDate_idx"
  ON "ExchangeRate"("tenantId", "fromCurrency", "toCurrency", "asOfDate");

-- AddForeignKey
ALTER TABLE "ExchangeRate" DROP CONSTRAINT IF EXISTS "ExchangeRate_tenantId_fkey";
ALTER TABLE "ExchangeRate"
  ADD CONSTRAINT "ExchangeRate_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
