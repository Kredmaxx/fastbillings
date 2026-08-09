-- CreateTable
CREATE TABLE "Form26AsImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "label" TEXT,
    "lines" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form26AsImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Form26AsImport_userId_isDeleted_periodFrom_idx" ON "Form26AsImport"("userId", "isDeleted", "periodFrom");

-- CreateIndex
CREATE INDEX "Form26AsImport_tenantId_isDeleted_periodFrom_idx" ON "Form26AsImport"("tenantId", "isDeleted", "periodFrom");

-- AddForeignKey
ALTER TABLE "Form26AsImport" ADD CONSTRAINT "Form26AsImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form26AsImport" ADD CONSTRAINT "Form26AsImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
