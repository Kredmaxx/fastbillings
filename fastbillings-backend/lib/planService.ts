import type { Plan, PlanBillingCycle, Prisma, SubscriptionStatus, Tenant } from '@prisma/client';

import { prisma } from './prisma';
import { addBillingPeriod, billingCycleToInterval } from './planEntitlements';

type PrismaTx = Prisma.TransactionClient;

export function slugifyPlanName(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'plan';
}

export async function uniquePlanSlug(base: string, client: PrismaTx | typeof prisma = prisma) {
  const root = slugifyPlanName(base);
  let slug = root;
  let suffix = 1;
  while (await client.plan.findFirst({ where: { slug, deletedAt: null } })) {
    suffix += 1;
    slug = `${root}-${suffix}`;
  }
  return slug;
}

export function serializePlan(plan: Plan) {
  return {
    ...plan,
    price: Number(plan.price),
  };
}

export async function getActivePlanBySlug(slug: string) {
  return prisma.plan.findFirst({
    where: { slug, isActive: true, deletedAt: null },
  });
}

export async function listActivePlansForPublic() {
  const plans = await prisma.plan.findMany({
    where: { isActive: true, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }],
  });
  return plans.map((plan) => ({
    ...serializePlan(plan),
    billingCycleLabel: planBillingCycleLabel(plan.billingCycle),
  }));
}

export async function assignPlanToTenant(
  input: {
    tenantId: string;
    planId: string;
    assignedBy?: string;
    status?: SubscriptionStatus;
    notes?: string;
    amountPaid?: number;
    currencyCode?: string;
  },
  client: PrismaTx | typeof prisma = prisma,
) {
  const plan = await client.plan.findFirst({
    where: { id: input.planId, deletedAt: null },
  });
  if (!plan) throw new Error('Plan not found');

  const tenant = await client.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new Error('Tenant not found');

  const now = new Date();
  const trialEndsAt =
    plan.trialDays > 0 ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000) : null;
  const interval = billingCycleToInterval(plan.billingCycle);
  const status = input.status ?? (plan.trialDays > 0 ? 'trialing' : 'active');
  const periodEnd = addBillingPeriod(now, interval);

  const existing = await client.tenantSubscription.findFirst({
    where: { tenantId: input.tenantId },
    orderBy: { createdAt: 'desc' },
  });

  const data = {
    planId: plan.id,
    planCode: plan.slug,
    status,
    billingInterval: interval,
    trialEndsAt: status === 'trialing' ? trialEndsAt : null,
    currentPeriodStartsAt: now,
    currentPeriodEndsAt: periodEnd,
    amountPaid: input.amountPaid ?? Number(plan.price),
    currencyCode: input.currencyCode ?? plan.currencyCode,
    assignedBy: input.assignedBy,
    notes: input.notes,
    provider: 'admin',
  };

  const subscription = existing
    ? await client.tenantSubscription.update({
        where: { id: existing.id },
        data,
        include: { plan: true, tenant: true },
      })
    : await client.tenantSubscription.create({
        data: { tenantId: input.tenantId, ...data },
        include: { plan: true, tenant: true },
      });

  await client.tenant.update({
    where: { id: input.tenantId },
    data: { status: status === 'trialing' ? 'trialing' : 'active' },
  });

  return subscription;
}

export async function createTrialSubscriptionForTenant(
  tenantId: string,
  planSlug = 'starter',
  client: PrismaTx | typeof prisma = prisma,
) {
  const plan =
    (await client.plan.findFirst({ where: { slug: planSlug, deletedAt: null } })) ??
    (await client.plan.findFirst({ where: { isActive: true, deletedAt: null }, orderBy: { sortOrder: 'asc' } }));

  if (!plan) {
    const now = new Date();
    return client.tenantSubscription.create({
      data: {
        tenantId,
        planCode: planSlug,
        status: 'trialing',
        billingInterval: 'month',
        trialEndsAt: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: addBillingPeriod(now, 'month'),
      },
    });
  }

  return assignPlanToTenant(
    { tenantId, planId: plan.id, status: 'trialing' },
    client,
  );
}

export function planBillingCycleLabel(cycle: PlanBillingCycle): string {
  const labels: Record<PlanBillingCycle, string> = {
    trial: 'Free Trial',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    half_yearly: 'Half Yearly',
    yearly: 'Yearly',
    lifetime: 'Lifetime',
  };
  return labels[cycle] ?? cycle;
}

export type TenantWithSubscription = Tenant & {
  subscriptions: Array<{ plan: Plan | null } & Record<string, unknown>>;
};
