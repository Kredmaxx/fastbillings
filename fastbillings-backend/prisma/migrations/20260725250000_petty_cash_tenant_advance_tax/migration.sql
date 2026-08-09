-- AlterTable
ALTER TABLE "PettyCash" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "PettyCash_tenantId_isDeleted_idx" ON "PettyCash"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "PettyCash_userId_isDeleted_idx" ON "PettyCash"("userId", "isDeleted");

-- AddForeignKey
ALTER TABLE "PettyCash" ADD CONSTRAINT "PettyCash_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PettyCash" ADD CONSTRAINT "PettyCash_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AdvanceTaxPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "fyLabel" TEXT NOT NULL,
    "installment" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidDate" TIMESTAMP(3),
    "amount" DECIMAL(18,4) NOT NULL,
    "challanNo" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvanceTaxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvanceTaxPayment_userId_isDeleted_fyLabel_idx" ON "AdvanceTaxPayment"("userId", "isDeleted", "fyLabel");

-- CreateIndex
CREATE INDEX "AdvanceTaxPayment_tenantId_isDeleted_fyLabel_idx" ON "AdvanceTaxPayment"("tenantId", "isDeleted", "fyLabel");

-- AddForeignKey
ALTER TABLE "AdvanceTaxPayment" ADD CONSTRAINT "AdvanceTaxPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceTaxPayment" ADD CONSTRAINT "AdvanceTaxPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
