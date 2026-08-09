-- Phase 8: TCS rate library + invoice TCS fields + TCS_PAYABLE CoA for existing ledgers

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "tcsSection" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "tcsRatePercent" DECIMAL(7,4);
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "tcsAmount" DECIMAL(18,4) DEFAULT 0;

CREATE TABLE IF NOT EXISTS "TcsRate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "section" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DECIMAL(7,4) NOT NULL,
  "threshold" DECIMAL(18,4),
  "onTaxInclusive" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TcsRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TcsRate_userId_isDeleted_idx" ON "TcsRate"("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "TcsRate_tenantId_isDeleted_section_idx" ON "TcsRate"("tenantId", "isDeleted", "section");

DO $$ BEGIN
  ALTER TABLE "TcsRate" ADD CONSTRAINT "TcsRate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TcsRate" ADD CONSTRAINT "TcsRate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed TCS Payable (2105) + mapping for users who already have an India GST output mapping
INSERT INTO "Account" ("id", "userId", "tenantId", "code", "name", "accountType", "parentId", "currencyCode", "roleProtected", "isDeleted", "createdAt", "updatedAt")
SELECT
  md5(m."userId" || ':tcs-payable-2105'),
  m."userId",
  m."tenantId",
  '2105',
  'TCS Payable',
  'LIABILITY',
  parent.id,
  COALESCE(parent."currencyCode", 'INR'),
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "LedgerAccountMapping" m
LEFT JOIN "Account" parent
  ON parent."userId" = m."userId"
 AND parent."code" = '2100'
 AND parent."isDeleted" = false
WHERE m."roleKey" IN ('OUTPUT_CGST', 'OUTPUT_TAX')
  AND NOT EXISTS (
    SELECT 1 FROM "Account" a
    WHERE a."userId" = m."userId" AND a."code" = '2105' AND a."isDeleted" = false
  )
GROUP BY m."userId", m."tenantId", parent.id, parent."currencyCode";

INSERT INTO "LedgerAccountMapping" ("id", "userId", "tenantId", "roleKey", "accountId", "createdAt", "updatedAt")
SELECT
  md5(a."userId" || ':map:TCS_PAYABLE'),
  a."userId",
  a."tenantId",
  'TCS_PAYABLE',
  a."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Account" a
WHERE a."code" = '2105'
  AND a."isDeleted" = false
  AND NOT EXISTS (
    SELECT 1 FROM "LedgerAccountMapping" m
    WHERE m."userId" = a."userId" AND m."roleKey" = 'TCS_PAYABLE'
  );
