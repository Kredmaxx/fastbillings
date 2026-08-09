-- CreateEnum
CREATE TYPE "Section43BNature" AS ENUM (
  'NONE',
  'BONUS',
  'PF_EMPLOYER',
  'ESI_EMPLOYER',
  'LEAVE_ENCASHMENT',
  'INTEREST_BANK',
  'TAX_DUTY_CESS',
  'OTHER_43B'
);

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN "section43BNature" "Section43BNature" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "paidDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ExpenseCategory_tenantId_section43BNature_idx" ON "ExpenseCategory"("tenantId", "section43BNature");
