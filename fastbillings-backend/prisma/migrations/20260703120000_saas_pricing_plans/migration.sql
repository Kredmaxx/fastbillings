-- SaaS pricing plans catalog + extended tenant subscriptions (Whatzio-style).

CREATE TYPE "PlanBillingCycle" AS ENUM ('trial', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'lifetime');

ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'quarter';
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'half_year';
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'lifetime';

CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "billingCycle" "PlanBillingCycle" NOT NULL DEFAULT 'monthly',
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "maxInvoices" INTEGER NOT NULL DEFAULT 100,
    "maxCustomers" INTEGER NOT NULL DEFAULT 100,
    "maxProducts" INTEGER NOT NULL DEFAULT 100,
    "maxStorageMb" INTEGER NOT NULL DEFAULT 500,
    "features" JSONB NOT NULL DEFAULT '{}',
    "stripePriceId" TEXT,
    "stripeProductId" TEXT,
    "razorpayPlanId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");
CREATE INDEX "Plan_isActive_sortOrder_idx" ON "Plan"("isActive", "sortOrder");
CREATE INDEX "Plan_deletedAt_idx" ON "Plan"("deletedAt");

ALTER TABLE "TenantSubscription" ADD COLUMN "planId" TEXT;
ALTER TABLE "TenantSubscription" ADD COLUMN "amountPaid" DECIMAL(18,4);
ALTER TABLE "TenantSubscription" ADD COLUMN "currencyCode" TEXT DEFAULT 'USD';
ALTER TABLE "TenantSubscription" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "TenantSubscription" ADD COLUMN "assignedBy" TEXT;
ALTER TABLE "TenantSubscription" ADD COLUMN "notes" TEXT;

CREATE INDEX "TenantSubscription_planId_idx" ON "TenantSubscription"("planId");

ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default plans
INSERT INTO "Plan" (
    "id", "name", "slug", "description", "price", "currencyCode", "billingCycle",
    "trialDays", "isFeatured", "isActive", "sortOrder",
    "maxUsers", "maxInvoices", "maxCustomers", "maxProducts", "maxStorageMb", "features"
) VALUES
(
    'plan-starter',
    'Starter',
    'starter',
    'For small businesses getting started with invoicing and billing.',
    0,
    'USD',
    'monthly',
    14,
    false,
    true,
    1,
    3,
    50,
    50,
    50,
    250,
    '{"access_invoicing":true,"access_inventory":true,"access_reports":false,"access_accounting":false,"access_ai":false,"access_gst":false}'::jsonb
),
(
    'plan-professional',
    'Professional',
    'professional',
    'Growing teams with inventory, accounting, and advanced reports.',
    29,
    'USD',
    'monthly',
    14,
    true,
    true,
    2,
    10,
    500,
    500,
    500,
    2048,
    '{"access_invoicing":true,"access_inventory":true,"access_reports":true,"access_accounting":true,"access_ai":true,"access_gst":true}'::jsonb
),
(
    'plan-enterprise',
    'Enterprise',
    'enterprise',
    'Unlimited scale for large organizations with full ERP capabilities.',
    99,
    'USD',
    'monthly',
    14,
    false,
    true,
    3,
    0,
    0,
    0,
    0,
    10240,
    '{"access_invoicing":true,"access_inventory":true,"access_reports":true,"access_accounting":true,"access_ai":true,"access_gst":true,"access_api":true,"priority_support":true}'::jsonb
)
ON CONFLICT ("slug") DO NOTHING;

UPDATE "TenantSubscription" ts
SET "planId" = p."id"
FROM "Plan" p
WHERE ts."planCode" = p."slug" AND ts."planId" IS NULL;

UPDATE "TenantSubscription"
SET "planId" = 'plan-starter'
WHERE "planId" IS NULL AND "planCode" = 'starter';
