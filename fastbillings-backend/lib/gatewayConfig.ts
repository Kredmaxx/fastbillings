import type { GatewayConfig, GatewayKind } from '@prisma/client';

import { prisma } from './prisma';

/** Prefer workspace gateway config, then legacy user-owned row. */
export async function findGatewayConfig(
  userId: string,
  kind: GatewayKind,
  tenantId?: string | null,
): Promise<GatewayConfig | null> {
  if (tenantId) {
    const byTenant = await prisma.gatewayConfig.findUnique({
      where: { gateway_tenant_kind_unique: { tenantId, kind } },
    });
    if (byTenant) return byTenant;
  }
  return prisma.gatewayConfig.findUnique({
    where: { userId_kind: { userId, kind } },
  });
}

/** List configs for settings UI: workspace rows when present, else user rows. */
export async function listGatewayConfigs(
  userId: string,
  tenantId?: string | null,
): Promise<GatewayConfig[]> {
  if (tenantId) {
    const byTenant = await prisma.gatewayConfig.findMany({
      where: { tenantId },
      orderBy: { kind: 'asc' },
    });
    if (byTenant.length) return byTenant;
  }
  return prisma.gatewayConfig.findMany({
    where: { userId },
    orderBy: { kind: 'asc' },
  });
}

module.exports = { findGatewayConfig, listGatewayConfigs };
module.exports.default = module.exports;
