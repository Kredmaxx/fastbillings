import { prisma } from './prisma';

/** Prefer workspace MessagingConfig, then legacy user-owned row. */
export async function findMessagingConfig(userId: string, tenantId?: string | null) {
  if (tenantId) {
    const byTenant = await prisma.messagingConfig.findUnique({ where: { tenantId } });
    if (byTenant) return byTenant;
  }
  return prisma.messagingConfig.findUnique({ where: { userId } });
}

module.exports = { findMessagingConfig };
module.exports.default = module.exports;
