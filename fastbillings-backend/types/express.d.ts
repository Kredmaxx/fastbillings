import 'express';

declare global {
  namespace Express {
    interface AuthContext {
      userId: string;
      tenantId: string;
      membershipId: string;
      membershipRole: 'OWNER' | 'ADMIN' | 'MEMBER';
      roleId?: string | null;
      /** Platform owner — may operate across tenants. */
      isPlatformAdmin?: boolean;
      /** Set when authenticated via a tenant developer API key. */
      apiKeyId?: string;
    }

    interface Request {
      /**
       * Legacy authenticated user id. Kept during the staged tenant migration
       * because many controllers still read req.user directly.
       */
      user?: string;
      auth?: AuthContext;
    }
  }
}

export {};
