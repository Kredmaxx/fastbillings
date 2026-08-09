-- Phase 16: Work in Progress (WIP) ledger role for manufacture builds

-- Seed WIP asset (1210) for tenants that already have Inventory (1200)
INSERT INTO "Account" ("id", "userId", "tenantId", "code", "name", "accountType", "parentId", "currencyCode", "roleProtected", "isDeleted", "createdAt", "updatedAt")
SELECT
  md5(m."userId" || ':wip-1210'),
  m."userId",
  m."tenantId",
  '1210',
  'Work in Progress',
  'ASSET',
  parent.id,
  COALESCE(parent."currencyCode", 'INR'),
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "LedgerAccountMapping" m
LEFT JOIN "Account" parent
  ON parent."userId" = m."userId"
 AND parent."code" = '1000'
 AND parent."isDeleted" = false
WHERE m."roleKey" = 'INVENTORY'
  AND NOT EXISTS (
    SELECT 1 FROM "Account" a
    WHERE a."userId" = m."userId" AND a."code" = '1210' AND a."isDeleted" = false
  )
GROUP BY m."userId", m."tenantId", parent.id, parent."currencyCode";

INSERT INTO "LedgerAccountMapping" ("id", "userId", "tenantId", "roleKey", "accountId", "createdAt", "updatedAt")
SELECT
  md5(a."userId" || ':map:WIP'),
  a."userId",
  a."tenantId",
  'WIP',
  a."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Account" a
WHERE a."code" = '1210'
  AND a."isDeleted" = false
  AND NOT EXISTS (
    SELECT 1 FROM "LedgerAccountMapping" m
    WHERE m."userId" = a."userId" AND m."roleKey" = 'WIP'
  );
