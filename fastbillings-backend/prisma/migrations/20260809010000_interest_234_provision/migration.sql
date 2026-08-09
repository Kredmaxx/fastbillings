-- CreateTable
CREATE TABLE "Interest234Provision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "fyLabel" TEXT NOT NULL,
    "provisionDate" TIMESTAMP(3) NOT NULL,
    "amount234B" DECIMAL(18,4) NOT NULL,
    "amount234C" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "estimatedLiabilitySnapshot" DECIMAL(18,4),
    "advanceTaxPaidSnapshot" DECIMAL(18,4),
    "asOfDate" TIMESTAMP(3),
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interest234Provision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Interest234Provision_userId_isDeleted_fyLabel_idx" ON "Interest234Provision"("userId", "isDeleted", "fyLabel");

-- CreateIndex
CREATE INDEX "Interest234Provision_tenantId_isDeleted_fyLabel_idx" ON "Interest234Provision"("tenantId", "isDeleted", "fyLabel");

-- AddForeignKey
ALTER TABLE "Interest234Provision" ADD CONSTRAINT "Interest234Provision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interest234Provision" ADD CONSTRAINT "Interest234Provision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
