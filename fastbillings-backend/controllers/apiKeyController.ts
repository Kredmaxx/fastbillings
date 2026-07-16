import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { generateTenantApiKey } from '../lib/tenantApiKey';

function requireTenant(req: Request, res: Response): string | null {
  const tenantId = req.auth?.tenantId;
  if (!tenantId) {
    res.status(403).json({ success: false, message: 'No active workspace selected.' });
    return null;
  }
  return tenantId;
}

/** API key management requires an interactive session (JWT), not another API key. */
function requireSessionAuth(req: Request, res: Response): boolean {
  if (req.auth?.apiKeyId) {
    res.status(403).json({
      success: false,
      message: 'API key management requires a signed-in session. Use the app or a JWT from login.',
    });
    return false;
  }
  return true;
}

/**
 * @swagger
 * tags:
 *   - name: API Keys
 *     description: Generate and manage tenant API keys for programmatic access
 */

/**
 * @swagger
 * /admin/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List API keys for the active workspace
 *     description: Returns all API keys for the active workspace. The secret value is never returned — only a masked hint.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys (secret never returned)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/ApiKey' }
 *             example:
 *               success: true
 *               data:
 *                 - id: 70e6ebe3-aa79-4fa0-ac50-cc42a01f5030
 *                   name: Production integrations
 *                   keyPrefix: fb_live_4b780329
 *                   hint: fb_live_4b780329…
 *                   status: active
 *                   lastUsedAt: null
 *                   expiresAt: '2027-07-16T18:42:00.308Z'
 *                   createdAt: '2026-07-16T18:42:00.310Z'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export async function listApiKeys(req: Request, res: Response): Promise<void> {
  if (!requireSessionAuth(req, res)) return;
  const tenantId = requireTenant(req, res);
  if (!tenantId) return;

  const keys = await prisma.tenantApiKey.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });

  res.json({
    success: true,
    data: keys.map((k) => ({
      ...k,
      hint: `${k.keyPrefix}…`,
      status: k.revokedAt ? 'revoked' : k.expiresAt && k.expiresAt < new Date() ? 'expired' : 'active',
    })),
  });
}

/**
 * @swagger
 * /admin/api-keys:
 *   post:
 *     tags: [API Keys]
 *     summary: Create a new API key (secret shown once)
 *     description: >-
 *       Creates a workspace-scoped API key. The full secret (`key`) is returned
 *       **only once** in this response — store it securely. Afterwards only the
 *       masked hint is available.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 description: Human-friendly label for the key.
 *                 example: Production integrations
 *               expiresInDays:
 *                 type: integer
 *                 nullable: true
 *                 description: Optional lifetime in days. Omit for a non-expiring key.
 *                 example: 365
 *           example:
 *             name: Production integrations
 *             expiresInDays: 365
 *     responses:
 *       201:
 *         description: Key created — store the `key` value immediately
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data: { $ref: '#/components/schemas/ApiKeyWithSecret' }
 *             example:
 *               success: true
 *               message: API key created. Copy it now — it will not be shown again.
 *               data:
 *                 id: 70e6ebe3-aa79-4fa0-ac50-cc42a01f5030
 *                 name: Production integrations
 *                 keyPrefix: fb_live_4b780329
 *                 hint: fb_live_4b780329…
 *                 expiresAt: '2027-07-16T18:42:00.308Z'
 *                 createdAt: '2026-07-16T18:42:00.310Z'
 *                 key: fb_live_4b7803290b1c4f7a8e2d9c5b6a1f0e3d2c4b5a6f7e8d9c0b
 *       400:
 *         description: Validation error (name missing or too short)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               message: Name is required (min 2 characters).
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export async function createApiKey(req: Request, res: Response): Promise<void> {
  if (!requireSessionAuth(req, res)) return;
  const tenantId = requireTenant(req, res);
  if (!tenantId) return;

  const name = String(req.body?.name || '').trim();
  if (!name || name.length < 2) {
    res.status(400).json({ success: false, message: 'Name is required (min 2 characters).' });
    return;
  }

  const expiresInDays = req.body?.expiresInDays != null ? Number(req.body.expiresInDays) : null;
  let expiresAt: Date | null = null;
  if (expiresInDays != null && !Number.isNaN(expiresInDays) && expiresInDays > 0) {
    expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }

  const { raw, prefix, hash } = generateTenantApiKey();

  const created = await prisma.tenantApiKey.create({
    data: {
      tenantId,
      name,
      keyPrefix: prefix,
      keyHash: hash,
      createdById: req.auth?.userId || null,
      expiresAt,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  res.status(201).json({
    success: true,
    message: 'API key created. Copy it now — it will not be shown again.',
    data: {
      ...created,
      hint: `${prefix}…`,
      key: raw,
    },
  });
}

/**
 * @swagger
 * /admin/api-keys/{id}:
 *   delete:
 *     tags: [API Keys]
 *     summary: Revoke an API key
 *     description: Permanently revokes a key. Any integration using it stops working immediately.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: The API key id to revoke.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Key revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: API key revoked. }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: string, format: uuid }
 *                     name: { type: string }
 *                     keyPrefix: { type: string }
 *                     revokedAt: { type: string, format: date-time }
 *             example:
 *               success: true
 *               message: API key revoked.
 *               data:
 *                 id: 70e6ebe3-aa79-4fa0-ac50-cc42a01f5030
 *                 name: Production integrations
 *                 keyPrefix: fb_live_4b780329
 *                 revokedAt: '2026-07-17T09:12:00.000Z'
 *       404:
 *         description: API key not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               message: API key not found.
 */
export async function revokeApiKey(req: Request, res: Response): Promise<void> {
  if (!requireSessionAuth(req, res)) return;
  const tenantId = requireTenant(req, res);
  if (!tenantId) return;

  const id = String(req.params.id || '');
  const existing = await prisma.tenantApiKey.findFirst({ where: { id, tenantId } });
  if (!existing) {
    res.status(404).json({ success: false, message: 'API key not found.' });
    return;
  }
  if (existing.revokedAt) {
    res.json({ success: true, message: 'API key already revoked.', data: existing });
    return;
  }

  const updated = await prisma.tenantApiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
    select: { id: true, name: true, keyPrefix: true, revokedAt: true },
  });

  res.json({ success: true, message: 'API key revoked.', data: updated });
}

/** Block API-key-authenticated requests from managing keys (extra guard for routes). */
export function requireJwtSession(req: Request, res: Response, next: NextFunction): void {
  if (!requireSessionAuth(req, res)) return;
  next();
}

module.exports = {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  requireJwtSession,
};
