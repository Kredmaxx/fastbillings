/**
 * OpenAPI documentation for high-traffic endpoints.
 *
 * This file contains only JSDoc `@swagger` blocks (no runtime code). It is
 * picked up by swagger-jsdoc via the `./controllers/**\/*.ts` glob and its
 * hand-written operations take precedence over the auto-generated route stubs,
 * so these endpoints show full request payloads, response schemas, and samples.
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with email + password
 *     description: >-
 *       Authenticates a user and returns a JWT plus the list of workspaces the
 *       user can access. Send the token as `Authorization: Bearer <token>` on
 *       subsequent requests.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: asha@acme.com }
 *               password: { type: string, format: password, example: 'S3curePass!' }
 *           example:
 *             email: asha@acme.com
 *             password: 'S3curePass!'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/LoginResponse' }
 *             example:
 *               message: Login successful
 *               token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjI5NDJhOWY2In0.q8Rn3xO2f_Zt1c9x0
 *               user:
 *                 id: 2942a9f6-f33d-4005-b0e8-47564514f2cf
 *                 firstName: Asha
 *                 lastName: Verma
 *                 email: asha@acme.com
 *                 phone: '+91 98765 43210'
 *                 user_type: ADMIN
 *               activeTenantId: tenant_2942a9f6-f33d-4005-b0e8-47564514f2cf
 *               tenants:
 *                 - id: tenant_2942a9f6-f33d-4005-b0e8-47564514f2cf
 *                   name: Acme Traders
 *                   slug: acme-traders
 *                   role: OWNER
 *                   status: active
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               message: Invalid credentials
 */

/**
 * @swagger
 * /admin/customers:
 *   get:
 *     tags: [Customers]
 *     summary: List customers
 *     description: Returns a paginated list of customers for the active workspace.
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number (1-based).
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *         description: Items per page.
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filter by name, email, or phone.
 *     responses:
 *       200:
 *         description: Paginated customers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Customer' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *             example:
 *               success: true
 *               data:
 *                 - id: c1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                   name: Blue Ocean Pvt Ltd
 *                   email: accounts@blueocean.com
 *                   phone: '+91 90000 11111'
 *                   website: https://blueocean.com
 *                   gstin: 27ABCDE1234F1Z5
 *                   billingAddress: 12 Marine Drive, Mumbai
 *                   createdAt: '2026-07-01T10:15:00.000Z'
 *               pagination: { total: 137, page: 1, limit: 10, totalPages: 14 }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     tags: [Customers]
 *     summary: Create a customer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string, example: Blue Ocean Pvt Ltd }
 *               email: { type: string, format: email, example: accounts@blueocean.com }
 *               phone: { type: string, example: '+91 90000 11111' }
 *               website: { type: string, example: https://blueocean.com }
 *               gstin: { type: string, example: 27ABCDE1234F1Z5 }
 *               billingAddress: { type: string, example: 12 Marine Drive, Mumbai }
 *           example:
 *             name: Blue Ocean Pvt Ltd
 *             email: accounts@blueocean.com
 *             phone: '+91 90000 11111'
 *             gstin: 27ABCDE1234F1Z5
 *     responses:
 *       201:
 *         description: Customer created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Customer created successfully }
 *                 data: { $ref: '#/components/schemas/Customer' }
 *             example:
 *               success: true
 *               message: Customer created successfully
 *               data:
 *                 id: c1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                 name: Blue Ocean Pvt Ltd
 *                 email: accounts@blueocean.com
 *                 phone: '+91 90000 11111'
 *                 website: https://blueocean.com
 *                 gstin: 27ABCDE1234F1Z5
 *                 billingAddress: 12 Marine Drive, Mumbai
 *                 createdAt: '2026-07-01T10:15:00.000Z'
 *       409:
 *         description: Customer with this email already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *             example:
 *               success: false
 *               message: Customer with this email already exists
 */

