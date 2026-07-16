import jwt from 'jsonwebtoken';

const JWT_EXPIRES_IN = '7d';

export interface TokenTenantContext {
  tenantId?: string | null;
  membershipId?: string | null;
}

export function generateToken(userId: string, context: TokenTenantContext = {}): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set in the environment.');
  }
  return jwt.sign(
    {
      id: userId,
      ...(context.tenantId ? { tenantId: context.tenantId } : {}),
      ...(context.membershipId ? { membershipId: context.membershipId } : {}),
    },
    secret,
    { expiresIn: JWT_EXPIRES_IN },
  );
}
