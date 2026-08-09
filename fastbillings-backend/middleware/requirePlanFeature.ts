import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  DEFAULT_PLAN_FEATURES,
  type PlanBooleanFeatureKey,
  type PlanNumericLimitKey,
} from '../lib/planEntitlements';

async function loadActivePlan(tenantId: string) {
  const sub = await prisma.tenantSubscription.findFirst({
    where: {
      tenantId,
      status: { in: ['trialing', 'active'] },
    },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
  return sub?.plan ?? null;
}

const CORE_FEATURES_WHEN_UNSPECIFIED: PlanBooleanFeatureKey[] = [
  'access_invoicing',
  'access_inventory',
  'access_purchases',
  'access_accounting',
  'access_reports',
  'access_gst',
];

function featureEnabled(plan: { features: Prisma.JsonValue } | null, key: PlanBooleanFeatureKey): boolean {
  // No subscription/plan row → grandfather existing tenants (do not hard-block).
  if (!plan) return true;
  const features =
    plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)
      ? (plan.features as Record<string, unknown>)
      : {};
  if (typeof features[key] === 'boolean') return features[key] as boolean;
  // Explicit empty/partial features JSON: allow core ERP modules, use defaults for optional ones.
  if (CORE_FEATURES_WHEN_UNSPECIFIED.includes(key)) return true;
  return DEFAULT_PLAN_FEATURES[key];
}

/** Gate a route behind a Plan.features boolean key. */
export function requirePlanFeature(feature: PlanBooleanFeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.auth?.isPlatformAdmin) {
        next();
        return;
      }
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(403).json({ success: false, message: 'Tenant context is required' });
        return;
      }
      const plan = await loadActivePlan(tenantId);
      if (!featureEnabled(plan, feature)) {
        res.status(402).json({
          success: false,
          message: `Your plan does not include ${feature.replace(/^access_/, '').replace(/_/g, ' ')}. Please upgrade.`,
          feature,
        });
        return;
      }
      next();
    } catch (err) {
      console.error('requirePlanFeature error:', err);
      res.status(500).json({ success: false, message: 'Plan check failed' });
    }
  };
}

type LimitCounter = (tenantId: string) => Promise<number>;

const LIMIT_COUNTERS: Partial<Record<PlanNumericLimitKey, LimitCounter>> = {
  maxCustomers: (tenantId) =>
    prisma.customer.count({ where: { tenantId, isDeleted: false } }),
  maxProducts: (tenantId) =>
    prisma.product.count({ where: { tenantId } }),
  maxUsers: (tenantId) =>
    prisma.tenantMembership.count({ where: { tenantId } }),
  maxInvoices: async (tenantId) => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return prisma.invoice.count({
      where: { tenantId, isDeleted: false, createdAt: { gte: start } },
    });
  },
};

/** Enforce a numeric Plan limit before creating a resource (0 = unlimited). */
export function requirePlanLimit(limitKey: PlanNumericLimitKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.auth?.isPlatformAdmin) {
        next();
        return;
      }
      const tenantId = req.auth?.tenantId;
      if (!tenantId) {
        res.status(403).json({ success: false, message: 'Tenant context is required' });
        return;
      }
      const plan = await loadActivePlan(tenantId);
      const max = plan ? Number(plan[limitKey] ?? 0) : 0;
      if (!max || max <= 0) {
        next();
        return;
      }
      const counter = LIMIT_COUNTERS[limitKey];
      if (!counter) {
        next();
        return;
      }
      const used = await counter(tenantId);
      if (used >= max) {
        res.status(402).json({
          success: false,
          message: `Plan limit reached for ${limitKey} (${used}/${max}). Please upgrade.`,
          limitKey,
          used,
          max,
        });
        return;
      }
      next();
    } catch (err) {
      console.error('requirePlanLimit error:', err);
      res.status(500).json({ success: false, message: 'Plan limit check failed' });
    }
  };
}
