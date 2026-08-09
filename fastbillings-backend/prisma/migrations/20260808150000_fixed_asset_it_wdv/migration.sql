-- AlterTable
ALTER TABLE "FixedAsset" ADD COLUMN "itBlock" TEXT;
ALTER TABLE "FixedAsset" ADD COLUMN "itRatePercent" DECIMAL(8,4);
ALTER TABLE "FixedAsset" ADD COLUMN "itOpeningWdv" DECIMAL(18,4);
