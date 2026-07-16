export type PlanBillingCycle =
  | "trial"
  | "monthly"
  | "quarterly"
  | "half_yearly"
  | "yearly"
  | "lifetime";

export interface PlanFeatures {
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
}

export interface TenantSubscriptionRow {
  id: string;
  tenantId: string;
  planId?: string | null;
  planCode: string;
  status: string;
  currentPeriodEndsAt?: string | null;
  plan?: SaasPlan | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
    owner?: { email: string };
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
