-- Phase 5: composition, RCM, supplier GSTIN, purchase TDS fields, TdsRate master

ALTER TABLE "CompanySettings" ADD COLUMN IF NOT EXISTS "isComposition" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "gstin" TEXT;

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "isReverseCharge" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "isReverseCharge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "tdsSection" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "tdsRatePercent" DECIMAL(7,4);
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "tdsAmount" DECIMAL(18,4) DEFAULT 0;

CREATE TABLE IF NOT EXISTS "TdsRate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "section" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DECIMAL(7,4) NOT NULL,
  "threshold" DECIMAL(18,4),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TdsRate_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TdsRate_userId_fkey') THEN
    ALTER TABLE "TdsRate" ADD CONSTRAINT "TdsRate_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TdsRate_tenantId_fkey') THEN
    ALTER TABLE "TdsRate" ADD CONSTRAINT "TdsRate_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TdsRate_userId_isDeleted_idx" ON "TdsRate" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "TdsRate_tenantId_isDeleted_section_idx" ON "TdsRate" ("tenantId", "isDeleted", "section");
