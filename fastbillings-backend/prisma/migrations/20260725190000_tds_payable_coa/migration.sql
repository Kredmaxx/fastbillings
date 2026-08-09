-- Phase 27: TDS_PAYABLE CoA (2106) + mapping for existing ledgers

INSERT INTO "Account" ("id", "userId", "tenantId", "code", "name", "accountType", "parentId", "currencyCode", "roleProtected", "isDeleted", "createdAt", "updatedAt")
SELECT
  md5(m."userId" || ':tds-payable-2106'),
  m."userId",
  m."tenantId",
  '2106',
  'TDS Payable',
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
WHERE m."roleKey" IN ('OUTPUT_CGST', 'OUTPUT_TAX', 'TCS_PAYABLE', 'AP')
  AND NOT EXISTS (
    SELECT 1 FROM "Account" a
    WHERE a."userId" = m."userId" AND a."code" = '2106' AND a."isDeleted" = false
  )
GROUP BY m."userId", m."tenantId", parent.id, parent."currencyCode";

INSERT INTO "LedgerAccountMapping" ("id", "userId", "tenantId", "roleKey", "accountId", "createdAt", "updatedAt")
SELECT
  md5(a."userId" || ':map:TDS_PAYABLE'),
  a."userId",
  a."tenantId",
  'TDS_PAYABLE',
  a."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Account" a
WHERE a."code" = '2106'
  AND a."isDeleted" = false
  AND NOT EXISTS (
    SELECT 1 FROM "LedgerAccountMapping" m
    WHERE m."userId" = a."userId" AND m."roleKey" = 'TDS_PAYABLE'
  );
