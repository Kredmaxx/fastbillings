import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { prisma } from '../lib/prisma';
import { ensureDefaultTenantForUser, getMembershipForRequest } from '../lib/tenancy';
import { isPlatformSuperAdmin } from '../lib/userTypes';
import { resolveTenantApiKey, TENANT_API_KEY_PREFIX } from '../lib/tenantApiKey';

interface DecodedToken {
  id: string;
  tenantId?: string;
  membershipId?: string;
  iat?: number;
  exp?: number;
}

function extractCredential(req: Request): { kind: 'apiKey' | 'jwt'; value: string } | null {
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return { kind: 'apiKey', value: headerKey.trim() };
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const value = auth.slice(7).trim();
  if (!value) return null;
  if (value.startsWith(TENANT_API_KEY_PREFIX)) {
    return { kind: 'apiKey', value };
  }
  return { kind: 'jwt', value };
}

export async function protect(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const credential = extractCredential(req);
  if (!credential) {
    res.status(401).json({ message: 'Not authorized' });
    return;
  }

  if (credential.kind === 'apiKey') {
    try {
      const resolved = await resolveTenantApiKey(credential.value);
      if (!resolved) {
        res.status(401).json({ message: 'Invalid or revoked API key' });
        return;
      }
      req.user = resolved.userId;
      req.auth = {
        userId: resolved.userId,
        tenantId: resolved.tenantId,
        membershipId: resolved.membershipId,
        membershipRole: resolved.membershipRole,
        roleId: resolved.roleId,
        isPlatformAdmin: resolved.isPlatformAdmin,
        apiKeyId: resolved.apiKeyId,
      };
      next();
      return;
    } catch (err) {
      console.error('protect: API key auth failed:', err);
      res.status(401).json({ message: 'Invalid or revoked API key' });
      return;
    }
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ message: 'Server misconfigured: JWT_SECRET missing' });
    return;
  }

  let decoded: DecodedToken;
  try {
    decoded = jwt.verify(credential.value, secret) as DecodedToken;
  } catch {
    res.status(401).json({ message: 'Invalid token' });
    return;
  }

  // Reject tokens whose user no longer exists and resolve the active tenant.
  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, user_type: true },
    });
    if (!user) {
      res.status(401).json({ message: 'Session expired. Please sign in again.' });
      return;
    }

    const platformAdmin = isPlatformSuperAdmin(user.user_type);

    let membership = await getMembershipForRequest(decoded.id, decoded.tenantId);
    if (!membership && !platformAdmin) {
      membership = await ensureDefaultTenantForUser(decoded.id);
    }
    if (!membership && !platformAdmin) {
      res.status(403).json({ message: 'No tenant membership found for this user.' });
      return;
    }

    if (membership && !platformAdmin) {
      if (membership.tenant.status === 'suspended' || membership.tenant.status === 'cancelled') {
        res.status(403).json({ message: 'Tenant is not active.' });
        return;
      }
    }

    if (platformAdmin && decoded.tenantId && !membership) {
      const tenant = await prisma.tenant.findUnique({ where: { id: decoded.tenantId } });
      if (!tenant) {
        res.status(401).json({ message: 'Session tenant is invalid. Please sign in again.' });
        return;
      }
    }

    req.user = decoded.id;
    req.auth = {
      userId: decoded.id,
      tenantId: membership?.tenantId ?? decoded.tenantId ?? '',
      membershipId: membership?.id ?? 'platform-admin',
      membershipRole: membership?.role ?? 'ADMIN',
      roleId: membership?.roleId,
      isPlatformAdmin: platformAdmin,
    };
  } catch (err) {
    console.error('protect: session or tenant membership check failed:', err);
    res.status(401).json({ message: 'Session tenant is invalid. Please sign in again.' });
    return;
  }

  next();
}

// Preserve the historical default-export shape so the existing JS controllers
// can `require('../middleware/authMiddleware')` unchanged. Once everything is
// TS we'll switch to named imports.
export default protect;
module.exports = protect;
module.exports.protect = protect;
module.exports.default = protect;
