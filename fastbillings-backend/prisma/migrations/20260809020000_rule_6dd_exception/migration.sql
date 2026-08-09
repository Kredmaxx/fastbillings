-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "rule6DdExceptionCode" TEXT;

-- AlterTable
ALTER TABLE "SupplierPayment" ADD COLUMN "rule6DdExceptionCode" TEXT;

-- CreateIndex
CREATE INDEX "Expense_rule6DdExceptionCode_idx" ON "Expense"("rule6DdExceptionCode");

-- CreateIndex
CREATE INDEX "SupplierPayment_rule6DdExceptionCode_idx" ON "SupplierPayment"("rule6DdExceptionCode");
