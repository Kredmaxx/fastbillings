-- Phase 11: GST compliance provider config (e-invoice / e-way)

CREATE TABLE IF NOT EXISTS "GstComplianceConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT,
  "eInvoiceProvider" TEXT NOT NULL DEFAULT 'mock',
  "eWayProvider" TEXT NOT NULL DEFAULT 'mock',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "livemode" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GstComplianceConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GstComplianceConfig_userId_key" ON "GstComplianceConfig"("userId");
CREATE INDEX IF NOT EXISTS "GstComplianceConfig_tenantId_idx" ON "GstComplianceConfig"("tenantId");

DO $$ BEGIN
  ALTER TABLE "GstComplianceConfig" ADD CONSTRAINT "GstComplianceConfig_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
