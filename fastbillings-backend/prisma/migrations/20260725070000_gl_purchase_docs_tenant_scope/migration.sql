-- Phase 4: tenant-scope GL + purchase documents (mid-migration; keep userId)

ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "LedgerAccountMapping" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "AccountingPeriod" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Purchase" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CreditNote" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "DebitNote" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill helper pattern: membership → tenant_<userId> → oldest tenant
UPDATE "Account" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "JournalEntry" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "LedgerAccountMapping" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "AccountingPeriod" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "Purchase" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "PurchaseOrder" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "CreditNote" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "DebitNote" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "Expense" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."userId";
UPDATE "Supplier" t SET "tenantId" = tm."tenantId" FROM "TenantMembership" tm WHERE t."tenantId" IS NULL AND tm."userId" = t."user_id";

UPDATE "Account" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "JournalEntry" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "LedgerAccountMapping" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "AccountingPeriod" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "Purchase" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "PurchaseOrder" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "CreditNote" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "DebitNote" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "Expense" t SET "tenantId" = 'tenant_' || t."userId" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."userId");
UPDATE "Supplier" t SET "tenantId" = 'tenant_' || t."user_id" WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" x WHERE x."id" = 'tenant_' || t."user_id");

UPDATE "Account" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "JournalEntry" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "LedgerAccountMapping" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "AccountingPeriod" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "Purchase" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "PurchaseOrder" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "CreditNote" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "DebitNote" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "Expense" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);
UPDATE "Supplier" t SET "tenantId" = (SELECT id FROM "Tenant" ORDER BY "createdAt" ASC LIMIT 1) WHERE t."tenantId" IS NULL AND EXISTS (SELECT 1 FROM "Tenant" LIMIT 1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Account_tenantId_fkey') THEN
    ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JournalEntry_tenantId_fkey') THEN
    ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerAccountMapping_tenantId_fkey') THEN
    ALTER TABLE "LedgerAccountMapping" ADD CONSTRAINT "LedgerAccountMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AccountingPeriod_tenantId_fkey') THEN
    ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Purchase_tenantId_fkey') THEN
    ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseOrder_tenantId_fkey') THEN
    ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CreditNote_tenantId_fkey') THEN
    ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DebitNote_tenantId_fkey') THEN
    ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Expense_tenantId_fkey') THEN
    ALTER TABLE "Expense" ADD CONSTRAINT "Expense_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Supplier_tenantId_fkey') THEN
    ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Account_tenantId_accountType_idx" ON "Account" ("tenantId", "accountType");
CREATE INDEX IF NOT EXISTS "JournalEntry_tenantId_entryDate_idx" ON "JournalEntry" ("tenantId", "entryDate");
CREATE INDEX IF NOT EXISTS "LedgerAccountMapping_tenantId_idx" ON "LedgerAccountMapping" ("tenantId");
CREATE INDEX IF NOT EXISTS "AccountingPeriod_tenantId_startDate_idx" ON "AccountingPeriod" ("tenantId", "startDate");
CREATE INDEX IF NOT EXISTS "Purchase_tenantId_idx" ON "Purchase" ("tenantId");
CREATE INDEX IF NOT EXISTS "Purchase_userId_isDeleted_idx" ON "Purchase" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_tenantId_idx" ON "PurchaseOrder" ("tenantId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_userId_isDeleted_idx" ON "PurchaseOrder" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "CreditNote_tenantId_idx" ON "CreditNote" ("tenantId");
CREATE INDEX IF NOT EXISTS "CreditNote_userId_isDeleted_idx" ON "CreditNote" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "DebitNote_tenantId_idx" ON "DebitNote" ("tenantId");
CREATE INDEX IF NOT EXISTS "DebitNote_userId_isDeleted_idx" ON "DebitNote" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "Expense_tenantId_idx" ON "Expense" ("tenantId");
CREATE INDEX IF NOT EXISTS "Expense_userId_isDeleted_idx" ON "Expense" ("userId", "isDeleted");
CREATE INDEX IF NOT EXISTS "Supplier_tenantId_idx" ON "Supplier" ("tenantId");
CREATE INDEX IF NOT EXISTS "Supplier_user_id_isDeleted_idx" ON "Supplier" ("user_id", "isDeleted");
