/**
 * Full demo data seed — Kredmaxx Technologies (realistic IT services +
 * hardware reseller workspace) across sales, purchases, inventory, GST,
 * banking, expenses, accounting, and AI features.
 *
 * IDEMPOTENT — wipes tenant-owned demo data and re-inserts a curated set.
 *
 * Pre-requisites:
 *   1. `npm run prisma:seed`
 *   2. `npm run prisma:seed:demo`   — Kredmaxx admin + tenant
 *   3. `npm run prisma:seed:demo:full`
 *
 * Login: admin@demo.fastbillings.local / Demo123$
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

import { seedDefaultChart } from '../lib/defaultChartOfAccounts';
import { USER_TYPE } from '../lib/userTypes';

const prisma = new PrismaClient();

const COMPANY_NAME = 'Kredmaxx Technologies';
const DEMO_EMAIL =
  process.env.SEED_EMAIL || process.env.DEMO_EMAIL || 'admin@demo.fastbillings.local';

type SeedCtx = { userId: string; tenantId: string; tenantName: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const D = (n: number | string): Prisma.Decimal => new Prisma.Decimal(n);

function daysAgo(d: number): Date {
  const r = new Date();
  r.setHours(12, 0, 0, 0);
  r.setDate(r.getDate() - d);
  return r;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** India FY Apr–Mar quarter for a date. */
function fyQuarterOf(d: Date): { fyLabel: string; quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' } {
  const y = d.getFullYear();
  const m = d.getMonth();
  const startYear = m >= 3 ? y : y - 1;
  const fyLabel = `${startYear}-${String(startYear + 1).slice(-2)}`;
  let quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  if (m >= 3 && m <= 5) quarter = 'Q1';
  else if (m >= 6 && m <= 8) quarter = 'Q2';
  else if (m >= 9 && m <= 11) quarter = 'Q3';
  else quarter = 'Q4';
  return { fyLabel, quarter };
}

// ---------------------------------------------------------------------------
// Counts (filled in as we go for the summary print at the end)
// ---------------------------------------------------------------------------
const counts: Record<string, number> = {};
function record(k: string, n: number): void {
  counts[k] = n;
}

// ===========================================================================
// Phase 1: WIPE
// ===========================================================================

async function dropLegacyCatalogUniques(): Promise<void> {
  // Older DBs still have global UNIQUE(brand_name/category_name/slug) which
  // blocks per-tenant catalog rows required by Brands/Categories/Units APIs.
  for (const idx of [
    'Brand_brand_name_key',
    'Category_category_name_key',
    'Category_slug_key',
    'Unit_unit_name_key',
    'Unit_short_name_key',
  ]) {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${idx}"`);
  }
}

async function wipe(ctx: SeedCtx): Promise<void> {
  const { userId, tenantId } = ctx;
  console.log(`Phase 1: wiping existing demo data for userId=${userId} tenantId=${tenantId}`);
  await dropLegacyCatalogUniques();

  const tenantCustomerScope: Prisma.CustomerWhereInput = {
    OR: [{ userId }, { tenantId }],
  };
  const tenantInvoiceScope: Prisma.InvoiceWhereInput = {
    OR: [{ userId }, { tenantId }, { customer: { tenantId } }],
  };

  // --- Legacy DEMO-* numbers (older seeds) + payments --------------------
  await prisma.supplierPayment.deleteMany({
    where: { paymentId: { startsWith: 'DEMO-PAY-' } },
  });
  await prisma.debitNote.deleteMany({ where: { debitNoteId: { startsWith: 'DEMO-DN-' } } });
  await prisma.salesDebitNote.deleteMany({
    where: { debitNoteNumber: { startsWith: 'DEMO-SDN-' } },
  });
  await prisma.purchase.deleteMany({ where: { purchaseId: { startsWith: 'DEMO-PUR-' } } });
  await prisma.purchaseOrder.deleteMany({
    where: { purchaseOrderId: { startsWith: 'DEMO-PO-' } },
  });
  await prisma.creditNote.deleteMany({
    where: { creditNoteNumber: { startsWith: 'DEMO-CN-' } },
  });
  await prisma.deliveryChallan.deleteMany({
    where: { challanNumber: { startsWith: 'DEMO-DC-' } },
  });
  await prisma.saleOrder.deleteMany({ where: { saleOrderId: { startsWith: 'DEMO-SO-' } } });
  await prisma.quotation.deleteMany({ where: { quotationId: { startsWith: 'DEMO-QT-' } } });
  await prisma.expense.deleteMany({ where: { expenseId: { startsWith: 'DEMO-EXP-' } } });
  await prisma.invoicePayment.deleteMany({
    where: { invoice: { invoiceNumber: { startsWith: 'DEMO-INV-' } } },
  });
  await prisma.eInvoiceRecord.deleteMany({
    where: { invoice: { invoiceNumber: { startsWith: 'DEMO-INV-' } } },
  });
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: 'DEMO-INV-' } } });
  await prisma.inventory.deleteMany({ where: { product: { code: { startsWith: 'DEMO-' } } } });
  await prisma.product.deleteMany({ where: { code: { startsWith: 'DEMO-' } } });
  await prisma.pettyCashTransaction.deleteMany({
    where: { remarks: { startsWith: 'DEMO-PC' } },
  });
  await prisma.journalEntry.deleteMany({ where: { entryNumber: { startsWith: 'DEMO-JE-' } } });

  // --- Payments / refunds (deepest first) ---------------------------------
  await prisma.refund.deleteMany({ where: { userId } });

  // InvoicePayment references PaymentTransaction; null it before deleting txns
  await prisma.invoicePayment.updateMany({
    where: { paymentTransactionId: { not: null }, invoice: { userId } },
    data: { paymentTransactionId: null },
  });

  // E-invoice records (must precede invoice deletion)
  await prisma.eInvoiceRecord.deleteMany({ where: { userId } });

  // Invoice payments (FK to Invoice + BankDetail + User)
  await prisma.invoicePayment.deleteMany({ where: { invoice: { userId } } });

  // Payment transactions (after invoice payment FK is nulled)
  await prisma.paymentTransaction.deleteMany({ where: { userId } });

  // --- Journal lines (cascade on delete) then entries ----------------------
  await prisma.journalEntry.deleteMany({ where: { userId } });

  // --- Bank transactions (no userId FK; scope via bankAccount.userId) -----
  await prisma.bankTransaction.deleteMany({
    where: { bankAccount: { userId } },
  });

  // --- PettyCash (tenant/user scoped) ------------------------------------
  await prisma.pettyCashTransaction.deleteMany({
    where: {
      OR: [
        { remarks: { startsWith: 'KMX-PC' } },
        { pettyCash: { OR: [{ userId }, { tenantId }] } },
      ],
    },
  });
  await prisma.pettyCash.deleteMany({
    where: { OR: [{ userId }, { tenantId }] },
  });

  // --- Purchase chain (user-scoped + leftover KMX-* from prior tenants) ---
  await prisma.supplierPayment.deleteMany({
    where: {
      OR: [
        { purchase: { userId } },
        { paymentId: { startsWith: 'KMX-PAY-' } },
      ],
    },
  });
  await prisma.debitNote.deleteMany({
    where: { OR: [{ userId }, { debitNoteId: { startsWith: 'KMX-DN-' } }] },
  });
  await prisma.purchase.deleteMany({
    where: { OR: [{ userId }, { purchaseId: { startsWith: 'KMX-PUR-' } }] },
  });
  await prisma.purchaseOrder.deleteMany({
    where: { OR: [{ userId }, { purchaseOrderId: { startsWith: 'KMX-PO-' } }] },
  });

  // --- Quotations / credit notes / delivery challans ----------------------
  // Scope by userId OR by customer-owned-by-demo to catch strays
  await prisma.creditNote.deleteMany({
    where: {
      OR: [
        { userId },
        { customer: tenantCustomerScope },
        { billToCustomer: tenantCustomerScope },
        { creditNoteNumber: { startsWith: 'KMX-CN-' } },
      ],
    },
  });
  await prisma.deliveryChallan.deleteMany({
    where: {
      OR: [
        { userId },
        { customer: tenantCustomerScope },
        { billToCustomer: tenantCustomerScope },
        { challanNumber: { startsWith: 'KMX-DC-' } },
      ],
    },
  });
  await prisma.saleOrder.deleteMany({
    where: {
      OR: [
        { userId },
        { customer: tenantCustomerScope },
        { billToCustomer: tenantCustomerScope },
        { saleOrderId: { startsWith: 'KMX-SO-' } },
      ],
    },
  });
  await prisma.quotation.deleteMany({
    where: {
      OR: [
        { userId },
        { customer: tenantCustomerScope },
        { billToCustomer: tenantCustomerScope },
        { quotationId: { startsWith: 'KMX-QT-' } },
      ],
    },
  });
  await prisma.reminder.deleteMany({
    where: { OR: [{ createdBy: userId }, { targetCustomerRel: tenantCustomerScope }] },
  });

  // --- Expenses: children first, then parents -----------------------------
  await prisma.expenseChangeLog.deleteMany({
    where: { expense: { userId } },
  });
  await prisma.expense.deleteMany({
    where: { userId, parentExpense: { not: null } },
  });
  await prisma.expense.deleteMany({
    where: { OR: [{ userId }, { expenseId: { startsWith: 'KMX-EXP-' } }] },
  });

  // --- Invoices: children & conversions first, then parents ---------------
  // Scope: anything owned by the demo admin OR referencing a customer owned
  // by them (catches stray invoices from prior test runs that lingered with
  // a different userId but pointed at a KMX-owned customer).
  const invoiceScope: Prisma.InvoiceWhereInput = tenantInvoiceScope;
  // Null self-references first so deletes are unambiguous
  await prisma.invoice.updateMany({
    where: { AND: [invoiceScope, { OR: [{ parentInvoice: { not: null } }, { convertedFromId: { not: null } }] }] },
    data: { parentInvoice: null, convertedFromId: null, convertedAt: null },
  });
  // Also wipe any payments/e-invoices/payment-transactions for those scoped invoices
  await prisma.invoicePayment.updateMany({
    where: { paymentTransactionId: { not: null }, invoice: invoiceScope },
    data: { paymentTransactionId: null },
  });
  await prisma.eInvoiceRecord.deleteMany({ where: { invoice: invoiceScope } });
  await prisma.invoicePayment.deleteMany({ where: { invoice: invoiceScope } });
  await prisma.paymentTransaction.deleteMany({ where: { invoice: invoiceScope } });
  await prisma.salesDebitNote.deleteMany({
    where: {
      OR: [
        { userId },
        { invoice: invoiceScope },
        { debitNoteNumber: { startsWith: 'KMX-SDN-' } },
      ],
    },
  });
  await prisma.creditNote.deleteMany({ where: { invoice: invoiceScope } });
  await prisma.deliveryChallan.deleteMany({ where: { invoice: invoiceScope } });
  await prisma.saleOrder.deleteMany({ where: { invoice: invoiceScope } });
  await prisma.quotation.deleteMany({ where: { invoice: invoiceScope } });
  await prisma.invoice.deleteMany({
    where: { OR: [invoiceScope, { invoiceNumber: { startsWith: 'KMX-INV-' } }] },
  });

  // --- Vehicles (scoped by userId OR by customer-owned-by-demo) ----------
  await prisma.vehicle.deleteMany({
    where: { OR: [{ userId }, { customer: tenantCustomerScope }] },
  });

  // --- Inventory / warehouses / products ---
  await prisma.manufactureOrder.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.bom.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.stockTransfer.deleteMany({ where: { userId } });
  await prisma.inventoryCostLayer.deleteMany({
    where: { OR: [{ userId }, { tenantId }] },
  });
  await prisma.inventorySerial.deleteMany({
    where: { OR: [{ userId }, { tenantId }] },
  });
  await prisma.inventoryBatch.deleteMany({
    where: { OR: [{ userId }, { tenantId }] },
  });
  await prisma.inventory.deleteMany({ where: { userId } });
  await prisma.inventory.deleteMany({ where: { product: { code: { startsWith: 'KMX-' } } } });
  await prisma.warehouse.deleteMany({ where: { userId } });
  await prisma.product.deleteMany({
    where: {
      OR: [{ code: { startsWith: 'KMX-' } }, { tenantId, code: { startsWith: 'KMX-' } }],
    },
  });
  // Tenant-owned catalog masters (list APIs are strict tenantId filters)
  await prisma.brand.deleteMany({ where: { tenantId } });
  await prisma.category.deleteMany({ where: { tenantId } });
  await prisma.unit.deleteMany({ where: { tenantId } });

  // --- TaxRate (user-scoped) ----------------------------------------------
  await prisma.taxRate.deleteMany({ where: { userId } });

  // --- Customer & Supplier ------------------------------------------------
  await prisma.customer.deleteMany({ where: tenantCustomerScope });
  await prisma.supplier.deleteMany({ where: { user_id: userId } });

  // --- Bank details (user-scoped) -----------------------------------------
  await prisma.bankDetail.deleteMany({ where: { userId } });

  // --- ExpenseCategory — drop any expenses still linked to demo categories ---
  await prisma.expense.deleteMany({
    where: {
      OR: [
        { expenseCategory: { title: { startsWith: 'Demo ' } } },
        { expenseCategory: { tenantId } },
      ],
    },
  });
  await prisma.expenseCategory.deleteMany({
    where: { OR: [{ title: { startsWith: 'Demo ' } }, { tenantId }] },
  });

  await prisma.signature.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });
  await prisma.fixedAsset.deleteMany({ where: { userId } });
  await prisma.costCenter.deleteMany({ where: { userId } });
  await prisma.project.deleteMany({ where: { userId } });
  await prisma.advanceTaxPayment.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.advanceTaxSetoff.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.interest234Provision.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.selfAssessmentTaxPayment.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.taxAuditOtherReceipt.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.salaryTdsDeduction.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.salaryTdsEmployee.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.taxDepositChallanAllocation.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.taxDepositChallan.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.tdsTcsReturnFiling.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.form26AsImport.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });

  // --- Gateway / messaging / integration / period configs -----------------
  await prisma.gatewayConfig.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.messagingConfig.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.accountingIntegration.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.accountingPeriod.deleteMany({ where: { userId } });

  // --- Chart of accounts: children first, then top-level -------------------
  await prisma.account.deleteMany({ where: { userId, parentId: { not: null } } });
  await prisma.account.deleteMany({ where: { userId } });

  // --- AI feature data (cluster H, slice H.4) ------------------------------
  // Messages cascade-delete with their session, but we delete explicitly so
  // the wipe is order-independent. Extraction jobs and usage logs are owned
  // by userId; the AiConfig is upserted (not deleted) in seedAll.
  const demoSessions = await prisma.aiChatSession.findMany({
    where: { OR: [{ userId }, { tenantId }] },
    select: { id: true },
  });
  if (demoSessions.length) {
    await prisma.aiChatMessage.deleteMany({
      where: { sessionId: { in: demoSessions.map((s) => s.id) } },
    });
  }
  await prisma.aiChatSession.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.aiExtractionJob.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });
  await prisma.aiUsageLog.deleteMany({ where: { OR: [{ userId }, { tenantId }] } });

  console.log('  ...wipe complete');
}

// ===========================================================================
// Phase 2: SEED
// ===========================================================================

async function ensurePaymentMode(name: string, slug: string): Promise<string> {
  const existing = await prisma.paymentMode.findUnique({ where: { slug } });
  if (existing) return existing.id;
  const row = await prisma.paymentMode.create({
    data: { name, slug, status: true, isSystem: true },
  });
  return row.id;
}

async function ensureTaxGroup(
  name: string,
  owner?: { userId: string; tenantId: string },
): Promise<string> {
  const existing = await prisma.taxGroup.findFirst({
    where: {
      tax_name: name,
      ...(owner
        ? { OR: [{ tenantId: owner.tenantId }, { userId: owner.userId }, { tenantId: null, userId: null }] }
        : {}),
    },
  });
  if (existing) {
    if (owner && (!existing.userId || !existing.tenantId)) {
      await prisma.taxGroup.update({
        where: { id: existing.id },
        data: { userId: owner.userId, tenantId: owner.tenantId },
      });
    }
    return existing.id;
  }
  const row = await prisma.taxGroup.create({
    data: {
      tax_name: name,
      status: true,
      userId: owner?.userId,
      tenantId: owner?.tenantId,
    },
  });
  return row.id;
}

async function ensureUnit(tenantId: string, unitName: string, shortName: string): Promise<string> {
  const existing = await prisma.unit.findFirst({
    where: { tenantId, unit_name: unitName },
  });
  if (existing) return existing.id;
  const row = await prisma.unit.create({
    data: { unit_name: unitName, short_name: shortName, status: true, tenantId },
  });
  return row.id;
}

async function ensureBrand(tenantId: string, name: string): Promise<string> {
  const existing = await prisma.brand.findFirst({
    where: { tenantId, brand_name: name },
  });
  if (existing) return existing.id;
  const row = await prisma.brand.create({
    data: { brand_name: name, status: true, tenantId },
  });
  return row.id;
}

async function ensureCategory(
  tenantId: string,
  name: string,
  slug: string,
  taxClass:
    | 'BUSINESS'
    | 'EXEMPT'
    | 'CAPITAL'
    | 'OTHER'
    | 'UNCLASSIFIED' = 'UNCLASSIFIED',
): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { tenantId, category_name: name },
  });
  if (existing) {
    if (existing.taxClass !== taxClass) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { taxClass },
      });
    }
    return existing.id;
  }
  const row = await prisma.category.create({
    data: { category_name: name, slug, status: true, taxClass, tenantId },
  });
  return row.id;
}

