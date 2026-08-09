import { prisma } from './prisma';

/** Prefer workspace EmailSettings, then legacy user-owned row. */
export async function findEmailSettings(userId: string, tenantId?: string | null) {
  if (tenantId) {
    const byTenant = await prisma.emailSettings.findUnique({ where: { tenantId } });
    if (byTenant) return byTenant;
  }
  return prisma.emailSettings.findUnique({ where: { userId } });
}

module.exports = { findEmailSettings };
module.exports.default = module.exports;
