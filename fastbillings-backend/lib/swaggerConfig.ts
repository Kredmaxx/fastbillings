import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'FastBillings API',
      version: '1.1.0',
      description: [
        'FastBillings invoicing + accounting platform admin API.',
        '',
        '## Authentication',
        '',
        'Most endpoints require one of:',
        '',
        '1. **Bearer JWT** — `POST /auth/login`, then **Authorize** with the token.',
        '2. **API key** — create keys in the app under **API Docs**, or via `POST /admin/api-keys`.',
        '   Send as `Authorization: Bearer fb_live_…` or header `X-API-Key: fb_live_…`.',
        '',
        'API keys are scoped to your workspace. The full secret is shown **once** at creation.',
        'Key management (`/admin/api-keys`) requires a JWT session, not another API key.',
        '',
        'Operations with a full request/response schema are hand-documented; the',
        'remainder are auto-listed from the live routes (method, path, path params,',
        'auth) so the reference is complete.',
      ].join('\n'),
      contact: { name: 'FastBillings Support', email: 'support@fastbillings.com' },
    },
    servers: [
      { url: '/api', description: 'Current host' },
      { url: 'https://fastbillings.com/api', description: 'Production' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT or fb_live_… API key',
          description: 'JWT from login, or a tenant API key starting with `fb_live_`.',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'Tenant developer API key (`fb_live_…`). Prefer Bearer when possible.',
        },
      },
      responses: {
        Unauthorized: {
          description: 'Missing, invalid, or expired token',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
        ServerError: {
          description: 'Unexpected server error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Not authorized' },
            error: { type: 'string', nullable: true },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 137 },
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            totalPages: { type: 'integer', example: 14 },
          },
        },
        SuccessMessage: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation completed successfully' },
          },
        },
        UserSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '2942a9f6-f33d-4005-b0e8-47564514f2cf' },
            firstName: { type: 'string', example: 'Asha' },
            lastName: { type: 'string', example: 'Verma' },
            email: { type: 'string', format: 'email', example: 'asha@acme.com' },
            phone: { type: 'string', nullable: true, example: '+91 98765 43210' },
            user_type: { type: 'string', example: 'ADMIN' },
          },
        },
        TenantSummary: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'tenant_2942a9f6-f33d-4005-b0e8-47564514f2cf' },
            name: { type: 'string', example: 'Acme Traders' },
            slug: { type: 'string', example: 'acme-traders' },
            role: { type: 'string', example: 'OWNER' },
            status: { type: 'string', example: 'active' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Login successful' },
            token: {
              type: 'string',
              example:
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI5NDJhOWY2In0.q8Rn3xO2f_Zt1c9x0',
            },
            user: { $ref: '#/components/schemas/UserSummary' },
            activeTenantId: {
              type: 'string',
              nullable: true,
              example: 'tenant_2942a9f6-f33d-4005-b0e8-47564514f2cf',
            },
            tenants: {
              type: 'array',
              items: { $ref: '#/components/schemas/TenantSummary' },
            },
          },
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: '70e6ebe3-aa79-4fa0-ac50-cc42a01f5030' },
            name: { type: 'string', example: 'Production integrations' },
            keyPrefix: { type: 'string', example: 'fb_live_4b780329' },
            hint: { type: 'string', example: 'fb_live_4b780329…' },
            status: { type: 'string', enum: ['active', 'expired', 'revoked'], example: 'active' },
            lastUsedAt: { type: 'string', format: 'date-time', nullable: true, example: null },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2027-07-16T18:42:00.308Z',
            },
            createdAt: { type: 'string', format: 'date-time', example: '2026-07-16T18:42:00.310Z' },
          },
        },
        ApiKeyWithSecret: {
          allOf: [
            { $ref: '#/components/schemas/ApiKey' },
            {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: 'Full secret — shown only once at creation.',
                  example: 'fb_live_4b7803290b1c4f7a8e2d9c5b6a1f0e3d2c4b5a6f7e8d9c0b',
                },
              },
            },
          ],
        },
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'c1a2b3c4-d5e6-7890-abcd-ef1234567890' },
            name: { type: 'string', example: 'Blue Ocean Pvt Ltd' },
            email: { type: 'string', format: 'email', example: 'accounts@blueocean.com' },
            phone: { type: 'string', example: '+91 90000 11111' },
            website: { type: 'string', nullable: true, example: 'https://blueocean.com' },
            gstin: { type: 'string', nullable: true, example: '27ABCDE1234F1Z5' },
            billingAddress: { type: 'string', nullable: true, example: '12 Marine Drive, Mumbai' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-07-01T10:15:00.000Z' },
          },
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'p1a2b3c4-d5e6-7890-abcd-ef1234567890' },
            name: { type: 'string', example: 'Steel Bolt M8' },
            sku: { type: 'string', example: 'SB-M8-001' },
            sellingPrice: { type: 'number', format: 'float', example: 12.5 },
            purchasePrice: { type: 'number', format: 'float', example: 8.0 },
            stockQuantity: { type: 'number', example: 420 },
            unitId: { type: 'string', nullable: true, example: 'u1a2b3c4-d5e6-7890' },
            taxGroupId: { type: 'string', nullable: true, example: 't1a2b3c4-d5e6-7890' },
          },
        },
        InvoiceLineItem: {
          type: 'object',
          properties: {
            productId: { type: 'string', example: 'p1a2b3c4-d5e6-7890-abcd-ef1234567890' },
            description: { type: 'string', example: 'Steel Bolt M8' },
            quantity: { type: 'number', example: 100 },
            rate: { type: 'number', format: 'float', example: 12.5 },
            taxRate: { type: 'number', format: 'float', example: 18 },
            amount: { type: 'number', format: 'float', example: 1250 },
          },
        },
        Invoice: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'i1a2b3c4-d5e6-7890-abcd-ef1234567890' },
            invoiceNumber: { type: 'string', example: 'INV-2026-0042' },
            customerId: { type: 'string', example: 'c1a2b3c4-d5e6-7890-abcd-ef1234567890' },
            status: {
              type: 'string',
              enum: ['draft', 'sent', 'paid', 'partial', 'overdue'],
              example: 'sent',
            },
            issueDate: { type: 'string', format: 'date', example: '2026-07-16' },
            dueDate: { type: 'string', format: 'date', example: '2026-07-30' },
            currency: { type: 'string', example: 'INR' },
            subtotal: { type: 'number', format: 'float', example: 1250 },
            taxTotal: { type: 'number', format: 'float', example: 225 },
            total: { type: 'number', format: 'float', example: 1475 },
            amountDue: { type: 'number', format: 'float', example: 1475 },
            items: {
              type: 'array',
              items: { $ref: '#/components/schemas/InvoiceLineItem' },
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Login + token handling' },
      { name: 'API Keys', description: 'Generate, list, and revoke workspace API keys' },
      { name: 'Dashboard', description: 'Dashboard summaries + accounts planning' },
      { name: 'Customers', description: 'Customer CRUD + statement + CSV import' },
      { name: 'Invoices', description: 'Invoices, recurring, templates, credit notes, public link' },
      { name: 'Quotations', description: 'Quotation CRUD + conversion' },
      { name: 'Products', description: 'Products, categories, brands, units' },
      { name: 'Inventory', description: 'Stock, cost layers (FIFO), valuation' },
      { name: 'Purchases', description: 'Suppliers, purchases, POs, debit notes, supplier payments' },
      { name: 'Payments', description: 'Payment transactions + gateway integrations' },
      { name: 'Expenses', description: 'Expenses, recurring expenses, categories, petty cash' },
      { name: 'Banking', description: 'Bank accounts + transactions + reconciliation' },
      { name: 'Accounting', description: 'Chart of accounts + journal entries + statements' },
      { name: 'Reports', description: 'P&L, balance sheet, aging, budgets, cash-flow' },
      { name: 'Tax & GST', description: 'Tax summary + GSTR-1 + GSTR-3B + filing exports' },
      { name: 'E-Invoice', description: 'India IRN generation' },
      { name: 'Integrations', description: 'Xero / QuickBooks / WhatsApp' },
      { name: 'AI', description: 'AI extraction + chat conversation' },
      { name: 'Users & Roles', description: 'Staff, roles, permissions' },
      { name: 'Audit', description: 'Activity log / audit trail' },
      { name: 'Reminders', description: 'Invoice / quotation reminders' },
      { name: 'Settings', description: 'Company settings, currencies, modules' },
      { name: 'Public', description: 'Unauthenticated public endpoints' },
    ],
  },
  apis: [
    './controllers/**/*.ts',
    './controllers/**/*.js',
    './routes/**/*.js',
    './routes/**/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);

// CommonJS interop — server.js consumes this via require()
module.exports = { swaggerSpec };
module.exports.default = { swaggerSpec };
