-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "section40A2FairMarketValue" DECIMAL(18,4),
ADD COLUMN "section40A2FmvNote" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "section40A2FairMarketValue" DECIMAL(18,4),
ADD COLUMN "section40A2FmvNote" TEXT;
