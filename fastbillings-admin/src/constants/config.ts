export const BRAND = {
  name: "Byzkon",
  tagline: "Platform Administration",
  platformAdminEmail: "superadmin@fastbillings.local",
} as const;

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const API = `${BASE}/api`;

export const API_URLS = {
  LOGIN: `${API}/auth/login`,
  LOGOUT: `${API}/auth/logout`,
  PLANS_META: `${API}/admin/platform/plans/meta`,
  PLANS: `${API}/admin/platform/plans`,
  ACTIVE_PLANS: `${API}/admin/plans/active`,
  SUBSCRIPTIONS: `${API}/admin/platform/subscriptions`,
  SUBSCRIPTION_STATS: `${API}/admin/platform/subscriptions/stats`,
  ASSIGN_PLAN: `${API}/admin/platform/subscriptions/assign`,
  CANCEL_SUBSCRIPTION: `${API}/admin/platform/subscriptions`,
  TENANTS: `${API}/admin/platform/tenants`,
  LANDING_PAGE: `${API}/admin/platform/landing-page`,
  PUBLIC_LANDING_PAGE: `${API}/landing-page`,
} as const;

export const TENANT_APP_URL = import.meta.env.VITE_TENANT_APP_URL ?? "http://localhost:3000";
