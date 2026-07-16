export type PlanBillingCycle =
  | "trial"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "lifetime";

export interface PlanFeatures {
  access_invoicing?: boolean;
  access_inventory?: boolean;
  access_purchases?: boolean;
  access_accounting?: boolean;
  access_reports?: boolean;
  access_gst?: boolean;
  access_ai?: boolean;
  access_api?: boolean;
  access_multi_currency?: boolean;
  access_integrations?: boolean;
  priority_support?: boolean;
  [key: string]: boolean | undefined;
}

export interface SaasPlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  price: number;
  currencyCode: string;
  billingCycle: PlanBillingCycle;
  billingCycleLabel?: string;
  trialDays: number;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  maxUsers: number;
  maxInvoices: number;
  maxCustomers: number;
  maxProducts: number;
  maxStorageMb: number;
  features: PlanFeatures;
  stripePriceId?: string | null;
  stripeProductId?: string | null;
  razorpayPlanId?: string | null;
}

export interface TenantSubscriptionRow {
  id: string;
  tenantId: string;
  planId?: string | null;
  planCode: string;
  status: string;
  billingInterval: string;
  amountPaid?: number | null;
  currencyCode?: string | null;
  trialEndsAt?: string | null;
  currentPeriodStartsAt?: string | null;
  currentPeriodEndsAt?: string | null;
  plan?: SaasPlan | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
    owner?: { id: string; email: string; firstName: string; lastName: string };
  };
}

export interface PlanMeta {
  billingCycles: PlanBillingCycle[];
  numericLimits: string[];
  booleanFeatures: string[];
  featureLabels: Record<string, string>;
}

export interface SubscriptionStats {
  totalTenants: number;
  activeSubs: number;
  trialingSubs: number;
  activePlans: number;
  estimatedMrr: number;
}
