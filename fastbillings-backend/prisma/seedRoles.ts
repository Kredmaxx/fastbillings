/**
 * Idempotent seeder: creates the 5 default roles and backfills existing users
 * that have no roleId.
 *
 * Roles created (by roleName, case-insensitive guard – duplicates skipped):
 *   Super Admin (user_type 0), Admin (user_type 1), Vendor (2), Staff (3), Maintainer (4), Supplier (5)
 *
 * Backfill: any User with user_type in the map above and roleId = null gets
 *           assigned the matching role (excludes user_type 999 sys-bootstrap).
 *
 * Run standalone:  npx ts-node prisma/seedRoles.ts
 * Called from:     prisma/seed.ts main()
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_ROLE_BY_USER_TYPE, ensureRole } from '../lib/defaultRoles';

// Seed runs standalone via `prisma db seed` — use its own client so the
// seeder is self-contained and doesn't depend on the hot-reload-cached
// shared client from lib/prisma.
const prisma = new PrismaClient();

export { ensureRole };

export interface SeedRolesResult {
  /** How many roles were newly created (not already present) */
  created: number;
  /** How many users were backfilled with a default role */
  backfilled: number;
  /** Map from user_type → role id */
  roleIds: Record<number, string>;
}

export async function seedRoles(): Promise<SeedRolesResult> {
  let created = 0;
  const roleIds: Record<number, string> = {};

  for (const [userTypeStr, roleName] of Object.entries(DEFAULT_ROLE_BY_USER_TYPE)) {
    const userType = Number(userTypeStr);
    const before = await prisma.role.findFirst({
      where: { roleName: { equals: roleName, mode: 'insensitive' }, deletedAt: null },
    });
    const id = await ensureRole(roleName, prisma);
    roleIds[userType] = id;
    if (!before) created += 1;
  }

  // Backfill: assign default role to existing users that have none
  let backfilled = 0;
  for (const [userTypeStr, roleId] of Object.entries(roleIds)) {
    const userType = Number(userTypeStr);
    const result = await prisma.user.updateMany({
      where: {
        user_type: userType,
        roleId: null,
      },
      data: { roleId },
    });
    backfilled += result.count;
  }

  return { created, backfilled, roleIds };
}

if (require.main === module) {
  seedRoles()
    .then((r) => {
      console.log(
        `Roles seeded (created ${r.created} new, backfilled ${r.backfilled} users).`,
      );
      return prisma.$disconnect();
    })
    .then(() => process.exit(0))
    .catch(async (e) => {
      console.error('seedRoles error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
