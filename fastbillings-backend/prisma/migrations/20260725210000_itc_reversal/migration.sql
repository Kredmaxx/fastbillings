-- CreateTable
CREATE TABLE "ItcReversal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "reversalDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "cgst" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "igst" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "cess" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItcReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItcReversal_userId_isDeleted_reversalDate_idx" ON "ItcReversal"("userId", "isDeleted", "reversalDate");

-- CreateIndex
CREATE INDEX "ItcReversal_tenantId_isDeleted_reversalDate_idx" ON "ItcReversal"("tenantId", "isDeleted", "reversalDate");

-- AddForeignKey
ALTER TABLE "ItcReversal" ADD CONSTRAINT "ItcReversal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItcReversal" ADD CONSTRAINT "ItcReversal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
