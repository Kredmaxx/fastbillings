/**
 * Platform super-admin seed — provisions the FastBillings platform owner account.
 *
 * Run AFTER `npm run prisma:seed`:
 *   npx ts-node prisma/seed-platform-admin.ts
 *
 * Creates:
 *   - Super Admin user: superadmin@fastbillings.local / SuperAdmin123$ (user_type=0)
 *   - Global "Super Admin" role (platform scope, no tenantId)
 *
 * This account is the platform owner and can switch into any tenant workspace.
 * Tenant/company administrators use user_type=1 (Admin) via registration or seed-demo.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { USER_TYPE } from '../lib/userTypes';
import { ensureRole } from '../lib/defaultRoles';

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'superadmin@fastbillings.local';
const SUPER_ADMIN_PASSWORD = 'SuperAdmin123$';
const SUPER_ADMIN_ID = 'platform-super-admin-1';

async function main(): Promise<void> {
  const roleId = await ensureRole('Super Admin', prisma);
  const passwordHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {
      password: passwordHash,
      firstName: 'Platform',
      lastName: 'Super Admin',
      user_type: USER_TYPE.SUPER_ADMIN,
      roleId,
      isDeleted: false,
    },
    create: {
      id: SUPER_ADMIN_ID,
      email: SUPER_ADMIN_EMAIL,
      password: passwordHash,
      firstName: 'Platform',
      lastName: 'Super Admin',
      user_type: USER_TYPE.SUPER_ADMIN,
      roleId,
      balance: 0,
      isDeleted: false,
    },
  });

  console.log(`Platform super admin seeded: ${admin.email}`);
  console.log(`Password: ${SUPER_ADMIN_PASSWORD}`);
  console.log('Role: Super Admin (platform owner)');
}

main()
  .catch((err) => {
    console.error('Platform admin seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
