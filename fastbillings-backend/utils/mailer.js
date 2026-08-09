// utils/mailer.js
//
// Single send path for the whole app. The active email provider is configured
// in the UI (Settings > Email Settings) and stored on the EmailSettings row;
// this module reads that row and builds the right nodemailer transport:
//
//   RESEND -> SMTP to smtp.resend.com (user "resend", pass = API key)
//   SMTP   -> the configured SMTP host/port/credentials
//   NODE   -> the configured Node Mail host/port/credentials
//   (none) -> env fallback (SMTP_HOST/SMTP_EMAIL/SMTP_PASSWORD; defaults to Gmail)
//
// When the active provider has a configured "from" address we override the
// caller-supplied `from` so mail always goes out as the verified sender
// (required by Resend, and what users expect from the UI config).
//
// Phase 78: resolve settings by workspace (tenantId) then userId. Callers should
// pass `tenantId` and/or `userId` on sendMail options (stripped before transport).
const nodemailer = require("nodemailer");

// Brief in-process cache keyed by scope so we don't hit the DB on every email.
/** @type {Map<string, { at: number, settings: any }>} */
const cache = new Map();
const CACHE_MS = 30000;

function cacheKey(tenantId, userId) {
  if (tenantId) return `t:${tenantId}`;
  if (userId) return `u:${userId}`;
  return "global";
}

async function loadActiveSettings({ tenantId, userId } = {}) {
  const key = cacheKey(tenantId, userId);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.settings;

  try {
    const { prisma } = require("../lib/prisma");
    let settings = null;

    if (tenantId) {
      settings = await prisma.emailSettings.findUnique({ where: { tenantId } });
    }
    if (!settings && userId) {
      settings = await prisma.emailSettings.findUnique({ where: { userId } });
    }
    // Legacy / cron without scope: prefer an enabled row (newest), else env fallback
    if (!settings && !tenantId && !userId) {
      settings = await prisma.emailSettings.findFirst({
        where: { OR: [{ resend_status: true }, { smtp_status: true }, { node_status: true }] },
        orderBy: { updatedAt: "desc" },
      });
    }

    // Prefer enabled provider flags when present; still return the row if flags are off
    // so the caller can fall through to env via buildTransport when no credentials work.
    cache.set(key, { at: now, settings: settings || null });
    return settings || null;
  } catch (err) {
    console.warn("[mailer] could not load EmailSettings, using env fallback:", err && err.message);
    return null;
  }
}

function fmtFrom(name, email) {
  if (!email) return null;
  return name ? `"${name}" <${email}>` : email;
}

/** Unified env aliases: SMTP_EMAIL/SMTP_USER and SMTP_PASSWORD/SMTP_PASS. */
function envSmtpUser() {
  return process.env.SMTP_EMAIL || process.env.SMTP_USER || "";
}

function envSmtpPass() {
  return process.env.SMTP_PASSWORD || process.env.SMTP_PASS || "";
}

function envSmtpFrom() {
  return process.env.SMTP_FROM || envSmtpUser();
}

/**
 * True when env SMTP credentials are present (either naming convention).
 * Controllers should use this instead of checking SMTP_EMAIL && SMTP_PASSWORD only.
 */
function hasEnvSmtpCredentials() {
  return Boolean(envSmtpUser() && envSmtpPass());
}

function settingsHaveProvider(s) {
  if (!s) return false;
  if (s.resend_status && s.resendApiKey) return true;
  if (s.smtp_status && s.smtpHost && s.smtpUsername && s.smtpPassword) return true;
  if (s.node_status && s.nodeHost && s.nodeUsername && s.nodePassword) return true;
  return false;
}

/** True when EmailSettings or env can actually send mail. */
async function isMailConfigured({ tenantId, userId } = {}) {
  const settings = await loadActiveSettings({ tenantId, userId });
  return settingsHaveProvider(settings) || hasEnvSmtpCredentials();
}

function buildTransport(s) {
  if (s && s.resend_status && s.resendApiKey) {
    return {
      transport: nodemailer.createTransport({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: { user: "resend", pass: s.resendApiKey },
      }),
      from: fmtFrom(s.resendFromName, s.resendFromEmail),
      replyTo: s.resendReplyTo || null,
    };
  }
  if (s && s.smtp_status && s.smtpHost) {
    const port = Number(s.smtpPort) || 587;
    return {
      transport: nodemailer.createTransport({
        host: s.smtpHost,
        port,
        secure: port === 465,
        auth: { user: s.smtpUsername, pass: s.smtpPassword },
      }),
      from: fmtFrom(s.smtpFromName, s.smtpFromEmail),
      replyTo: s.smtpReplyTo || null,
    };
  }
  if (s && s.node_status && s.nodeHost) {
    const port = Number(s.nodePort) || 587;
    return {
      transport: nodemailer.createTransport({
        host: s.nodeHost,
        port,
        secure: port === 465,
        auth: { user: s.nodeUsername, pass: s.nodePassword },
      }),
      from: fmtFrom(s.nodeFromName, s.nodeFromEmail),
      replyTo: s.nodeReplyTo || null,
    };
  }
  // Env fallback (legacy behaviour: Gmail unless SMTP_HOST overrides).
  const user = envSmtpUser();
  const pass = envSmtpPass();
  if (!user || !pass) {
    return { transport: null, from: null, replyTo: null };
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    transport: nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465 || String(process.env.SMTP_SECURE).toLowerCase() === "true",
      auth: { user, pass },
    }),
    from: fmtFrom(process.env.SMTP_FROM_NAME, envSmtpFrom()),
    replyTo: process.env.SMTP_REPLY_TO || null,
  };
}

const sendMail = async (options) => {
  const { tenantId, userId, ...mailOptions } = options || {};
  const settings = await loadActiveSettings({ tenantId, userId });
  const { transport, from, replyTo } = buildTransport(settings);
  if (!transport) {
    const err = new Error(
      "Email is not configured. Set SMTP credentials in Settings > Email or via SMTP_HOST / SMTP_USER|SMTP_EMAIL / SMTP_PASS|SMTP_PASSWORD.",
    );
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }
  const opts = { ...mailOptions };
  // Always send as the configured/verified sender when one is set.
  if (from) opts.from = from;
  // Set the configured reply-to unless the caller already supplied one.
  if (replyTo && !opts.replyTo) opts.replyTo = replyTo;
  if (!opts.from) opts.from = envSmtpFrom() || undefined;
  return await transport.sendMail(opts);
};

// Allow the controller to clear the cache right after a settings change so the
// next email uses the new provider without waiting for the TTL.
// Pass scope (tenantId or userId) to clear one entry, or omit to clear all.
const clearMailerCache = (scope) => {
  if (scope) {
    cache.delete(`t:${scope}`);
    cache.delete(`u:${scope}`);
  } else {
    cache.clear();
  }
};

module.exports = {
  sendMail,
  clearMailerCache,
  loadActiveSettings,
  envSmtpUser,
  envSmtpPass,
  envSmtpFrom,
  hasEnvSmtpCredentials,
  isMailConfigured,
};
