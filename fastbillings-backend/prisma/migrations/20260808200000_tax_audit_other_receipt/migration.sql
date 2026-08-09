-- CreateTable
CREATE TABLE "TaxAuditOtherReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "receiptDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "taxClass" "IncomeTaxClass" NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxAuditOtherReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxAuditOtherReceipt_userId_isDeleted_receiptDate_idx" ON "TaxAuditOtherReceipt"("userId", "isDeleted", "receiptDate");

-- CreateIndex
CREATE INDEX "TaxAuditOtherReceipt_tenantId_isDeleted_receiptDate_idx" ON "TaxAuditOtherReceipt"("tenantId", "isDeleted", "receiptDate");

-- AddForeignKey
ALTER TABLE "TaxAuditOtherReceipt" ADD CONSTRAINT "TaxAuditOtherReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAuditOtherReceipt" ADD CONSTRAINT "TaxAuditOtherReceipt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
