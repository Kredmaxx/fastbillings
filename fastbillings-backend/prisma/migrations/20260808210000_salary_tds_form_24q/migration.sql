-- AlterEnum
ALTER TYPE "TaxDepositChallanSourceType" ADD VALUE 'SALARY';

-- CreateTable
CREATE TABLE "SalaryTdsEmployee" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "pan" TEXT,
    "employeeCode" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryTdsEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryTdsDeduction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "employeeId" TEXT NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "amountPaid" DECIMAL(18,4) NOT NULL,
    "tdsAmount" DECIMAL(18,4) NOT NULL,
    "section" TEXT NOT NULL DEFAULT '192',
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryTdsDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalaryTdsEmployee_userId_isDeleted_idx" ON "SalaryTdsEmployee"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "SalaryTdsEmployee_tenantId_isDeleted_idx" ON "SalaryTdsEmployee"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "SalaryTdsDeduction_userId_isDeleted_payDate_idx" ON "SalaryTdsDeduction"("userId", "isDeleted", "payDate");

-- CreateIndex
CREATE INDEX "SalaryTdsDeduction_tenantId_isDeleted_payDate_idx" ON "SalaryTdsDeduction"("tenantId", "isDeleted", "payDate");

-- CreateIndex
CREATE INDEX "SalaryTdsDeduction_employeeId_isDeleted_idx" ON "SalaryTdsDeduction"("employeeId", "isDeleted");

-- AddForeignKey
ALTER TABLE "SalaryTdsEmployee" ADD CONSTRAINT "SalaryTdsEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryTdsEmployee" ADD CONSTRAINT "SalaryTdsEmployee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryTdsDeduction" ADD CONSTRAINT "SalaryTdsDeduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryTdsDeduction" ADD CONSTRAINT "SalaryTdsDeduction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryTdsDeduction" ADD CONSTRAINT "SalaryTdsDeduction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "SalaryTdsEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
