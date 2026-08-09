import { prisma } from './prisma';

/** Prefer workspace Localization, then legacy user-owned active row. */
export async function findLocalization(userId: string, tenantId?: string | null) {
  if (tenantId) {
    const byTenant = await prisma.localization.findFirst({
      where: { tenantId, isActive: true },
      include: {
        dateFormat: { select: { id: true, title: true, format: true } },
        timeFormat: { select: { id: true, name: true, format: true } },
        timezone: { select: { id: true, name: true, utc_offset: true } },
      },
    });
    if (byTenant) return byTenant;
  }
  return prisma.localization.findFirst({
    where: { userId, isActive: true },
    include: {
      dateFormat: { select: { id: true, title: true, format: true } },
      timeFormat: { select: { id: true, name: true, format: true } },
      timezone: { select: { id: true, name: true, utc_offset: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = { findLocalization };
module.exports.default = module.exports;