async function seedAll(ctx: SeedCtx): Promise<void> {
  const { userId, tenantId, tenantName } = ctx;
  console.log('Phase 2: seeding demo data');

  // -------------------------------------------------------------------------
  // CompanySettings — tenant-scoped (falls back to user link on create)
  // -------------------------------------------------------------------------
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: COMPANY_NAME },
  });

  const companyRow = await prisma.companySettings.upsert({
    where: { userId },
    update: {
      companyName: COMPANY_NAME,
      email: 'accounts@kredmaxx.com',
      phone: '+91-44-4567-8900',
      address: 'Plot 42, TIDEL Park, Taramani',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '600113',
      taxRegime: 'GST_INDIA',
      countryId: 'c-india',
      publicBaseUrl: 'http://localhost:3000',
      merchantUpiId: 'kredmaxx@upi',
      merchantName: COMPANY_NAME,
      gstin: '33AABCK4521R1Z8',
      tan: 'CHEM04521B',
      functionalCurrency: 'INR',
      fiscalYearStartMonth: 4,
      tenantId,
    },
    create: {
      companyName: COMPANY_NAME,
      email: 'accounts@kredmaxx.com',
      phone: '+91-44-4567-8900',
      address: 'Plot 42, TIDEL Park, Taramani',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '600113',
      taxRegime: 'GST_INDIA',
      countryId: 'c-india',
      publicBaseUrl: 'http://localhost:3000',
      merchantUpiId: 'kredmaxx@upi',
      merchantName: COMPANY_NAME,
      gstin: '33AABCK4521R1Z8',
      tan: 'CHEM04521B',
      functionalCurrency: 'INR',
      fiscalYearStartMonth: 4,
      userId,
      tenantId,
    },
  });
  record('companySettings', 1);

  // -------------------------------------------------------------------------
  // PaymentModes (global) — ensure required ones exist
  // -------------------------------------------------------------------------
  const pmCashId = await ensurePaymentMode('Cash', 'cash');
  const pmBankId = await ensurePaymentMode('Bank Transfer', 'bank-transfer');
  const pmUpiId = await ensurePaymentMode('UPI', 'upi');
  const pmCardId = await ensurePaymentMode('Card', 'card');
  const pmChequeId = await ensurePaymentMode('Cheque', 'cheque');

  // -------------------------------------------------------------------------
  // TaxRates (10) — user-scoped
  // -------------------------------------------------------------------------
  const taxRatesSpec = [
    { name: 'CGST 2.5%', taxKind: 'CGST' as const, regime: 'GST_INDIA' as const, rate: '2.5' },
    { name: 'CGST 6%', taxKind: 'CGST' as const, regime: 'GST_INDIA' as const, rate: '6' },
    { name: 'CGST 9%', taxKind: 'CGST' as const, regime: 'GST_INDIA' as const, rate: '9' },
    { name: 'CGST 14%', taxKind: 'CGST' as const, regime: 'GST_INDIA' as const, rate: '14' },
    { name: 'SGST 2.5%', taxKind: 'SGST' as const, regime: 'GST_INDIA' as const, rate: '2.5' },
    { name: 'SGST 6%', taxKind: 'SGST' as const, regime: 'GST_INDIA' as const, rate: '6' },
    { name: 'SGST 9%', taxKind: 'SGST' as const, regime: 'GST_INDIA' as const, rate: '9' },
    { name: 'SGST 14%', taxKind: 'SGST' as const, regime: 'GST_INDIA' as const, rate: '14' },
    { name: 'IGST 5%', taxKind: 'IGST' as const, regime: 'GST_INDIA' as const, rate: '5' },
    { name: 'IGST 12%', taxKind: 'IGST' as const, regime: 'GST_INDIA' as const, rate: '12' },
    { name: 'IGST 18%', taxKind: 'IGST' as const, regime: 'GST_INDIA' as const, rate: '18' },
    { name: 'IGST 28%', taxKind: 'IGST' as const, regime: 'GST_INDIA' as const, rate: '28' },
    { name: 'VAT 20%', taxKind: 'VAT' as const, regime: 'VAT_GENERIC' as const, rate: '20' },
  ];
  const taxRateByName: Record<string, { id: string; name: string; percent: number; kind: string }> = {};
  for (const spec of taxRatesSpec) {
    const row = await prisma.taxRate.create({
      data: {
        userId,
        tenantId,
        regime: spec.regime,
        taxKind: spec.taxKind,
        name: spec.name,
        rate: D(spec.rate),
        countryId: 'c-india',
        isActive: true,
      },
    });
    taxRateByName[spec.name] = { id: row.id, name: row.name, percent: Number(spec.rate), kind: spec.taxKind };
  }
  record('taxRates', taxRatesSpec.length);

  // -------------------------------------------------------------------------
  // Brands (6), Categories (8), Units (5) — global (idempotent via ensure*)
  // -------------------------------------------------------------------------
  const brandIds: string[] = [];
  for (const b of ['Apple', 'Dell', 'HP', 'Samsung', 'Lenovo', 'Microsoft']) {
    brandIds.push(await ensureBrand(tenantId, b));
  }
  record('brands', brandIds.length);

  const categorySpecs: Array<
    [string, string, 'BUSINESS' | 'EXEMPT' | 'CAPITAL' | 'OTHER' | 'UNCLASSIFIED']
  > = [
    ['Electronics', 'electronics', 'BUSINESS'],
    ['Office Supplies', 'office-supplies', 'BUSINESS'],
    ['Furniture', 'furniture', 'BUSINESS'],
    ['Services', 'services', 'BUSINESS'],
    ['Software', 'software', 'BUSINESS'],
    ['Stationery', 'stationery', 'UNCLASSIFIED'],
    ['Hardware', 'hardware', 'BUSINESS'],
    ['Consulting', 'consulting', 'OTHER'],
  ];
  const categoryIds: string[] = [];
  for (const [name, slug, taxClass] of categorySpecs) {
    categoryIds.push(await ensureCategory(tenantId, name, slug, taxClass));
  }
  record('categories', categoryIds.length);

  const unitSpecs = [
    ['Pieces', 'pcs'],
    ['Hours', 'hr'],
    ['Kilograms', 'kg'],
    ['Box', 'box'],
    ['Litres', 'ltr'],
  ] as const;
  const unitIds: string[] = [];
  for (const [u, s] of unitSpecs) {
    unitIds.push(await ensureUnit(tenantId, u, s));
  }
  record('units', unitIds.length);

  // TaxGroup used by Product (Product has required taxGroupId)
  const taxGroupGst18 = await ensureTaxGroup('GST 18%', { userId, tenantId });

  // -------------------------------------------------------------------------
  // Products (10 + 5 services = 15) — global, KMX-prefixed code
  // -------------------------------------------------------------------------
  // Kredmaxx catalog: hardware resale + software licenses + professional services
  // Physical goods: FIFO for cost layers; SERIAL for laptops/monitors; BATCH for consumables.
  const productSpecs = [
    { code: 'KMX-LAPTOP-01', name: 'Dell Latitude 5440 Business Laptop', type: 'Product', sell: 72000, buy: 61000, cat: 0, brand: 1, unit: 0, fifo: true, track: 'SERIAL' as const },
    { code: 'KMX-LAPTOP-02', name: 'HP EliteBook 840 G10', type: 'Product', sell: 85000, buy: 72000, cat: 0, brand: 2, unit: 0, fifo: true, track: 'SERIAL' as const },
    { code: 'KMX-MONITOR-01', name: 'Dell UltraSharp 27" U2723QE Monitor', type: 'Product', sell: 42000, buy: 34000, cat: 0, brand: 1, unit: 0, fifo: true, track: 'SERIAL' as const },
    { code: 'KMX-KBD-01', name: 'Apple Magic Keyboard with Touch ID', type: 'Product', sell: 14500, buy: 11200, cat: 0, brand: 0, unit: 0, fifo: true, track: 'NONE' as const },
    { code: 'KMX-MOUSE-01', name: 'Logitech MX Master 3S Mouse', type: 'Product', sell: 9500, buy: 7400, cat: 0, brand: 0, unit: 0, fifo: true, track: 'NONE' as const },
    { code: 'KMX-DESK-01', name: 'Sit-Stand Workstation Desk', type: 'Product', sell: 28000, buy: 19500, cat: 2, brand: 3, unit: 0, fifo: true, track: 'NONE' as const },
    { code: 'KMX-CHAIR-01', name: 'Ergonomic Mesh Office Chair', type: 'Product', sell: 16500, buy: 11200, cat: 2, brand: 3, unit: 0, fifo: true, track: 'NONE' as const },
    { code: 'KMX-PAPER-01', name: 'A4 Copier Paper (5-ream carton)', type: 'Product', sell: 1450, buy: 980, cat: 5, brand: 4, unit: 3, fifo: true, track: 'BATCH' as const },
    { code: 'KMX-INK-01', name: 'HP LaserJet Pro Toner 26A', type: 'Product', sell: 5200, buy: 3800, cat: 1, brand: 2, unit: 0, fifo: true, track: 'BATCH' as const },
    { code: 'KMX-MS365-01', name: 'Microsoft 365 Business Premium (Annual)', type: 'Product', sell: 16200, buy: 12800, cat: 4, brand: 5, unit: 0, fifo: false, track: 'NONE' as const },
    // Finished goods assembled via BOM / manufacture orders
    { code: 'KMX-WS-KIT-01', name: 'Kredmaxx Pro Workstation Bundle', type: 'Product', sell: 185000, buy: 0, cat: 6, brand: 5, unit: 0, fifo: false, track: 'NONE' as const },
    { code: 'KMX-CUBICLE-01', name: 'Kredmaxx Office Cubicle Kit', type: 'Product', sell: 52000, buy: 0, cat: 2, brand: 3, unit: 0, fifo: false, track: 'NONE' as const },
    { code: 'KMX-SVC-01', name: 'Custom Software Development (Hourly)', type: 'Service', sell: 2800, buy: 1600, cat: 3, brand: 5, unit: 1, fifo: false, track: 'NONE' as const },
    { code: 'KMX-SVC-02', name: 'IT Strategy Consulting (Hourly)', type: 'Service', sell: 4500, buy: 2200, cat: 7, brand: 5, unit: 1, fifo: false, track: 'NONE' as const },
    { code: 'KMX-SVC-03', name: 'Managed IT Support Retainer (Monthly)', type: 'Service', sell: 35000, buy: 15000, cat: 3, brand: 5, unit: 0, fifo: false, track: 'NONE' as const },
    { code: 'KMX-SVC-04', name: 'Cloud Migration Project (AWS/Azure)', type: 'Service', sell: 275000, buy: 140000, cat: 3, brand: 5, unit: 0, fifo: false, track: 'NONE' as const },
    { code: 'KMX-SVC-05', name: 'VAPT & Cybersecurity Assessment', type: 'Service', sell: 125000, buy: 65000, cat: 7, brand: 5, unit: 0, fifo: false, track: 'NONE' as const },
  ];

  type Prod = {
    id: string;
    name: string;
    code: string;
    type: 'Product' | 'Service';
    sell: number;
    buy: number;
    fifo: boolean;
    track: 'NONE' | 'BATCH' | 'SERIAL';
  };
  const products: Prod[] = [];
  for (const p of productSpecs) {
    const row = await prisma.product.create({
      data: {
        item_type: p.type as 'Product' | 'Service',
        name: p.name,
        code: p.code,
        categoryId: categoryIds[p.cat] ?? categoryIds[0],
        brandId: brandIds[p.brand] ?? brandIds[0],
        unitId: unitIds[p.unit] ?? unitIds[0],
        selling_price: p.sell,
        purchase_price: p.buy,
        discount_type: 'percentage',
        discount_value: 0,
        taxGroupId: taxGroupGst18,
        barcode: `BC-${p.code}-${randomBytes(3).toString('hex').toUpperCase()}`,
        alert_quantity: p.type === 'Product' ? 5 : 0,
        description: `${p.name} — supplied / delivered by ${COMPANY_NAME}.`,
        product_image: '',
        enable_inventory: p.type === 'Product',
        stock: p.type === 'Product' ? 25 : 0,
        status: true,
        tenantId,
        hsnSac: p.type === 'Service' ? '998314' : '847130',
        valuationMethod: p.fifo ? 'FIFO' : 'WAC',
        trackingMode: p.track,
      },
    });
    products.push({
      id: row.id,
      name: row.name,
      code: row.code,
      type: p.type as 'Product' | 'Service',
      sell: p.sell,
      buy: p.buy,
      fifo: p.fifo,
      track: p.track,
    });
  }
  record('products', products.length);

  // Warehouses — Chennai HQ + Bangalore branch stock
  const whMain = await prisma.warehouse.create({
    data: {
      userId,
      tenantId,
      name: 'Chennai HQ Store',
      code: 'WH-CHN',
      isDefault: true,
    },
  });
  const whBlr = await prisma.warehouse.create({
    data: {
      userId,
      tenantId,
      name: 'Bangalore Branch Store',
      code: 'WH-BLR',
      isDefault: false,
    },
  });
  record('warehouses', 2);

  // Inventory rows for each Product (not Service) — initial stock
  let invCount = 0;
  for (const p of products) {
    if (p.type !== 'Product') continue;
    await prisma.inventory.create({
      data: {
        productId: p.id,
        quantity: 18,
        userId,
        tenantId,
        warehouseId: whMain.id,
        notes: 'Opening stock — Chennai HQ',
      },
    });
    invCount++;
    await prisma.inventory.create({
      data: {
        productId: p.id,
        quantity: 7,
        userId,
        tenantId,
        warehouseId: whBlr.id,
        notes: 'Opening stock — Bangalore branch',
      },
    });
    invCount++;
  }
  record('inventory', invCount);

  // FIFO cost layers — multiple receipt buckets per hardware SKU (Cost Layers page)
  let costLayerCount = 0;
  for (const p of products) {
    if (!p.fifo || p.type !== 'Product') continue;
    const layers = [
      { qty: 10, unitCost: round2(p.buy * 0.96), days: 75, source: 'PURCHASE' },
      { qty: 8, unitCost: round2(p.buy), days: 40, source: 'PURCHASE' },
      { qty: 7, unitCost: round2(p.buy * 1.03), days: 12, source: 'PURCHASE' },
    ];
    for (const layer of layers) {
      await prisma.inventoryCostLayer.create({
        data: {
          userId,
          tenantId,
          productId: p.id,
          qtyRemaining: D(layer.qty),
          unitCost: D(layer.unitCost),
          receivedAt: daysAgo(layer.days),
          sourceType: layer.source,
          sourceId: `KMX-LAYER-${p.code}-${layer.days}`,
        },
      });
      costLayerCount++;
    }
    // Keep on-hand qty aligned with open layers (25)
    await prisma.inventory.updateMany({
      where: { productId: p.id, userId },
      data: { quantityOnHand: D(25), avgCost: D(0) },
    });
  }
  record('inventoryCostLayers', costLayerCount);

  // -------------------------------------------------------------------------
  // Batch & serial stock (Batch & serial page)
  // -------------------------------------------------------------------------
  const byCode = (code: string) => {
    const p = products.find((x) => x.code === code);
    if (!p) throw new Error(`Demo product missing: ${code}`);
    return p;
  };

  let batchCount = 0;
  const paper = byCode('KMX-PAPER-01');
  const toner = byCode('KMX-INK-01');
  const batchSpecs = [
    { product: paper, lot: 'LOT-PAPER-2401', wh: whMain.id, qty: 40, cost: paper.buy, expiryDays: 400 },
    { product: paper, lot: 'LOT-PAPER-2406', wh: whMain.id, qty: 25, cost: round2(paper.buy * 1.02), expiryDays: 520 },
    { product: paper, lot: 'LOT-PAPER-BLR-01', wh: whBlr.id, qty: 12, cost: paper.buy, expiryDays: 360 },
    { product: toner, lot: 'LOT-TONER-26A-A', wh: whMain.id, qty: 18, cost: toner.buy, expiryDays: 540 },
    { product: toner, lot: 'LOT-TONER-26A-B', wh: whMain.id, qty: 8, cost: round2(toner.buy * 0.98), expiryDays: 200 },
    { product: toner, lot: 'LOT-TONER-BLR-01', wh: whBlr.id, qty: 6, cost: toner.buy, expiryDays: 300 },
  ];
  for (const b of batchSpecs) {
    await prisma.inventoryBatch.create({
      data: {
        userId,
        tenantId,
        productId: b.product.id,
        warehouseId: b.wh,
        lotNumber: b.lot,
        qtyOnHand: D(b.qty),
        unitCost: D(b.cost),
        expiryDate: daysAgo(-b.expiryDays),
        sourceType: 'PURCHASE',
        sourceId: `KMX-BATCH-${b.lot}`,
      },
    });
    batchCount++;
  }
  record('inventoryBatches', batchCount);

  let serialCount = 0;
  const serialSpecs: Array<{ product: Prod; prefix: string; wh: string; count: number; sold?: number }> = [
    { product: byCode('KMX-LAPTOP-01'), prefix: 'DL5440', wh: whMain.id, count: 6, sold: 1 },
    { product: byCode('KMX-LAPTOP-02'), prefix: 'HP840G10', wh: whMain.id, count: 4, sold: 0 },
    { product: byCode('KMX-MONITOR-01'), prefix: 'DU2723', wh: whMain.id, count: 5, sold: 1 },
    { product: byCode('KMX-LAPTOP-01'), prefix: 'DL5440-BLR', wh: whBlr.id, count: 3, sold: 0 },
  ];
  for (const s of serialSpecs) {
    for (let i = 1; i <= s.count; i++) {
      const sold = i <= (s.sold ?? 0);
      await prisma.inventorySerial.create({
        data: {
          userId,
          tenantId,
          productId: s.product.id,
          warehouseId: sold ? null : s.wh,
          serialNumber: `${s.prefix}-${String(i).padStart(4, '0')}`,
          status: sold ? 'SOLD' : 'AVAILABLE',
          unitCost: D(s.product.buy),
          sourceType: 'PURCHASE',
          sourceId: `KMX-SERIAL-${s.prefix}`,
          soldAt: sold ? daysAgo(20) : null,
        },
      });
      serialCount++;
    }
  }
  record('inventorySerials', serialCount);

  // -------------------------------------------------------------------------
  // BOMs + Manufacture orders (Workstation + Cubicle kits)
  // -------------------------------------------------------------------------
  const fgWorkstation = byCode('KMX-WS-KIT-01');
  const fgCubicle = byCode('KMX-CUBICLE-01');
  const bomWorkstation = await prisma.bom.create({
    data: {
      userId,
      tenantId,
      finishedProductId: fgWorkstation.id,
      name: 'Pro Workstation BOM',
      isActive: true,
      lines: {
        create: [
          { componentProductId: byCode('KMX-LAPTOP-01').id, qtyPerBuild: D(1), sortOrder: 0 },
          { componentProductId: byCode('KMX-MONITOR-01').id, qtyPerBuild: D(1), sortOrder: 1 },
          { componentProductId: byCode('KMX-KBD-01').id, qtyPerBuild: D(1), sortOrder: 2 },
          { componentProductId: byCode('KMX-MOUSE-01').id, qtyPerBuild: D(1), sortOrder: 3 },
        ],
      },
    },
  });
  const bomCubicle = await prisma.bom.create({
    data: {
      userId,
      tenantId,
      finishedProductId: fgCubicle.id,
      name: 'Office Cubicle BOM',
      isActive: true,
      lines: {
        create: [
          { componentProductId: byCode('KMX-DESK-01').id, qtyPerBuild: D(1), sortOrder: 0 },
          { componentProductId: byCode('KMX-CHAIR-01').id, qtyPerBuild: D(1), sortOrder: 1 },
        ],
      },
    },
  });
  record('boms', 2);

  const wsBuildCost = round2(
    byCode('KMX-LAPTOP-01').buy +
      byCode('KMX-MONITOR-01').buy +
      byCode('KMX-KBD-01').buy +
      byCode('KMX-MOUSE-01').buy,
  );
  const cubicleBuildCost = round2(byCode('KMX-DESK-01').buy + byCode('KMX-CHAIR-01').buy);

  await prisma.manufactureOrder.create({
    data: {
      userId,
      tenantId,
      bomId: bomWorkstation.id,
      orderNumber: 'KMX-MO-00001',
      warehouseId: whMain.id,
      quantity: D(2),
      status: 'COMPLETED',
      notes: 'BrightPath Healthcare — 2 pro workstations for clinic IT rollout.',
      completedAt: daysAgo(18),
      totalBuildCost: D(round2(wsBuildCost * 2)),
      lines: {
        create: [
          {
            productId: byCode('KMX-LAPTOP-01').id,
            role: 'COMPONENT',
            quantity: D(2),
            unitCost: D(byCode('KMX-LAPTOP-01').buy),
          },
          {
            productId: byCode('KMX-MONITOR-01').id,
            role: 'COMPONENT',
            quantity: D(2),
            unitCost: D(byCode('KMX-MONITOR-01').buy),
          },
          {
            productId: byCode('KMX-KBD-01').id,
            role: 'COMPONENT',
            quantity: D(2),
            unitCost: D(byCode('KMX-KBD-01').buy),
          },
          {
            productId: byCode('KMX-MOUSE-01').id,
            role: 'COMPONENT',
            quantity: D(2),
            unitCost: D(byCode('KMX-MOUSE-01').buy),
          },
          {
            productId: fgWorkstation.id,
            role: 'FINISHED',
            quantity: D(2),
            unitCost: D(wsBuildCost),
          },
        ],
      },
    },
  });
  await prisma.manufactureOrder.create({
    data: {
      userId,
      tenantId,
      bomId: bomCubicle.id,
      orderNumber: 'KMX-MO-00002',
      warehouseId: whMain.id,
      quantity: D(5),
      status: 'DRAFT',
      notes: 'Chennai HQ expansion — 5 cubicle kits (pending stock pick).',
      totalBuildCost: null,
      lines: {
        create: [
          {
            productId: byCode('KMX-DESK-01').id,
            role: 'COMPONENT',
            quantity: D(5),
            unitCost: D(byCode('KMX-DESK-01').buy),
          },
          {
            productId: byCode('KMX-CHAIR-01').id,
            role: 'COMPONENT',
            quantity: D(5),
            unitCost: D(byCode('KMX-CHAIR-01').buy),
          },
          {
            productId: fgCubicle.id,
            role: 'FINISHED',
            quantity: D(5),
            unitCost: D(cubicleBuildCost),
          },
        ],
      },
    },
  });
  await prisma.manufactureOrder.create({
    data: {
      userId,
      tenantId,
      bomId: bomWorkstation.id,
      orderNumber: 'KMX-MO-00003',
      warehouseId: whBlr.id,
      quantity: D(1),
      status: 'CANCELLED',
      notes: 'Cancelled — client deferred Bangalore branch rollout.',
      totalBuildCost: null,
    },
  });
  record('manufactureOrders', 3);

  // -------------------------------------------------------------------------
  // Customers (10) — enterprise B2B + SMB / freelance clients
  // -------------------------------------------------------------------------
  const panFromGstin = (gstin?: string) => (gstin && gstin.length >= 12 ? gstin.slice(2, 12) : undefined);
  type CustomerSpec = {
    name: string;
    email: string;
    phone: string;
    gstin?: string;
    pan?: string;
    state: string;
    city: string;
    stateId: string;
  };
  const customerSpecs: CustomerSpec[] = [
    { name: 'Nexus Retail Pvt Ltd', email: 'ap@nexusretail.in', phone: '9840011001', gstin: '33AABCN8821R1Z2', state: 'Tamil Nadu', city: 'Chennai', stateId: 's-tn' },
    { name: 'Horizon Logistics India', email: 'finance@horizonlog.in', phone: '9820022002', gstin: '27AABCH4410R1Z6', state: 'Maharashtra', city: 'Mumbai', stateId: 's-mh' },
    { name: 'BrightPath Healthcare LLP', email: 'it.procurement@brightpath.care', phone: '9880033003', gstin: '29AABCB7733R1Z9', state: 'Karnataka', city: 'Bangalore', stateId: 's-ka' },
    { name: 'Coastal Media Group', email: 'accounts@coastalmedia.in', phone: '9440044004', gstin: '33AABCC5566R1Z1', state: 'Tamil Nadu', city: 'Chennai', stateId: 's-tn' },
    { name: 'Rahul Menon', email: 'rahul.menon@outlook.com', phone: '9876543215', pan: 'AABPR7788M', state: 'Tamil Nadu', city: 'Chennai', stateId: 's-tn' },
    { name: 'Priya Natarajan', email: 'priya.natarajan@gmail.com', phone: '9876543216', pan: 'AABPP3344N', state: 'Karnataka', city: 'Bangalore', stateId: 's-ka' },
    { name: 'Senthil Kumar Traders', email: 'senthil@sktraders.in', phone: '9876543217', gstin: '33AABCS2299R1Z4', state: 'Tamil Nadu', city: 'Coimbatore', stateId: 's-tn' },
    { name: 'Anita Krishnan Consulting', email: 'anita@akconsult.in', phone: '9876543218', pan: 'AABPA5566K', state: 'Kerala', city: 'Kochi', stateId: 's-kl' },
    { name: 'Vertex Fintech Solutions', email: 'ops@vertexfintech.com', phone: '9876543219', gstin: '27AABCV9901R1Z8', state: 'Maharashtra', city: 'Pune', stateId: 's-mh' },
    { name: 'Sunrise Agro Exports', email: 'it@sunriseagro.in', phone: '9876543220', gstin: '36AABCS1188R1Z3', state: 'Telangana', city: 'Hyderabad', stateId: 's-tg' },
  ];

  type Cust = CustomerSpec & { id: string };
  const customers: Cust[] = [];
  for (const c of customerSpecs) {
    const row = await prisma.customer.create({
      data: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        gstin: c.gstin ?? null,
        pan: c.pan ?? panFromGstin(c.gstin) ?? null,
        status: 'Active',
        billingAddress: {
          line1: `${Math.floor(Math.random() * 999) + 1} ${c.city} Main Rd`,
          city: c.city,
          state: c.state,
          country: 'India',
          pincode: '600001',
          stateId: c.stateId,
        },
        shippingAddress: {
          line1: `${Math.floor(Math.random() * 999) + 1} ${c.city} Main Rd`,
          city: c.city,
          state: c.state,
          country: 'India',
          pincode: '600001',
          stateId: c.stateId,
        },
        userId,
        tenantId,
      },
    });
    customers.push({ ...c, id: row.id });
  }
  record('customers', customers.length);

  if (customers[0] && products[0] && products[1]) {
    await prisma.customerProductRate.createMany({
      data: [
        {
          tenantId,
          customerId: customers[0].id,
          productId: products[0].id,
          sellingPrice: Math.round(products[0].sell * 0.9 * 100) / 100,
        },
        {
          tenantId,
          customerId: customers[0].id,
          productId: products[1].id,
          sellingPrice: Math.round(products[1].sell * 0.92 * 100) / 100,
        },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Suppliers (directory) + Vendor Users (for PO / purchase / payments)
  // -------------------------------------------------------------------------
  const supplierSpecs = [
    { name: 'Pinnacle Computing Distributors', email: 'sales@pinnaclecomp.in', phone: '9988776601', gstin: '33AABCP1001R1Z1' },
    { name: 'TechSource India Pvt Ltd', email: 'orders@techsourceindia.in', phone: '9988776602', gstin: '29AABCT2002R1Z2' },
    { name: 'Workstation Mart', email: 'b2b@workstationmart.in', phone: '9988776603', gstin: '33AABCW3003R1Z3' },
    { name: 'CloudNova Hosting', email: 'billing@cloudnova.in', phone: '9988776604', gstin: '27AABCC4004R1Z4' },
    { name: 'SwiftRoute Logistics', email: 'accounts@swiftroute.in', phone: '9988776605', gstin: '33AABCS5005R1Z5' },
  ];
  type Supp = { id: string; name: string; vendorUserId: string; email: string; pan: string | null };
  const suppliers: Supp[] = [];
  const vendorPassword = await bcrypt.hash('Vendor123$', 10);
  for (let i = 0; i < supplierSpecs.length; i++) {
    const s = supplierSpecs[i];
    // Use business email as vendor login so Form 26Q can resolve supplier PAN by email.
    const vendorEmail = s.email;
    const supplierPan = panFromGstin(s.gstin) || null;
    const vendorUser = await prisma.user.upsert({
      where: { email: vendorEmail },
      update: {
        firstName: s.name.split(' ')[0],
        lastName: 'Vendor',
        phone: s.phone,
        user_type: USER_TYPE.VENDOR,
        password: vendorPassword,
        isDeleted: false,
      },
      create: {
        email: vendorEmail,
        password: vendorPassword,
        firstName: s.name.split(' ')[0],
        lastName: 'Vendor',
        phone: s.phone,
        user_type: USER_TYPE.VENDOR,
        balance: 0,
        isDeleted: false,
      },
    });
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId, userId: vendorUser.id } },
      update: { role: 'MEMBER', acceptedAt: new Date() },
      create: {
        tenantId,
        userId: vendorUser.id,
        role: 'MEMBER',
        acceptedAt: new Date(),
      },
    });
    const row = await prisma.supplier.create({
      data: {
        user_id: userId,
        tenantId,
        supplier_name: s.name,
        supplier_email: s.email,
        supplier_phone: s.phone,
        gstin: s.gstin,
        pan: supplierPan,
        // First demo supplier = non-resident deductee for Form 27Q (purchase i=0 has TDS).
        isNonResident: i === 0,
        // TechSource (i=1) = related party for §40A(2) disclosure (also resident §40(a)(ia) demos).
        isRelatedParty: i === 1,
        // MSME flags for §43B(h) / MSME payables demos (not Pinnacle NR).
        isMsme: i === 2 || i === 3 || i === 4,
        msmeUdyam: i === 2 || i === 3 || i === 4 ? `UDYAM-TN-00-00000${i}` : null,
        balance: 0,
        status: true,
      },
    });
    suppliers.push({
      id: row.id,
      name: s.name,
      vendorUserId: vendorUser.id,
      email: s.email,
      pan: supplierPan,
    });
  }
  record('suppliers', suppliers.length);
  record('vendorUsers', suppliers.length);

  // Staff roles + permissions (MEMBER must have roleId after money-path RBAC)
  async function ensureStaffRole(
    roleName: string,
    grants: Array<{ slug: string; view?: boolean; create?: boolean; edit?: boolean; delete?: boolean }>,
  ): Promise<string> {
    const role = await prisma.role.upsert({
      where: { role_tenant_name_unique: { tenantId, roleName } },
      update: { status: true, deletedAt: null },
      create: { roleName, status: true, tenantId, createdBy: userId },
    });
    for (const g of grants) {
      const mod = await prisma.module.findFirst({
        where: { moduleSlug: g.slug, deletedAt: null },
        select: { id: true },
      });
      if (!mod) continue;
      const existing = await prisma.permission.findFirst({
        where: { roleId: role.id, moduleId: mod.id, deletedAt: null },
      });
      const data = {
        view: !!g.view,
        create: !!g.create,
        edit: !!g.edit,
        delete: !!g.delete,
        allowAll: false,
      };
      if (existing) {
        await prisma.permission.update({ where: { id: existing.id }, data });
      } else {
        await prisma.permission.create({
          data: { roleId: role.id, moduleId: mod.id, ...data },
        });
      }
    }
    return role.id;
  }

  const salesRoleId = await ensureStaffRole('Sales', [
    { slug: 'dashboard', view: true },
    { slug: 'invoices', view: true, create: true, edit: true },
    { slug: 'quotations', view: true, create: true, edit: true, delete: true },
    { slug: 'sale-orders', view: true, create: true, edit: true, delete: true },
    { slug: 'customers', view: true, create: true, edit: true },
    { slug: 'product-services', view: true },
    { slug: 'delivery-challans', view: true, create: true, edit: true },
    { slug: 'credit-notes', view: true },
    { slug: 'sales-debit-notes', view: true },
  ]);
  const financeRoleId = await ensureStaffRole('Finance', [
    { slug: 'dashboard', view: true },
    { slug: 'banking', view: true, create: true, edit: true, delete: true },
    { slug: 'expenses', view: true, create: true, edit: true, delete: true },
    { slug: 'petty-cash', view: true, create: true, edit: true },
    { slug: 'transaction', view: true },
    { slug: 'accounting-reports', view: true, create: true, edit: true },
    { slug: 'finance-reports', view: true },
    { slug: 'purchase-list', view: true },
    { slug: 'invoices', view: true },
    { slug: 'customers', view: true },
  ]);

  // Staff users — finance + sales (login: Staff123$)
  const staffPassword = await bcrypt.hash('Staff123$', 10);
  const staffSpecs = [
    {
      email: 'finance@demo.kredmaxx.local',
      firstName: 'Divya',
      lastName: 'Rao',
      phone: '9841099001',
      roleId: financeRoleId,
    },
    {
      email: 'sales@demo.kredmaxx.local',
      firstName: 'Karthik',
      lastName: 'Iyer',
      phone: '9841099002',
      roleId: salesRoleId,
    },
  ];
  let staffCount = 0;
  for (const st of staffSpecs) {
    const staffUser = await prisma.user.upsert({
      where: { email: st.email },
      update: {
        firstName: st.firstName,
        lastName: st.lastName,
        phone: st.phone,
        user_type: USER_TYPE.STAFF,
        password: staffPassword,
        roleId: st.roleId,
        isDeleted: false,
      },
      create: {
        email: st.email,
        password: staffPassword,
        firstName: st.firstName,
        lastName: st.lastName,
        phone: st.phone,
        user_type: USER_TYPE.STAFF,
        roleId: st.roleId,
        balance: 0,
        isDeleted: false,
      },
    });
    await prisma.tenantMembership.upsert({
      where: { tenantId_userId: { tenantId, userId: staffUser.id } },
      update: { role: 'MEMBER', roleId: st.roleId, acceptedAt: new Date() },
      create: {
        tenantId,
        userId: staffUser.id,
        role: 'MEMBER',
        roleId: st.roleId,
        acceptedAt: new Date(),
      },
    });
    staffCount++;
  }
  record('staffUsers', staffCount);

  // -------------------------------------------------------------------------
  // Vehicles (4) — linked to first 4 customers
  // -------------------------------------------------------------------------
  const vehicleSpecs = [
    { customerIdx: 0, name: 'Company Sedan', make: 'Toyota', model: 'Camry', year: 2022, reg: 'TN-01-AB-1234', vin: 'JT2BF22K1W0123456' },
    { customerIdx: 1, name: 'Executive SUV', make: 'Honda', model: 'CR-V', year: 2023, reg: 'MH-02-CD-5678', vin: 'JHLRD7861YC012345' },
    { customerIdx: 2, name: 'Delivery Van', make: 'Mahindra', model: 'Bolero Pickup', year: 2021, reg: 'KA-03-EF-9012', vin: 'MA1TA2GAKM1A12345' },
    { customerIdx: 4, name: 'Family Hatchback', make: 'Maruti', model: 'Swift', year: 2024, reg: 'TN-04-GH-3456', vin: 'MA3EYDF1SK0123456' },
  ];
  let vehicleCount = 0;
  for (const v of vehicleSpecs) {
    await prisma.vehicle.create({
      data: {
        customerId: customers[v.customerIdx].id,
        userId,
        name: v.name,
        make: v.make,
        model: v.model,
        year: v.year,
        registrationNumber: v.reg,
        vin: v.vin,
        mileage: 25000,
        status: true,
      },
    });
    vehicleCount++;
  }
  record('vehicles', vehicleCount);

  // -------------------------------------------------------------------------
  // BankDetails (3)
  // -------------------------------------------------------------------------
  const bankSpecs = [
    {
      accountHoldername: COMPANY_NAME,
      bankName: 'HDFC Bank',
      branchName: 'Taramani Chennai',
      accountNumber: `KMX-${randomBytes(4).toString('hex').toUpperCase()}-01`,
      IFSCCode: 'HDFC0001234',
      accountType: 'current' as const,
      openingBalance: '1250000',
    },
    {
      accountHoldername: COMPANY_NAME,
      bankName: 'ICICI Bank',
      branchName: 'OMR Chennai',
      accountNumber: `KMX-${randomBytes(4).toString('hex').toUpperCase()}-02`,
      IFSCCode: 'ICIC0002345',
      accountType: 'current' as const,
      openingBalance: '380000',
    },
    {
      accountHoldername: COMPANY_NAME,
      bankName: 'State Bank of India',
      branchName: 'Adyar Chennai',
      accountNumber: `KMX-${randomBytes(4).toString('hex').toUpperCase()}-03`,
      IFSCCode: 'SBIN0003456',
      accountType: 'savings' as const,
      openingBalance: '215000',
    },
  ];
  type Bank = { id: string; name: string; balance: number };
  const banks: Bank[] = [];
  for (const b of bankSpecs) {
    const row = await prisma.bankDetail.create({
      data: {
        accountHoldername: b.accountHoldername,
        bankName: b.bankName,
        branchName: b.branchName,
        accountNumber: b.accountNumber,
        IFSCCode: b.IFSCCode,
        accountType: b.accountType,
        openingBalance: D(b.openingBalance),
        currentBalance: D(b.openingBalance),
        userId,
        tenantId,
        status: true,
      },
    });
    banks.push({ id: row.id, name: b.bankName, balance: Number(b.openingBalance) });
  }
  record('bankDetails', banks.length);

  // -------------------------------------------------------------------------
  // Chart of Accounts (24 — via existing helper, idempotent)
  // -------------------------------------------------------------------------
  const chart = await seedDefaultChart(prisma, userId);
  await prisma.account.updateMany({ where: { userId }, data: { tenantId } });
  record('accounts', chart.created + chart.skipped);

  // Helper to look up account id by code (for journal entries)
  const accountByCode: Record<string, string> = {};
  for (const a of await prisma.account.findMany({ where: { userId } })) {
    accountByCode[a.code] = a.id;
  }

  // -------------------------------------------------------------------------
  // ExpenseCategories (5) — tenant-scoped; "Demo " prefix for idempotent wipe
  // -------------------------------------------------------------------------
  const expCatDefs: Array<{
    title: string;
    taxClass: 'ALLOWABLE' | 'DISALLOWABLE' | 'CAPITAL' | 'PERSONAL' | 'UNCLASSIFIED';
    section43BNature?:
      | 'NONE'
      | 'BONUS'
      | 'PF_EMPLOYER'
      | 'ESI_EMPLOYER'
      | 'LEAVE_ENCASHMENT'
      | 'INTEREST_BANK'
      | 'TAX_DUTY_CESS'
      | 'OTHER_43B';
  }> = [
    { title: 'Demo Office Rent', taxClass: 'ALLOWABLE' },
    { title: 'Demo Utilities', taxClass: 'ALLOWABLE' },
    { title: 'Demo Software & Subscriptions', taxClass: 'ALLOWABLE' },
    { title: 'Demo Travel', taxClass: 'DISALLOWABLE' },
    { title: 'Demo Marketing', taxClass: 'UNCLASSIFIED' },
    { title: 'Demo Staff Bonus', taxClass: 'ALLOWABLE', section43BNature: 'BONUS' },
    { title: 'Demo Employer PF', taxClass: 'ALLOWABLE', section43BNature: 'PF_EMPLOYER' },
    { title: 'Demo Personal Drawings', taxClass: 'PERSONAL' },
    { title: 'Demo Capital Works', taxClass: 'CAPITAL' },
  ];
  const expCatNames = expCatDefs.map((d) => d.title);
  const expCats: Record<string, string> = {};
  for (const def of expCatDefs) {
    const row = await prisma.expenseCategory.create({
      data: {
        title: def.title,
        status: true,
        taxClass: def.taxClass,
        section43BNature: def.section43BNature ?? 'NONE',
        userId,
        tenantId,
      },
    });
    expCats[def.title] = row.id;
  }
  record('expenseCategories', expCatNames.length);

  // -------------------------------------------------------------------------
  // Invoices (~18) — diverse mix
  // -------------------------------------------------------------------------
  // Build a small library of "applied taxes" sets so we can stamp them into items[]
  const TN_INTRA = [
    { taxRateId: taxRateByName['CGST 9%'].id, name: 'CGST 9%', kind: 'CGST', percent: 9 },
    { taxRateId: taxRateByName['SGST 9%'].id, name: 'SGST 9%', kind: 'SGST', percent: 9 },
  ];
  const INTER = [{ taxRateId: taxRateByName['IGST 18%'].id, name: 'IGST 18%', kind: 'IGST', percent: 18 }];

  type InvoiceItem = {
    productId: string;
    productName: string;
    description: string;
    qty: number;
    rate: number;
    discount: number;
    taxableAmount: number;
    taxes: Array<{ taxRateId: string; name: string; kind: string; percent: number; amount: number }>;
    totalTax: number;
    lineTotal: number;
  };

  function buildLine(
    productIdx: number,
    qty: number,
    appliedTaxes: typeof TN_INTRA | typeof INTER,
  ): InvoiceItem {
    const p = products[productIdx];
    const taxable = round2(qty * p.sell);
    const taxes = appliedTaxes.map((t) => ({
      ...t,
      amount: round2((taxable * t.percent) / 100),
    }));
    const totalTax = round2(taxes.reduce((s, t) => s + t.amount, 0));
    return {
      productId: p.id,
      productName: p.name,
      description: p.name,
      qty,
      rate: p.sell,
      discount: 0,
      taxableAmount: taxable,
      taxes,
      totalTax,
      lineTotal: round2(taxable + totalTax),
    };
  }

  type InvoiceSpec = {
    customerIdx: number;
    items: InvoiceItem[];
    status: 'PAID' | 'UNPAID' | 'OVERDUE' | 'PARTIALLY_PAID' | 'DRAFT' | 'SENT';
    daysAgo: number;
    dueDateOffset: number;
    invoiceType?: 'INVOICE' | 'PROFORMA';
  };

  const invoiceSpecs: InvoiceSpec[] = [
    // PAID (5) — mostly Tamil Nadu intra-state
    { customerIdx: 0, items: [buildLine(0, 2, TN_INTRA), buildLine(2, 1, TN_INTRA)], status: 'PAID', daysAgo: 70, dueDateOffset: -55 },
    { customerIdx: 3, items: [buildLine(12, 40, TN_INTRA)], status: 'PAID', daysAgo: 55, dueDateOffset: -40 },
    { customerIdx: 4, items: [buildLine(3, 1, TN_INTRA), buildLine(4, 1, TN_INTRA)], status: 'PAID', daysAgo: 45, dueDateOffset: -30 },
    { customerIdx: 6, items: [buildLine(9, 1, TN_INTRA)], status: 'PAID', daysAgo: 35, dueDateOffset: -20 },
    { customerIdx: 1, items: [buildLine(13, 20, INTER), buildLine(15, 1, INTER)], status: 'PAID', daysAgo: 30, dueDateOffset: -15 },

    // UNPAID (3)
    { customerIdx: 2, items: [buildLine(14, 1, INTER)], status: 'UNPAID', daysAgo: 15, dueDateOffset: 15 },
    { customerIdx: 7, items: [buildLine(0, 1, INTER), buildLine(3, 1, INTER)], status: 'UNPAID', daysAgo: 10, dueDateOffset: 20 },
    { customerIdx: 5, items: [buildLine(16, 1, INTER), buildLine(13, 8, INTER)], status: 'UNPAID', daysAgo: 5, dueDateOffset: 25 },

    // OVERDUE (2)
    { customerIdx: 8, items: [buildLine(5, 1, INTER), buildLine(6, 2, INTER)], status: 'OVERDUE', daysAgo: 75, dueDateOffset: -45 },
    { customerIdx: 9, items: [buildLine(8, 2, INTER)], status: 'OVERDUE', daysAgo: 80, dueDateOffset: -50 },

    // PARTIALLY_PAID (2)
    { customerIdx: 0, items: [buildLine(1, 1, TN_INTRA), buildLine(2, 1, TN_INTRA)], status: 'PARTIALLY_PAID', daysAgo: 25, dueDateOffset: -10 },
    { customerIdx: 3, items: [buildLine(15, 1, TN_INTRA)], status: 'PARTIALLY_PAID', daysAgo: 20, dueDateOffset: 5 },

    // PROFORMA (2) — invoiceType=PROFORMA, status=DRAFT/SENT
    { customerIdx: 1, items: [buildLine(0, 5, INTER), buildLine(2, 5, INTER)], status: 'SENT', daysAgo: 8, dueDateOffset: 22, invoiceType: 'PROFORMA' },
    { customerIdx: 2, items: [buildLine(16, 1, INTER)], status: 'DRAFT', daysAgo: 6, dueDateOffset: 24, invoiceType: 'PROFORMA' },
  ];

  let invoiceCount = 0;
  let invoicePaymentCount = 0;
  type CreatedInv = { id: string; invoiceNumber: string; customerId: string; total: number; date: Date; status: string };
  const createdInvoices: CreatedInv[] = [];
  type TcsImportLine = {
    section: string;
    amount: number;
    pan: string | null;
    name: string;
    date: string;
    fyLabel: string;
    quarter: string;
  };
  const tcsImportLines: TcsImportLine[] = [];
  /** Accumulate TCS/TDS by fy|quarter for deposit challan seeding. */
  const taxByBucket = new Map<string, number>();
  const taxDocsByBucket = new Map<
    string,
    Array<{ sourceType: 'PURCHASE' | 'INVOICE'; sourceId: string; amount: number }>
  >();
  const addTaxBucket = (kind: 'TDS' | 'TCS', date: Date, amount: number) => {
    if (amount <= 0) return;
    const { fyLabel, quarter } = fyQuarterOf(date);
    const key = `${kind}|${fyLabel}|${quarter}`;
    taxByBucket.set(key, round2((taxByBucket.get(key) ?? 0) + amount));
  };
  const addTaxDoc = (
    kind: 'TDS' | 'TCS',
    date: Date,
    sourceType: 'PURCHASE' | 'INVOICE',
    sourceId: string,
    amount: number,
  ) => {
    if (amount <= 0) return;
    const { fyLabel, quarter } = fyQuarterOf(date);
    const key = `${kind}|${fyLabel}|${quarter}`;
    const arr = taxDocsByBucket.get(key) || [];
    arr.push({ sourceType, sourceId, amount: round2(amount) });
    taxDocsByBucket.set(key, arr);
  };

  let invSeq = 0;
  for (const spec of invoiceSpecs) {
    invSeq += 1;
    const totalTaxable = round2(spec.items.reduce((s, it) => s + it.taxableAmount, 0));
    const totalTax = round2(spec.items.reduce((s, it) => s + it.totalTax, 0));
    const totalAmount = round2(totalTaxable + totalTax);
    const invDate = daysAgo(spec.daysAgo);
    const dueDate = new Date(invDate.getTime() + spec.dueDateOffset * 24 * 60 * 60 * 1000);
    const customer = customers[spec.customerIdx];

    // Seed TCS on a few regular invoices for Form 27EQ worksheet demos (206C).
    const applyTcs =
      !spec.invoiceType &&
      (spec.status === 'PAID' || spec.status === 'SENT' || spec.status === 'PARTIALLY_PAID') &&
      (invSeq === 1 || invSeq === 3 || invSeq === 5);
    const tcsRate = 0.1;
    const tcsAmount = applyTcs ? round2((totalTaxable * tcsRate) / 100) : 0;
    if (applyTcs) {
      addTaxBucket('TCS', invDate, tcsAmount);
      const fq = fyQuarterOf(invDate);
      tcsImportLines.push({
        section: '206C(1H)',
        amount: tcsAmount,
        pan: customer.pan ?? panFromGstin(customer.gstin) ?? null,
        name: customer.name,
        date: invDate.toISOString().slice(0, 10),
        fyLabel: fq.fyLabel,
        quarter: fq.quarter,
      });
    }

    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: `KMX-INV-${String(invSeq).padStart(5, '0')}`,
        customerId: customer.id,
        invoiceDate: invDate,
        dueDate,
        items: spec.items as unknown as Prisma.InputJsonValue,
        status: spec.status,
        taxableAmount: D(totalTaxable),
        TotalAmount: D(totalAmount),
        vat: D(totalTax),
        ...(applyTcs
          ? {
              tcsSection: '206C(1H)',
              tcsRatePercent: D(tcsRate),
              tcsAmount: D(tcsAmount),
            }
          : {}),
        userId,
        tenantId,
        billFrom: userId,
        billTo: customer.id,
        invoiceType: spec.invoiceType ?? 'INVOICE',
        bankId: banks[0].id,
        notes: `Thank you for choosing ${COMPANY_NAME}.`,
        termsAndCondition: 'Payment due within terms shown above. Bank details on invoice.',
        warehouseId: whMain.id,
      },
    });
    if (applyTcs) addTaxDoc('TCS', invDate, 'INVOICE', inv.id, tcsAmount);
    createdInvoices.push({ id: inv.id, invoiceNumber: inv.invoiceNumber!, customerId: customer.id, total: totalAmount, date: invDate, status: spec.status });
    invoiceCount++;

    // Invoice payments for PAID and PARTIALLY_PAID
    if (spec.status === 'PAID') {
      await prisma.invoicePayment.create({
        data: {
          invoiceId: inv.id,
          amount: D(totalAmount),
          paymentModeId: pmBankId,
          bankId: banks[0].id,
          received_on: new Date(invDate.getTime() + 5 * 24 * 60 * 60 * 1000),
          notes: 'Full payment received via bank transfer.',
          received_by: userId,
        },
      });
      invoicePaymentCount++;
    } else if (spec.status === 'PARTIALLY_PAID') {
      await prisma.invoicePayment.create({
        data: {
          invoiceId: inv.id,
          amount: D(round2(totalAmount * 0.5)),
          paymentModeId: pmUpiId,
          bankId: banks[1].id,
          received_on: new Date(invDate.getTime() + 3 * 24 * 60 * 60 * 1000),
          notes: 'Partial payment (50%).',
          received_by: userId,
        },
      });
      invoicePaymentCount++;
    }
  }

  // Recurring parent + 2 children
  const recurringParentItems = [buildLine(14, 1, TN_INTRA)];
  const rpTaxable = round2(recurringParentItems.reduce((s, it) => s + it.taxableAmount, 0));
  const rpTax = round2(recurringParentItems.reduce((s, it) => s + it.totalTax, 0));
  const rpTotal = round2(rpTaxable + rpTax);
  const parentStartOn = daysAgo(90);
  invSeq += 1;
  const recurringParent = await prisma.invoice.create({
    data: {
      invoiceNumber: `KMX-INV-${String(invSeq).padStart(5, '0')}`,
      customerId: customers[3].id,
      invoiceDate: parentStartOn,
      dueDate: new Date(parentStartOn.getTime() + 15 * 24 * 60 * 60 * 1000),
      items: recurringParentItems as unknown as Prisma.InputJsonValue,
      status: 'PAID',
      taxableAmount: D(rpTaxable),
      TotalAmount: D(rpTotal),
      vat: D(rpTax),
      userId,
      tenantId,
      billFrom: userId,
      billTo: customers[3].id,
      bankId: banks[0].id,
      isRecurring: true,
      repeatEvery: 'month',
      startOn: parentStartOn,
      neverExpire: true,
      stopped: false,
      lastRecurringDate: daysAgo(30),
      nextRecurringDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      notes: 'Recurring monthly retainer (template).',
    },
  });
  invoiceCount++;

  for (let i = 0; i < 2; i++) {
    invSeq += 1;
    const childDate = daysAgo(60 - i * 30);
    const child = await prisma.invoice.create({
      data: {
        invoiceNumber: `KMX-INV-${String(invSeq).padStart(5, '0')}`,
        customerId: customers[3].id,
        invoiceDate: childDate,
        dueDate: new Date(childDate.getTime() + 15 * 24 * 60 * 60 * 1000),
        items: recurringParentItems as unknown as Prisma.InputJsonValue,
        status: 'PAID',
        taxableAmount: D(rpTaxable),
        TotalAmount: D(rpTotal),
        vat: D(rpTax),
        userId,
        tenantId,
        billFrom: userId,
        billTo: customers[3].id,
        bankId: banks[0].id,
        parentInvoice: recurringParent.id,
        notes: `Recurring child #${i + 1} of monthly retainer.`,
      },
    });
    await prisma.invoicePayment.create({
      data: {
        invoiceId: child.id,
        amount: D(rpTotal),
        paymentModeId: pmBankId,
        bankId: banks[0].id,
        received_on: new Date(childDate.getTime() + 5 * 24 * 60 * 60 * 1000),
        notes: 'Recurring monthly payment.',
        received_by: userId,
      },
    });
    invoiceCount++;
    invoicePaymentCount++;
  }
  record('invoices', invoiceCount);
  record('invoicePayments', invoicePaymentCount);

  // -------------------------------------------------------------------------
  // §269ST demo cash receipts (cl. 31) — dedicated invoices + cash modes
  // -------------------------------------------------------------------------
  {
    const stCustomer = customers[0];
    const stDay = daysAgo(12);
    const stUnderDay = daysAgo(8);
    const stSpecs: Array<{
      purchaseIdSuffix: string;
      amount: number;
      receivedOn: Date;
      note: string;
    }> = [
      {
        purchaseIdSuffix: 'ST01',
        amount: 250000,
        receivedOn: stDay,
        note: 'Demo §269ST single cash receipt over ₹2L',
      },
      {
        purchaseIdSuffix: 'ST02',
        amount: 120000,
        receivedOn: stDay,
        note: 'Demo §269ST same-day split A',
      },
      {
        purchaseIdSuffix: 'ST03',
        amount: 110000,
        receivedOn: stDay,
        note: 'Demo §269ST same-day split B',
      },
      {
        purchaseIdSuffix: 'ST04',
        amount: 150000,
        receivedOn: stUnderDay,
        note: 'Demo §269ST under-threshold cash receipt',
      },
    ];
    let stInvCount = 0;
    let stPayCount = 0;
    for (const spec of stSpecs) {
      invSeq += 1;
      const inv = await prisma.invoice.create({
        data: {
          invoiceNumber: `KMX-INV-ST-${spec.purchaseIdSuffix}`,
          customerId: stCustomer.id,
          invoiceDate: spec.receivedOn,
          dueDate: new Date(spec.receivedOn.getTime() + 15 * 24 * 60 * 60 * 1000),
          items: [
            {
              productId: products[0].id,
              productName: products[0].name,
              description: spec.note,
              qty: 1,
              rate: spec.amount,
              discount: 0,
              taxableAmount: spec.amount,
              taxes: [],
              totalTax: 0,
              lineTotal: spec.amount,
            },
          ] as unknown as Prisma.InputJsonValue,
          status: 'PAID',
          taxableAmount: D(spec.amount),
          TotalAmount: D(spec.amount),
          vat: D(0),
          userId,
          tenantId,
          billFrom: userId,
          billTo: stCustomer.id,
          bankId: banks[0].id,
          warehouseId: whMain.id,
          notes: spec.note,
        },
      });
      await prisma.invoicePayment.create({
        data: {
          invoiceId: inv.id,
          tenantId,
          amount: D(spec.amount),
          paymentModeId: pmCashId,
          bankId: banks[0].id,
          received_on: spec.receivedOn,
          notes: spec.note,
          received_by: userId,
        },
      });
      stInvCount += 1;
      stPayCount += 1;
      invoiceCount += 1;
      invoicePaymentCount += 1;
    }
    record('section269StInvoices', stInvCount);
    record('section269StPayments', stPayCount);
    // Refresh recorded invoice/payment totals after §269ST demos.
    record('invoices', invoiceCount);
    record('invoicePayments', invoicePaymentCount);
  }

  // -------------------------------------------------------------------------
  // Purchases (6)
  // -------------------------------------------------------------------------
  let purchaseCount = 0;
  type CreatedPur = { id: string; purchaseId: string; supplierName: string; total: number; date: Date; status: string };
  const createdPurchases: CreatedPur[] = [];
  type TdsImportLine = {
    section: string;
    amount: number;
    pan: string | null;
    name: string;
    date: string;
    fyLabel: string;
    quarter: string;
  };
  const tdsImportLines: TdsImportLine[] = [];
  for (let i = 0; i < 6; i++) {
    const supplier = suppliers[i % suppliers.length];
    const pProduct = products[(i + 5) % products.length];
    const qty = 5 + i;
    const taxable = round2(qty * pProduct.buy);
    const tax = round2((taxable * 18) / 100);
    const total = round2(taxable + tax);
    const statuses = ['paid', 'paid', 'partially_paid', 'pending', 'pending', 'completed'] as const;
    // Pending MSME bills (i=3,4) dated >45 days ago for §43B(h) unpaid demo.
    const purDate = statuses[i] === 'pending' ? daysAgo(90 - (i - 3) * 5) : daysAgo(60 - i * 9);
    const dueDate = new Date(purDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Seed TDS on first 3 purchases for Form 26Q worksheet demos (194C / 194J).
    const tdsSpecs = [
      { section: '194C', rate: 1 },
      { section: '194J', rate: 10 },
      { section: '194C', rate: 2 },
    ] as const;
    const tds = i < tdsSpecs.length
      ? { section: tdsSpecs[i].section, rate: tdsSpecs[i].rate, amount: round2((taxable * tdsSpecs[i].rate) / 100) }
      : null;
    if (tds) {
      addTaxBucket('TDS', purDate, tds.amount);
      const fq = fyQuarterOf(purDate);
      tdsImportLines.push({
        section: tds.section,
        amount: tds.amount,
        pan: supplier.pan,
        name: supplier.name,
        date: purDate.toISOString().slice(0, 10),
        fyLabel: fq.fyLabel,
        quarter: fq.quarter,
      });
    }

    const purchase = await prisma.purchase.create({
      data: {
        purchaseId: `KMX-PUR-${String(i + 1).padStart(5, '0')}`,
        vendorId: supplier.vendorUserId,
        purchaseDate: purDate,
        dueDate,
        status: statuses[i],
        items: [
          {
            productId: pProduct.id,
            productName: pProduct.name,
            description: pProduct.name,
            qty,
            rate: pProduct.buy,
            discount: 0,
            taxableAmount: taxable,
            taxes: [
              { taxRateId: taxRateByName['IGST 18%'].id, name: 'IGST 18%', kind: 'IGST', percent: 18, amount: tax },
            ],
            totalTax: tax,
            lineTotal: total,
          },
        ] as unknown as Prisma.InputJsonValue,
        paymentModeId: pmBankId,
        taxableAmount: D(taxable),
        totalDiscount: D(0),
        totalTax: D(tax),
        totalAmount: D(total),
        ...(tds
          ? {
              tdsSection: tds.section,
              tdsRatePercent: D(tds.rate),
              tdsAmount: D(tds.amount),
            }
          : {}),
        paidAmount: statuses[i] === 'paid' || statuses[i] === 'completed' ? D(total) : statuses[i] === 'partially_paid' ? D(round2(total / 2)) : D(0),
        balanceAmount: statuses[i] === 'paid' || statuses[i] === 'completed' ? D(0) : statuses[i] === 'partially_paid' ? D(round2(total / 2)) : D(total),
        bankId: banks[i % banks.length].id,
        warehouseId: whMain.id,
        userId,
        tenantId,
        billFrom: userId,
        billTo: supplier.vendorUserId,
        notes: `Stock / service purchase from ${supplier.name}.`,
      },
    });
    purchaseCount++;
    if (tds) addTaxDoc('TDS', purDate, 'PURCHASE', purchase.id, tds.amount);
    createdPurchases.push({
      id: purchase.id,
      purchaseId: purchase.purchaseId!,
      supplierName: supplier.name,
      total,
      date: purDate,
      status: statuses[i],
    });
    // Supplier payment for the paid ones
    if (statuses[i] === 'paid' || statuses[i] === 'completed' || statuses[i] === 'partially_paid') {
      // i=2 MSME partial payment delayed past 45 days for §43B(h) late-pay review demo.
      const payDelayDays = i === 2 ? 60 : 7;
      await prisma.supplierPayment.create({
        data: {
          paymentId: `KMX-PAY-${String(i + 1).padStart(5, '0')}`,
          purchaseId: purchase.id,
          supplierId: supplier.vendorUserId,
          tenantId,
          paymentDate: new Date(purDate.getTime() + payDelayDays * 24 * 60 * 60 * 1000),
          paymentModeId: pmBankId,
          sourceType: 'BANK',
          bankId: banks[i % banks.length].id,
          amount: statuses[i] === 'partially_paid' ? round2(total / 2) : total,
          paidAmount: statuses[i] === 'partially_paid' ? round2(total / 2) : total,
          dueAmount: statuses[i] === 'partially_paid' ? round2(total / 2) : 0,
          notes: `Payment to ${supplier.name}.`,
          createdBy: userId,
        },
      });
    }
  }
  // §40(a)(ia) resident + §40(a)(i) NR demos — excluded from taxByBucket / challan map
  {
    const iaVendor = suppliers[1]; // resident (TechSource)
    const aiVendor = suppliers[0]; // non-resident (Pinnacle)
    const demoProduct = products[0];
    const demoSpecs: Array<{
      purchaseId: string;
      vendor: Supp;
      taxable: number;
      section: string;
      rate: number;
      tdsAmount: number;
      days: number;
      note: string;
      /** Optional §40A(2) FMV tag (excess = invoice total − FMV). */
      section40A2FairMarketValue?: number;
      section40A2FmvNote?: string;
    }> = [
      {
        purchaseId: 'KMX-PUR-00007',
        vendor: iaVendor,
        taxable: 50000,
        section: '194C',
        rate: 1,
        tdsAmount: 500,
        days: 33,
        note: 'Demo §40(a)(ia) NON_DEPOSIT — resident TDS deducted, no challan map',
        // Invoice total 59,000; FMV 54,000 → putative excess 5,000
        section40A2FairMarketValue: 54000,
        section40A2FmvNote: 'Demo §40A(2) FMV tag — books excess review',
      },
      {
        purchaseId: 'KMX-PUR-00008',
        vendor: iaVendor,
        taxable: 40000,
        section: '194J',
        rate: 10,
        tdsAmount: 0,
        days: 31,
        note: 'Demo §40(a)(ia) NON_DEDUCTION — resident section tagged, TDS not deducted',
      },
      {
        purchaseId: 'KMX-PUR-00009',
        vendor: aiVendor,
        taxable: 60000,
        section: '195',
        rate: 10,
        tdsAmount: 6000,
        days: 29,
        note: 'Demo §40(a)(i) NON_DEPOSIT — NR TDS deducted, no challan map',
      },
      {
        purchaseId: 'KMX-PUR-00010',
        vendor: aiVendor,
        taxable: 35000,
        section: '195',
        rate: 10,
        tdsAmount: 0,
        days: 26,
        note: 'Demo §40(a)(i) NON_DEDUCTION — NR section tagged, TDS not deducted',
      },
    ];
    for (const spec of demoSpecs) {
      const tax = round2((spec.taxable * 18) / 100);
      const total = round2(spec.taxable + tax);
      const purDate = daysAgo(spec.days);
      await prisma.purchase.create({
        data: {
          purchaseId: spec.purchaseId,
          vendorId: spec.vendor.vendorUserId,
          purchaseDate: purDate,
          dueDate: new Date(purDate.getTime() + 30 * 24 * 60 * 60 * 1000),
          status: 'paid',
          items: [
            {
              productId: demoProduct.id,
              productName: demoProduct.name,
              description: demoProduct.name,
              qty: 1,
              rate: spec.taxable,
              discount: 0,
              taxableAmount: spec.taxable,
              taxes: [
                {
                  taxRateId: taxRateByName['IGST 18%'].id,
                  name: 'IGST 18%',
                  kind: 'IGST',
                  percent: 18,
                  amount: tax,
                },
              ],
              totalTax: tax,
              lineTotal: total,
            },
          ] as unknown as Prisma.InputJsonValue,
          paymentModeId: pmBankId,
          taxableAmount: D(spec.taxable),
          totalDiscount: D(0),
          totalTax: D(tax),
          totalAmount: D(total),
          tdsSection: spec.section,
          tdsRatePercent: D(spec.rate),
          tdsAmount: D(spec.tdsAmount),
          paidAmount: D(total),
          balanceAmount: D(0),
          bankId: banks[0].id,
          warehouseId: whMain.id,
          userId,
          tenantId,
          billFrom: userId,
          billTo: spec.vendor.vendorUserId,
          notes: spec.note,
          ...(spec.section40A2FairMarketValue != null
            ? {
                section40A2FairMarketValue: D(spec.section40A2FairMarketValue),
                section40A2FmvNote: spec.section40A2FmvNote ?? null,
              }
            : {}),
        },
      });
      purchaseCount++;
    }
  }
  record('purchases', purchaseCount);

  // -------------------------------------------------------------------------
  // Tax deposit challans (TDS/TCS) — cover seeded books totals per FY quarter
  // -------------------------------------------------------------------------
  let taxDepositChallanCount = 0;
  let taxDepositChallanAllocCount = 0;
  let taxDepositChallanSeq = 0;
  const tdsChallanNoByQuarter = new Map<string, string>();
  const tcsChallanNoByQuarter = new Map<string, string>();
  for (const [key, amount] of taxByBucket.entries()) {
    const [kind, fyLabel, quarter] = key.split('|') as ['TDS' | 'TCS', string, string];
    taxDepositChallanSeq += 1;
    // Keep TDS deposit dates inside the purchase TDS window so 26AS period overlap works.
    const depositDate = daysAgo(kind === 'TDS' ? 45 : 28);
    const challanNo = `KMX-${kind}-${String(taxDepositChallanSeq).padStart(6, '0')}`;
    const challan = await prisma.taxDepositChallan.create({
      data: {
        userId,
        tenantId,
        kind,
        fyLabel,
        quarter,
        section: kind === 'TDS' ? '194C' : '206C(1H)',
        bsrCode: kind === 'TDS' ? '0510308' : '0510312',
        challanNo,
        depositDate,
        amount: D(amount),
        notes: `Demo ${kind} deposit covering books ${fyLabel} ${quarter}`,
      },
    });
    const docs = taxDocsByBucket.get(key) || [];
    for (const doc of docs) {
      await prisma.taxDepositChallanAllocation.create({
        data: {
          challanId: challan.id,
          sourceType: doc.sourceType,
          sourceId: doc.sourceId,
          amount: D(doc.amount),
          userId,
          tenantId,
        },
      });
      taxDepositChallanAllocCount += 1;
    }
    if (kind === 'TDS') {
      tdsChallanNoByQuarter.set(`${fyLabel}|${quarter}`, challanNo);
    } else {
      tcsChallanNoByQuarter.set(`${fyLabel}|${quarter}`, challanNo);
    }
    taxDepositChallanCount += 1;
  }
  record('taxDepositChallans', taxDepositChallanCount);
  record('taxDepositChallanAllocations', taxDepositChallanAllocCount);

  // -------------------------------------------------------------------------
  // Form 26AS stub import — purchase TDS + invoice TCS + deposit challan nos
  // -------------------------------------------------------------------------
  if (tdsImportLines.length > 0 || tcsImportLines.length > 0) {
    const tdsLines = tdsImportLines.map((l) => ({
      section: l.section,
      amount: l.amount,
      pan: l.pan,
      name: l.name,
      date: l.date,
      challanNo: tdsChallanNoByQuarter.get(`${l.fyLabel}|${l.quarter}`) || null,
    }));
    const tcsLines = tcsImportLines.map((l) => ({
      section: l.section,
      amount: l.amount,
      pan: l.pan,
      name: l.name,
      date: l.date,
      challanNo: tcsChallanNoByQuarter.get(`${l.fyLabel}|${l.quarter}`) || null,
    }));
    const lines = [...tdsLines, ...tcsLines];
    const dates = lines.map((l) => l.date).sort();
    await prisma.form26AsImport.create({
      data: {
        userId,
        tenantId,
        periodFrom: new Date(`${dates[0]}T00:00:00.000Z`),
        periodTo: new Date(`${dates[dates.length - 1]}T23:59:59.999Z`),
        label: 'Demo Form 26AS (portal stub)',
        notes:
          'Seeded from purchase TDS + invoice TCS + deposit challans — stub, not AIS download.',
        lines: lines as unknown as Prisma.InputJsonValue,
      },
    });
    record('form26AsImports', 1);
  }

  // -------------------------------------------------------------------------
  // Advance tax payments (books tracker + GL when ledger live)
  // -------------------------------------------------------------------------
  {
    const { fyLabel } = fyQuarterOf(new Date());
    const y1 = Number(fyLabel.slice(0, 4));
    const advanceRows = [
      {
        installment: 'Q1',
        amount: 45000,
        dueDate: new Date(`${y1}-06-15T00:00:00.000Z`),
        paidDate: new Date(`${y1}-06-14T00:00:00.000Z`),
        challanNo: 'AT-Q1-DEMO',
        notes: 'Demo Q1 advance tax (15%)',
      },
      {
        installment: 'Q2',
        amount: 90000,
        dueDate: new Date(`${y1}-09-15T00:00:00.000Z`),
        paidDate: daysAgo(20),
        challanNo: 'AT-Q2-DEMO',
        notes: 'Demo Q2 advance tax (additional to reach 45%)',
      },
    ];
    for (const r of advanceRows) {
      await prisma.advanceTaxPayment.create({
        data: {
          userId,
          tenantId,
          fyLabel,
          installment: r.installment,
          dueDate: r.dueDate,
          paidDate: r.paidDate,
          amount: D(r.amount),
          challanNo: r.challanNo,
          notes: r.notes,
        },
      });
    }
    record('advanceTaxPayments', advanceRows.length);

    const paidTotal = advanceRows.reduce((s, r) => s + r.amount, 0);
    const provisionAmount = 200000;
    const setoffAmount = Math.min(paidTotal, provisionAmount);
    await prisma.advanceTaxSetoff.create({
      data: {
        userId,
        tenantId,
        fyLabel,
        setoffDate: new Date(`${y1 + 1}-03-31T00:00:00.000Z`),
        provisionAmount: D(provisionAmount),
        setoffAmount: D(setoffAmount),
        notes: 'Demo year-end setoff — books only, not ITR / OLTAS',
      },
    });
    record('advanceTaxSetoffs', 1);

    const stillPayable = Math.max(0, provisionAmount - setoffAmount);
    // Demo 234B/C books provision (matches estimate at liability 200k / advance 135k).
    const amount234C = 1100;
    const amount234B = 2600;
    const interestTotal = amount234C + amount234B;
    await prisma.interest234Provision.create({
      data: {
        userId,
        tenantId,
        fyLabel,
        provisionDate: new Date(`${y1 + 1}-07-31T00:00:00.000Z`),
        amount234B: D(amount234B),
        amount234C: D(amount234C),
        totalAmount: D(interestTotal),
        estimatedLiabilitySnapshot: D(provisionAmount),
        advanceTaxPaidSnapshot: D(paidTotal),
        asOfDate: new Date(`${y1 + 1}-07-31T00:00:00.000Z`),
        notes: 'Demo interest u/s 234B/C provision — books only, not CPC / ITR',
      },
    });
    record('interest234Provisions', 1);

    const satTotal = stillPayable + interestTotal;
    if (satTotal > 0) {
      await prisma.selfAssessmentTaxPayment.create({
        data: {
          userId,
          tenantId,
          fyLabel,
          paidDate: new Date(`${y1 + 1}-07-31T00:00:00.000Z`),
          amount: D(satTotal),
          challanNo: 'SAT-DEMO-001',
          notes:
            'Demo self-assessment tax clearing remaining tax + interest 234B/C payable — books only',
        },
      });
      record('selfAssessmentTaxPayments', 1);
    }
  }

  // -------------------------------------------------------------------------
  // Tax-audit other receipts (manual non-invoice income)
  // -------------------------------------------------------------------------
  {
    const otherReceipts = [
      {
        description: 'Bank interest (FD)',
        amount: 18500,
        taxClass: 'OTHER' as const,
        receiptDate: daysAgo(40),
        notes: 'Demo other receipt — not from invoices',
      },
      {
        description: 'Scrap sale proceeds',
        amount: 7200,
        taxClass: 'BUSINESS' as const,
        receiptDate: daysAgo(25),
        notes: null,
      },
    ];
    for (const r of otherReceipts) {
      await prisma.taxAuditOtherReceipt.create({
        data: {
          userId,
          tenantId,
          receiptDate: r.receiptDate,
          description: r.description,
          amount: D(r.amount),
          taxClass: r.taxClass,
          notes: r.notes,
        },
      });
    }
    record('taxAuditOtherReceipts', otherReceipts.length);
  }

  // -------------------------------------------------------------------------
  // Salary TDS (Form 24Q) — employees + u/s 192 lines + deposit challan map
  // -------------------------------------------------------------------------
  {
    const empSpecs = [
      { name: 'Ananya Krishnan', pan: 'AABPA1122K', employeeCode: 'EMP-001' },
      { name: 'Vikram Subramanian', pan: 'AABPV3344M', employeeCode: 'EMP-002' },
    ];
    const employees: Array<{ id: string; name: string; pan: string }> = [];
    for (const e of empSpecs) {
      const row = await prisma.salaryTdsEmployee.create({
        data: {
          userId,
          tenantId,
          name: e.name,
          pan: e.pan,
          employeeCode: e.employeeCode,
        },
      });
      employees.push({ id: row.id, name: row.name, pan: e.pan });
    }
    record('salaryTdsEmployees', employees.length);

    const dedSpecs: Array<{
      emp: number;
      payDate: Date;
      amountPaid: number;
      tdsAmount: number;
      employeePfAmount: number;
      employeeEsiAmount?: number;
      /** §36(1)(va): on-time | undeposited | late */
      pfDeposit?: 'on-time' | 'undeposited' | 'late';
      esiDeposit?: 'on-time' | 'undeposited' | 'late';
    }> = [
      {
        emp: 0,
        payDate: daysAgo(70),
        amountPaid: 85000,
        tdsAmount: 6500,
        employeePfAmount: 10200,
        employeeEsiAmount: 570,
        pfDeposit: 'on-time',
        esiDeposit: 'late',
      },
      {
        emp: 0,
        payDate: daysAgo(40),
        amountPaid: 85000,
        tdsAmount: 6500,
        employeePfAmount: 10200,
        pfDeposit: 'on-time',
      },
      {
        emp: 1,
        payDate: daysAgo(65),
        amountPaid: 72000,
        tdsAmount: 4200,
        employeePfAmount: 8640,
        pfDeposit: 'undeposited',
      },
      {
        emp: 1,
        payDate: daysAgo(35),
        amountPaid: 72000,
        tdsAmount: 4200,
        employeePfAmount: 8640,
        pfDeposit: 'on-time',
      },
    ];
    const deductionIds: string[] = [];
    let salaryTdsTotal = 0;
    for (const d of dedSpecs) {
      const pfDue = new Date(
        Date.UTC(d.payDate.getUTCFullYear(), d.payDate.getUTCMonth() + 1, 15, 23, 59, 59, 999),
      );
      const esiDue = pfDue;
      const depositFor = (mode: 'on-time' | 'undeposited' | 'late' | undefined, due: Date) => {
        if (!mode || mode === 'undeposited') return null;
        if (mode === 'late') return new Date(due.getTime() + 10 * 24 * 60 * 60 * 1000);
        return new Date(due.getTime() - 5 * 24 * 60 * 60 * 1000);
      };
      const row = await prisma.salaryTdsDeduction.create({
        data: {
          userId,
          tenantId,
          employeeId: employees[d.emp].id,
          payDate: d.payDate,
          amountPaid: D(d.amountPaid),
          tdsAmount: D(d.tdsAmount),
          section: '192',
          notes: 'Demo salary TDS u/s 192 + §36(1)(va) employee PF/ESI tags',
          employeePfAmount: D(d.employeePfAmount),
          employeeEsiAmount:
            d.employeeEsiAmount != null ? D(d.employeeEsiAmount) : null,
          pfDueDate: pfDue,
          pfDepositedDate: depositFor(d.pfDeposit, pfDue),
          esiDueDate: d.employeeEsiAmount != null ? esiDue : null,
          esiDepositedDate:
            d.employeeEsiAmount != null ? depositFor(d.esiDeposit, esiDue) : null,
        },
      });
      deductionIds.push(row.id);
      salaryTdsTotal += d.tdsAmount;
    }
    record('salaryTdsDeductions', deductionIds.length);

    const { fyLabel, quarter } = fyQuarterOf(daysAgo(40));
    const salaryChallanNo = `KMX-SAL-${fyLabel.replace('-', '')}-${quarter}`;
    const salaryChallan = await prisma.taxDepositChallan.create({
      data: {
        userId,
        tenantId,
        kind: 'TDS',
        fyLabel,
        quarter,
        section: '192',
        bsrCode: '0510320',
        challanNo: salaryChallanNo,
        depositDate: daysAgo(30),
        amount: D(salaryTdsTotal),
        notes: 'Demo salary TDS deposit covering Form 24Q lines',
      },
    });
    for (let i = 0; i < deductionIds.length; i++) {
      await prisma.taxDepositChallanAllocation.create({
        data: {
          challanId: salaryChallan.id,
          sourceType: 'SALARY',
          sourceId: deductionIds[i],
          amount: D(dedSpecs[i].tdsAmount),
          userId,
          tenantId,
        },
      });
    }
    record('salaryTdsChallanAllocations', deductionIds.length);

    // Append salary TDS lines into Form 26AS stub (created earlier from purchase TDS).
    const existing26as = await prisma.form26AsImport.findFirst({
      where: { userId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
    if (existing26as) {
      const prev = Array.isArray(existing26as.lines) ? (existing26as.lines as unknown[]) : [];
      const salaryLines = dedSpecs.map((d) => ({
        section: '192',
        amount: d.tdsAmount,
        pan: employees[d.emp].pan,
        name: employees[d.emp].name,
        date: d.payDate.toISOString().slice(0, 10),
        challanNo: salaryChallanNo,
      }));
      const allDates = [
        ...salaryLines.map((l) => l.date),
        existing26as.periodFrom.toISOString().slice(0, 10),
        existing26as.periodTo.toISOString().slice(0, 10),
      ].sort();
      await prisma.form26AsImport.update({
        where: { id: existing26as.id },
        data: {
          lines: [...prev, ...salaryLines] as unknown as Prisma.InputJsonValue,
          periodFrom: new Date(`${allDates[0]}T00:00:00.000Z`),
          periodTo: new Date(`${allDates[allDates.length - 1]}T23:59:59.999Z`),
          notes:
            'Seeded from purchase TDS + salary TDS + invoice TCS + deposit challans — stub, not AIS download.',
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Clause 34(b) TDS/TCS return-filed books flags (not TRACES / CPC)
  // Leave one applicable 26Q quarter unfiled for pack demo.
  // -------------------------------------------------------------------------
  {
    const nrEmails = new Set(
      (await prisma.supplier.findMany({
        where: { user_id: userId, isDeleted: false, isNonResident: true },
        select: { supplier_email: true },
      }))
        .map((s) => s.supplier_email.trim().toLowerCase())
        .filter(Boolean),
    );
    const [purRows, salRows, invRows] = await Promise.all([
      prisma.purchase.findMany({
        where: {
          userId,
          tenantId,
          isDeleted: false,
          status: { not: 'cancelled' },
          tdsAmount: { gt: 0 },
        },
        select: {
          purchaseDate: true,
          billToUser: { select: { email: true } },
          vendor: { select: { email: true } },
        },
      }),
      prisma.salaryTdsDeduction.findMany({
        where: { userId, tenantId, isDeleted: false, tdsAmount: { gt: 0 } },
        select: { payDate: true },
      }),
      prisma.invoice.findMany({
        where: {
          userId,
          tenantId,
          isDeleted: false,
          invoiceType: 'INVOICE',
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          tcsAmount: { gt: 0 },
        },
        select: { invoiceDate: true },
      }),
    ]);

    const keySet = new Set<string>();
    for (const p of purRows) {
      const email = (p.billToUser?.email || p.vendor?.email || '').trim().toLowerCase();
      const form = email && nrEmails.has(email) ? '27Q' : '26Q';
      const { fyLabel, quarter } = fyQuarterOf(p.purchaseDate);
      keySet.add(`${form}|${fyLabel}|${quarter}`);
    }
    for (const d of salRows) {
      const { fyLabel, quarter } = fyQuarterOf(d.payDate);
      keySet.add(`24Q|${fyLabel}|${quarter}`);
    }
    for (const inv of invRows) {
      const { fyLabel, quarter } = fyQuarterOf(inv.invoiceDate);
      keySet.add(`27EQ|${fyLabel}|${quarter}`);
    }

    const unfiledKey = [...keySet].find((k) => k.startsWith('26Q|')) || null;
    let filingCount = 0;
    let seq = 0;
    for (const key of [...keySet].sort()) {
      const [form, fyLabel, quarter] = key.split('|');
      const isFiled = key !== unfiledKey;
      seq += 1;
      await prisma.tdsTcsReturnFiling.create({
        data: {
          userId,
          tenantId,
          fyLabel,
          form,
          quarter,
          isFiled,
          filedDate: isFiled ? daysAgo(10) : null,
          acknowledgementNo: isFiled ? `KMX-ACK-${form}-${quarter}-${seq}` : null,
          notes: isFiled
            ? 'Demo books return-filed flag — not TRACES / CPC'
            : 'Demo unfiled applicable quarter for clause 34(b)',
        },
      });
      filingCount += 1;
    }
    record('tdsTcsReturnFilings', filingCount);
  }

  // -------------------------------------------------------------------------
  // Expenses (12) — 2 recurring parents + 2 children + 8 one-off
  // -------------------------------------------------------------------------
  let expenseCount = 0;

  // Recurring parent: Office Rent (monthly)
  const rentParent = await prisma.expense.create({
    data: {
      expenseId: `KMX-EXP-${String(1).padStart(5, '0')}`,
      amount: D(45000),
      expenseDate: daysAgo(90),
      paymentModeId: pmBankId,
      paymentStatus: 'PAID',
      description: 'Monthly office rent — Chennai HQ (recurring template).',
      expenseCategoryId: expCats['Demo Office Rent'],
      sourceType: 'BANK',
      bankId: banks[0].id,
      userId,
      isRecurring: true,
      repeatEvery: 'month',
      startOn: daysAgo(90),
      neverExpire: true,
      stopped: false,
      lastRecurringDate: daysAgo(30),
      nextRecurringDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
  });
  expenseCount++;

  // Recurring parent: Internet (monthly)
  const internetParent = await prisma.expense.create({
    data: {
      expenseId: `KMX-EXP-${String(2).padStart(5, '0')}`,
      amount: D(3500),
      expenseDate: daysAgo(85),
      paymentModeId: pmUpiId,
      paymentStatus: 'PAID',
      description: 'Monthly internet — leased line (recurring template).',
      expenseCategoryId: expCats['Demo Utilities'],
      sourceType: 'BANK',
      bankId: banks[1].id,
      supplierId: suppliers[3].id,
      userId,
      isRecurring: true,
      repeatEvery: 'month',
      startOn: daysAgo(85),
      neverExpire: true,
      stopped: false,
      lastRecurringDate: daysAgo(25),
      nextRecurringDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });
  expenseCount++;

  // 2 children for rent (monthly)
  for (let i = 0; i < 2; i++) {
    await prisma.expense.create({
      data: {
        expenseId: `KMX-EXP-${String(3 + i).padStart(5, '0')}`,
        amount: D(45000),
        expenseDate: daysAgo(60 - i * 30),
        paymentModeId: pmBankId,
        paymentStatus: 'PAID',
        description: `Monthly office rent — month ${i + 1}.`,
        expenseCategoryId: expCats['Demo Office Rent'],
        sourceType: 'BANK',
        bankId: banks[0].id,
        userId,
        parentExpense: rentParent.id,
      },
    });
    expenseCount++;
  }

  // 1 child for internet
  await prisma.expense.create({
    data: {
      expenseId: `KMX-EXP-${String(5).padStart(5, '0')}`,
      amount: D(3500),
      expenseDate: daysAgo(55),
      paymentModeId: pmUpiId,
      paymentStatus: 'PAID',
      description: 'Monthly internet — last month.',
      expenseCategoryId: expCats['Demo Utilities'],
      sourceType: 'BANK',
      bankId: banks[1].id,
      supplierId: suppliers[3].id,
      userId,
      parentExpense: internetParent.id,
    },
  });
  expenseCount++;

  // Mixed one-offs + §40A(3): 1 cash > ₹10k + same-day split (one with Rule 6DD tag)
  const oneOffSpecs: Array<{
    amt: number;
    cat: string;
    desc: string;
    supp: number | null;
    status: string;
    pm: string;
    days: number;
    sourceType?: 'BANK' | 'PETTY_CASH';
    rule6DdExceptionCode?: string;
    paidDate?: Date;
    section40A2FairMarketValue?: number;
    section40A2FmvNote?: string;
  }> = [
    { amt: 12500, cat: 'Demo Software & Subscriptions', desc: 'Adobe Creative Cloud annual subscription', supp: 3, status: 'PAID', pm: pmCardId, days: 50 },
    { amt: 8500, cat: 'Demo Travel', desc: 'Client visit Mumbai — flight + cab', supp: null, status: 'PAID', pm: pmCardId, days: 40 },
    { amt: 22000, cat: 'Demo Marketing', desc: 'Q1 digital marketing campaign', supp: null, status: 'PAID', pm: pmBankId, days: 38 },
    { amt: 1850, cat: 'Demo Utilities', desc: 'Electricity bill', supp: null, status: 'PAID', pm: pmUpiId, days: 22 },
    { amt: 5400, cat: 'Demo Software & Subscriptions', desc: 'GitHub Enterprise — 1 month', supp: null, status: 'PAID', pm: pmCardId, days: 18 },
    { amt: 6700, cat: 'Demo Travel', desc: 'Client visit Bangalore — train + hotel', supp: null, status: 'PENDING', pm: pmCardId, days: 8 },
    { amt: 15000, cat: 'Demo Marketing', desc: 'Social media boost (LinkedIn ads)', supp: null, status: 'PENDING', pm: pmCardId, days: 3 },
    {
      amt: 18500,
      cat: 'Demo Travel',
      desc: 'Cash site expenses — vendor labour (demo §40A(3) single)',
      supp: null,
      status: 'PAID',
      pm: pmCashId,
      days: 28,
      sourceType: 'PETTY_CASH',
    },
    {
      amt: 6000,
      cat: 'Demo Travel',
      desc: 'Cash materials — split A (demo §40A(3) day+payee)',
      supp: 1,
      status: 'PAID',
      pm: pmCashId,
      days: 27,
      sourceType: 'PETTY_CASH' as const,
      // Related-party TechSource: FMV 4,000 → putative excess 2,000
      section40A2FairMarketValue: 4000,
      section40A2FmvNote: 'Demo §40A(2) FMV tag on related-party expense',
    },
    {
      amt: 6000,
      cat: 'Demo Travel',
      desc: 'Cash materials — split B (demo Rule 6DD BANK_ACCOUNT exception)',
      supp: 1,
      status: 'PAID',
      pm: pmCashId,
      days: 27,
      sourceType: 'PETTY_CASH' as const,
      rule6DdExceptionCode: 'BANK_ACCOUNT',
    },
    {
      amt: 8000,
      cat: 'Demo Personal Drawings',
      desc: 'Owner personal drawings (demo clause 21(a) PERSONAL)',
      supp: null,
      status: 'PAID',
      pm: pmBankId,
      days: 20,
    },
    {
      amt: 25000,
      cat: 'Demo Capital Works',
      desc: 'Office fit-out / capital works (demo clause 21(a) CAPITAL)',
      supp: null,
      status: 'PAID',
      pm: pmBankId,
      days: 55,
    },
    {
      amt: 50000,
      cat: 'Demo Staff Bonus',
      desc: 'FY staff performance bonus accrued — unpaid (demo §43B)',
      supp: null,
      status: 'PENDING',
      pm: pmBankId,
      days: 10,
    },
    (() => {
      const pfExpenseDate = daysAgo(45);
      const fyStartYear =
        pfExpenseDate.getUTCMonth() >= 3
          ? pfExpenseDate.getUTCFullYear()
          : pfExpenseDate.getUTCFullYear() - 1;
      // Paid after 31 Oct return due-date proxy for that FY end year.
      const paidDate = new Date(Date.UTC(fyStartYear + 1, 10, 15, 0, 0, 0, 0));
      return {
        amt: 12000,
        cat: 'Demo Employer PF',
        desc: 'Employer PF contribution paid after ITR due-date proxy (demo §43B late)',
        supp: null as number | null,
        status: 'PAID',
        pm: pmBankId,
        days: 45,
        paidDate,
      };
    })(),
  ];
  for (let i = 0; i < oneOffSpecs.length; i++) {
    const o = oneOffSpecs[i];
    await prisma.expense.create({
      data: {
        expenseId: `KMX-EXP-${String(6 + i).padStart(5, '0')}`,
        amount: D(o.amt),
        expenseDate: daysAgo(o.days),
        paymentModeId: o.pm,
        paymentStatus: o.status as 'PAID' | 'PENDING',
        description: o.desc,
        expenseCategoryId: expCats[o.cat],
        sourceType: o.sourceType ?? 'BANK',
        bankId: o.sourceType === 'PETTY_CASH' ? null : banks[i % banks.length].id,
        supplierId: o.supp !== null ? suppliers[o.supp].id : null,
        userId,
        ...('rule6DdExceptionCode' in o && o.rule6DdExceptionCode
          ? { rule6DdExceptionCode: o.rule6DdExceptionCode }
          : {}),
        ...(o.paidDate ? { paidDate: o.paidDate } : {}),
        ...(o.section40A2FairMarketValue != null
          ? {
              section40A2FairMarketValue: D(o.section40A2FairMarketValue),
              section40A2FmvNote: o.section40A2FmvNote ?? null,
            }
          : {}),
      },
    });
    expenseCount++;
  }
  record('expenses', expenseCount);

  // -------------------------------------------------------------------------
  // Quotations (5) — mix of statuses
  // -------------------------------------------------------------------------
  type QuotationSpec = {
    customerIdx: number;
    items: InvoiceItem[];
    status: 'draft' | 'sent' | 'accepted' | 'declined';
    daysAgo: number;
    expiryOffsetDays: number;
  };

  const quotationSpecs: QuotationSpec[] = [
    { customerIdx: 0, items: [buildLine(0, 3, TN_INTRA), buildLine(2, 2, TN_INTRA)], status: 'accepted', daysAgo: 60, expiryOffsetDays: 30 },
    { customerIdx: 1, items: [buildLine(13, 25, INTER), buildLine(15, 1, INTER)], status: 'sent', daysAgo: 28, expiryOffsetDays: 30 },
    { customerIdx: 2, items: [buildLine(14, 1, INTER), buildLine(16, 1, INTER)], status: 'sent', daysAgo: 14, expiryOffsetDays: 30 },
    { customerIdx: 5, items: [buildLine(3, 2, INTER), buildLine(4, 2, INTER)], status: 'declined', daysAgo: 50, expiryOffsetDays: 30 },
    { customerIdx: 7, items: [buildLine(7, 4, INTER)], status: 'draft', daysAgo: 4, expiryOffsetDays: 30 },
  ];

  let quotationCount = 0;
  for (let i = 0; i < quotationSpecs.length; i++) {
    const spec = quotationSpecs[i];
    const totalTaxable = round2(spec.items.reduce((s, it) => s + it.taxableAmount, 0));
    const totalTax = round2(spec.items.reduce((s, it) => s + it.totalTax, 0));
    const totalAmount = round2(totalTaxable + totalTax);
    const qDate = daysAgo(spec.daysAgo);
    const expiry = new Date(qDate.getTime() + spec.expiryOffsetDays * 24 * 60 * 60 * 1000);
    const customer = customers[spec.customerIdx];
    await prisma.quotation.create({
      data: {
        quotationId: `KMX-QT-${String(i + 1).padStart(6, '0')}`,
        customerId: customer.id,
        quotationDate: qDate,
        expiryDate: expiry,
        items: spec.items as unknown as Prisma.InputJsonValue,
        status: spec.status,
        paymentTerms: 'Net 30',
        taxableAmount: D(totalTaxable),
        TotalAmount: D(totalAmount),
        vat: D(totalTax),
        userId,
        billFrom: userId,
        billTo: customer.id,
        bankId: banks[0].id,
        notes: 'Auto-generated by full demo seed.',
        termsAndCondition: 'Quote valid until expiry date.',
      },
    });
    quotationCount++;
  }
  record('quotations', quotationCount);

  // -------------------------------------------------------------------------
  // Credit Notes (3) — issued against PAID invoices
  // -------------------------------------------------------------------------
  let creditNoteCount = 0;
  const paidInvoicesForCN = createdInvoices.filter((i) => i.status === 'PAID').slice(0, 3);
  const cnStatuses: Array<'PENDING' | 'PAID' | 'CANCELLED'> = ['PENDING', 'PAID', 'CANCELLED'];
  const cnReasons: Array<'RETURN' | 'DAMAGED_GOODS' | 'OVERCHARGE'> = ['RETURN', 'DAMAGED_GOODS', 'OVERCHARGE'];
  for (let i = 0; i < paidInvoicesForCN.length; i++) {
    const inv = paidInvoicesForCN[i];
    // Partial credit (~20% of invoice)
    const taxable = round2(inv.total * 0.18);
    const tax = round2(taxable * 0.18);
    const total = round2(taxable + tax);
    await prisma.creditNote.create({
      data: {
        creditNoteNumber: `KMX-CN-${String(i + 1).padStart(6, '0')}`,
        invoiceId: inv.id,
        customerId: inv.customerId,
        creditNoteDate: new Date(inv.date.getTime() + 14 * 24 * 60 * 60 * 1000),
        referenceNo: inv.invoiceNumber,
        reason: cnReasons[i],
        description: `Credit note for ${inv.invoiceNumber}.`,
        items: [
          {
            productId: products[0].id,
            productName: products[0].name,
            description: 'Adjustment',
            qty: 1,
            rate: taxable,
            discount: 0,
            taxableAmount: taxable,
            taxes: [{ taxRateId: taxRateByName['IGST 18%'].id, name: 'IGST 18%', kind: 'IGST', percent: 18, amount: tax }],
            totalTax: tax,
            lineTotal: total,
          },
        ] as unknown as Prisma.InputJsonValue,
        status: cnStatuses[i],
        refund_method: i === 1 ? 'BANK_TRANSFER' : 'CREDIT_TO_ACCOUNT',
        taxableAmount: D(taxable),
        totalAmount: D(total),
        vat: D(tax),
        bankId: banks[0].id,
        notes: 'Auto-generated by full demo seed.',
        userId,
        tenantId,
        billFrom: userId,
        billTo: inv.customerId,
        appliedToInvoice: inv.id,
        appliedDate: new Date(inv.date.getTime() + 15 * 24 * 60 * 60 * 1000),
      },
    });
    creditNoteCount++;
  }
  record('creditNotes', creditNoteCount);

  // -------------------------------------------------------------------------
  // Delivery Challans (4) — goods delivery notes against invoices
  // -------------------------------------------------------------------------
  let challanCount = 0;
  const invoicesForDC = createdInvoices.slice(0, 4);
  const dcStatuses: Array<'DRAFT' | 'PENDING' | 'DELIVERED' | 'CANCELLED'> = ['DELIVERED', 'DELIVERED', 'PENDING', 'DRAFT'];
  for (let i = 0; i < invoicesForDC.length; i++) {
    const inv = invoicesForDC[i];
    const taxable = round2(inv.total / 1.18);
    const tax = round2(inv.total - taxable);
    await prisma.deliveryChallan.create({
      data: {
        challanNumber: `KMX-DC-${String(i + 1).padStart(6, '0')}`,
        invoiceId: inv.id,
        customerId: inv.customerId,
        challanDate: new Date(inv.date.getTime() + 1 * 24 * 60 * 60 * 1000),
        referenceNo: inv.invoiceNumber,
        items: [
          {
            productId: products[0].id,
            productName: products[0].name,
            description: 'Goods delivery',
            qty: 1,
            rate: taxable,
            discount: 0,
            taxableAmount: taxable,
            taxes: [{ taxRateId: taxRateByName['IGST 18%'].id, name: 'IGST 18%', kind: 'IGST', percent: 18, amount: tax }],
            totalTax: tax,
            lineTotal: inv.total,
          },
        ] as unknown as Prisma.InputJsonValue,
        status: dcStatuses[i],
        taxableAmount: D(taxable),
        totalAmount: D(inv.total),
        vat: D(tax),
        bankId: banks[0].id,
        notes: 'Auto-generated by full demo seed.',
        termsAndCondition: 'Please verify goods at delivery.',
        userId,
        billFrom: userId,
        billTo: inv.customerId,
        receivedBy: dcStatuses[i] === 'DELIVERED' ? 'Customer Representative' : '',
        receivedDate: dcStatuses[i] === 'DELIVERED' ? new Date(inv.date.getTime() + 2 * 24 * 60 * 60 * 1000) : null,
      },
    });
    challanCount++;
  }
  record('deliveryChallans', challanCount);

  // -------------------------------------------------------------------------
  // Purchase Orders (5) — outgoing orders to suppliers
  // -------------------------------------------------------------------------
  let purchaseOrderCount = 0;
  const poStatuses: Array<'new' | 'pending' | 'completed' | 'cancelled'> = ['new', 'pending', 'pending', 'completed', 'completed'];
  for (let i = 0; i < 5; i++) {
    const supplier = suppliers[i % suppliers.length];
    const pProduct = products[(i + 2) % products.length];
    const qty = 8 + i * 2;
    const taxable = round2(qty * pProduct.buy);
    const tax = round2((taxable * 18) / 100);
    const total = round2(taxable + tax);
    const poDate = daysAgo(50 - i * 8);
    const dueDate = new Date(poDate.getTime() + 21 * 24 * 60 * 60 * 1000);
    await prisma.purchaseOrder.create({
      data: {
        purchaseOrderId: `KMX-PO-${String(i + 1).padStart(6, '0')}`,
        vendorId: supplier.vendorUserId,
        purchaseOrderDate: poDate,
        dueDate,
        status: poStatuses[i],
        paymentMode: 'BANK_TRANSFER',
        items: [
          {
            productId: pProduct.id,
            productName: pProduct.name,
            description: pProduct.name,
            qty,
            rate: pProduct.buy,
            discount: 0,
            taxableAmount: taxable,
            taxes: [{ taxRateId: taxRateByName['IGST 18%'].id, name: 'IGST 18%', kind: 'IGST', percent: 18, amount: tax }],
            totalTax: tax,
            lineTotal: total,
          },
        ] as unknown as Prisma.InputJsonValue,
        taxableAmount: D(taxable),
        totalDiscount: D(0),
        vat: D(tax),
        TotalAmount: D(total),
        bankId: banks[i % banks.length].id,
        userId,
        tenantId,
        billFrom: userId,
        billTo: supplier.vendorUserId,
        notes: `PO to ${supplier.name} for ${pProduct.name}.`,
        termsAndCondition: 'Delivery within 21 days to Chennai HQ.',
      },
    });
    purchaseOrderCount++;
  }
  record('purchaseOrders', purchaseOrderCount);

  // -------------------------------------------------------------------------
  // Debit Notes (3) — issued against existing Purchases
  // -------------------------------------------------------------------------
  let debitNoteCount = 0;
  const purchasesForDN = createdPurchases.slice(0, 3);
  const dnStatuses: Array<'new' | 'pending' | 'completed' | 'paid'> = ['new', 'pending', 'paid'];
  for (let i = 0; i < purchasesForDN.length; i++) {
    const pur = purchasesForDN[i];
    const vendorUserId = suppliers[i % suppliers.length].vendorUserId;
    // Adjustment ~15% of purchase
    const taxable = round2(pur.total * 0.13);
    const tax = round2(taxable * 0.18);
    const total = round2(taxable + tax);
    await prisma.debitNote.create({
      data: {
        debitNoteId: `KMX-DN-${String(i + 1).padStart(6, '0')}`,
        purchaseId: pur.id,
        vendorId: vendorUserId,
        debitNoteDate: new Date(pur.date.getTime() + 10 * 24 * 60 * 60 * 1000),
        dueDate: new Date(pur.date.getTime() + 40 * 24 * 60 * 60 * 1000),
        referenceNo: pur.purchaseId,
        items: [
          {
            productId: products[0].id,
            productName: products[0].name,
            description: 'Return / pricing adjustment',
            qty: 1,
            rate: taxable,
            discount: 0,
            taxableAmount: taxable,
            taxes: [{ taxRateId: taxRateByName['IGST 18%'].id, name: 'IGST 18%', kind: 'IGST', percent: 18, amount: tax }],
            totalTax: tax,
            lineTotal: total,
          },
        ] as unknown as Prisma.InputJsonValue,
        status: dnStatuses[i],
        paymentModeId: pmBankId,
        taxableAmount: D(taxable),
        totalDiscount: D(0),
        totalTax: D(tax),
        totalAmount: D(total),
        paidAmount: dnStatuses[i] === 'paid' ? D(total) : D(0),
        balanceAmount: dnStatuses[i] === 'paid' ? D(0) : D(total),
        bankId: banks[0].id,
        notes: `Debit note against ${pur.purchaseId}: ${pur.supplierName}.`,
        userId,
        createdBy: userId,
        billFrom: userId,
        billTo: vendorUserId,
      },
    });
    debitNoteCount++;
  }
  record('debitNotes', debitNoteCount);

  // -------------------------------------------------------------------------
  // PettyCash (1 cashbook + 8 transactions) — mix of ADD (top-ups) & SPEND
  // -------------------------------------------------------------------------
  const pcOpening = 5000;
  const pcRow = await prisma.pettyCash.create({
    data: {
      userId,
      tenantId,
      openingBalance: D(pcOpening),
      currentBalance: D(pcOpening),
      asOnDate: daysAgo(60),
    },
  });

  const pcTxSpecs: Array<{
    type: 'ADD' | 'SPEND' | 'RETURN';
    amount: number;
    relatedType: 'PETTY_CASH' | 'SUPPLIER_PAYMENT' | 'EXPENSE' | 'BANK';
    relatedId: string;
    remarks: string;
    days: number;
  }> = [
    { type: 'ADD', amount: 10000, relatedType: 'BANK', relatedId: banks[0].id, remarks: 'KMX-PC-TOPUP-001 Top-up from HDFC', days: 55 },
    { type: 'SPEND', amount: 450, relatedType: 'EXPENSE', relatedId: expCats['Demo Utilities'], remarks: 'KMX-PC-001 Office tea/snacks', days: 50 },
    { type: 'SPEND', amount: 1200, relatedType: 'EXPENSE', relatedId: expCats['Demo Travel'], remarks: 'KMX-PC-002 Local courier charges', days: 45 },
    { type: 'SPEND', amount: 800, relatedType: 'EXPENSE', relatedId: expCats['Demo Utilities'], remarks: 'KMX-PC-003 Office cleaning supplies', days: 40 },
    { type: 'ADD', amount: 5000, relatedType: 'BANK', relatedId: banks[0].id, remarks: 'KMX-PC-TOPUP-002 Top-up from HDFC', days: 32 },
    { type: 'SPEND', amount: 2200, relatedType: 'EXPENSE', relatedId: expCats['Demo Travel'], remarks: 'KMX-PC-004 Auto rickshaw fares', days: 25 },
    { type: 'SPEND', amount: 350, relatedType: 'EXPENSE', relatedId: expCats['Demo Office Rent'], remarks: 'KMX-PC-005 Photocopy/printing', days: 18 },
    { type: 'RETURN', amount: 500, relatedType: 'PETTY_CASH', relatedId: pcRow.id, remarks: 'KMX-PC-RET-001 Unused advance returned', days: 10 },
  ];

  let pcBalance = pcOpening;
  let pettyCashTxCount = 0;
  for (const t of pcTxSpecs) {
    const before = pcBalance;
    const after = round2(
      t.type === 'ADD' ? before + t.amount : before - t.amount,
    );
    await prisma.pettyCashTransaction.create({
      data: {
        pettyCashId: pcRow.id,
        transactionDate: daysAgo(t.days),
        transactionType: t.type,
        amount: D(t.amount),
        balanceBefore: D(before),
        balanceAfter: D(after),
        remarks: t.remarks,
        relatedType: t.relatedType,
        relatedId: t.relatedId,
      },
    });
    pcBalance = after;
    pettyCashTxCount++;
  }
  // Update current balance on PettyCash row
  await prisma.pettyCash.update({
    where: { id: pcRow.id },
    data: { currentBalance: D(pcBalance), asOnDate: new Date() },
  });
  record('pettyCash', 1);
  record('pettyCashTransactions', pettyCashTxCount);

  // -------------------------------------------------------------------------
  // Journal Entries (3 balanced)
  // -------------------------------------------------------------------------
  await prisma.journalEntry.create({
    data: {
      userId,
      entryNumber: 'KMX-JE-00001',
      entryDate: daysAgo(85),
      description: 'Owner contribution — initial capital',
      reference: 'OPEN-001',
      isPosted: true,
      lines: {
        create: [
          { accountId: accountByCode['1001']!, debit: D(100000), credit: D(0), description: 'Cash deposit' },
          { accountId: accountByCode['3001']!, debit: D(0), credit: D(100000), description: 'Owner equity' },
        ],
      },
    },
  });
  await prisma.journalEntry.create({
    data: {
      userId,
      entryNumber: 'KMX-JE-00002',
      entryDate: daysAgo(60),
      description: 'Prepaid rent for Q2',
      reference: 'JE-RENT-Q2',
      isPosted: true,
      lines: {
        create: [
          { accountId: accountByCode['5101']!, debit: D(45000), credit: D(0), description: 'Rent expense' },
          { accountId: accountByCode['1001']!, debit: D(0), credit: D(45000), description: 'Paid from cash' },
        ],
      },
    },
  });
  await prisma.journalEntry.create({
    data: {
      userId,
      entryNumber: 'KMX-JE-00003',
      entryDate: daysAgo(45),
      description: 'Cash deposit to bank',
      reference: 'JE-DEPOSIT-001',
      isPosted: true,
      lines: {
        create: [
          { accountId: accountByCode['1002']!, debit: D(250000), credit: D(0), description: 'Bank account' },
          { accountId: accountByCode['1001']!, debit: D(0), credit: D(250000), description: 'Cash on hand' },
        ],
      },
    },
  });
  record('journalEntries', 3);

  // -------------------------------------------------------------------------
  // BankTransactions (~30) — mix of deposits/withdrawals + reconciled state
  // -------------------------------------------------------------------------
  // Running balance per bank
  const bankBalances: Record<string, number> = {};
  for (const b of banks) bankBalances[b.id] = b.balance;

  let txCount = 0;
  // Deposits (correspond to invoice payments)
  let txIdx = 0;
  for (const inv of createdInvoices) {
    if (inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID') {
      const bankId = banks[txIdx % banks.length].id;
      const amount = inv.status === 'PARTIALLY_PAID' ? round2(inv.total / 2) : inv.total;
      const before = bankBalances[bankId];
      const after = round2(before + amount);
      await prisma.bankTransaction.create({
        data: {
          bankAccountId: bankId,
          transactionDate: new Date(inv.date.getTime() + 5 * 24 * 60 * 60 * 1000),
          type: 'DEPOSIT',
          amount: D(amount),
          balanceBefore: D(before),
          balanceAfter: D(after),
          paymentModeId: pmBankId,
          referenceNo: inv.invoiceNumber,
          remarks: `Payment received for ${inv.invoiceNumber}`,
          relatedType: 'INVOICE_PAYMENT',
          relatedId: inv.id,
          isReconciled: txIdx % 3 !== 0,
          reconciledBy: txIdx % 3 !== 0 ? userId : null,
          reconciliationDate: txIdx % 3 !== 0 ? new Date(inv.date.getTime() + 6 * 24 * 60 * 60 * 1000) : null,
        },
      });
      bankBalances[bankId] = after;
      txCount++;
      txIdx++;
    }
  }

  // Withdrawals (for paid expenses)
  const paidExpenses = await prisma.expense.findMany({
    where: { userId, paymentStatus: 'PAID' },
    take: 12,
  });
  for (let i = 0; i < paidExpenses.length; i++) {
    const e = paidExpenses[i];
    const bankId = e.bankId ?? banks[0].id;
    const amount = Number(e.amount);
    const before = bankBalances[bankId] ?? banks[0].balance;
    const after = round2(before - amount);
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: bankId,
        transactionDate: e.expenseDate,
        type: 'WITHDRAWAL',
        amount: D(amount),
        balanceBefore: D(before),
        balanceAfter: D(after),
        paymentModeId: e.paymentModeId ?? pmBankId,
        referenceNo: e.expenseId,
        remarks: `Expense: ${e.description}`,
        relatedType: 'EXPENSE',
        relatedId: e.id,
        isReconciled: i % 2 === 0,
        reconciledBy: i % 2 === 0 ? userId : null,
      },
    });
    bankBalances[bankId] = after;
    txCount++;
  }

  // A handful of manual transfers/cash deposits to bulk to 30+
  for (let i = 0; i < 12; i++) {
    const bankId = banks[i % banks.length].id;
    const isDeposit = i % 2 === 0;
    const amount = round2(2000 + i * 500);
    const before = bankBalances[bankId] ?? banks[0].balance;
    const after = isDeposit ? round2(before + amount) : round2(before - amount);
    await prisma.bankTransaction.create({
      data: {
        bankAccountId: bankId,
        transactionDate: daysAgo(80 - i * 5),
        type: isDeposit ? 'DEPOSIT' : 'WITHDRAWAL',
        amount: D(amount),
        balanceBefore: D(before),
        balanceAfter: D(after),
        paymentModeId: pmCashId,
        referenceNo: `KMX-BT-MANUAL-${String(i + 1).padStart(3, '0')}`,
        remarks: isDeposit ? 'Cash deposit (manual)' : 'Cash withdrawal (manual)',
        relatedType: 'MANUAL',
        isReconciled: i < 4,
        reconciledBy: i < 4 ? userId : null,
      },
    });
    bankBalances[bankId] = after;
    txCount++;
  }

  // Update bank current balances to reflect transactions
  for (const b of banks) {
    await prisma.bankDetail.update({
      where: { id: b.id },
      data: { currentBalance: D(bankBalances[b.id] ?? b.balance) },
    });
  }
  record('bankTransactions', txCount);

  // -------------------------------------------------------------------------
  // PaymentTransactions (3 OFFLINE + 1 RAZORPAY-style CREATED)
  // -------------------------------------------------------------------------
  let ptCount = 0;
  const paidInvoices = createdInvoices.filter((i) => i.status === 'PAID').slice(0, 3);
  for (let i = 0; i < paidInvoices.length; i++) {
    const inv = paidInvoices[i];
    await prisma.paymentTransaction.create({
      data: {
        userId,
        invoiceId: inv.id,
        kind: 'OFFLINE',
        status: 'CAPTURED',
        amount: D(inv.total),
        currency: 'INR',
        gatewayOrderId: `KMX-ORD-${randomBytes(4).toString('hex').toUpperCase()}`,
        gatewayPaymentId: `KMX-PAY-${randomBytes(4).toString('hex').toUpperCase()}`,
        metadata: { source: 'KMX-seed', invoiceNumber: inv.invoiceNumber },
      },
    });
    ptCount++;
  }
  // 1 Razorpay CREATED (i.e. checkout started but not paid)
  const unpaidInvoice = createdInvoices.find((i) => i.status === 'UNPAID');
  if (unpaidInvoice) {
    await prisma.paymentTransaction.create({
      data: {
        userId,
        invoiceId: unpaidInvoice.id,
        kind: 'RAZORPAY',
        status: 'CREATED',
        amount: D(unpaidInvoice.total),
        currency: 'INR',
        gatewayOrderId: `order_DEMO${randomBytes(6).toString('hex').toUpperCase()}`,
        metadata: { source: 'KMX-seed', invoiceNumber: unpaidInvoice.invoiceNumber, mock: true },
      },
    });
    ptCount++;
  }
  record('paymentTransactions', ptCount);

  // -------------------------------------------------------------------------
  // EInvoiceRecord (4) — via MockProvider-style payload
  // -------------------------------------------------------------------------
  let eInvCount = 0;
  const b2bPaid = createdInvoices.filter((i) => i.status === 'PAID').slice(0, 4);
  for (const inv of b2bPaid) {
    const irn = randomBytes(32).toString('hex');
    const ackNo = String(Math.floor(Math.random() * 1e15)).padStart(15, '0');
    await prisma.eInvoiceRecord.create({
      data: {
        userId,
        invoiceId: inv.id,
        irn,
        ackNo,
        ackDate: new Date(inv.date.getTime() + 1 * 24 * 60 * 60 * 1000),
        signedInvoice: `MOCK_SIGNED_INV_${inv.invoiceNumber}`,
        signedQRCode: `MOCK_QR_${irn.slice(0, 16)}`,
        status: 'GENERATED',
        provider: 'mock',
        metadata: { provider: 'mock', invoiceNumber: inv.invoiceNumber },
      },
    });
    eInvCount++;
  }
  record('eInvoices', eInvCount);

  // -------------------------------------------------------------------------
  // AccountingPeriods (2)
  // -------------------------------------------------------------------------
  const aprStart = new Date('2026-04-01T00:00:00.000Z');
  const aprEnd = new Date('2026-04-30T23:59:59.999Z');
  const marStart = new Date('2026-03-01T00:00:00.000Z');
  const marEnd = new Date('2026-03-31T23:59:59.999Z');
  await prisma.accountingPeriod.create({
    data: { userId, name: 'April 2026', startDate: aprStart, endDate: aprEnd, isLocked: false },
  });
  await prisma.accountingPeriod.create({
    data: { userId, name: 'March 2026', startDate: marStart, endDate: marEnd, isLocked: true, lockedAt: daysAgo(20), lockedBy: userId },
  });
  record('accountingPeriods', 2);

  // -------------------------------------------------------------------------
  // GatewayConfig (OFFLINE) + MessagingConfig
  // -------------------------------------------------------------------------
  await prisma.gatewayConfig.upsert({
    where: { userId_kind: { userId, kind: 'OFFLINE' } },
    update: {
      tenantId,
      enabled: true,
      config: { instructions: 'Bank transfer to account number on invoice.' },
    },
    create: {
      userId,
      tenantId,
      kind: 'OFFLINE',
      enabled: true,
      config: { instructions: 'Bank transfer to account number on invoice.' },
      livemode: false,
    },
  });
  record('gatewayConfigs', 1);

  await prisma.messagingConfig.upsert({
    where: { userId },
    update: {
      tenantId,
      whatsappEnabled: false,
      defaultTemplate: 'Hi {{customer_name}}, your invoice {{invoice_number}} of {{amount}} is due on {{due_date}}.',
    },
    create: {
      userId,
      tenantId,
      whatsappEnabled: false,
      defaultTemplate: 'Hi {{customer_name}}, your invoice {{invoice_number}} of {{amount}} is due on {{due_date}}.',
    },
  });
  record('messagingConfigs', 1);

  // -------------------------------------------------------------------------
  // AI features (cluster H, slice H.4)
  //   - AiConfig: MOCK provider, enabled (so the demo shows all AI UI)
  //   - AiUsageLog: spread over the last 14 days for a realistic usage chart
  //   - AiExtractionJob: one CONFIRMED (linked to a demo purchase), one
  //     EXTRACTED (awaiting confirm)
  //   - AiChatSession + AiChatMessage: two sample conversations
  // -------------------------------------------------------------------------
  await prisma.aiConfig.upsert({
    where: { userId },
    update: {
      tenantId,
      provider: 'MOCK',
      enabled: true,
      extractionModel: 'mock-extract-v1',
      chatModel: 'mock-chat-v1',
      monthlyBudgetUsd: D(25),
    },
    create: {
      userId,
      tenantId,
      provider: 'MOCK',
      enabled: true,
      extractionModel: 'mock-extract-v1',
      chatModel: 'mock-chat-v1',
      monthlyBudgetUsd: D(25),
    },
  });
  record('aiConfigs', 1);

  // AiUsageLog — 8 rows over the last 14 days (mix of extraction + chat).
  const usageSeed: Array<{ day: number; feature: 'extraction' | 'chat'; cost: number; inTok: number; outTok: number }> = [
    { day: 13, feature: 'chat', cost: 0.0049, inTok: 1200, outTok: 220 },
    { day: 12, feature: 'extraction', cost: 0.0031, inTok: 1800, outTok: 140 },
    { day: 10, feature: 'chat', cost: 0.0052, inTok: 1350, outTok: 250 },
    { day: 8, feature: 'extraction', cost: 0.0029, inTok: 1700, outTok: 130 },
    { day: 6, feature: 'chat', cost: 0.0061, inTok: 1500, outTok: 310 },
    { day: 4, feature: 'extraction', cost: 0.0033, inTok: 1900, outTok: 150 },
    { day: 2, feature: 'chat', cost: 0.0047, inTok: 1180, outTok: 210 },
    { day: 1, feature: 'chat', cost: 0.0055, inTok: 1420, outTok: 270 },
  ];
  let aiUsageCount = 0;
  for (const u of usageSeed) {
    await prisma.aiUsageLog.create({
      data: {
        userId,
        tenantId,
        feature: u.feature,
        provider: 'MOCK',
        model: u.feature === 'extraction' ? 'mock-extract-v1' : 'mock-chat-v1',
        inputTokens: u.inTok,
        outputTokens: u.outTok,
        costUsd: D(u.cost),
        createdAt: daysAgo(u.day),
      },
    });
    aiUsageCount++;
  }
  record('aiUsageLogs', aiUsageCount);

  // AiExtractionJob — one CONFIRMED (linked to the first demo purchase) and
  // one EXTRACTED (awaiting confirmation). Mirrors the MockProvider's canned
  // Acme Office Supplies bill so the demo extraction history looks real.
  const acmeExtracted = {
    vendorName: 'Workstation Mart',
    vendorGstin: '33AABCW3003R1Z3',
    invoiceNumber: 'WSM-2026-0419',
    invoiceDate: daysAgo(12).toISOString().slice(0, 10),
    dueDate: daysAgo(-18).toISOString().slice(0, 10),
    currency: 'INR',
    lineItems: [
      { description: 'A4 Copier Paper (5-ream carton)', quantity: 10, unitPrice: 980, amount: 9800 },
      { description: 'HP LaserJet Pro Toner 26A', quantity: 4, unitPrice: 3800, amount: 15200 },
      { description: 'Ergonomic Mesh Office Chair', quantity: 2, unitPrice: 11200, amount: 22400 },
    ],
    taxBreakdown: [
      { label: 'CGST', rate: 9, amount: 4266 },
      { label: 'SGST', rate: 9, amount: 4266 },
    ],
    subtotal: 47400,
    total: 55932,
    notes: 'Net 30 — Kredmaxx Chennai HQ delivery.',
    _confidence: 0.95,
  };

  const linkedPurchase = createdPurchases[0];
  let aiJobCount = 0;
  await prisma.aiExtractionJob.create({
    data: {
      userId,
      tenantId,
      sourceFilePath: 'uploads/ai-jobs/KMX-acme-bill.pdf',
      mimeType: 'application/pdf',
      status: 'CONFIRMED',
      extractedData: acmeExtracted as unknown as Prisma.InputJsonValue,
      rawResponse: JSON.stringify(acmeExtracted),
      confidence: D(0.95),
      costUsd: D(0.0031),
      resultingPurchaseId: linkedPurchase ? linkedPurchase.id : null,
      createdAt: daysAgo(12),
    },
  });
  aiJobCount++;

  const pendingExtracted = {
    vendorName: 'TechSource India Pvt Ltd',
    vendorGstin: '29AABCT2002R1Z2',
    invoiceNumber: 'TSI-INV-7741',
    invoiceDate: daysAgo(3).toISOString().slice(0, 10),
    dueDate: daysAgo(-27).toISOString().slice(0, 10),
    currency: 'INR',
    lineItems: [
      { description: 'Logitech MX Master 3S Mouse', quantity: 5, unitPrice: 7400, amount: 37000 },
      { description: 'Apple Magic Keyboard with Touch ID', quantity: 3, unitPrice: 11200, amount: 33600 },
    ],
    taxBreakdown: [
      { label: 'IGST', rate: 18, amount: 12708 },
    ],
    subtotal: 70600,
    total: 83308,
    notes: 'Awaiting confirmation — inter-state supply.',
    _confidence: 0.88,
  };
  await prisma.aiExtractionJob.create({
    data: {
      userId,
      tenantId,
      sourceFilePath: 'uploads/ai-jobs/KMX-stationery-bill.jpg',
      mimeType: 'image/jpeg',
      status: 'EXTRACTED',
      extractedData: pendingExtracted as unknown as Prisma.InputJsonValue,
      rawResponse: JSON.stringify(pendingExtracted),
      confidence: D(0.88),
      costUsd: D(0.0029),
      createdAt: daysAgo(3),
    },
  });
  aiJobCount++;
  record('aiExtractionJobs', aiJobCount);

  // AiChatSession + AiChatMessage — two sample conversations.
  let aiSessionCount = 0;
  let aiMessageCount = 0;

  const session1 = await prisma.aiChatSession.create({
    data: {
      userId,
      tenantId,
      title: 'How much GST do I owe this quarter?',
      createdAt: daysAgo(6),
      updatedAt: daysAgo(6),
    },
  });
  aiSessionCount++;
  const s1Messages: Array<Prisma.AiChatMessageCreateManyInput> = [
    {
      sessionId: session1.id,
      role: 'USER',
      content: 'How much GST do I owe this quarter?',
      createdAt: daysAgo(6),
    },
    {
      sessionId: session1.id,
      role: 'ASSISTANT',
      content: '',
      toolName: 'get_gst_summary',
      toolInput: {} as Prisma.InputJsonValue,
      createdAt: new Date(daysAgo(6).getTime() + 1000),
    },
    {
      sessionId: session1.id,
      role: 'TOOL',
      content: '',
      toolName: 'get_gst_summary',
      toolResult: { outputTax: 84600, inputTaxCredit: 31200, netPayable: 53400 } as Prisma.InputJsonValue,
      createdAt: new Date(daysAgo(6).getTime() + 2000),
    },
    {
      sessionId: session1.id,
      role: 'ASSISTANT',
      content:
        'For the current quarter your output GST is ₹84,600 and your input tax credit is ₹31,200, leaving a net GST payable of ₹53,400.',
      costUsd: D(0.0061),
      createdAt: new Date(daysAgo(6).getTime() + 3000),
    },
  ];
  await prisma.aiChatMessage.createMany({ data: s1Messages });
  aiMessageCount += s1Messages.length;

  const session2 = await prisma.aiChatSession.create({
    data: {
      userId,
      tenantId,
      title: 'Who are my top 5 debtors?',
      createdAt: daysAgo(2),
      updatedAt: daysAgo(2),
    },
  });
  aiSessionCount++;
  const s2Messages: Array<Prisma.AiChatMessageCreateManyInput> = [
    {
      sessionId: session2.id,
      role: 'USER',
      content: 'Who are my top 5 debtors?',
      createdAt: daysAgo(2),
    },
    {
      sessionId: session2.id,
      role: 'ASSISTANT',
      content: '',
      toolName: 'get_top_debtors',
      toolInput: { limit: 5 } as Prisma.InputJsonValue,
      createdAt: new Date(daysAgo(2).getTime() + 1000),
    },
    {
      sessionId: session2.id,
      role: 'TOOL',
      content: '',
      toolName: 'get_top_debtors',
      toolResult: {
        debtors: [
          { name: 'BrightPath Healthcare LLP', outstanding: 147500 },
          { name: 'Horizon Logistics India', outstanding: 98600 },
          { name: 'Vertex Fintech Solutions', outstanding: 61200 },
          { name: 'Sunrise Agro Exports', outstanding: 34800 },
          { name: 'Anita Krishnan Consulting', outstanding: 22100 },
        ],
      } as Prisma.InputJsonValue,
      createdAt: new Date(daysAgo(2).getTime() + 2000),
    },
    {
      sessionId: session2.id,
      role: 'ASSISTANT',
      content:
        'Your top 5 debtors are: BrightPath Healthcare LLP (₹1,47,500), Horizon Logistics India (₹98,600), Vertex Fintech Solutions (₹61,200), Sunrise Agro Exports (₹34,800) and Anita Krishnan Consulting (₹22,100).',
      costUsd: D(0.0047),
      createdAt: new Date(daysAgo(2).getTime() + 3000),
    },
  ];
  await prisma.aiChatMessage.createMany({ data: s2Messages });
  aiMessageCount += s2Messages.length;

  record('aiChatSessions', aiSessionCount);
  record('aiChatMessages', aiMessageCount);

  // -------------------------------------------------------------------------
  // Extra module data — signatures, reminders, accounting extras, currency
  // -------------------------------------------------------------------------
  await prisma.signature.create({
    data: {
      signatureName: 'Arjun Mehta — Director',
      signatureImage: '',
      status: true,
      markAsDefault: true,
      userId,
      tenantId,
    },
  });
  record('signatures', 1);

  await prisma.costCenter.createMany({
    data: [
      { userId, tenantId, code: 'CC-OPS', name: 'Operations' },
      { userId, tenantId, code: 'CC-SALES', name: 'Sales & Marketing' },
      { userId, tenantId, code: 'CC-IT', name: 'IT & Infrastructure' },
    ],
  });
  record('costCenters', 3);

  await prisma.project.createMany({
    data: [
      { userId, tenantId, code: 'PRJ-NEXUS', name: 'Nexus Retail — POS Integration', status: 'active' },
      { userId, tenantId, code: 'PRJ-CLOUD', name: 'Horizon Logistics — Cloud Migration', status: 'active' },
    ],
  });
  record('projects', 2);

  // Inter-warehouse stock transfer (Chennai → Bangalore)
  await prisma.stockTransfer.create({
    data: {
      transferNumber: 'KMX-ST-00001',
      userId,
      tenantId,
      fromWarehouseId: whMain.id,
      toWarehouseId: whBlr.id,
      transferDate: daysAgo(14),
      notes: 'Replenish Bangalore branch for BrightPath deployment.',
      status: 'COMPLETED',
      lines: {
        create: [
          { productId: products[0].id, quantity: D(3), unitCost: D(products[0].buy) },
          { productId: products[2].id, quantity: D(2), unitCost: D(products[2].buy) },
        ],
      },
    },
  });
  record('stockTransfers', 1);

  // Sales debit notes (GSTR-1 CDNR) against paid invoices
  const sdnSources = createdInvoices.filter((inv) => inv.status === 'PAID').slice(0, 2);
  let sdnCount = 0;
  for (let i = 0; i < sdnSources.length; i++) {
    const inv = sdnSources[i];
    const taxable = round2(inv.total * 0.08);
    const tax = round2(taxable * 0.18);
    const total = round2(taxable + tax);
    await prisma.salesDebitNote.create({
      data: {
        debitNoteNumber: `KMX-SDN-${String(i + 1).padStart(6, '0')}`,
        invoiceId: inv.id,
        customerId: inv.customerId,
        debitNoteDate: new Date(inv.date.getTime() + 12 * 24 * 60 * 60 * 1000),
        referenceNo: inv.invoiceNumber,
        reason: 'OVERCHARGE',
        description: 'Additional charges for on-site configuration.',
        items: [
          {
            productId: products[13].id,
            productName: products[13].name,
            description: 'On-site configuration surcharge',
            qty: 1,
            rate: taxable,
            discount: 0,
            taxableAmount: taxable,
            taxes: [{ taxRateId: taxRateByName['IGST 18%'].id, name: 'IGST 18%', kind: 'IGST', percent: 18, amount: tax }],
            totalTax: tax,
            lineTotal: total,
          },
        ] as unknown as Prisma.InputJsonValue,
        status: i === 0 ? 'PAID' : 'PENDING',
        taxableAmount: D(taxable),
        totalAmount: D(total),
        vat: D(tax),
        notes: `Sales debit note for ${inv.invoiceNumber}`,
        userId,
        tenantId,
        billFrom: userId,
        billTo: inv.customerId,
      },
    });
    sdnCount++;
  }
  record('salesDebitNotes', sdnCount);

  const expenseAccount = accountByCode['5101'];
  if (expenseAccount) {
    await prisma.budget.create({
      data: {
        userId,
        tenantId,
        accountId: expenseAccount,
        periodStart: new Date('2026-04-01T00:00:00.000Z'),
        periodEnd: new Date('2026-06-30T23:59:59.999Z'),
        amount: D(150000),
      },
    });
    record('budgets', 1);
  }

  // Pinned acquisition dates so books-vs-IT dep (FY 2026-27) stays stable across reseed.
  await prisma.fixedAsset.createMany({
    data: [
      {
        userId,
        tenantId,
        name: 'Office Laptop Fleet',
        cost: D(450000),
        salvageValue: D(45000),
        usefulLifeMonths: 36,
        acquisitionDate: new Date(2025, 6, 1),
        accumulatedDepreciation: D(75000),
        status: 'active',
        itBlock: 'Computers',
        itRatePercent: D(40),
        itOpeningWdv: D(270000),
      },
      {
        userId,
        tenantId,
        name: 'Server Rack',
        cost: D(180000),
        salvageValue: D(18000),
        usefulLifeMonths: 60,
        acquisitionDate: new Date(2025, 2, 15),
        accumulatedDepreciation: D(36000),
        status: 'active',
        itBlock: 'Plant & Machinery',
        itRatePercent: D(15),
        itOpeningWdv: D(153000),
      },
    ],
  });
  record('fixedAssets', 2);

  const firstCustomer = customers[0];
  if (firstCustomer) {
    await prisma.reminder.create({
      data: {
        name: 'Invoice due reminder',
        type: 'automatic',
        remindDays: 3,
        remindTiming: 'before',
        remindEvent: 'due_date',
        isEnabled: true,
        emailConfig: { subject: 'Payment reminder', body: 'Your invoice is due soon.' },
        targetCustomer: firstCustomer.id,
        createdBy: userId,
        companyId: companyRow.id,
        status: 'active',
      },
    });
    record('reminders', 1);
  }

  const existingInr = await prisma.currency.findFirst({ where: { code: 'INR' } });
  if (!existingInr) {
    await prisma.currency.create({
      data: {
        name: 'Indian Rupee',
        code: 'INR',
        symbol: '₹',
        status: true,
        createdBy: userId,
      },
    });
    record('currencies', 1);
  }

  console.log('  ...seed complete');
}

// ===========================================================================
// Main
// ===========================================================================

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing demo full seed in production. Set ALLOW_DEMO_SEED=true only for intentional demo instances.',
    );
  }

  const adminUser = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (!adminUser) {
    throw new Error(
      `User (${DEMO_EMAIL}) not found. Register first or set SEED_EMAIL to an existing account.`,
    );
  }

  const membership =
    (await prisma.tenantMembership.findFirst({
      where: { userId: adminUser.id, tenant: { slug: 'kredmaxx-technologies' } },
      include: { tenant: true },
    })) ||
    (await prisma.tenantMembership.findFirst({
      where: { userId: adminUser.id },
      include: { tenant: true },
      orderBy: { createdAt: 'asc' },
    }));
  if (!membership?.tenantId) {
    throw new Error(
      `No tenant membership for ${DEMO_EMAIL}. Run: npm run prisma:seed:demo`,
    );
  }

  await prisma.tenant.update({
    where: { id: membership.tenantId },
    data: { name: COMPANY_NAME },
  });

  const ctx: SeedCtx = {
    userId: adminUser.id,
    tenantId: membership.tenantId,
    tenantName: COMPANY_NAME,
  };

  console.log(`Full demo seed — ${COMPANY_NAME}`);
  console.log(`  email=${DEMO_EMAIL}`);
  console.log(`  userId=${ctx.userId} tenantId=${ctx.tenantId}`);
  console.log('-'.repeat(60));

  await wipe(ctx);
  await seedAll(ctx);

  console.log('-'.repeat(60));
  console.log('Kredmaxx Technologies demo summary:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(22)} ${v}`);
  }
  console.log('-'.repeat(60));
  console.log(`Workspace: ${COMPANY_NAME}`);
  console.log(`Admin login: ${DEMO_EMAIL} / Demo123$`);
  console.log(`Staff: finance@demo.kredmaxx.local / Staff123$`);
  console.log(`        sales@demo.kredmaxx.local / Staff123$`);
  console.log('Login at:  http://localhost:3000/admin/login');
}

main()
  .catch((err) => {
    console.error('Full demo seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
