import { LedgerError } from './buildLines';
import { getPack } from './packs';
import type { LedgerRole } from './roles';
import { LEDGER_ROLES } from './roles';

export interface ApplyPackTx {
  companySettings: {
    findFirst: (args: unknown) => Promise<{ id: string; ledgerInitialized: boolean } | null>;
    upsert: (args: unknown) => Promise<unknown>;
  };
  account: {
    findUnique: (args: unknown) => Promise<{ id: string; code: string } | null>;
    create: (args: { data: unknown }) => Promise<{ id: string; code: string }>;
    update: (args: unknown) => Promise<unknown>;
  };
  ledgerAccountMapping: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany?: (args: unknown) => Promise<Array<{ roleKey: string; accountId: string }>>;
  };
}

export interface ApplyPackInput {
  userId: string;
  tenantId?: string | null;
  countryCode: string;
  functionalCurrency?: string;
  fiscalYearStartMonth?: number;
  goLiveDate: Date;
}

export async function applyPack(tx: ApplyPackTx, input: ApplyPackInput): Promise<void> {
  const pack = getPack(input.countryCode);
  if (!pack) throw new LedgerError(`unknown country pack: ${input.countryCode}`);

  const settings = await tx.companySettings.findFirst({ where: { userId: input.userId } });
  if (settings?.ledgerInitialized) {
    throw new LedgerError('ledger already initialized; country/setup is immutable');
  }

  // 1. Seed CoA — parents first (sorted so a parent precedes its children by code length then code)
  const ordered = [...pack.accounts].sort((a, b) => (a.parentCode ? 1 : 0) - (b.parentCode ? 1 : 0));
  const codeToId = new Map<string, string>();
  const roleByCode = new Map(pack.accounts.filter((a) => a.role).map((a) => [a.code, a.role!]));

  for (const acc of ordered) {
    const existing = await tx.account.findUnique({ where: { userId_code: { userId: input.userId, code: acc.code } } });
    if (existing) {
      codeToId.set(acc.code, existing.id);
      if (roleByCode.has(acc.code)) {
        await tx.account.update({ where: { id: existing.id }, data: { roleProtected: true } });
      }
      continue;
    }
    const parentId = acc.parentCode ? codeToId.get(acc.parentCode) ?? null : null;
    const row = await tx.account.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId ?? null,
        code: acc.code, name: acc.name, accountType: acc.accountType,
        parentId, currencyCode: input.functionalCurrency ?? pack.defaultFunctionalCurrency,
        roleProtected: roleByCode.has(acc.code),
      },
    });
    codeToId.set(acc.code, row.id);
  }

  // 2. Map every role -> account id
  for (const role of Object.keys(pack.roleMap) as LedgerRole[]) {
    const code = pack.roleMap[role];
    const accountId = codeToId.get(code);
    if (!accountId) throw new LedgerError(`pack ${pack.countryCode} role ${role} -> missing account ${code}`);
    await tx.ledgerAccountMapping.upsert({
      where: { userId_roleKey: { userId: input.userId, roleKey: role } },
      create: {
        userId: input.userId,
        tenantId: input.tenantId ?? null,
        roleKey: role,
        accountId,
      },
      update: { accountId, ...(input.tenantId ? { tenantId: input.tenantId } : {}) },
    });
  }

  // 3. Write tenant ledger settings (NOT ledgerInitialized — that flips at cutover, B.6)
  // Use upsert so a fresh tenant with no CompanySettings row doesn't crash with P2025.
  await tx.companySettings.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      // Required String fields — populated with empty strings as placeholder defaults.
      // The tenant will complete these via the company-settings onboarding step.
      companyName: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      country: '',
      pincode: '',
      // Ledger fields
      countryCode: pack.countryCode,
      functionalCurrency: input.functionalCurrency ?? pack.defaultFunctionalCurrency,
      fiscalYearStartMonth: input.fiscalYearStartMonth ?? pack.fiscalYearStartMonth,
      goLiveDate: input.goLiveDate,
    },
    update: {
      countryCode: pack.countryCode,
      functionalCurrency: input.functionalCurrency ?? pack.defaultFunctionalCurrency,
      fiscalYearStartMonth: input.fiscalYearStartMonth ?? pack.fiscalYearStartMonth,
      goLiveDate: input.goLiveDate,
    },
  });
}

