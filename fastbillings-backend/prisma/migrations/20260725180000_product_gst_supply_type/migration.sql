-- CreateEnum
CREATE TYPE "GstSupplyType" AS ENUM ('TAXABLE', 'NIL_RATED', 'EXEMPT', 'NON_GST');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "gstSupplyType" "GstSupplyType" NOT NULL DEFAULT 'TAXABLE';
