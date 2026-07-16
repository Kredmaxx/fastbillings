import crypto from 'crypto';
import { prisma } from './prisma';

export const TENANT_API_KEY_PREFIX = 'fb_live_';

export function hashTenantApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateTenantApiKey(): { raw: string; prefix: string; hash: string } {
  const secret = crypto.randomBytes(24).toString('hex');
  const raw = `${TENANT_API_KEY_PREFIX}${secret}`;
  const prefix = raw.slice(0, 16);
  return { raw, prefix, hash: hashTenantApiKey(raw) };
}

export async function resolveTenantApiKey(rawKey: string): Promise<{
  userId: string;
  tenantId: string;
  membershipId: string;
  membershipRole: 'OWNER' | 'ADMIN' | 'MEMBER';
  roleId?: string | null;
  isPlatformAdmin: boolean;
  apiKeyId: string;
} | null> {
  if (!rawKey.startsWith(TENANT_API_KEY_PREFIX)) return null;

  const keyHash = hashTenantApiKey(rawKey);
  const record = await prisma.tenantApiKey.findUnique({
    where: { keyHash },
    include: {
      tenant: { select: { id: true, status: true } },
    },
  });

  if (!record || record.revokedAt) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;
  if (record.tenant.status === 'suspended' || record.tenant.status === 'cancelled') return null;

  let membership = record.createdById
    ? await prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId: record.tenantId, userId: record.createdById } },
      })
    : null;

  if (!membership) {
    membership = await prisma.tenantMembership.findFirst({
      where: { tenantId: record.tenantId, role: { in: ['OWNER', 'ADMIN'] } },
      orderBy: { createdAt: 'asc' },
    });
  }
  if (!membership) return null;

  prisma.tenantApiKey
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    userId: membership.userId,
    tenantId: record.tenantId,
    membershipId: membership.id,
    membershipRole: membership.role,
    roleId: membership.roleId,
    isPlatformAdmin: false,
    apiKeyId: record.id,
  };
}
