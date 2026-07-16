import type { PermissionAction, PermissionSet } from "@models/permissions";
import { store } from "@store/index";
import { hasFullTenantAccess } from "@constants/userTypes";

export const hasPermission = (permissions: PermissionSet[], moduleSlug: string, action: PermissionAction) : boolean => {
    const module = permissions.find((permission) => permission.moduleSlug === moduleSlug);
    const { user, activeTenantId, tenants } = store.getState().auth;
    const membership = tenants.find((tenant) => tenant.tenantId === activeTenantId);

    if (hasFullTenantAccess(user?.user_type, membership?.role)) return true;
    if (!module) return false;
    if (module.allowAll) return true;
    return module[action];
}