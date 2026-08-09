-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN     "userId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "ExpenseCategory_tenantId_isDeleted_idx" ON "ExpenseCategory"("tenantId", "isDeleted");

-- CreateIndex
CREATE INDEX "ExpenseCategory_userId_isDeleted_idx" ON "ExpenseCategory"("userId", "isDeleted");

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
