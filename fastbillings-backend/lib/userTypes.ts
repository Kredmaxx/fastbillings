/**
 * Platform-wide user type codes.
 *
 * Super Admin (0) — platform owner, cross-tenant operations.
 * Admin (1)       — tenant / company administrator.
 * Vendor (2), Staff (3), Maintainer (4), Supplier (5) — tenant-scoped roles.
 * System (999)    — bootstrap user, not a real login account.
 */
export const USER_TYPE = {
  SUPER_ADMIN: 0,
  ADMIN: 1,
  VENDOR: 2,
  STAFF: 3,
  MAINTAINER: 4,
  SUPPLIER: 5,
  SYSTEM: 999,
} as const;

export const USER_TYPE_LABEL: Readonly<Record<number, string>> = {
  [USER_TYPE.SUPER_ADMIN]: 'Super Admin',
  [USER_TYPE.ADMIN]: 'Admin',
  [USER_TYPE.VENDOR]: 'Vendor',
  [USER_TYPE.STAFF]: 'Staff',
  [USER_TYPE.MAINTAINER]: 'Maintainer',
  [USER_TYPE.SUPPLIER]: 'Supplier',
  [USER_TYPE.SYSTEM]: 'System',
};

export function isPlatformSuperAdmin(userType: number | null | undefined): boolean {
  return userType === USER_TYPE.SUPER_ADMIN;
}

export function isTenantAdmin(userType: number | null | undefined): boolean {
  return userType === USER_TYPE.ADMIN;
}

export function isProtectedAccount(userType: number | null | undefined): boolean {
  return isPlatformSuperAdmin(userType) || isTenantAdmin(userType);
}

export function userTypeLabel(userType: number): string {
  return USER_TYPE_LABEL[userType] ?? `Type ${userType}`;
}
