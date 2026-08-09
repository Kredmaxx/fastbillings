-- CreateTable
CREATE TABLE "TaxDepositChallan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "kind" TEXT NOT NULL,
    "fyLabel" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "section" TEXT,
    "bsrCode" TEXT NOT NULL,
    "challanNo" TEXT NOT NULL,
    "depositDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxDepositChallan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaxDepositChallan_userId_isDeleted_kind_fyLabel_quarter_idx" ON "TaxDepositChallan"("userId", "isDeleted", "kind", "fyLabel", "quarter");

-- CreateIndex
CREATE INDEX "TaxDepositChallan_tenantId_isDeleted_kind_fyLabel_quarter_idx" ON "TaxDepositChallan"("tenantId", "isDeleted", "kind", "fyLabel", "quarter");

-- AddForeignKey
ALTER TABLE "TaxDepositChallan" ADD CONSTRAINT "TaxDepositChallan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDepositChallan" ADD CONSTRAINT "TaxDepositChallan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
