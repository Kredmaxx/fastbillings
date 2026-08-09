import type { Request } from 'express';

import { prisma } from './prisma';

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

/** Ownership filter only (no isDeleted) — safe to nest under AND with search OR. */
export function tenantOrUserFilter(req: Request): {
  OR: Array<{ tenantId: string } | { userId: string }>;
} {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  if (tenantId) {
    return { OR: [{ tenantId }, { userId }] };
  }
  return { OR: [{ userId }] };
}

/**
 * Dual-scope for entities mid-migration: prefer tenantId rows, keep legacy userId rows visible.
 */
export function tenantOrUserScope(req: Request): {
  isDeleted: false;
  OR: Array<{ tenantId: string } | { userId: string }>;
} {
  return { isDeleted: false, ...tenantOrUserFilter(req) };
}

/** Same as tenantOrUserFilter for models that use `user_id` (Supplier). */
export function supplierTenantOrUserFilter(req: Request): {
  OR: Array<{ tenantId: string } | { user_id: string }>;
} {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  if (tenantId) {
    return { OR: [{ tenantId }, { user_id: userId }] };
  }
  return { OR: [{ user_id: userId }] };
}

export function supplierTenantOrUserScope(req: Request): {
  isDeleted: false;
  OR: Array<{ tenantId: string } | { user_id: string }>;
} {
  return { isDeleted: false, ...supplierTenantOrUserFilter(req) };
}

/** Auth tenant id when present (for writes); null for legacy sessions. */
export function optionalTenantId(req: Request): string | null {
  const tenantId = req.auth?.tenantId;
  return typeof tenantId === 'string' && tenantId ? tenantId : null;
}

/** CustomField uses soft-delete via `deletedAt` (not isDeleted). */
export function customFieldScope(req: Request): {
  deletedAt: null;
  OR: Array<{ tenantId: string } | { userId: string }>;
} {
  return { deletedAt: null, ...tenantOrUserFilter(req) };
}

/**
 * Ownership via `createdBy` (Reminder, SupplierPayment mid-migration).
 * Prefer tenant rows; keep legacy createdBy rows visible.
 */
export function createdByOwnershipFilter(req: Request): {
  OR: Array<{ tenantId: string } | { createdBy: string }>;
} {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  if (tenantId) {
    return { OR: [{ tenantId }, { createdBy: userId }] };
  }
  return { OR: [{ createdBy: userId }] };
}

/** @deprecated Prefer createdByOwnershipFilter — same shape. */
export function reminderOwnershipFilter(req: Request): {
  OR: Array<{ tenantId: string } | { createdBy: string }>;
} {
  return createdByOwnershipFilter(req);
}

/**
 * For GL entities that are still user-owned: include all tenant members' rows
 * so multi-user workspaces share one chart / journal view.
 */
export async function tenantMemberUserIds(req: Request): Promise<string[]> {
  const userId = requireUserId(req);
  const tenantId = req.auth?.tenantId;
  if (!tenantId) return [userId];
  const memberships = await prisma.tenantMembership.findMany({
    where: { tenantId },
    select: { userId: true },
  });
  const ids = memberships.map((m) => m.userId);
  if (!ids.includes(userId)) ids.push(userId);
  return ids;
}
