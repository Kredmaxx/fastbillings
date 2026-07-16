/**
 * Postgres/Prisma module-hierarchy seed.
 *
 * Replaces the legacy MongoDB `seedModules.js` (which targeted a now-removed
 * Mongo store and therefore never populated the Postgres `Module` table). The
 * module hierarchy drives the role/permission tree AND the per-module custom-
 * fields screens (Settings → Module Settings). Idempotent: existing modules
 * (matched by moduleSlug) are left untouched, missing ones are created.
 *
 * Run: `npx ts-node prisma/seedModules.ts`  (or via the install/seed flow).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ChildDef { moduleName: string; moduleSlug: string }
interface ParentDef { moduleName: string; moduleSlug: string; children: ChildDef[] }

const HIERARCHY: ParentDef[] = [
  { moduleName: 'Main', moduleSlug: 'main', children: [
    { moduleName: 'Dashboard', moduleSlug: 'dashboard' },
  ] },
  { moduleName: 'Inventory & Sales', moduleSlug: 'inventory-sales', children: [
    { moduleName: 'Product / Services', moduleSlug: 'product-services' },
    { moduleName: 'Inventory', moduleSlug: 'inventory' },
    { moduleName: 'Invoices', moduleSlug: 'invoices' },
    { moduleName: 'Credit Notes', moduleSlug: 'credit-notes' },
    { moduleName: 'Quotations', moduleSlug: 'quotations' },
    { moduleName: 'Delivery Challans', moduleSlug: 'delivery-challans' },
    { moduleName: 'Customers', moduleSlug: 'customers' },
  ] },
  { moduleName: 'Purchases', moduleSlug: 'purchases', children: [
    { moduleName: 'Purchases', moduleSlug: 'purchase-list' },
    { moduleName: 'Purchase Orders', moduleSlug: 'purchase-orders' },
    { moduleName: 'Debit Notes', moduleSlug: 'debit-notes' },
    { moduleName: 'Suppliers', moduleSlug: 'suppliers' },
    { moduleName: 'Supplier Payments', moduleSlug: 'supplier-payments' },
  ] },
  { moduleName: 'Manage Users', moduleSlug: 'manage-users', children: [
    { moduleName: 'Roles & Permissions', moduleSlug: 'roles-permissions' },
  ] },
  { moduleName: 'Finance & Accounting', moduleSlug: 'finance-accounting', children: [
    { moduleName: 'Expenses', moduleSlug: 'expenses' },
    { moduleName: 'Banking', moduleSlug: 'banking' },
    { moduleName: 'Transaction', moduleSlug: 'transaction' },
    { moduleName: 'Petty Cash', moduleSlug: 'petty-cash' },
  ] },
  { moduleName: 'Reports', moduleSlug: 'reports', children: [
    { moduleName: 'Item Reports', moduleSlug: 'item-reports' },
    { moduleName: 'Transaction Reports', moduleSlug: 'transaction-reports' },
    { moduleName: 'Finance Reports', moduleSlug: 'finance-reports' },
    { moduleName: 'Accounting Reports', moduleSlug: 'accounting-reports' },
  ] },
  { moduleName: 'Settings', moduleSlug: 'settings', children: [
    { moduleName: 'General Settings', moduleSlug: 'general-settings' },
    { moduleName: 'Website Settings', moduleSlug: 'website-settings' },
    { moduleName: 'System Settings', moduleSlug: 'system-settings' },
    { moduleName: 'Finance Settings', moduleSlug: 'finance-settings' },
    { moduleName: 'Module Settings', moduleSlug: 'module-settings' },
    { moduleName: 'Other Settings', moduleSlug: 'other-settings' },
  ] },
];

async function ensureModule(moduleName: string, moduleSlug: string, parentId: string | null): Promise<string> {
  const existing = await prisma.module.findFirst({ where: { moduleSlug, parentId } });
  if (existing) return existing.id;
  const created = await prisma.module.create({ data: { moduleName, moduleSlug, parentId } });
  return created.id;
}

export async function seedModules(): Promise<{ created: number }> {
  let created = 0;
  for (const parent of HIERARCHY) {
    const before = await prisma.module.findFirst({ where: { moduleSlug: parent.moduleSlug, parentId: null } });
    const parentId = await ensureModule(parent.moduleName, parent.moduleSlug, null);
    if (!before) created += 1;
    for (const child of parent.children) {
      const childBefore = await prisma.module.findFirst({ where: { moduleSlug: child.moduleSlug, parentId } });
      await ensureModule(child.moduleName, child.moduleSlug, parentId);
      if (!childBefore) created += 1;
    }
  }
  return { created };
}

if (require.main === module) {
  seedModules()
    .then((r) => { console.log(`Modules seeded (created ${r.created} new).`); return prisma.$disconnect(); })
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('seedModules error:', e); await prisma.$disconnect(); process.exit(1); });
}
