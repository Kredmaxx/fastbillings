import { prisma } from '../prisma';
import { decrypt } from '../aiCrypto';

import { ClaudeProvider } from './claudeProvider';
import { OpenAIProvider } from './openaiProvider';
import { MockProvider } from './mockProvider';
import type { AiProvider } from './types';
import { AiDisabledError } from './types';

/** Prefer workspace (tenant) AiConfig, then legacy user-owned row. */
export async function findAiConfig(userId: string, tenantId?: string | null) {
  if (tenantId) {
    const byTenant = await prisma.aiConfig.findUnique({ where: { tenantId } });
    if (byTenant) return byTenant;
  }
  return prisma.aiConfig.findUnique({ where: { userId } });
}

/**
 * Resolves the configured AI provider for a user/workspace. Falls back to
 * MockProvider when there is no config, AI is off, MOCK is selected, or no key.
 *
 * Throws `AiDisabledError` when `requireEnabled` is true and AI is off.
 */
export async function getProviderForUser(
  userId: string,
  opts: { requireEnabled?: boolean; tenantId?: string | null } = {},
): Promise<AiProvider> {
  const config = await findAiConfig(userId, opts.tenantId);

  if (opts.requireEnabled && (!config || !config.enabled)) {
    throw new AiDisabledError();
  }

  if (!config) return new MockProvider();
  if (config.provider === 'MOCK') return new MockProvider();
  if (!config.encryptedApiKey) return new MockProvider();

  const apiKey = decrypt(config.encryptedApiKey);

  if (config.provider === 'CLAUDE') {
    return new ClaudeProvider({
      apiKey,
      extractionModel: config.extractionModel ?? undefined,
      chatModel: config.chatModel ?? undefined,
    });
  }
  if (config.provider === 'OPENAI') {
    return new OpenAIProvider({
      apiKey,
      extractionModel: config.extractionModel ?? undefined,
      chatModel: config.chatModel ?? undefined,
    });
  }

  // Defensive default: any unknown provider value falls back to mock.
  return new MockProvider();
}

/**
 * Convenience used by H.2/H.3 callers that need both the provider and
 * the loaded config (for budget checks, model overrides, etc.).
 */
export async function getProviderAndConfig(
  userId: string,
  opts: { requireEnabled?: boolean; tenantId?: string | null } = {},
): Promise<{
  provider: AiProvider;
  config: Awaited<ReturnType<typeof findAiConfig>>;
}> {
  const config = await findAiConfig(userId, opts.tenantId);
  if (opts.requireEnabled && (!config || !config.enabled)) {
    throw new AiDisabledError();
  }
  const provider = await getProviderForUser(userId, opts);
  return { provider, config };
}
