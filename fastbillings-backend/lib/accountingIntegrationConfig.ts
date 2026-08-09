import type { AccountingIntegration, IntegrationKind } from '@prisma/client';

import { prisma } from './prisma';

/** Prefer workspace integration, then legacy user-owned row. */
export async function findAccountingIntegration(
  userId: string,
  kind: IntegrationKind,
  tenantId?: string | null,
): Promise<AccountingIntegration | null> {
  if (tenantId) {
    const byTenant = await prisma.accountingIntegration.findUnique({
      where: { accounting_integration_tenant_kind_unique: { tenantId, kind } },
    });
    if (byTenant) return byTenant;
  }
  return prisma.accountingIntegration.findUnique({
    where: { userId_kind: { userId, kind } },
  });
}

/** List for settings UI: workspace rows when present, else user rows. */
export async function listAccountingIntegrations(
  userId: string,
  tenantId?: string | null,
): Promise<AccountingIntegration[]> {
  if (tenantId) {
    const byTenant = await prisma.accountingIntegration.findMany({
      where: { tenantId },
      orderBy: { kind: 'asc' },
    });
    if (byTenant.length) return byTenant;
  }
  return prisma.accountingIntegration.findMany({
    where: { userId },
    orderBy: { kind: 'asc' },
  });
}

module.exports = { findAccountingIntegration, listAccountingIntegrations };
module.exports.default = module.exports;
