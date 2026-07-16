import type { Request, Response } from 'express';
import type { PlanBillingCycle, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  PLAN_BOOLEAN_FEATURE_KEYS,
  PLAN_FEATURE_LABELS,
  PLAN_NUMERIC_LIMIT_KEYS,
  DEFAULT_PLAN_FEATURES,
} from '../lib/planEntitlements';
import {
  assignPlanToTenant,
  createTrialSubscriptionForTenant,
  getActivePlanBySlug,
  planBillingCycleLabel,
  serializePlan,
  uniquePlanSlug,
} from '../lib/planService';
import { requireUserId } from '../lib/tenantScope';

function parsePlanBody(body: Record<string, unknown>) {
  const features = (body.features as Record<string, boolean> | undefined) ?? {};
  const mergedFeatures = { ...DEFAULT_PLAN_FEATURES, ...features };

  return {
    name: String(body.name ?? '').trim(),
    slug: body.slug ? String(body.slug).trim().toLowerCase() : undefined,
    description: body.description ? String(body.description) : null,
    price: Number(body.price ?? 0),
    currencyCode: String(body.currencyCode ?? 'USD').toUpperCase(),
    billingCycle: (body.billingCycle as PlanBillingCycle) ?? 'monthly',
    trialDays: Number(body.trialDays ?? 14),
    isFeatured: Boolean(body.isFeatured),
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    sortOrder: Number(body.sortOrder ?? 0),
    maxUsers: Number(body.maxUsers ?? 5),
    maxInvoices: Number(body.maxInvoices ?? 100),
    maxCustomers: Number(body.maxCustomers ?? 100),
    maxProducts: Number(body.maxProducts ?? 100),
    maxStorageMb: Number(body.maxStorageMb ?? 500),
    features: mergedFeatures,
    stripePriceId: body.stripePriceId ? String(body.stripePriceId) : null,
    stripeProductId: body.stripeProductId ? String(body.stripeProductId) : null,
    razorpayPlanId: body.razorpayPlanId ? String(body.razorpayPlanId) : null,
  };
}

export async function getPlanMeta(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      billingCycles: ['trial', 'monthly', 'quarterly', 'half_yearly', 'yearly', 'lifetime'],
      numericLimits: PLAN_NUMERIC_LIMIT_KEYS,
      booleanFeatures: PLAN_BOOLEAN_FEATURE_KEYS,
      featureLabels: PLAN_FEATURE_LABELS,
    },
  });
}