/**
 * @swagger
 * /admin/products:
 *   get:
 *     tags: [Products]
 *     summary: List products
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Filter by product name or SKU.
 *     responses:
 *       200:
 *         description: Paginated products
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Product' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *             example:
 *               success: true
 *               data:
 *                 - id: p1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                   name: Steel Bolt M8
 *                   sku: SB-M8-001
 *                   sellingPrice: 12.5
 *                   purchasePrice: 8.0
 *                   stockQuantity: 420
 *                   unitId: u1a2b3c4-d5e6-7890
 *                   taxGroupId: t1a2b3c4-d5e6-7890
 *               pagination: { total: 58, page: 1, limit: 10, totalPages: 6 }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     tags: [Products]
 *     summary: Create a product
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, sellingPrice]
 *             properties:
 *               name: { type: string, example: Steel Bolt M8 }
 *               sku: { type: string, example: SB-M8-001 }
 *               sellingPrice: { type: number, format: float, example: 12.5 }
 *               purchasePrice: { type: number, format: float, example: 8.0 }
 *               stockQuantity: { type: number, example: 420 }
 *               unitId: { type: string, example: u1a2b3c4-d5e6-7890 }
 *               taxGroupId: { type: string, example: t1a2b3c4-d5e6-7890 }
 *           example:
 *             name: Steel Bolt M8
 *             sku: SB-M8-001
 *             sellingPrice: 12.5
 *             purchasePrice: 8.0
 *             stockQuantity: 420
 *     responses:
 *       201:
 *         description: Product created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Product created successfully }
 *                 data: { $ref: '#/components/schemas/Product' }
 *             example:
 *               success: true
 *               message: Product created successfully
 *               data:
 *                 id: p1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                 name: Steel Bolt M8
 *                 sku: SB-M8-001
 *                 sellingPrice: 12.5
 *                 purchasePrice: 8.0
 *                 stockQuantity: 420
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @swagger
 * /admin/invoices:
 *   get:
 *     tags: [Invoices]
 *     summary: List invoices
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, sent, paid, partial, overdue] }
 *         description: Filter by invoice status.
 *     responses:
 *       200:
 *         description: Paginated invoices
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Invoice' }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *             example:
 *               success: true
 *               data:
 *                 - id: i1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                   invoiceNumber: INV-2026-0042
 *                   customerId: c1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                   status: sent
 *                   issueDate: '2026-07-16'
 *                   dueDate: '2026-07-30'
 *                   currency: INR
 *                   subtotal: 1250
 *                   taxTotal: 225
 *                   total: 1475
 *                   amountDue: 1475
 *                   items:
 *                     - productId: p1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                       description: Steel Bolt M8
 *                       quantity: 100
 *                       rate: 12.5
 *                       taxRate: 18
 *                       amount: 1250
 *               pagination: { total: 213, page: 1, limit: 10, totalPages: 22 }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *   post:
 *     tags: [Invoices]
 *     summary: Create an invoice
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, items]
 *             properties:
 *               customerId: { type: string, example: c1a2b3c4-d5e6-7890-abcd-ef1234567890 }
 *               issueDate: { type: string, format: date, example: '2026-07-16' }
 *               dueDate: { type: string, format: date, example: '2026-07-30' }
 *               currency: { type: string, example: INR }
 *               notes: { type: string, example: Thank you for your business. }
 *               items:
 *                 type: array
 *                 items: { $ref: '#/components/schemas/InvoiceLineItem' }
 *           example:
 *             customerId: c1a2b3c4-d5e6-7890-abcd-ef1234567890
 *             issueDate: '2026-07-16'
 *             dueDate: '2026-07-30'
 *             currency: INR
 *             items:
 *               - productId: p1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                 description: Steel Bolt M8
 *                 quantity: 100
 *                 rate: 12.5
 *                 taxRate: 18
 *     responses:
 *       201:
 *         description: Invoice created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: Invoice created successfully }
 *                 data: { $ref: '#/components/schemas/Invoice' }
 *             example:
 *               success: true
 *               message: Invoice created successfully
 *               data:
 *                 id: i1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                 invoiceNumber: INV-2026-0042
 *                 customerId: c1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                 status: draft
 *                 issueDate: '2026-07-16'
 *                 dueDate: '2026-07-30'
 *                 currency: INR
 *                 subtotal: 1250
 *                 taxTotal: 225
 *                 total: 1475
 *                 amountDue: 1475
 *                 items:
 *                   - productId: p1a2b3c4-d5e6-7890-abcd-ef1234567890
 *                     description: Steel Bolt M8
 *                     quantity: 100
 *                     rate: 12.5
 *                     taxRate: 18
 *                     amount: 1250
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

export {};
