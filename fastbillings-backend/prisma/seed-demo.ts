/**
 * Demo seed — provisions the CodeCanyon listing demo account.
 *
 * Run AFTER `npm run prisma:seed` (the baseline lookup data must exist).
 *
 *   npx ts-node prisma/seed-demo.ts
 *
 * Creates:
 *   - Role "Administrator"
 *   - Tenant admin user: admin@demo.fastbillings.local / Demo123$  (user_type=1, Admin)
 *   - Default CompanySettings tied to that admin
 *
 * After this seed the frontend skips /register and /setup and lands at
 * /admin/login directly. Customers running a clean install should NOT run
 * this script — they should go through the onboarding flow instead.
 *
 * Idempotent — re-running updates the demo admin's password without
 * touching anything else.
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

async function main(): Promise<void> {
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
      firstName: 'Demo',
      lastName: 'Admin',
      user_type: USER_TYPE.ADMIN,
      roleId: role.id,
      isDeleted: false,
    },
    create: {
      id: DEMO_USER_ID,
      email: DEMO_EMAIL,
      password: passwordHash,
      firstName: 'Demo',
      lastName: 'Admin',
      user_type: USER_TYPE.ADMIN,
      roleId: role.id,
      balance: 0,
      isDeleted: false,
    },
  });

  await prisma.companySettings.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      id: DEMO_COMPANY_ID,
      companyName: 'Dreams Technologies',
      email: 'support@example.com',
      phone: '+91-9876543210',
      address: 'Chennai, Tamil Nadu, India',
      city: 'Chennai',
      state: 'Tamil Nadu',
      country: 'India',
      pincode: '600001',
      userId: admin.id,
    },
  });

  console.log(`Demo admin seeded: ${admin.email}`);
  console.log(`Password: ${DEMO_PASSWORD}`);
  console.log(`Login at: http://localhost:8080/admin/login`);
}

main()
  .catch((err) => {
    console.error('Demo seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
