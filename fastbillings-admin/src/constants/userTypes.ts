export const USER_TYPE = {
  SUPER_ADMIN: 0,
  ADMIN: 1,
} as const;

export function isPlatformSuperAdmin(userType?: number | null): boolean {
  return userType === USER_TYPE.SUPER_ADMIN;
}
