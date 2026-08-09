-- CreateEnum
CREATE TYPE "IncomeTaxClass" AS ENUM ('BUSINESS', 'EXEMPT', 'CAPITAL', 'OTHER', 'UNCLASSIFIED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "taxClass" "IncomeTaxClass" NOT NULL DEFAULT 'UNCLASSIFIED';

-- CreateIndex
CREATE INDEX "Category_tenantId_taxClass_idx" ON "Category"("tenantId", "taxClass");
