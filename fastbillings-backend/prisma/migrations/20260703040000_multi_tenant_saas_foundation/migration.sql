-- Multi-tenant SaaS foundation: shared database, tenantId row scoping.

CREATE TYPE "TenantStatus" AS ENUM ('trialing', 'active', 'suspended', 'cancelled');
CREATE TYPE "TenantMembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'cancelled');
CREATE TYPE "BillingInterval" AS ENUM ('month', 'year');

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'trialing',
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TenantMembershipRole" NOT NULL DEFAULT 'MEMBER',
    "roleId" TEXT,
    "invitedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "billingInterval" "BillingInterval" NOT NULL DEFAULT 'month',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStartsAt" TIMESTAMP(3),
    "currentPeriodEndsAt" TIMESTAMP(3),
    "provider" TEXT,
    "providerCustomerId" TEXT,
    "providerSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Role" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CompanySettings" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "GeneralSetting" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;

CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

INSERT INTO "Tenant" ("id", "name", "slug", "status", "ownerId", "createdAt", "updatedAt")
SELECT
  'tenant_' || u."id",
  COALESCE(NULLIF(TRIM(cs."companyName"), ''), NULLIF(TRIM(u."firstName" || ' ' || COALESCE(u."lastName", '')), ''), u."email"),
  LOWER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(cs."companyName"), ''), u."email"), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || LEFT(u."id", 8),
  'active'::"TenantStatus",
  u."id",
  NOW(),
  NOW()
FROM "User" u
LEFT JOIN "CompanySettings" cs ON cs."userId" = u."id"
WHERE u."user_type" <> 999
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "TenantMembership" ("id", "tenantId", "userId", "role", "roleId", "acceptedAt", "createdAt", "updatedAt")
SELECT
  'membership_' || u."id",
  'tenant_' || u."id",
  u."id",
  CASE WHEN u."user_type" = 1 THEN 'OWNER'::"TenantMembershipRole" ELSE 'MEMBER'::"TenantMembershipRole" END,
  u."roleId",
  NOW(),
  NOW(),
  NOW()
FROM "User" u
JOIN "Tenant" t ON t."id" = 'tenant_' || u."id"
WHERE u."user_type" <> 999
ON CONFLICT ("tenantId", "userId") DO NOTHING;

UPDATE "CompanySettings" cs
SET "tenantId" = 'tenant_' || cs."userId"
WHERE cs."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = 'tenant_' || cs."userId");

UPDATE "Customer" c
SET "tenantId" = 'tenant_' || c."userId"
WHERE c."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = 'tenant_' || c."userId");

UPDATE "Invoice" i
SET "tenantId" = 'tenant_' || i."userId"
WHERE i."tenantId" IS NULL
  AND EXISTS (SELECT 1 FROM "Tenant" t WHERE t."id" = 'tenant_' || i."userId");

UPDATE "GeneralSetting" gs
SET "tenantId" = (
  SELECT t."id"
  FROM "Tenant" t
  JOIN "User" u ON u."id" = t."ownerId"
  WHERE u."user_type" = 1
  ORDER BY t."createdAt" ASC
  LIMIT 1
)
WHERE gs."tenantId" IS NULL;

UPDATE "Role" r
SET "tenantId" = (
  SELECT t."id"
  FROM "Tenant" t
  JOIN "User" u ON u."id" = t."ownerId"
  WHERE u."user_type" = 1
  ORDER BY t."createdAt" ASC
  LIMIT 1
)
WHERE r."tenantId" IS NULL AND r."createdBy" <> 'sys-bootstrap';

DROP INDEX IF EXISTS "GeneralSetting_key_key";
DROP INDEX IF EXISTS "Invoice_invoiceNumber_key";
DROP INDEX IF EXISTS "customer_external_upsert_idx";
DROP INDEX IF EXISTS "customer_email_per_user_idx";

CREATE INDEX "Tenant_ownerId_idx" ON "Tenant"("ownerId");
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");
CREATE INDEX "TenantMembership_roleId_idx" ON "TenantMembership"("roleId");
CREATE UNIQUE INDEX "role_tenant_name_unique" ON "Role"("tenantId", "roleName");
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");
CREATE UNIQUE INDEX "customer_external_tenant_upsert_idx" ON "Customer"("externalSource", "externalRef", "tenantId");
CREATE UNIQUE INDEX "customer_tenant_email_unique" ON "Customer"("tenantId", "email");
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");
CREATE UNIQUE INDEX "invoice_tenant_number_unique" ON "Invoice"("tenantId", "invoiceNumber");
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");
CREATE UNIQUE INDEX "CompanySettings_tenantId_key" ON "CompanySettings"("tenantId");
CREATE UNIQUE INDEX "general_setting_tenant_key_unique" ON "GeneralSetting"("tenantId", "key");
CREATE INDEX "GeneralSetting_tenantId_idx" ON "GeneralSetting"("tenantId");
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
CREATE INDEX "TenantSubscription_tenantId_status_idx" ON "TenantSubscription"("tenantId", "status");
CREATE INDEX "TenantSubscription_provider_providerSubscriptionId_idx" ON "TenantSubscription"("provider", "providerSubscriptionId");

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanySettings" ADD CONSTRAINT "CompanySettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneralSetting" ADD CONSTRAINT "GeneralSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
