-- CreateEnum
CREATE TYPE "ExpenseTaxClass" AS ENUM ('ALLOWABLE', 'DISALLOWABLE', 'CAPITAL', 'PERSONAL', 'UNCLASSIFIED');

-- AlterTable
ALTER TABLE "ExpenseCategory" ADD COLUMN "taxClass" "ExpenseTaxClass" NOT NULL DEFAULT 'UNCLASSIFIED';

-- CreateIndex
CREATE INDEX "ExpenseCategory_tenantId_taxClass_idx" ON "ExpenseCategory"("tenantId", "taxClass");