export async function listPlans(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20), 10)));
    const search = String(req.query.search ?? '').trim();
    const activeOnly = req.query.active === 'true';

    const where: Prisma.PlanWhereInput = {
      deletedAt: null,
      ...(activeOnly ? { isActive: true } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, plans] = await Promise.all([
      prisma.plan.count({ where }),
      prisma.plan.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: {
        plans: plans.map(serializePlan),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to list plans',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listActivePlans(_req: Request, res: Response): Promise<void> {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
    });

    res.json({
      success: true,
      data: plans.map((plan) => ({
        ...serializePlan(plan),
        billingCycleLabel: planBillingCycleLabel(plan.billingCycle),
      })),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to list active plans',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getPlan(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const plan = await prisma.plan.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id }, { slug: id }],
      },
    });

    if (!plan) {
      res.status(404).json({ success: false, message: 'Plan not found' });
      return;
    }

    res.json({ success: true, data: serializePlan(plan) });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plan',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function createPlan(req: Request, res: Response): Promise<void> {
  try {
    const body = parsePlanBody(req.body as Record<string, unknown>);
    if (!body.name) {
      res.status(400).json({ success: false, message: 'Plan name is required' });
      return;
    }

    const slug = body.slug || (await uniquePlanSlug(body.name));
    const existing = await prisma.plan.findFirst({ where: { slug, deletedAt: null } });
    if (existing) {
      res.status(400).json({ success: false, message: 'Plan slug already exists' });
      return;
    }

    const plan = await prisma.plan.create({
      data: { ...body, slug },
    });

    res.status(201).json({ success: true, data: serializePlan(plan) });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to create plan',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function updatePlan(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      res.status(404).json({ success: false, message: 'Plan not found' });
      return;
    }

    const body = parsePlanBody(req.body as Record<string, unknown>);
    if (body.slug && body.slug !== existing.slug) {
      const clash = await prisma.plan.findFirst({ where: { slug: body.slug, deletedAt: null } });
      if (clash) {
        res.status(400).json({ success: false, message: 'Plan slug already exists' });
        return;
      }
    }

    const plan = await prisma.plan.update({
      where: { id },
      data: {
        ...body,
        slug: body.slug || existing.slug,
      },
    });

    res.json({ success: true, data: serializePlan(plan) });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update plan',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function togglePlanStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { isActive } = req.body as { isActive?: boolean };
    const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) {
      res.status(404).json({ success: false, message: 'Plan not found' });
      return;
    }

    const updated = await prisma.plan.update({
      where: { id },
      data: { isActive: isActive ?? !plan.isActive },
    });

    res.json({ success: true, data: serializePlan(updated) });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update plan status',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function deletePlan(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const plan = await prisma.plan.findFirst({ where: { id, deletedAt: null } });
    if (!plan) {
      res.status(404).json({ success: false, message: 'Plan not found' });
      return;
    }

    await prisma.plan.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Plan archived successfully' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete plan',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getTenantSubscription(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      res.status(400).json({ success: false, message: 'Tenant context required' });
      return;
    }

    const subscription = await prisma.tenantSubscription.findFirst({
      where: { tenantId },
      include: { plan: true, tenant: { select: { id: true, name: true, slug: true, status: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: subscription
        ? {
            ...subscription,
            amountPaid: subscription.amountPaid ? Number(subscription.amountPaid) : null,
            plan: subscription.plan ? serializePlan(subscription.plan) : null,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function listTenantSubscriptions(req: Request, res: Response): Promise<void> {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? 20), 10)));
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = String(req.query.search ?? '').trim();

    const where: Prisma.TenantSubscriptionWhereInput = {
      ...(status ? { status: status as never } : {}),
      ...(search
        ? {
            OR: [
              { planCode: { contains: search, mode: 'insensitive' } },
              { tenant: { name: { contains: search, mode: 'insensitive' } } },
              { tenant: { slug: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, subscriptions] = await Promise.all([
      prisma.tenantSubscription.count({ where }),
      prisma.tenantSubscription.findMany({
        where,
        include: {
          plan: true,
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
              owner: { select: { id: true, email: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      data: {
        subscriptions: subscriptions.map((sub) => ({
          ...sub,
          amountPaid: sub.amountPaid ? Number(sub.amountPaid) : null,
          plan: sub.plan ? serializePlan(sub.plan) : null,
        })),
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to list subscriptions',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getSubscriptionStats(_req: Request, res: Response): Promise<void> {
  try {
    const [totalTenants, activeSubs, trialingSubs, plans] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenantSubscription.count({ where: { status: 'active' } }),
      prisma.tenantSubscription.count({ where: { status: 'trialing' } }),
      prisma.plan.count({ where: { deletedAt: null, isActive: true } }),
    ]);

    const mrrRows = await prisma.tenantSubscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
      include: { plan: true },
    });

    const mrr = mrrRows.reduce((sum, sub) => {
      const price = sub.plan ? Number(sub.plan.price) : Number(sub.amountPaid ?? 0);
      return sum + price;
    }, 0);

    res.json({
      success: true,
      data: { totalTenants, activeSubs, trialingSubs, activePlans: plans, estimatedMrr: mrr },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subscription stats',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function assignPlan(req: Request, res: Response): Promise<void> {
  try {
    const { tenantId, planId, status, notes, amountPaid, currencyCode } = req.body as {
      tenantId?: string;
      planId?: string;
      status?: 'trialing' | 'active' | 'past_due' | 'cancelled';
      notes?: string;
      amountPaid?: number;
      currencyCode?: string;
    };

    if (!tenantId || !planId) {
      res.status(400).json({ success: false, message: 'tenantId and planId are required' });
      return;
    }

    const subscription = await assignPlanToTenant({
      tenantId,
      planId,
      assignedBy: requireUserId(req),
      status,
      notes,
      amountPaid,
      currencyCode,
    });

    res.json({
      success: true,
      message: 'Plan assigned to tenant successfully',
      data: {
        ...subscription,
        amountPaid: subscription.amountPaid ? Number(subscription.amountPaid) : null,
        plan: subscription.plan ? serializePlan(subscription.plan) : null,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to assign plan',
    });
  }
}

export async function cancelTenantSubscription(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const subscription = await prisma.tenantSubscription.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() },
      include: { plan: true, tenant: true },
    });

    await prisma.tenant.update({
      where: { id: subscription.tenantId },
      data: { status: 'cancelled' },
    });

    res.json({ success: true, data: subscription });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel subscription',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

module.exports = {
  getPlanMeta,
  listPlans,
  listActivePlans,
  getPlan,
  createPlan,
  updatePlan,
  togglePlanStatus,
  deletePlan,
  getTenantSubscription,
  listTenantSubscriptions,
  getSubscriptionStats,
  assignPlan,
  cancelTenantSubscription,
  getActivePlanBySlug,
  createTrialSubscriptionForTenant,
};
