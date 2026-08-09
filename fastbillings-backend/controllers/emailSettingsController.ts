import fs from 'fs';
import path from 'path';

import type { Request, Response } from 'express';
import type { EmailSettings, EmailSettingsProviderType, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import { findEmailSettings } from '../lib/emailSettings';
import { optionalTenantId, requireUserId, UnauthorizedError } from '../lib/tenantScope';

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

function toPublic(row: EmailSettings | null, tenantId?: string | null) {
  if (!row) {
    return { tenantScoped: Boolean(tenantId) };
  }
  // Never echo secrets back to the client.
  const {
    nodePassword: _np,
    smtpPassword: _sp,
    resendApiKey: _rk,
    ...safe
  } = row;
  return {
    ...safe,
    hasNodePassword: Boolean(row.nodePassword),
    hasSmtpPassword: Boolean(row.smtpPassword),
    hasResendApiKey: Boolean(row.resendApiKey),
    tenantScoped: Boolean(row.tenantId),
  };
}

/**
 * Create or update email settings (one shared workspace config per tenant).
 */
export async function createOrUpdateEmailSettings(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as EmailSettingsBody;

    if (!body.provider_type) {
      res.status(400).json({ success: false, message: 'provider_type is required' });
      return;
    }

    let existing = await findEmailSettings(userId, tenantId);
    if (!existing && tenantId) {
      existing = await prisma.emailSettings.findUnique({ where: { userId } });
    }

    const data: Prisma.EmailSettingsUncheckedCreateInput = {
      provider_type: body.provider_type,
      nodeFromName: body.nodeFromName,
      nodeFromEmail: body.nodeFromEmail,
      nodeReplyTo: body.nodeReplyTo,
      nodeHost: body.nodeHost,
      nodePort: body.nodePort,
      nodeUsername: body.nodeUsername,
      // Keep prior secret when the client omits/blank-sends (masked UI).
      nodePassword:
        body.nodePassword && body.nodePassword.trim()
          ? body.nodePassword
          : (existing?.nodePassword ?? null),
      smtpFromName: body.smtpFromName,
      smtpFromEmail: body.smtpFromEmail,
      smtpReplyTo: body.smtpReplyTo,
      smtpHost: body.smtpHost,
      smtpPort: body.smtpPort,
      smtpUsername: body.smtpUsername,
      smtpPassword:
        body.smtpPassword && body.smtpPassword.trim()
          ? body.smtpPassword
          : (existing?.smtpPassword ?? null),
      resendFromName: body.resendFromName,
      resendFromEmail: body.resendFromEmail,
      resendReplyTo: body.resendReplyTo,
      resendApiKey:
        body.resendApiKey && body.resendApiKey.trim()
          ? body.resendApiKey
          : (existing?.resendApiKey ?? null),
      smtp_status: body.smtp_status,
      node_status: body.node_status,
      resend_status: body.resend_status,
      userId,
      ...(tenantId ? { tenantId } : {}),
    };

    const updateData = {
      provider_type: data.provider_type,
      nodeFromName: data.nodeFromName,
      nodeFromEmail: data.nodeFromEmail,
      nodeReplyTo: data.nodeReplyTo,
      nodeHost: data.nodeHost,
      nodePort: data.nodePort,
      nodeUsername: data.nodeUsername,
      nodePassword: data.nodePassword,
      smtpFromName: data.smtpFromName,
      smtpFromEmail: data.smtpFromEmail,
      smtpReplyTo: data.smtpReplyTo,
      smtpHost: data.smtpHost,
      smtpPort: data.smtpPort,
      smtpUsername: data.smtpUsername,
      smtpPassword: data.smtpPassword,
      resendFromName: data.resendFromName,
      resendFromEmail: data.resendFromEmail,
      resendReplyTo: data.resendReplyTo,
      resendApiKey: data.resendApiKey,
      smtp_status: data.smtp_status,
      node_status: data.node_status,
      resend_status: data.resend_status,
      ...(tenantId && existing && !existing.tenantId ? { tenantId } : {}),
    };

    let settings: EmailSettings;
    if (existing) {
      settings = await prisma.emailSettings.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else if (tenantId) {
      try {
        settings = await prisma.emailSettings.create({ data });
      } catch (e) {
        const raced = await prisma.emailSettings.findUnique({ where: { tenantId } });
        if (!raced) throw e;
        settings = await prisma.emailSettings.update({
          where: { id: raced.id },
          data: updateData,
        });
      }
    } else {
      settings = await prisma.emailSettings.upsert({
        where: { userId },
        create: data,
        update: updateData,
      });
    }

    try {
      const mailer = require('../utils/mailer') as { clearMailerCache?: () => void };
      mailer.clearMailerCache?.(tenantId ?? userId);
    } catch {
      /* non-fatal */
    }

    if (body.provider_type === 'SMTP') {
      updateEnvFile({
        SMTP_HOST: body.smtpHost,
        SMTP_PORT: body.smtpPort,
        SMTP_SECURE: body.smtp_status || false,
        SMTP_EMAIL: body.smtpFromEmail,
        SMTP_PASSWORD: data.smtpPassword ?? undefined,
      });
    } else if (body.provider_type === 'NODE') {
      updateEnvFile({
        NODE_HOST: body.nodeHost,
        NODE_PORT: body.nodePort,
        NODE_EMAIL: body.nodeFromEmail,
        NODE_PASSWORD: data.nodePassword ?? undefined,
      });
    } else if (body.provider_type === 'RESEND') {
      updateEnvFile({
        RESEND_API_KEY: data.resendApiKey ?? undefined,
        RESEND_FROM_EMAIL: body.resendFromEmail,
        RESEND_FROM_NAME: body.resendFromName,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Email settings saved successfully',
      data: toPublic(settings, tenantId),
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
 * Get workspace email settings (tenant-first).
 */
export async function getEmailSettings(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const settings = await findEmailSettings(userId, tenantId);

    res.status(200).json({
      success: true,
      data: toPublic(settings, tenantId),
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
 * Send a test email through the workspace-active provider.
 */
export async function sendTestEmail(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);

    let recipient = (req.body as { to?: string }).to?.trim();
    if (!recipient) {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
      recipient = u?.email ?? undefined;
    }
    if (!recipient) {
      res.status(400).json({ success: false, message: 'A recipient email is required.' });
      return;
    }

    const mailer = require('../utils/mailer') as {
      sendMail: (opts: Record<string, unknown>) => Promise<unknown>;
    };
    await mailer.sendMail({
      to: recipient,
      subject: 'FastBillings test email',
      html:
        '<p>This is a test email from your FastBillings email configuration.</p>' +
        '<p>If you received this, your active email provider is working correctly.</p>',
      tenantId,
      userId,
    });

    res.status(200).json({ success: true, message: `Test email sent to ${recipient}.` });
  } catch (err) {
    if (handleUnauthorized(res, err)) return;
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
