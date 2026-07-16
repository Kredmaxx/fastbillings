import fs from 'fs';
import path from 'path';

import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import type { EmailSettingsProviderType } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { requireUserId, UnauthorizedError } from '../lib/tenantScope';

function handleUnauthorized(res: Response, err: unknown): boolean {
  if (err instanceof UnauthorizedError) {
    res.status(err.status).json({ success: false, message: err.message });
    return true;
  }
  return false;
}

/**
 * Update .env file helper — preserved verbatim from the JS source.
 */
function updateEnvFile(newVars: Record<string, string | boolean | number | undefined>): void {
  try {
    const envPath = path.join(__dirname, '../.env');
    const envData = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    const envObj: Record<string, string> = {};
    envData.split('\n').forEach((line) => {
      const [key, value] = line.split('=');
      if (key) envObj[key.trim()] = value ? value.trim() : '';
    });

    Object.keys(newVars).forEach((key) => {
      const v = newVars[key];
      envObj[key] = v === undefined || v === null ? '' : String(v);
    });

    const updatedData = Object.entries(envObj)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.writeFileSync(envPath, updatedData, 'utf-8');
  } catch (err) {
    // Non-fatal: the DB row is the source of truth for the mailer. In a
    // read-only/container FS the .env write can fail — don't block saving.
    console.warn('[emailSettings] could not update .env (non-fatal):', err instanceof Error ? err.message : err);
  }
}

interface EmailSettingsBody {
  userId?: string;
  provider_type?: EmailSettingsProviderType;
  nodeFromName?: string;
  nodeFromEmail?: string;
  nodeReplyTo?: string;
  nodeHost?: string;
  nodePort?: string;
  nodeUsername?: string;
  nodePassword?: string;
  smtpFromName?: string;
  smtpFromEmail?: string;
  smtpReplyTo?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUsername?: string;
  smtpPassword?: string;
  resendFromName?: string;
  resendFromEmail?: string;
  resendReplyTo?: string;
  resendApiKey?: string;
  smtp_status?: boolean;
  node_status?: boolean;
  resend_status?: boolean;
}

/**
 * Create or update email settings (only one entry per user).
 */
export async function createOrUpdateEmailSettings(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as EmailSettingsBody;
    // Prefer the authenticated userId; fall back to body.userId to match the
    // JS source which read from req.body.userId.
    let userId: string;
    try {
      userId = requireUserId(req);
    } catch (err) {
      if (body.userId) {
        userId = body.userId;
      } else {
        throw err;
      }
    }

    const data: Prisma.EmailSettingsUncheckedCreateInput = {
      provider_type: body.provider_type as EmailSettingsProviderType,
      nodeFromName: body.nodeFromName,
      nodeFromEmail: body.nodeFromEmail,
      nodeReplyTo: body.nodeReplyTo,
      nodeHost: body.nodeHost,
      nodePort: body.nodePort,
      nodeUsername: body.nodeUsername,
      nodePassword: body.nodePassword,
      smtpFromName: body.smtpFromName,
      smtpFromEmail: body.smtpFromEmail,
      smtpReplyTo: body.smtpReplyTo,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpUsername: body.smtpUsername,
      smtpPassword: body.smtpPassword,
      resendFromName: body.resendFromName,
      resendFromEmail: body.resendFromEmail,
      resendReplyTo: body.resendReplyTo,
      resendApiKey: body.resendApiKey,
      smtp_status: body.smtp_status,
      node_status: body.node_status,
      resend_status: body.resend_status,
      userId,
    };

    // Mongoose findOneAndUpdate({ userId }, ..., { upsert: true }) — there is no
    // unique constraint on userId in the Prisma schema, so we replicate that
    // semantics with findFirst + update/create rather than upsert.
    const existing = await prisma.emailSettings.findFirst({ where: { userId } });
    const settings = existing
      ? await prisma.emailSettings.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.emailSettings.create({ data });

    // Invalidate the mailer's provider cache so the next email uses the new config.
    try {
      const mailer = require('../utils/mailer') as { clearMailerCache?: () => void };
      mailer.clearMailerCache?.();
    } catch {
      /* non-fatal */
    }

    if (body.provider_type === 'SMTP') {
      updateEnvFile({
        SMTP_HOST: body.smtpHost,
        SMTP_PORT: body.smtpPort,
        SMTP_SECURE: body.smtp_status || false,
        SMTP_EMAIL: body.smtpFromEmail,
        SMTP_PASSWORD: body.smtpPassword,
      });
    } else if (body.provider_type === 'NODE') {
      updateEnvFile({
        NODE_HOST: body.nodeHost,
        NODE_PORT: body.nodePort,
        NODE_EMAIL: body.nodeFromEmail,
        NODE_PASSWORD: body.nodePassword,
      });
    } else if (body.provider_type === 'RESEND') {
      // Mirrored to .env for parity; the mailer reads the DB row as source of truth.
      updateEnvFile({
        RESEND_API_KEY: body.resendApiKey,
        RESEND_FROM_EMAIL: body.resendFromEmail,
        RESEND_FROM_NAME: body.resendFromName,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Email settings saved successfully and .env updated',
      data: settings,
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    res.status(500).json({
      success: false,
      message: 'Error saving email settings',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * List email settings for a user.
 */
export async function getEmailSettings(req: Request, res: Response): Promise<void> {
  try {
    let userId: string | undefined = (req.query.userId as string | undefined) ?? undefined;
    if (!userId) {
      try {
        userId = requireUserId(req);
      } catch {
        userId = undefined;
      }
    }

    const settings = userId
      ? await prisma.emailSettings.findFirst({ where: { userId } })
      : null;

    res.status(200).json({
      success: true,
      data: settings ?? {},
    });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
    res.status(500).json({
      success: false,
      message: 'Error fetching email settings',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Send a test email through the currently active provider so the user can
 * validate their configuration (API key / verified domain / SMTP creds) from
 * the UI. Surfaces the underlying transport error message on failure.
 */
export async function sendTestEmail(req: Request, res: Response): Promise<void> {
  try {
    let userId: string | undefined;
    try {
      userId = requireUserId(req);
    } catch {
      userId = (req.body as { userId?: string }).userId;
    }

    let recipient = (req.body as { to?: string }).to?.trim();
    if (!recipient && userId) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      recipient = u?.email ?? undefined;
    }
    if (!recipient) {
      res.status(400).json({ success: false, message: 'A recipient email is required.' });
      return;
    }

    // mailer reads the active EmailSettings row (cache was cleared on save).
    const mailer = require('../utils/mailer') as {
      sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
    };
    await mailer.sendMail({
      to: recipient,
      subject: 'FastBillings test email',
      html:
        '<p>This is a test email from your FastBillings email configuration.</p>' +
        '<p>If you received this, your active email provider is working correctly.</p>',
    });

    res.status(200).json({ success: true, message: `Test email sent to ${recipient}.` });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to send test email. Check your provider configuration.',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// CommonJS interop for legacy JS routes that still use module-alias requires.
module.exports = {
  createOrUpdateEmailSettings,
  getEmailSettings,
  sendTestEmail,
};
module.exports.createOrUpdateEmailSettings = createOrUpdateEmailSettings;
module.exports.getEmailSettings = getEmailSettings;
module.exports.sendTestEmail = sendTestEmail;