export interface EnsureMissingLedgerRolesInput {
  userId: string;
  tenantId?: string | null;
  countryCode?: string | null;
  functionalCurrency?: string | null;
}

function collectAncestorCodes(
  packAccounts: Array<{ code: string; parentCode?: string }>,
  leafCode: string,
): string[] {
  const byCode = new Map(packAccounts.map((a) => [a.code, a]));
  const out: string[] = [];
  let cur: string | undefined = leafCode;
  while (cur) {
    out.push(cur);
    cur = byCode.get(cur)?.parentCode;
  }
  return out.reverse(); // parents first
}

/**
 * For already-initialized ledgers: create any missing pack accounts and upsert
 * missing role mappings (e.g. newly added ADVANCE_TAX). Does not flip cutover.
 */
export async function ensureMissingLedgerRoles(
  tx: ApplyPackTx,
  input: EnsureMissingLedgerRolesInput,
): Promise<{ addedRoles: string[] }> {
  const countryCode = (input.countryCode || 'IN').trim().toUpperCase() || 'IN';
  const pack = getPack(countryCode);
  if (!pack) throw new LedgerError(`unknown country pack: ${countryCode}`);

  const existingMappings = tx.ledgerAccountMapping.findMany
    ? await tx.ledgerAccountMapping.findMany({
        where: { userId: input.userId },
        select: { roleKey: true, accountId: true },
      })
    : [];
  // No pack applied yet — do not bootstrap a full CoA from payment create.
  if (existingMappings.length === 0) return { addedRoles: [] };
  const mappedRoles = new Set(existingMappings.map((m) => m.roleKey));
  const missingRoles = LEDGER_ROLES.filter((r) => !mappedRoles.has(r));
  if (missingRoles.length === 0) return { addedRoles: [] };

  const currency = input.functionalCurrency ?? pack.defaultFunctionalCurrency;
  const codeToId = new Map<string, string>();
  const codesToEnsure = new Set<string>();
  for (const role of missingRoles) {
    for (const code of collectAncestorCodes(pack.accounts, pack.roleMap[role])) {
      codesToEnsure.add(code);
    }
  }

  const depthOf = (code: string): number => {
    let d = 0;
    let cur: string | undefined = code;
    const byCode = new Map(pack.accounts.map((a) => [a.code, a]));
    while (cur && byCode.get(cur)?.parentCode) {
      cur = byCode.get(cur)!.parentCode;
      d += 1;
    }
    return d;
  };
  // Parents before children.
  const ordered = [...pack.accounts]
    .filter((a) => codesToEnsure.has(a.code))
    .sort((a, b) => depthOf(a.code) - depthOf(b.code) || a.code.localeCompare(b.code));

  for (const acc of ordered) {
    const existing = await tx.account.findUnique({
      where: { userId_code: { userId: input.userId, code: acc.code } },
    });
    if (existing) {
      codeToId.set(acc.code, existing.id);
      continue;
    }
    const parentId = acc.parentCode ? codeToId.get(acc.parentCode) ?? null : null;
    const row = await tx.account.create({
      data: {
        userId: input.userId,
        tenantId: input.tenantId ?? null,
        code: acc.code,
        name: acc.name,
        accountType: acc.accountType,
        parentId,
        currencyCode: currency,
        roleProtected: Boolean(acc.role),
      },
    });
    codeToId.set(acc.code, row.id);
  }

  const addedRoles: string[] = [];
  for (const role of missingRoles) {
    const code = pack.roleMap[role];
    const accountId = codeToId.get(code);
    if (!accountId) {
      throw new LedgerError(`pack ${pack.countryCode} role ${role} -> missing account ${code}`);
    }
    await tx.ledgerAccountMapping.upsert({
      where: { userId_roleKey: { userId: input.userId, roleKey: role } },
      create: {
        userId: input.userId,
        tenantId: input.tenantId ?? null,
        roleKey: role,
        accountId,
      },
      update: { accountId, ...(input.tenantId ? { tenantId: input.tenantId } : {}) },
    });
    addedRoles.push(role);
  }

  return { addedRoles };
}
