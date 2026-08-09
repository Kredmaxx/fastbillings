import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { runWithAuditContext, type AuditContext } from '../lib/auditContext';

// This middleware runs globally (before the per-route `protect`), so `req.user`
// is not set yet. Derive the actor straight from the Bearer token instead, so
// audited writes are attributed to the real user rather than "system".
function identityFromToken(req: Request): { userId: string | null; tenantId: string | null } {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return { userId: null, tenantId: null };
  const secret = process.env.JWT_SECRET;
  if (!secret) return { userId: null, tenantId: null };
  try {
    const decoded = jwt.verify(auth.split(' ')[1], secret) as {
      id?: string;
      tenantId?: string;
    };
    return {
      userId: typeof decoded.id === 'string' ? decoded.id : null,
      tenantId: typeof decoded.tenantId === 'string' && decoded.tenantId ? decoded.tenantId : null,
    };
  } catch {
    return { userId: null, tenantId: null };
  }
}

export async function auditContextMiddleware(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const fromToken = identityFromToken(req);
  const userId =
    (typeof req.user === 'string' ? req.user : null)
    ?? (typeof req.auth?.userId === 'string' ? req.auth.userId : null)
    ?? fromToken.userId;
  const tenantId =
    (typeof req.auth?.tenantId === 'string' && req.auth.tenantId ? req.auth.tenantId : null)
    ?? fromToken.tenantId;
  const ipAddress = req.ip ?? null;
  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;

  let userName = 'system';
  if (userId) {
    try {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true },
      });
      if (u) {
        const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
        userName = full || u.email || 'system';
      }
    } catch {
      userName = 'system';
    }
  }

  const ctx: AuditContext = { userId, tenantId, userName, ipAddress, userAgent };
  runWithAuditContext(ctx, () => next());
}

module.exports = { auditContextMiddleware };
module.exports.auditContextMiddleware = auditContextMiddleware;
