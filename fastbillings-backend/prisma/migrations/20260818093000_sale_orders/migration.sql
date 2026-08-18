-- P1-1: Sale orders (convert to invoice; no GL until the invoice is issued)

CREATE TYPE "SaleOrderStatus" AS ENUM ('draft', 'confirmed', 'invoiced', 'cancelled');

CREATE TABLE "SaleOrder" (
    "id" TEXT NOT NULL,
    "saleOrderId" TEXT,
    "customerId" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL,
    "deliveryDate" TIMESTAMP(3),
    "referenceNo" TEXT DEFAULT '',
    "items" JSONB,
    "status" "SaleOrderStatus" NOT NULL DEFAULT 'draft',
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "totalDiscount" DECIMAL(18,4) DEFAULT 0,
    "vat" DECIMAL(18,4) DEFAULT 0,
    "roundOff" BOOLEAN NOT NULL DEFAULT false,
    "TotalAmount" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "termsAndCondition" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "billFrom" TEXT NOT NULL,
    "billTo" TEXT NOT NULL,
    "warehouseId" TEXT,
    "invoiceId" TEXT,
    "currencyCode" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SaleOrder_saleOrderId_key" ON "SaleOrder"("saleOrderId");
CREATE INDEX "SaleOrder_tenantId_idx" ON "SaleOrder"("tenantId");
CREATE INDEX "SaleOrder_userId_isDeleted_idx" ON "SaleOrder"("userId", "isDeleted");

ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_billFrom_fkey" FOREIGN KEY ("billFrom") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_billTo_fkey" FOREIGN KEY ("billTo") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleOrder" ADD CONSTRAINT "SaleOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Module" ("id", "moduleName", "moduleSlug", "parentId", "userType", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, 'Sale Orders', 'sale-orders', p.id, 'ADMIN'::"ModuleUserType", NOW(), NOW()
FROM "Module" p
WHERE p."moduleSlug" = 'inventory-sales' AND p."parentId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Module" c WHERE c."moduleSlug" = 'sale-orders' AND c."deletedAt" IS NULL
  );

INSERT INTO "Permission" ("id", "roleId", "moduleId", "create", "edit", "delete", "view", "allowAll", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, q."roleId", so.id, q."create", q."edit", q."delete", q."view", q."allowAll", NOW(), NOW()
FROM "Permission" q
JOIN "Module" qm ON qm.id = q."moduleId" AND qm."moduleSlug" = 'quotations'
JOIN "Module" so ON so."moduleSlug" = 'sale-orders' AND so."deletedAt" IS NULL
WHERE q."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "Permission" existing
    WHERE existing."roleId" = q."roleId"
      AND existing."moduleId" = so.id
      AND existing."deletedAt" IS NULL
  );
