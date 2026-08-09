/**
 * Demo seed — provisions the Kredmaxx Technologies workspace admin.
 *
 * Run AFTER `npm run prisma:seed` (baseline lookup data must exist).
 *
 *   npm run prisma:seed:demo
 *
 * Creates:
 *   - Role "Administrator"
 *   - Tenant "Kredmaxx Technologies" + OWNER membership
 *   - Tenant admin: admin@demo.fastbillings.local / Demo123$
 *   - CompanySettings (GST India, Chennai HQ)
 *
 * Then run the full dataset:
 *   npm run prisma:seed:demo:full
 *
 * Idempotent — safe to re-run.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { USER_TYPE } from '../lib/userTypes';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'admin@demo.fastbillings.local';
const DEMO_PASSWORD = 'Demo123$';
const DEMO_USER_ID = 'demo-admin-1';
const DEMO_ROLE_ID = 'seed-role-administrator';
const DEMO_COMPANY_ID = 'demo-company-1';
const DEMO_TENANT_ID = 'demo-tenant-kredmaxx';
const DEMO_TENANT_SLUG = 'kredmaxx-technologies';
const COMPANY_NAME = 'Kredmaxx Technologies';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing demo seed in production. Set ALLOW_DEMO_SEED=true only for intentional demo instances.',
    );
  }

  const role = await prisma.role.upsert({
    where: { id: DEMO_ROLE_ID },
    update: { roleName: 'Administrator', status: true },
    create: { id: DEMO_ROLE_ID, roleName: 'Administrator', status: true },
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {
      password: passwordHash,
      firstName: 'Arjun',
      lastName: 'Mehta',
      phone: '+91-9876543210',
      user_type: USER_TYPE.ADMIN,
      roleId: role.id,
      isDeleted: false,
    },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      password: passwordHash,
      firstName: 'Arjun',
      lastName: 'Mehta',
      phone: '+91-9876543210',
      user_type: USER_TYPE.ADMIN,
      roleId: role.id,
      balance: 0,
      isDeleted: false,
    },
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: {
      name: COMPANY_NAME,
      ownerId: admin.id,
      status: 'active',
    },
    create: {
      id: DEMO_TENANT_ID,
      name: COMPANY_NAME,
      slug: DEMO_TENANT_SLUG,
      ownerId: admin.id,
      status: 'active',
    },
  });

  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: { tenantId: tenant.id, userId: admin.id },
    },
    update: {
      role: 'OWNER',
      roleId: role.id,
      acceptedAt: new Date(),
    },
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      role: 'OWNER',
      roleId: role.id,
      acceptedAt: new Date(),
    },
  });

  // Invoice/list APIs are strict tenant-scoped. Extra memberships (e.g. an
  // older empty "demo-admin" workspace) make login land on a tenant with no
  // data — remove them so the demo always opens Kredmaxx Technologies.
  const removed = await prisma.tenantMembership.deleteMany({
    where: { userId: admin.id, tenantId: { not: tenant.id } },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} extra tenant membership(s) for demo admin`);
  }

  await prisma.companySettings.upsert({
    where: { userId: admin.id },
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
      tenantId: tenant.id,
    },
    create: {
      id: DEMO_COMPANY_ID,
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
      userId: admin.id,
      tenantId: tenant.id,
    },
  });

  console.log(`Demo workspace: ${COMPANY_NAME}`);
  console.log(`Admin: ${admin.email}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log(`Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`Login: http://localhost:3000/admin/login`);
  console.log(`Next: npm run prisma:seed:demo:full`);
}

main()
  .catch((err) => {
    console.error('Demo seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
