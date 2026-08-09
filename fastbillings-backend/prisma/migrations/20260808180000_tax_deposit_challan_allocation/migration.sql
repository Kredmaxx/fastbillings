-- CreateEnum
CREATE TYPE "TaxDepositChallanSourceType" AS ENUM ('PURCHASE', 'INVOICE');

-- CreateTable
CREATE TABLE "TaxDepositChallanAllocation" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "sourceType" "TaxDepositChallanSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxDepositChallanAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxDepositChallanAllocation_sourceType_sourceId_idx" ON "TaxDepositChallanAllocation"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "TaxDepositChallanAllocation_tenantId_sourceType_sourceId_idx" ON "TaxDepositChallanAllocation"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "TaxDepositChallanAllocation_userId_idx" ON "TaxDepositChallanAllocation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxDepositChallanAllocation_challanId_sourceType_sourceId_key" ON "TaxDepositChallanAllocation"("challanId", "sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "TaxDepositChallanAllocation" ADD CONSTRAINT "TaxDepositChallanAllocation_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "TaxDepositChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDepositChallanAllocation" ADD CONSTRAINT "TaxDepositChallanAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDepositChallanAllocation" ADD CONSTRAINT "TaxDepositChallanAllocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
