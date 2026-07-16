import type { Request } from 'express';

/**
 * Throws a typed error with HTTP-style status if `req.user` (the userId
 * the auth middleware decoded from the JWT) is missing. Use this at the
 * top of any controller that needs the authenticated userId.
 */
export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = 'Not authorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export function requireUserId(req: Request): string {
  const userId = req.auth?.userId ?? req.user;
  if (!userId || typeof userId !== 'string') {
    throw new UnauthorizedError();
  }
  return userId;
}

export function requireTenantId(req: Request): string {
  const tenantId = req.auth?.tenantId;
  if (!tenantId || typeof tenantId !== 'string') {
    throw new UnauthorizedError('Tenant context is required');
  }
  return tenantId;
}

/**
 * Returns the legacy per-user `where` partial that controllers still awaiting
 * tenant conversion can spread into Prisma queries. We standardise on
 * `{ userId, isDeleted: false }` so soft-deleted rows are hidden by
 * default.
 *
 * If a controller legitimately needs to see soft-deleted rows (e.g. a
 * "trash" view) it can spread tenantScope(req) and then override
 * `isDeleted` explicitly.
 */
export function tenantScope(req: Request): { userId: string; isDeleted: false } {
  return { userId: requireUserId(req), isDeleted: false };
}

/**
 * Strict tenant-owned scope for resources that have completed SaaS conversion.
 */
export function tenantEntityScope(req: Request): { tenantId: string; isDeleted: false } {
  return { tenantId: requireTenantId(req), isDeleted: false };
}
