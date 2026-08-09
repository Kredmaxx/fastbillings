-- CostCenter tenant scope + FK to User
ALTER TABLE "CostCenter" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "CostCenter_tenantId_idx" ON "CostCenter"("tenantId");

ALTER TABLE "CostCenter" DROP CONSTRAINT IF EXISTS "CostCenter_userId_fkey";
ALTER TABLE "CostCenter"
  ADD CONSTRAINT "CostCenter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CostCenter" DROP CONSTRAINT IF EXISTS "CostCenter_tenantId_fkey";
ALTER TABLE "CostCenter"
  ADD CONSTRAINT "CostCenter_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Project tenant scope + FK to User
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_tenantId_idx" ON "Project"("tenantId");

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_userId_fkey";
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_tenantId_fkey";
ALTER TABLE "Project"
  ADD CONSTRAINT "Project_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
