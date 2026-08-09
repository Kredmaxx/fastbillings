import type { NextFunction, Request, Response } from 'express';

import { prisma } from '../lib/prisma';
import { isPlatformSuperAdmin, isTenantAdmin } from '../lib/userTypes';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

/**
 * API RBAC gate. OWNER / ADMIN membership roles and tenant Admin user_type
 * bypass module checks (same as frontend hasFullTenantAccess).
 */
export function requirePermission(moduleSlug: string, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = req.auth;
      if (!auth?.userId) {
        res.status(401).json({ success: false, message: 'Not authorized' });
        return;
      }

      if (auth.isPlatformAdmin) {
        next();
        return;
      }

      if (auth.membershipRole === 'OWNER' || auth.membershipRole === 'ADMIN') {
        next();
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { user_type: true, roleId: true },
      });
      if (!user) {
        res.status(401).json({ success: false, message: 'Not authorized' });
        return;
      }
      if (isPlatformSuperAdmin(user.user_type) || isTenantAdmin(user.user_type)) {
        next();
        return;
      }

      const roleId = auth.roleId ?? user.roleId;
      if (!roleId) {
        res.status(403).json({
          success: false,
          message: `Missing permission: ${action} on ${moduleSlug}`,
        });
        return;
      }

      const permission = await prisma.permission.findFirst({
        where: {
          roleId,
          deletedAt: null,
          module: { moduleSlug, deletedAt: null },
        },
        select: {
          allowAll: true,
          view: true,
          create: true,
          edit: true,
          delete: true,
        },
      });

      const allowed =
        !!permission &&
        (permission.allowAll ||
          (action === 'view' && permission.view) ||
          (action === 'create' && permission.create) ||
          (action === 'edit' && permission.edit) ||
          (action === 'delete' && permission.delete));

      if (!allowed) {
        res.status(403).json({
          success: false,
          message: `Missing permission: ${action} on ${moduleSlug}`,
        });
        return;
      }

      next();
    } catch (err) {
      console.error('requirePermission error:', err);
      res.status(500).json({ success: false, message: 'Permission check failed' });
    }
  };
}
