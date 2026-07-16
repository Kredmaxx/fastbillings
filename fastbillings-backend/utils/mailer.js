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
const nodemailer = require("nodemailer");

// Brief in-process cache so we don't hit the DB on every email.
let cache = { at: 0, settings: null };
const CACHE_MS = 30000;

async function loadActiveSettings() {
  const now = Date.now();
  if (cache.settings !== undefined && now - cache.at < CACHE_MS) return cache.settings;
  try {
    const { prisma } = require("../lib/prisma");
    const settings = await prisma.emailSettings.findFirst({
      where: { OR: [{ resend_status: true }, { smtp_status: true }, { node_status: true }] },
      orderBy: { updatedAt: "desc" },
    });
    cache = { at: now, settings: settings || null };
    return cache.settings;
  } catch (err) {
    console.warn("[mailer] could not load EmailSettings, using env fallback:", err && err.message);
    return null;
  }
}

function fmtFrom(name, email) {
  if (!email) return null;
  return name ? `"${name}" <${email}>` : email;
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
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    transport: nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_EMAIL || process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
      },
    }),
    from: fmtFrom(process.env.SMTP_FROM_NAME, process.env.SMTP_FROM || process.env.SMTP_EMAIL || process.env.SMTP_USER),
    replyTo: process.env.SMTP_REPLY_TO || null,
  };
}

const sendMail = async (options) => {
  const settings = await loadActiveSettings();
  const { transport, from, replyTo } = buildTransport(settings);
  const opts = { ...options };
  // Always send as the configured/verified sender when one is set.
  if (from) opts.from = from;
  // Set the configured reply-to unless the caller already supplied one.
  if (replyTo && !opts.replyTo) opts.replyTo = replyTo;
  return await transport.sendMail(opts);
};

// Allow the controller to clear the cache right after a settings change so the
// next email uses the new provider without waiting for the TTL.
const clearMailerCache = () => { cache = { at: 0, settings: null }; };

module.exports = { sendMail, clearMailerCache };
