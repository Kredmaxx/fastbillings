import type { Request, Response } from 'express';
import type { TenantStatus } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireUserId } from '../lib/tenantScope';
import { createTenantForOwner, uniqueTenantSlugForName } from '../lib/tenancy';
import { createTrialSubscriptionForTenant } from '../lib/planService';

const TENANT_STATUSES: TenantStatus[] = ['trialing', 'active', 'suspended', 'cancelled'];

function serializePlatformTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner?: { id: string; email: string; firstName: string; lastName: string } | null;
  subscriptions?: Array<{
    id: string;
    status: string;
    planCode: string;
    plan?: { id: string; name: string } | null;
  }>;
  _count?: { memberships: number };
  memberships?: Array<{
    id: string;
    role: string;
    user: { id: string; email: string; firstName: string; lastName: string };
  }>;
}) {
  const subscription = tenant.subscriptions?.[0];
  return {
    tenantId: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    ownerId: tenant.ownerId,
    owner: tenant.owner
      ? {
          id: tenant.owner.id,
          email: tenant.owner.email,
          name: [tenant.owner.firstName, tenant.owner.lastName].filter(Boolean).join(' '),
        }
      : null,
    memberCount: tenant._count?.memberships ?? tenant.memberships?.length ?? 0,
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          planCode: subscription.planCode,
          planName: subscription.plan?.name ?? subscription.planCode,
        }
      : null,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    memberships: tenant.memberships?.map((m) => ({
      id: m.id,
      role: m.role,
      user: m.user,
    })),
  };
}

const tenantListInclude = {
  owner: { select: { id: true, email: true, firstName: true, lastName: true } },
  subscriptions: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    include: { plan: { select: { id: true, name: true } } },
  },
  _count: { select: { memberships: true } },
};

export async function listPlatformTenants(_req: Request, res: Response): Promise<void> {
  try {
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      include: tenantListInclude,
    });
    res.json({ success: true, data: tenants.map(serializePlatformTenant) });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to list tenants',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getPlatformTenant(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: {
        ...tenantListInclude,
        memberships: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    res.json({ success: true, data: serializePlatformTenant(tenant) });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function createPlatformTenant(req: Request, res: Response): Promise<void> {
  try {
    const { name, ownerEmail, status = 'trialing', slug } = req.body as {
      name?: string;
      ownerEmail?: string;
      status?: TenantStatus;
      slug?: string;
    };

    if (!name?.trim()) {
      res.status(400).json({ success: false, message: 'Workspace name is required' });
      return;
    }
    if (!TENANT_STATUSES.includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status' });
      return;
    }

    let ownerId: string | undefined;
    if (ownerEmail?.trim()) {
      const owner = await prisma.user.findFirst({
        where: { email: ownerEmail.trim().toLowerCase() },
        select: { id: true },
      });
      if (!owner) {
        res.status(404).json({ success: false, message: 'Owner user not found for that email' });
        return;
      }
      ownerId = owner.id;
    }

    const normalizedSlug = slug?.trim()
      ? slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-')
      : undefined;

    if (normalizedSlug) {
      const conflict = await prisma.tenant.findUnique({ where: { slug: normalizedSlug } });
      if (conflict) {
        res.status(409).json({ success: false, message: 'Slug already in use' });
        return;
      }
    }

    let tenant = ownerId
      ? await createTenantForOwner({ ownerId, name: name.trim(), membershipRole: 'OWNER' })
      : await prisma.tenant.create({
          data: {
            name: name.trim(),
            slug: normalizedSlug ?? (await uniqueTenantSlugForName(name.trim())),
            status,
          },
        });

    const updates: { status?: TenantStatus; slug?: string } = {};
    if (status !== tenant.status) updates.status = status;
    if (normalizedSlug && normalizedSlug !== tenant.slug) updates.slug = normalizedSlug;
    if (Object.keys(updates).length > 0) {
      tenant = await prisma.tenant.update({ where: { id: tenant.id }, data: updates });
    }

    await createTrialSubscriptionForTenant(tenant.id, 'starter');

    const full = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      include: tenantListInclude,
    });

    res.status(201).json({
      success: true,
      data: serializePlatformTenant(full!),
      message: 'Tenant created',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to create tenant',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updatePlatformTenant(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, slug, status, ownerEmail } = req.body as {
      name?: string;
      slug?: string;
      status?: TenantStatus;
      ownerEmail?: string | null;
    };

    const existing = await prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }

    const data: { name?: string; slug?: string; status?: TenantStatus; ownerId?: string | null } = {};

    if (name !== undefined) {
      if (!name.trim()) {
        res.status(400).json({ success: false, message: 'Name cannot be empty' });
        return;
      }
      data.name = name.trim();
    }

    if (slug !== undefined) {
      const normalized = slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      if (!normalized) {
        res.status(400).json({ success: false, message: 'Invalid slug' });
        return;
      }
      const conflict = await prisma.tenant.findFirst({
        where: { slug: normalized, NOT: { id } },
      });
      if (conflict) {
        res.status(409).json({ success: false, message: 'Slug already in use' });
        return;
      }
      data.slug = normalized;
    }

    if (status !== undefined) {
      if (!TENANT_STATUSES.includes(status)) {
        res.status(400).json({ success: false, message: 'Invalid status' });
        return;
      }
      data.status = status;
    }

    if (ownerEmail !== undefined) {
      if (ownerEmail === null || ownerEmail === '') {
        data.ownerId = null;
      } else {
        const owner = await prisma.user.findFirst({
          where: { email: ownerEmail.trim().toLowerCase() },
          select: { id: true },
        });
        if (!owner) {
          res.status(404).json({ success: false, message: 'Owner user not found' });
          return;
        }
        data.ownerId = owner.id;
      }
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data,
      include: tenantListInclude,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: id,
        userId: requireUserId(req),
        userName: req.auth?.userId ?? 'platform-admin',
        action: 'UPDATE',
        entityType: 'Tenant',
        entityId: id,
        entityLabel: tenant.name,
        summary: 'Platform admin updated tenant',
      },
    });

    res.json({ success: true, data: serializePlatformTenant(tenant), message: 'Tenant updated' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update tenant',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updatePlatformTenantStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body as { status?: TenantStatus };
    if (!status || !TENANT_STATUSES.includes(status)) {
      res.status(400).json({ success: false, message: 'Valid status is required' });
      return;
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { status },
      include: tenantListInclude,
    });

    res.json({ success: true, data: serializePlatformTenant(tenant), message: `Status set to ${status}` });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }
    res.status(500).json({
      success: false,
      message: 'Failed to update tenant status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deletePlatformTenant(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }

    await prisma.tenant.delete({ where: { id } });

    res.json({ success: true, message: `Tenant "${tenant.name}" deleted` });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete tenant',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = {
  listPlatformTenants,
  getPlatformTenant,
  createPlatformTenant,
  updatePlatformTenant,
  updatePlatformTenantStatus,
  deletePlatformTenant,
};
