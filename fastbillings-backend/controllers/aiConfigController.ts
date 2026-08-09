import type { Request, Response } from 'express';
import type { AiConfig, AiProviderKind, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { encrypt, maskApiKey } from '../lib/aiCrypto';
import {
  ClaudeProvider,
  CLAUDE_DEFAULT_CHAT_MODEL,
  CLAUDE_DEFAULT_EXTRACTION_MODEL,
} from '../lib/aiProviders/claudeProvider';
import {
  OpenAIProvider,
  OPENAI_DEFAULT_CHAT_MODEL,
  OPENAI_DEFAULT_EXTRACTION_MODEL,
} from '../lib/aiProviders/openaiProvider';
import { MockProvider } from '../lib/aiProviders/mockProvider';
import { findAiConfig } from '../lib/aiProviders/registry';
import { optionalTenantId, requireUserId, UnauthorizedError } from '../lib/tenantScope';
import type { AiProvider } from '../lib/aiProviders/types';

const PROVIDERS: readonly AiProviderKind[] = ['CLAUDE', 'OPENAI', 'MOCK'] as const;

interface PublicAiConfig {
  provider: AiProviderKind;
  enabled: boolean;
  apiKeyHint: string | null;
  extractionModel: string | null;
  chatModel: string | null;
  monthlyBudgetUsd: number;
  hasApiKey: boolean;
  tenantScoped: boolean;
}

function toPublic(config: AiConfig | null, tenantId?: string | null): PublicAiConfig {
  if (!config) {
    return {
      provider: 'MOCK',
      enabled: false,
      apiKeyHint: null,
      extractionModel: null,
      chatModel: null,
      monthlyBudgetUsd: 0,
      hasApiKey: false,
      tenantScoped: Boolean(tenantId),
    };
  }
  return {
    provider: config.provider,
    enabled: config.enabled,
    apiKeyHint: config.apiKeyHint,
    extractionModel: config.extractionModel,
    chatModel: config.chatModel,
    monthlyBudgetUsd: config.monthlyBudgetUsd ? Number(config.monthlyBudgetUsd) : 0,
    hasApiKey: !!config.encryptedApiKey,
    tenantScoped: Boolean(config.tenantId),
  };
}

export async function getAiConfig(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const config = await findAiConfig(userId, tenantId);
    res.json({ success: true, data: { config: toPublic(config, tenantId) } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('aiConfig.get error:', err);
    res.status(500).json({ success: false, message: 'Failed to load AI config' });
  }
}

interface UpdateBody {
  provider?: AiProviderKind | string;
  enabled?: boolean;
  apiKey?: string | null;
  extractionModel?: string | null;
  chatModel?: string | null;
  monthlyBudgetUsd?: number | string | null;
}

function defaultModelsFor(provider: AiProviderKind): { extractionModel: string; chatModel: string } {
  if (provider === 'CLAUDE') {
    return {
      extractionModel: CLAUDE_DEFAULT_EXTRACTION_MODEL,
      chatModel: CLAUDE_DEFAULT_CHAT_MODEL,
    };
  }
  if (provider === 'OPENAI') {
    return {
      extractionModel: OPENAI_DEFAULT_EXTRACTION_MODEL,
      chatModel: OPENAI_DEFAULT_CHAT_MODEL,
    };
  }
  return { extractionModel: 'mock-extract-v1', chatModel: 'mock-chat-v1' };
}

function buildPayload(
  userId: string,
  body: UpdateBody,
  existing: AiConfig | null,
  tenantId?: string | null,
): Prisma.AiConfigUncheckedCreateInput {
  const providerForDefaults = (body.provider as AiProviderKind) ?? existing?.provider ?? 'MOCK';
  const defaults = defaultModelsFor(providerForDefaults);

  const baseData: Prisma.AiConfigUncheckedCreateInput = {
    userId,
    ...(tenantId ? { tenantId } : {}),
    provider: providerForDefaults,
    enabled: body.enabled ?? existing?.enabled ?? false,
    extractionModel:
      body.extractionModel !== undefined
        ? body.extractionModel
        : (existing?.extractionModel ?? defaults.extractionModel),
    chatModel:
      body.chatModel !== undefined ? body.chatModel : (existing?.chatModel ?? defaults.chatModel),
    monthlyBudgetUsd:
      body.monthlyBudgetUsd === null || body.monthlyBudgetUsd === undefined
        ? (existing?.monthlyBudgetUsd ?? 0)
        : (Number(body.monthlyBudgetUsd) as unknown as Prisma.Decimal),
    encryptedApiKey: existing?.encryptedApiKey ?? null,
    apiKeyHint: existing?.apiKeyHint ?? null,
  };

  if (body.apiKey === null) {
    baseData.encryptedApiKey = null;
    baseData.apiKeyHint = null;
  } else if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
    baseData.encryptedApiKey = encrypt(body.apiKey);
    baseData.apiKeyHint = maskApiKey(body.apiKey);
  }

  return baseData;
}

export async function updateAiConfig(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = (req.body ?? {}) as UpdateBody;

    if (body.provider !== undefined && !PROVIDERS.includes(body.provider as AiProviderKind)) {
      res.status(400).json({ success: false, message: 'Invalid provider' });
      return;
    }

    // Workspace-first: one shared BYOK config per tenant; legacy falls back to userId
    let existing = await findAiConfig(userId, tenantId);
    if (!existing && tenantId) {
      existing = await prisma.aiConfig.findUnique({ where: { userId } });
    }

    const baseData = buildPayload(userId, body, existing, tenantId);
    const updateData = {
      provider: baseData.provider,
      enabled: baseData.enabled,
      extractionModel: baseData.extractionModel,
      chatModel: baseData.chatModel,
      monthlyBudgetUsd: baseData.monthlyBudgetUsd,
      encryptedApiKey: baseData.encryptedApiKey,
      apiKeyHint: baseData.apiKeyHint,
      ...(tenantId && existing && !existing.tenantId ? { tenantId } : {}),
    };

    let saved: AiConfig;
    if (existing) {
      saved = await prisma.aiConfig.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else if (tenantId) {
      try {
        saved = await prisma.aiConfig.create({ data: baseData });
      } catch (e) {
        const raced = await prisma.aiConfig.findUnique({ where: { tenantId } });
        if (!raced) throw e;
        saved = await prisma.aiConfig.update({
          where: { id: raced.id },
          data: {
            provider: baseData.provider,
            enabled: baseData.enabled,
            extractionModel: baseData.extractionModel,
            chatModel: baseData.chatModel,
            monthlyBudgetUsd: baseData.monthlyBudgetUsd,
            encryptedApiKey: baseData.encryptedApiKey,
            apiKeyHint: baseData.apiKeyHint,
          },
        });
      }
    } else {
      saved = await prisma.aiConfig.upsert({
        where: { userId },
        create: baseData,
        update: {
          provider: baseData.provider,
          enabled: baseData.enabled,
          extractionModel: baseData.extractionModel,
          chatModel: baseData.chatModel,
          monthlyBudgetUsd: baseData.monthlyBudgetUsd,
          encryptedApiKey: baseData.encryptedApiKey,
          apiKeyHint: baseData.apiKeyHint,
        },
      });
    }

    res.json({
      success: true,
      message: 'AI configuration saved',
      data: { config: toPublic(saved, tenantId) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('aiConfig.update error:', err);
    res.status(500).json({ success: false, message: 'Failed to save AI config' });
  }
}

export async function testAiConfig(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const config = await findAiConfig(userId, tenantId);
    if (!config) {
      res.json({ success: true, data: { ok: false, error: 'No AI configuration saved yet.' } });
      return;
    }

    let provider: AiProvider;
    try {
      if (config.provider === 'MOCK') {
        provider = new MockProvider();
      } else if (!config.encryptedApiKey) {
        res.json({
          success: true,
          data: { ok: false, error: 'No API key stored. Save a key before testing.' },
        });
        return;
      } else {
        const { getProviderForUser } = await import('../lib/aiProviders/registry');
        provider = await getProviderForUser(userId, { tenantId });
      }
    } catch (decryptErr) {
      res.json({
        success: true,
        data: {
          ok: false,
          error:
            decryptErr instanceof Error ? decryptErr.message : 'Failed to decrypt stored API key',
        },
      });
      return;
    }

    const result = await provider.ping();
    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('aiConfig.test error:', err);
    res.status(500).json({ success: false, message: 'Failed to test AI config' });
  }
}

export async function deleteAiConfig(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const existing = await findAiConfig(userId, tenantId);
    if (!existing) {
      res.json({
        success: true,
        message: 'No AI configuration to disable',
        data: { config: toPublic(null, tenantId) },
      });
      return;
    }
    const updated = await prisma.aiConfig.update({
      where: { id: existing.id },
      data: { enabled: false, encryptedApiKey: null, apiKeyHint: null },
    });
    res.json({
      success: true,
      message: 'AI features disabled and key cleared',
      data: { config: toPublic(updated, tenantId) },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('aiConfig.delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to disable AI' });
  }
}

const handlers = { getAiConfig, updateAiConfig, testAiConfig, deleteAiConfig };
module.exports = handlers;
module.exports.default = handlers;
