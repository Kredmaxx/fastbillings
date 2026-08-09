import type { Prisma, TenantMembershipRole } from '@prisma/client';

import { prisma } from './prisma';
import { createTrialSubscriptionForTenant } from './planService';
import { USER_TYPE } from './userTypes';

type PrismaTx = Prisma.TransactionClient;

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tenant';
}

async function uniqueTenantSlug(base: string, client: PrismaTx | typeof prisma): Promise<string> {
  const root = slugify(base);
  let slug = root;
  let suffix = 1;
  while (await client.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1;
    slug = `${root}-${suffix}`;
  }
  return slug;
}

export async function uniqueTenantSlugForName(name: string, client: PrismaTx | typeof prisma = prisma) {
  return uniqueTenantSlug(name, client);
}

export async function createTenantForOwner(
  input: {
    ownerId: string;
    name: string;
    roleId?: string | null;
    membershipRole?: TenantMembershipRole;
  },
  client: PrismaTx | typeof prisma = prisma,
) {
  const slug = await uniqueTenantSlug(input.name, client);
  return client.tenant.create({
    data: {
      name: input.name,
      slug,
      status: 'active',
      ownerId: input.ownerId,
      memberships: {
        create: {
          userId: input.ownerId,
          role: input.membershipRole ?? 'OWNER',
          roleId: input.roleId ?? undefined,
          acceptedAt: new Date(),
        },
      },
    },
    include: {
      memberships: true,
    },
  });
}

export async function ensureDefaultTenantForUser(userId: string) {
  // Prefer the tenant linked to CompanySettings when present — that is the
  // workspace the user actually configured / seeded (e.g. Kredmaxx demo).
  const company = await prisma.companySettings.findUnique({
    where: { userId },
    select: { tenantId: true },
  });
  if (company?.tenantId) {
    const fromCompany = await prisma.tenantMembership.findFirst({
      where: { userId, tenantId: company.tenantId },
      include: { tenant: true },
    });
    if (fromCompany) return fromCompany;
  }

  const preferredSlug = await prisma.tenantMembership.findFirst({
    where: { userId, tenant: { slug: 'kredmaxx-technologies' } },
    include: { tenant: true },
  });
  if (preferredSlug) return preferredSlug;

  const existing = await prisma.tenantMembership.findFirst({
    where: { userId },
    include: { tenant: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, email: true, roleId: true, user_type: true },
  });
  if (!user) return null;

  const tenantName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  const tenant = await createTenantForOwner({
    ownerId: user.id,
    name: tenantName,
    roleId: user.roleId,
    membershipRole: user.user_type === USER_TYPE.ADMIN ? 'OWNER' : 'MEMBER',
  });

  await createTrialSubscriptionForTenant(tenant.id, 'starter');

  return {
    ...tenant.memberships[0],
    tenant,
  };
}

export async function getMembershipForRequest(userId: string, requestedTenantId?: string | null) {
  const where = requestedTenantId ? { userId, tenantId: requestedTenantId } : { userId };
  return prisma.tenantMembership.findFirst({
    where,
    include: { tenant: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function listAllTenants() {
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return tenants.map((tenant) => ({
    membershipId: `platform-${tenant.id}`,
    tenantId: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    role: 'ADMIN' as const,
    roleId: null,
  }));
}

export async function listUserTenants(userId: string) {
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId },
    include: { tenant: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });

  return memberships.map((membership) => ({
    membershipId: membership.id,
    tenantId: membership.tenantId,
    name: membership.tenant.name,
    slug: membership.tenant.slug,
    status: membership.tenant.status,
    role: membership.role,
    roleId: membership.roleId,
  }));
}
