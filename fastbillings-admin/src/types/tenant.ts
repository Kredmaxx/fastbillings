export type TenantStatus = "trialing" | "active" | "suspended" | "cancelled";

export interface PlatformTenant {
  tenantId: string;
  name: string;
  slug: string;
  status: TenantStatus;
  ownerId?: string | null;
  owner?: { id: string; email: string; name: string } | null;
  memberCount: number;
  subscription?: {
    id: string;
    status: string;
    planCode: string;
    planName: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  memberships?: Array<{
    id: string;
    role: string;
    user: { id: string; email: string; firstName: string; lastName: string };
  }>;
}

export const TENANT_STATUSES: { value: TenantStatus; label: string }[] = [
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
  { value: "cancelled", label: "Cancelled" },
];
