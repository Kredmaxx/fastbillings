-- CreateTable
CREATE TABLE "TdsTcsReturnFiling" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "fyLabel" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "isFiled" BOOLEAN NOT NULL DEFAULT false,
    "filedDate" TIMESTAMP(3),
    "acknowledgementNo" TEXT,
    "notes" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsTcsReturnFiling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TdsTcsReturnFiling_tenantId_fyLabel_form_quarter_idx" ON "TdsTcsReturnFiling"("tenantId", "fyLabel", "form", "quarter");

-- CreateIndex
CREATE INDEX "TdsTcsReturnFiling_userId_isDeleted_fyLabel_idx" ON "TdsTcsReturnFiling"("userId", "isDeleted", "fyLabel");

-- CreateIndex
CREATE UNIQUE INDEX "TdsTcsReturnFiling_userId_fyLabel_form_quarter_key" ON "TdsTcsReturnFiling"("userId", "fyLabel", "form", "quarter");

-- AddForeignKey
ALTER TABLE "TdsTcsReturnFiling" ADD CONSTRAINT "TdsTcsReturnFiling_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsTcsReturnFiling" ADD CONSTRAINT "TdsTcsReturnFiling_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
