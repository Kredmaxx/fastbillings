-- CreateTable
CREATE TABLE "SelfAssessmentTaxPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "fyLabel" TEXT NOT NULL,
    "paidDate" TIMESTAMP(3),
    "amount" DECIMAL(18,4) NOT NULL,
    "challanNo" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelfAssessmentTaxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SelfAssessmentTaxPayment_userId_isDeleted_fyLabel_idx" ON "SelfAssessmentTaxPayment"("userId", "isDeleted", "fyLabel");

-- CreateIndex
CREATE INDEX "SelfAssessmentTaxPayment_tenantId_isDeleted_fyLabel_idx" ON "SelfAssessmentTaxPayment"("tenantId", "isDeleted", "fyLabel");

-- AddForeignKey
ALTER TABLE "SelfAssessmentTaxPayment" ADD CONSTRAINT "SelfAssessmentTaxPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfAssessmentTaxPayment" ADD CONSTRAINT "SelfAssessmentTaxPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
