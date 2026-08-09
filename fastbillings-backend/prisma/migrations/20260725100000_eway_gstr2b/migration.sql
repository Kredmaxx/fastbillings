-- Phase 7: e-way bill readiness + GSTR-2B ITC reconcile staging

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "ewayBillNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "ewayBillDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "transporterGstin" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "transporterName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "transportDistanceKm" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "vehicleNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "dispatchFromPincode" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "dispatchToPincode" TEXT;

DO $$ BEGIN
  CREATE TYPE "EWayBillStatus" AS ENUM ('PENDING', 'GENERATED', 'CANCELLED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "Gstr2bMatchStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'PARTIAL', 'MISSING_IN_BOOKS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "EWayBillRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "ewayBillNo" TEXT,
  "ewayBillDate" TIMESTAMP(3),
  "validUpto" TIMESTAMP(3),
  "transporterGstin" TEXT,
  "transporterName" TEXT,
  "distanceKm" INTEGER,
  "vehicleNo" TEXT,
  "fromPincode" TEXT,
  "toPincode" TEXT,
  "status" "EWayBillStatus" NOT NULL DEFAULT 'PENDING',
  "errorMessage" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'mock',
  "cancelledAt" TIMESTAMP(3),
  "cancelReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EWayBillRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EWayBillRecord_invoiceId_idx" ON "EWayBillRecord"("invoiceId");
CREATE INDEX IF NOT EXISTS "EWayBillRecord_userId_status_idx" ON "EWayBillRecord"("userId", "status");
CREATE INDEX IF NOT EXISTS "EWayBillRecord_ewayBillNo_idx" ON "EWayBillRecord"("ewayBillNo");

CREATE TABLE IF NOT EXISTS "Gstr2bImport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "periodMonth" TEXT NOT NULL,
  "sourceLabel" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lineCount" INTEGER NOT NULL DEFAULT 0,
  "matchedCount" INTEGER NOT NULL DEFAULT 0,
  "partialCount" INTEGER NOT NULL DEFAULT 0,
  "missingCount" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Gstr2bImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Gstr2bImport_userId_periodMonth_idx" ON "Gstr2bImport"("userId", "periodMonth");
CREATE INDEX IF NOT EXISTS "Gstr2bImport_tenantId_periodMonth_idx" ON "Gstr2bImport"("tenantId", "periodMonth");

CREATE TABLE IF NOT EXISTS "Gstr2bLine" (
  "id" TEXT NOT NULL,
  "importId" TEXT NOT NULL,
  "supplierGstin" TEXT,
  "supplierName" TEXT,
  "invoiceNumber" TEXT NOT NULL,
  "invoiceDate" TIMESTAMP(3),
  "taxableValue" DECIMAL(18,4) NOT NULL,
  "igst" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "cgst" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "sgst" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "cess" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "invoiceValue" DECIMAL(18,4),
  "matchStatus" "Gstr2bMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "matchedPurchaseId" TEXT,
  "matchNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Gstr2bLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Gstr2bLine_importId_matchStatus_idx" ON "Gstr2bLine"("importId", "matchStatus");
CREATE INDEX IF NOT EXISTS "Gstr2bLine_invoiceNumber_idx" ON "Gstr2bLine"("invoiceNumber");

DO $$ BEGIN
  ALTER TABLE "EWayBillRecord" ADD CONSTRAINT "EWayBillRecord_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EWayBillRecord" ADD CONSTRAINT "EWayBillRecord_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Gstr2bImport" ADD CONSTRAINT "Gstr2bImport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Gstr2bImport" ADD CONSTRAINT "Gstr2bImport_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Gstr2bLine" ADD CONSTRAINT "Gstr2bLine_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "Gstr2bImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
