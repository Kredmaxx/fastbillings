import type { NextFunction, Request, Response } from 'express';
import type { AiConfig } from '@prisma/client';

import { optionalTenantId, requireUserId } from '../lib/tenantScope';
import { findAiConfig, getProviderForUser } from '../lib/aiProviders/registry';
import type { AiProvider } from '../lib/aiProviders/types';

// Augment Express request so AI feature controllers can read these
// without re-fetching. Slice H.2/H.3 controllers consume them.
declare module 'express-serve-static-core' {
  interface Request {
    aiConfig?: AiConfig;
    aiProvider?: AiProvider;
  }
}

/**
 * Gate for AI feature endpoints. Loads workspace AiConfig (tenant-first)
 * and short-circuits with HTTP 412 when AI is disabled. On success, attaches
 * `req.aiConfig` and `req.aiProvider`.
 */
export async function requireAiEnabled(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const config = await findAiConfig(userId, tenantId);

    if (!config || !config.enabled) {
      res.status(412).json({
        success: false,
        error: 'AI features disabled',
        message: 'Configure in Settings → AI',
      });
      return;
    }

    req.aiConfig = config;
    req.aiProvider = await getProviderForUser(userId, { tenantId });
    next();
  } catch (err) {
    console.error('requireAiEnabled error:', err);
    res.status(500).json({ success: false, message: 'Failed to load AI configuration' });
  }
}

// CommonJS interop so the .js admin routes file can require this.
module.exports = requireAiEnabled;
module.exports.requireAiEnabled = requireAiEnabled;
module.exports.default = requireAiEnabled;
