-- CreateTable
CREATE TABLE "AdvanceTaxSetoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "fyLabel" TEXT NOT NULL,
    "setoffDate" TIMESTAMP(3) NOT NULL,
    "provisionAmount" DECIMAL(18,4) NOT NULL,
    "setoffAmount" DECIMAL(18,4) NOT NULL,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvanceTaxSetoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvanceTaxSetoff_userId_isDeleted_fyLabel_idx" ON "AdvanceTaxSetoff"("userId", "isDeleted", "fyLabel");

-- CreateIndex
CREATE INDEX "AdvanceTaxSetoff_tenantId_isDeleted_fyLabel_idx" ON "AdvanceTaxSetoff"("tenantId", "isDeleted", "fyLabel");

-- AddForeignKey
ALTER TABLE "AdvanceTaxSetoff" ADD CONSTRAINT "AdvanceTaxSetoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvanceTaxSetoff" ADD CONSTRAINT "AdvanceTaxSetoff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
