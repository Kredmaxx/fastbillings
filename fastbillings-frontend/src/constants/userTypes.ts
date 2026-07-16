/** Platform-wide user type codes (mirrors backend lib/userTypes.ts). */
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
  [USER_TYPE.SUPER_ADMIN]: "Super Admin",
  [USER_TYPE.ADMIN]: "Admin",
  [USER_TYPE.VENDOR]: "Vendor",
  [USER_TYPE.STAFF]: "Staff",
  [USER_TYPE.MAINTAINER]: "Maintainer",
  [USER_TYPE.SUPPLIER]: "Supplier",
  [USER_TYPE.SYSTEM]: "System",
};

export function isPlatformSuperAdmin(userType?: number | null): boolean {
  return userType === USER_TYPE.SUPER_ADMIN;
}

export function isTenantAdmin(userType?: number | null): boolean {
  return userType === USER_TYPE.ADMIN;
}

export function hasFullTenantAccess(
  userType?: number | null,
  membershipRole?: "OWNER" | "ADMIN" | "MEMBER" | null,
): boolean {
  if (isPlatformSuperAdmin(userType)) return true;
  if (isTenantAdmin(userType)) return true;
  return membershipRole === "OWNER" || membershipRole === "ADMIN";
}
