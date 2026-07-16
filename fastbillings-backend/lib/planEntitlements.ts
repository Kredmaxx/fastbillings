/**
 * FastBillings SaaS plan entitlements (adapted from Whatzio plan-entitlements pattern).
 * Numeric limits live on Plan.maxUsers, maxInvoices, etc. (0 = unlimited).
 * Boolean keys in Plan.features gate modules.
 */

export const PLAN_NUMERIC_LIMIT_KEYS = [
  'maxUsers',
  'maxInvoices',
  'maxCustomers',
  'maxProducts',
  'maxStorageMb',
] as const;

export const PLAN_BOOLEAN_FEATURE_KEYS = [
  'access_invoicing',
  'access_inventory',
  'access_purchases',
  'access_accounting',
  'access_reports',
  'access_gst',
  'access_ai',
  'access_api',
  'access_multi_currency',
  'access_integrations',
  'priority_support',
] as const;

export type PlanBooleanFeatureKey = (typeof PLAN_BOOLEAN_FEATURE_KEYS)[number];
export type PlanNumericLimitKey = (typeof PLAN_NUMERIC_LIMIT_KEYS)[number];

export const PLAN_FEATURE_LABELS: Record<string, string> = {
  access_invoicing: 'Invoicing & Billing',
  access_inventory: 'Inventory Management',
  access_purchases: 'Purchases & Suppliers',
  access_accounting: 'Accounting & Journal',
  access_reports: 'Financial Reports',
  access_gst: 'GST / Tax Filing',
  access_ai: 'AI Bill Scan & Chat',
  access_api: 'REST API Access',
  access_multi_currency: 'Multi-Currency',
  access_integrations: 'Xero / QuickBooks',
  priority_support: 'Priority Support',
  maxUsers: 'Team Members',
  maxInvoices: 'Invoices / Month',
  maxCustomers: 'Customers',
  maxProducts: 'Products',
  maxStorageMb: 'Storage (MB)',
};

export const DEFAULT_PLAN_FEATURES: Record<PlanBooleanFeatureKey, boolean> = {
  access_invoicing: true,
  access_inventory: false,
  access_purchases: false,
  access_accounting: false,
  access_reports: false,
  access_gst: false,
  access_ai: false,
  access_api: false,
  access_multi_currency: false,
  access_integrations: false,
  priority_support: false,
};

export function billingCycleToInterval(
  cycle: string,
): 'month' | 'quarter' | 'half_year' | 'year' | 'lifetime' {
  switch (cycle) {
    case 'quarterly':
      return 'quarter';
    case 'half_yearly':
      return 'half_year';
    case 'yearly':
      return 'year';
    case 'lifetime':
      return 'lifetime';
    default:
      return 'month';
  }
}

export function addBillingPeriod(start: Date, interval: string): Date {
  const end = new Date(start);
  switch (interval) {
    case 'quarter':
    case 'quarterly':
      end.setMonth(end.getMonth() + 3);
      break;
    case 'half_year':
    case 'half_yearly':
      end.setMonth(end.getMonth() + 6);
      break;
    case 'year':
    case 'yearly':
      end.setFullYear(end.getFullYear() + 1);
      break;
    case 'lifetime':
      end.setFullYear(end.getFullYear() + 100);
      break;
    default:
      end.setMonth(end.getMonth() + 1);
  }
  return end;
}
