-- P1-3: dual UOM on Product (primary stock unit + optional secondary billing unit)

ALTER TABLE "Product" ADD COLUMN "secondaryUnitId" TEXT;
ALTER TABLE "Product" ADD COLUMN "secondaryToPrimaryQty" DECIMAL(18,6);
ALTER TABLE "Product" ADD COLUMN "billingUnit" TEXT NOT NULL DEFAULT 'PRIMARY';

CREATE INDEX "Product_secondaryUnitId_idx" ON "Product"("secondaryUnitId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_secondaryUnitId_fkey" FOREIGN KEY ("secondaryUnitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
