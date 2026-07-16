import type { Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { requireTenantId, requireUserId } from '../lib/tenantScope';
import { listAllTenants } from '../lib/tenancy';

function isTenantAdmin(req: Request): boolean {
  if (req.auth?.isPlatformAdmin) return true;
  return req.auth?.membershipRole === 'OWNER' || req.auth?.membershipRole === 'ADMIN';
}

export async function getCurrentTenant(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = requireTenantId(req);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        companySettings: true,
        memberships: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true } },
            roleRef: { select: { id: true, roleName: true } },
          },
        },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!tenant) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }

    res.json({ success: true, data: tenant });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listTenants(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);

    if (req.auth?.isPlatformAdmin) {
      const tenants = await listAllTenants();
      res.json({ success: true, data: tenants });
      return;
    }

    const memberships = await prisma.tenantMembership.findMany({
      where: { userId },
      include: {
        tenant: {
          include: {
            subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: memberships.map((membership) => ({
        membershipId: membership.id,
        role: membership.role,
        roleId: membership.roleId,
        tenant: membership.tenant,
      })),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to list tenants',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updateCurrentTenantStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!isTenantAdmin(req)) {
      res.status(403).json({ success: false, message: 'Tenant admin permission required' });
      return;
    }

    const tenantId = requireTenantId(req);
    const { status } = req.body as { status?: 'trialing' | 'active' | 'suspended' | 'cancelled' };
    if (!status || !['trialing', 'active', 'suspended', 'cancelled'].includes(status)) {
      res.status(400).json({ success: false, message: 'Valid status is required' });
      return;
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: requireUserId(req),
        userName: req.auth?.userId ?? 'unknown',
        action: 'UPDATE',
        entityType: 'Tenant',
        entityId: tenantId,
        entityLabel: tenant.name,
        summary: `Tenant status changed to ${status}`,
      },
    });

    res.json({ success: true, data: tenant });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update tenant status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function upsertCurrentTenantSubscription(req: Request, res: Response): Promise<void> {
  try {
    if (!isTenantAdmin(req)) {
      res.status(403).json({ success: false, message: 'Tenant admin permission required' });
      return;
    }

    const tenantId = requireTenantId(req);
    const {
      planCode = 'starter',
      status = 'trialing',
      billingInterval = 'month',
      provider,
      providerCustomerId,
      providerSubscriptionId,
    } = req.body as Record<string, string | undefined>;

    const existing = await prisma.tenantSubscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const subscription = existing
      ? await prisma.tenantSubscription.update({
          where: { id: existing.id },
          data: {
            planCode,
            status: status as never,
            billingInterval: billingInterval as never,
            provider,
            providerCustomerId,
            providerSubscriptionId,
          },
        })
      : await prisma.tenantSubscription.create({
          data: {
            tenantId,
            planCode,
            status: status as never,
            billingInterval: billingInterval as never,
            provider,
            providerCustomerId,
            providerSubscriptionId,
          },
        });

    res.json({ success: true, data: subscription });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update tenant subscription',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = {
  getCurrentTenant,
  listTenants,
  updateCurrentTenantStatus,
  upsertCurrentTenantSubscription,
};
