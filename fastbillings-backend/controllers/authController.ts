import type { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UAParser } from 'ua-parser-js';
import geoip from 'geoip-lite';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';

import { prisma } from '../lib/prisma';
import { hashPassword, comparePassword } from '../utils/password';
import { generateToken } from '../utils/generateToken';
import { ensureRole, DEFAULT_ROLE_BY_USER_TYPE } from '../lib/defaultRoles';
import { USER_TYPE } from '../lib/userTypes';
import {
  createTenantForOwner,
  ensureDefaultTenantForUser,
  getMembershipForRequest,
  listAllTenants,
  listUserTenants,
} from '../lib/tenancy';
import { createTrialSubscriptionForTenant } from '../lib/planService';
import { isPlatformSuperAdmin } from '../lib/userTypes';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function badInput(res: Response, errors: ReturnType<typeof validationResult>): void {
  res.status(400).json({
    errors: errors.array().map((err) => err.msg),
  });
}

export async function register(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    badInput(res, errors);
    return;
  }

  const { firstName, lastName, email, phone, password } = req.body as {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
  };

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'Email already exists' });
      return;
    }

    const hashed = await hashPassword(password);

    // Ensure the Admin role exists (idempotent – safe on fresh installs that
    // haven't been seeded yet) and link it to the new admin user.
    // Resilient: role lookup failure must not block registration — next-boot
    // backfill (seedRoles) will heal the missing roleId automatically.
    let adminRoleId: string | null = null;
    try {
      adminRoleId = await ensureRole(DEFAULT_ROLE_BY_USER_TYPE[1]);
    } catch (roleErr) {
      console.warn('register: ensureRole failed (non-fatal, roleId will be null)', roleErr);
    }

    const { user, membership } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          firstName,
          lastName,
          email,
          phone,
          password: hashed,
          user_type: USER_TYPE.ADMIN,
          ...(adminRoleId ? { roleId: adminRoleId } : {}),
        },
      });

      const tenantName =
        (req.body.companyName as string | undefined)?.trim() ||
        [firstName, lastName].filter(Boolean).join(' ').trim() ||
        email;
      const tenant = await createTenantForOwner(
        {
          ownerId: createdUser.id,
          name: tenantName,
          roleId: adminRoleId,
          membershipRole: 'OWNER',
        },
        tx,
      );

      await createTrialSubscriptionForTenant(tenant.id, 'starter', tx);

      return { user: createdUser, membership: tenant.memberships[0] };
    });

    const tenants = await listUserTenants(user.id);

    res.status(201).json({
      message: 'Admin account created successfully',
      token: generateToken(user.id, {
        tenantId: membership.tenantId,
        membershipId: membership.id,
      }),
      user,
      activeTenantId: membership.tenantId,
      tenants,
    });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    badInput(res, errors);
    return;
  }

  const { email, password } = req.body as { email: string; password: string };

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await comparePassword(password, user.password))) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    // Capture login activity (best-effort; failure here must not break login).
    try {
      const forwardedFor = req.headers['x-forwarded-for'];
      const ipAddress =
        (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0]) ||
        req.socket.remoteAddress ||
        'Unknown';

      const ua = new UAParser(req.headers['user-agent']).getResult();
      const browser = ua.browser.name || 'Unknown';
      const device = ua.device.model
        ? `${ua.device.vendor || 'Unknown'} ${ua.device.model}`
        : 'Desktop';

      const geo = geoip.lookup(ipAddress);
      const location = geo
        ? `${geo.city || 'Unknown'}, ${geo.country || 'Unknown'}`
        : 'Unknown';

      await prisma.loginActivity.create({
        data: {
          userId: user.id,
          ipAddress,
          browser,
          device,
          location,
        },
      });
    } catch (activityErr) {
      console.warn('LoginActivity recording failed (non-fatal)', activityErr);
    }

    const membership = isPlatformSuperAdmin(user.user_type)
      ? await getMembershipForRequest(user.id, null)
      : await ensureDefaultTenantForUser(user.id);

    if (!membership && !isPlatformSuperAdmin(user.user_type)) {
      res.status(403).json({ message: 'No tenant membership found for this user.' });
      return;
    }

    const tenants = isPlatformSuperAdmin(user.user_type)
      ? await listAllTenants()
      : await listUserTenants(user.id);

    res.json({
      message: 'Login successful',
      token: generateToken(user.id, {
        tenantId: membership?.tenantId,
        membershipId: membership?.id,
      }),
      user,
      activeTenantId: membership?.tenantId ?? null,
      tenants,
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({ message: 'Server error' });
  }
}

