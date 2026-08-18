-- P1-2: per-customer product selling rates (invoice/POS auto-fill)

CREATE TABLE "CustomerProductRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sellingPrice" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerProductRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerProductRate_customerId_productId_key" ON "CustomerProductRate"("customerId", "productId");
CREATE INDEX "CustomerProductRate_tenantId_idx" ON "CustomerProductRate"("tenantId");
CREATE INDEX "CustomerProductRate_productId_idx" ON "CustomerProductRate"("productId");

ALTER TABLE "CustomerProductRate" ADD CONSTRAINT "CustomerProductRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProductRate" ADD CONSTRAINT "CustomerProductRate_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProductRate" ADD CONSTRAINT "CustomerProductRate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
