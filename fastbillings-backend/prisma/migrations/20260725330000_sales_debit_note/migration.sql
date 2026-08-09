-- CreateTable
CREATE TABLE "SalesDebitNote" (
    "id" TEXT NOT NULL,
    "debitNoteNumber" TEXT,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "debitNoteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referenceNo" TEXT DEFAULT '',
    "reason" "CreditNoteReason" DEFAULT 'OTHER',
    "description" TEXT DEFAULT '',
    "items" JSONB,
    "status" "CreditNoteStatus" NOT NULL DEFAULT 'PENDING',
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "vat" DECIMAL(18,4) DEFAULT 0,
    "totalDiscount" DECIMAL(18,4) DEFAULT 0,
    "currencyCode" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT NOT NULL,
    "billFrom" TEXT NOT NULL,
    "billTo" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesDebitNote_debitNoteNumber_key" ON "SalesDebitNote"("debitNoteNumber");

-- CreateIndex
CREATE INDEX "SalesDebitNote_tenantId_idx" ON "SalesDebitNote"("tenantId");

-- CreateIndex
CREATE INDEX "SalesDebitNote_userId_isDeleted_idx" ON "SalesDebitNote"("userId", "isDeleted");

-- CreateIndex
CREATE INDEX "SalesDebitNote_invoiceId_idx" ON "SalesDebitNote"("invoiceId");

-- AddForeignKey
ALTER TABLE "SalesDebitNote" ADD CONSTRAINT "SalesDebitNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesDebitNote" ADD CONSTRAINT "SalesDebitNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesDebitNote" ADD CONSTRAINT "SalesDebitNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesDebitNote" ADD CONSTRAINT "SalesDebitNote_billFrom_fkey" FOREIGN KEY ("billFrom") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesDebitNote" ADD CONSTRAINT "SalesDebitNote_billTo_fkey" FOREIGN KEY ("billTo") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SalesDebitNote" ADD CONSTRAINT "SalesDebitNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