export function logout(_req: Request, res: Response): void {
  res.json({ message: 'Logout successful (handled client-side)' });
}

/** Sign in / register via Google Identity Services ID token. */
export async function loginWithGoogle(req: Request, res: Response): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(503).json({
      message: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID on the server.',
    });
    return;
  }

  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ message: 'Google credential is required' });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      res.status(401).json({ message: 'Invalid Google token' });
      return;
    }
    if (payload.email_verified === false) {
      res.status(401).json({ message: 'Google email is not verified' });
      return;
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const firstName = payload.given_name || payload.name?.split(' ')[0] || 'User';
    const lastName =
      payload.family_name || payload.name?.split(' ').slice(1).join(' ') || null;
    const profileImage = payload.picture || null;

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId }, { email }],
        isDeleted: false,
      },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            ...(profileImage && !user.profileImage ? { profileImage } : {}),
          },
        });
      }
    } else {
      const randomPassword = await hashPassword(crypto.randomBytes(32).toString('hex'));
      let adminRoleId: string | null = null;
      try {
        adminRoleId = await ensureRole(DEFAULT_ROLE_BY_USER_TYPE[1]);
      } catch (roleErr) {
        console.warn('loginWithGoogle: ensureRole failed (non-fatal)', roleErr);
      }

      const created = await prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            firstName,
            lastName,
            email,
            googleId,
            profileImage,
            password: randomPassword,
            user_type: USER_TYPE.ADMIN,
            ...(adminRoleId ? { roleId: adminRoleId } : {}),
          },
        });

        const tenantName =
          [firstName, lastName].filter(Boolean).join(' ').trim() || email;
        const tenant = await createTenantForOwner(
          {
            ownerId: createdUser.id,
            name: tenantName,
            roleId: adminRoleId,
            membershipRole: 'OWNER',
          },
          tx,
        );
        await createTrialSubscriptionForTenant(tenant.id, 'starter', tx);
        return createdUser;
      });

      user = created;
    }

    const membership = isPlatformSuperAdmin(user.user_type)
      ? await getMembershipForRequest(user.id, null)
      : await ensureDefaultTenantForUser(user.id);

    if (!membership && !isPlatformSuperAdmin(user.user_type)) {
      res.status(403).json({ message: 'No tenant membership found for this user.' });
      return;
    }

    const tenants = isPlatformSuperAdmin(user.user_type)
      ? await listAllTenants()
      : await listUserTenants(user.id);

    res.json({
      message: 'Google sign-in successful',
      token: generateToken(user.id, {
        tenantId: membership?.tenantId,
        membershipId: membership?.id,
      }),
      user,
      activeTenantId: membership?.tenantId ?? null,
      tenants,
    });
  } catch (err) {
    console.error('loginWithGoogle error', err);
    res.status(401).json({ message: 'Google authentication failed' });
  }
}

export async function switchTenant(req: Request, res: Response): Promise<void> {
  const userId = req.auth?.userId ?? req.user;
  const { tenantId } = req.body as { tenantId?: string };

  if (!userId || !tenantId) {
    res.status(400).json({ message: 'tenantId is required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }

  let membership = await getMembershipForRequest(userId, tenantId);
  if (!membership && isPlatformSuperAdmin(user.user_type)) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      res.status(404).json({ message: 'Tenant not found' });
      return;
    }
  } else if (!membership) {
    res.status(404).json({ message: 'Tenant membership not found' });
    return;
  } else if (membership.tenant.status === 'suspended' || membership.tenant.status === 'cancelled') {
    res.status(403).json({ message: 'Tenant is not active.' });
    return;
  }

  const tenants = isPlatformSuperAdmin(user.user_type)
    ? await listAllTenants()
    : await listUserTenants(userId);

  res.json({
    message: 'Tenant switched successfully',
    token: generateToken(userId, {
      tenantId,
      membershipId: membership?.id,
    }),
    user,
    activeTenantId: tenantId,
    tenants,
  });
}

// CommonJS interop for legacy JS callers
module.exports = { register, login, logout, switchTenant, loginWithGoogle };
module.exports.register = register;
module.exports.login = login;
module.exports.logout = logout;
module.exports.switchTenant = switchTenant;
module.exports.loginWithGoogle = loginWithGoogle;
