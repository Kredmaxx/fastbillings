-- AlterTable
ALTER TABLE "SalaryTdsDeduction" ADD COLUMN "employeePfAmount" DECIMAL(18,4),
ADD COLUMN "employeeEsiAmount" DECIMAL(18,4),
ADD COLUMN "pfDueDate" TIMESTAMP(3),
ADD COLUMN "pfDepositedDate" TIMESTAMP(3),
ADD COLUMN "esiDueDate" TIMESTAMP(3),
ADD COLUMN "esiDepositedDate" TIMESTAMP(3);
