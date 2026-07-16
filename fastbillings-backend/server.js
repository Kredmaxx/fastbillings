// ts-node/register MUST be first so subsequent require() of `.ts` modules
// (auth layer in slice 0.1c, more conversions in 0.1d-e) is resolved by the
// TypeScript loader. Once everything is TS and compiled to dist/ (slice 0.1f),
// this can be removed in favour of running pre-built JS.
require('ts-node/register');
require('module-alias/register');
require('dotenv').config();
const fs = require('fs');
const https = require('https');
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const conversationRoutes = require('./routes/conversationRoutes');
const externalRoutes = require('./routes/externalRoutes');
const publicRoutes = require('./routes/publicRoutes');
const dimensionRoutes = require('./routes/dimensionRoutes');
const { auditContextMiddleware } = require('./middleware/auditContext');
const { blockSettingsWriteInDemo } = require('./middleware/demoMode');
const app = express();
// Behind an HTTPS reverse proxy (TLS terminated upstream). Trust X-Forwarded-*
// so req.protocol reflects the original scheme (https) — otherwise generated
// upload/image URLs come out as http://.
app.set('trust proxy', true);
connectDB();


require('./invoiceReminderCron');
require('./quotationReminderCron');
require('./recurringInvoicesCron');
require('./recurringExpensesCron');

app.use(cors());
app.use(express.json());
app.use(auditContextMiddleware); // audit: carry actor context into Prisma writes
app.use('/uploads', express.static('uploads'));

app.get('/api/healthz', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'fastbillings-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
// Public marketing landing page (no auth)
const landingPageController = require('./controllers/landingPageController');
app.get('/api/landing-page', landingPageController.getPublicLandingPage);
// Demo mode: freeze settings writes before they reach the admin routes.
app.use('/api/admin', blockSettingsWriteInDemo);
app.use('/api/admin', adminRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/conversation', conversationRoutes);
app.use('/api/external', externalRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', dimensionRoutes); // P3.3 cost-centers + projects + pnl reports

// Swagger UI at /api/docs (slice G.4)
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./lib/swaggerConfig');
// Auto-list every live route in the spec (hand-written @swagger docs win).
const { mergeGeneratedPaths } = require('./lib/swaggerRoutes');
try {
  const { added, total } = mergeGeneratedPaths(swaggerSpec, [
    { base: '/auth', router: authRoutes, secured: false, tag: 'Auth' },
    { base: '/admin', router: adminRoutes, secured: true },
    { base: '/admin', router: dimensionRoutes, secured: true, tag: 'Reports' },
    { base: '/reminders', router: reminderRoutes, secured: true, tag: 'Reminders' },
    { base: '/conversation', router: conversationRoutes, secured: true, tag: 'AI' },
    { base: '/external', router: externalRoutes, secured: false, tag: 'Integrations' },
    { base: '/public', router: publicRoutes, secured: false, tag: 'Public' },
  ]);
  console.log(`[swagger] auto-documented ${added} routes (spec now lists ${total} operations)`);
} catch (e) {
  console.error('[swagger] route auto-documentation failed:', e);
}
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'FastBillings API Docs',
  swaggerOptions: { persistAuthorization: true },
}));
app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

const PORT = process.env.PORT || 3001;

if (process.env.ENABLE_HTTPS === 'true') {
  const options = {
    key: fs.readFileSync(__dirname + '/ssl.key'),
    cert: fs.readFileSync(__dirname + '/ssl.crt'),
  };
  https.createServer(options, app).listen(PORT, () => {
    console.log(`HTTPS server running on port ${PORT}`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`HTTP server running on port ${PORT}`);
  });
}