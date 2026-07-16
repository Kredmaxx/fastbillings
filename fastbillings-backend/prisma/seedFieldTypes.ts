/**
 * Postgres/Prisma seed for the custom-field `FieldType` catalog.
 *
 * The Add/Edit Custom Field form (Settings > Module Settings > Custom Fields)
 * populates its "field type" dropdown from `/admin/field-types`. Without seeded
 * rows the form has nothing to select. Option-based types MUST use the slugs the
 * frontend recognises for the "options" editor: `dropdown`, `radio`, `check_box`.
 * Idempotent (slug is @unique → upsert).
 *
 * Run: `npx ts-node prisma/seedFieldTypes.ts` (or via the install/seed flow).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FIELD_TYPES: { name: string; slug: string }[] = [
  { name: 'Text', slug: 'text' },
  { name: 'Textarea', slug: 'textarea' },
  { name: 'Number', slug: 'number' },
  { name: 'Currency', slug: 'currency' },
  { name: 'Email', slug: 'email' },
  { name: 'Date', slug: 'date' },
  { name: 'Time', slug: 'time' },
  { name: 'Dropdown', slug: 'dropdown' },   // needs options (FE)
  { name: 'Radio', slug: 'radio' },         // needs options (FE)
  { name: 'Checkbox', slug: 'check_box' },  // needs options (FE)
];

export async function seedFieldTypes(): Promise<{ created: number }> {
  let created = 0;
  for (const ft of FIELD_TYPES) {
    const existing = await prisma.fieldType.findUnique({ where: { slug: ft.slug } });
    if (existing) continue;
    await prisma.fieldType.create({ data: { name: ft.name, slug: ft.slug } });
    created += 1;
  }
  return { created };
}

if (require.main === module) {
  seedFieldTypes()
    .then((r) => { console.log(`Field types seeded (created ${r.created} new).`); return prisma.$disconnect(); })
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('seedFieldTypes error:', e); await prisma.$disconnect(); process.exit(1); });
}
