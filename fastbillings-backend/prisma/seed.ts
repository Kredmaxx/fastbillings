/**
 * Baseline seed — runs by default for fresh installs (CodeCanyon customers).
 *
 * Seeds ONLY the lookup data that the onboarding flow needs:
 *   - System bootstrap user (user_type=999, doesn't count as admin so
 *     /api/admin/app-version still reports `new_register: true`)
 *   - Countries / States / Cities (a handful — enough to demo)
 *   - Timezones / DateFormats / TimeFormats
 *   - Currencies (linked to the bootstrap user as createdBy)
 *
 * Does NOT create an admin user. The frontend will render /register on
 * first run so the customer goes through the onboarding flow.
 *
 * For the CodeCanyon public demo (with admin@demo.fastbillings.local /
 * Demo123$ already provisioned), run `npm run prisma:seed:demo` AFTER
 * `npm run prisma:seed`.
 *
 * Idempotent — re-running is safe.
 */

import { PrismaClient } from '@prisma/client';
import { seedModules } from './seedModules';
import { seedFieldTypes } from './seedFieldTypes';
import { seedNotifications } from './seedNotifications';
import { seedEmailTemplates } from './seedEmailTemplates';
import { seedRoles } from './seedRoles';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // ---------------------------------------------------------------------------
  // System bootstrap user (needed as a FK target for Currency.createdBy).
  // user_type=999 so app-version doesn't count it as an admin.
  // ---------------------------------------------------------------------------
  await prisma.user.upsert({
    where: { id: 'sys-bootstrap' },
    update: {},
    create: {
      id: 'sys-bootstrap',
      firstName: 'System',
      lastName: 'Bootstrap',
      email: 'system@fastbillings.internal',
      password: '$2b$10$disabled',
      user_type: 999,
      balance: 0,
      isDeleted: false,
    },
  });

  // ---------------------------------------------------------------------------
  // Countries
  // ---------------------------------------------------------------------------
  const countries = [
    { id: 'c-india', name: 'India', iso3: 'IND', iso2: 'IN', phonecode: '91', capital: 'New Delhi', currency: 'INR' },
    { id: 'c-united-states', name: 'United States', iso3: 'USA', iso2: 'US', phonecode: '1', capital: 'Washington', currency: 'USD' },
    { id: 'c-united-kingdom', name: 'United Kingdom', iso3: 'GBR', iso2: 'GB', phonecode: '44', capital: 'London', currency: 'GBP' },
    { id: 'c-australia', name: 'Australia', iso3: 'AUS', iso2: 'AU', phonecode: '61', capital: 'Canberra', currency: 'AUD' },
    { id: 'c-canada', name: 'Canada', iso3: 'CAN', iso2: 'CA', phonecode: '1', capital: 'Ottawa', currency: 'CAD' },
    { id: 'c-germany', name: 'Germany', iso3: 'DEU', iso2: 'DE', phonecode: '49', capital: 'Berlin', currency: 'EUR' },
    { id: 'c-france', name: 'France', iso3: 'FRA', iso2: 'FR', phonecode: '33', capital: 'Paris', currency: 'EUR' },
    { id: 'c-singapore', name: 'Singapore', iso3: 'SGP', iso2: 'SG', phonecode: '65', capital: 'Singapore', currency: 'SGD' },
    { id: 'c-uae', name: 'United Arab Emirates', iso3: 'ARE', iso2: 'AE', phonecode: '971', capital: 'Abu Dhabi', currency: 'AED' },
    { id: 'c-japan', name: 'Japan', iso3: 'JPN', iso2: 'JP', phonecode: '81', capital: 'Tokyo', currency: 'JPY' },
  ];
  for (const c of countries) {
    await prisma.country.upsert({ where: { id: c.id }, update: c, create: c });
  }

  // ---------------------------------------------------------------------------
  // States
  // ---------------------------------------------------------------------------
  const states = [
    { id: 's-tn', name: 'Tamil Nadu', country_id: 'c-india', state_code: 'TN' },
    { id: 's-ka', name: 'Karnataka', country_id: 'c-india', state_code: 'KA' },
    { id: 's-mh', name: 'Maharashtra', country_id: 'c-india', state_code: 'MH' },
    { id: 's-dl', name: 'Delhi', country_id: 'c-india', state_code: 'DL' },
    { id: 's-kl', name: 'Kerala', country_id: 'c-india', state_code: 'KL' },
    { id: 's-tg', name: 'Telangana', country_id: 'c-india', state_code: 'TG' },
    { id: 's-ca', name: 'California', country_id: 'c-united-states', state_code: 'CA' },
    { id: 's-ny', name: 'New York', country_id: 'c-united-states', state_code: 'NY' },
    { id: 's-tx', name: 'Texas', country_id: 'c-united-states', state_code: 'TX' },
    { id: 's-fl', name: 'Florida', country_id: 'c-united-states', state_code: 'FL' },
    { id: 's-eng', name: 'England', country_id: 'c-united-kingdom', state_code: 'ENG' },
    { id: 's-sco', name: 'Scotland', country_id: 'c-united-kingdom', state_code: 'SCO' },
  ];
  for (const s of states) {
    await prisma.state.upsert({ where: { id: s.id }, update: s, create: s });
  }

  // ---------------------------------------------------------------------------
  // Cities
  // ---------------------------------------------------------------------------
  const cities = [
    { id: 'ci-chennai', name: 'Chennai', state_id: 's-tn', country_id: 'c-india' },
    { id: 'ci-coimbatore', name: 'Coimbatore', state_id: 's-tn', country_id: 'c-india' },
    { id: 'ci-madurai', name: 'Madurai', state_id: 's-tn', country_id: 'c-india' },
    { id: 'ci-bangalore', name: 'Bangalore', state_id: 's-ka', country_id: 'c-india' },
    { id: 'ci-mysore', name: 'Mysore', state_id: 's-ka', country_id: 'c-india' },
    { id: 'ci-mumbai', name: 'Mumbai', state_id: 's-mh', country_id: 'c-india' },
    { id: 'ci-pune', name: 'Pune', state_id: 's-mh', country_id: 'c-india' },
    { id: 'ci-delhi', name: 'New Delhi', state_id: 's-dl', country_id: 'c-india' },
    { id: 'ci-kochi', name: 'Kochi', state_id: 's-kl', country_id: 'c-india' },
    { id: 'ci-hyd', name: 'Hyderabad', state_id: 's-tg', country_id: 'c-india' },
    { id: 'ci-sf', name: 'San Francisco', state_id: 's-ca', country_id: 'c-united-states' },
    { id: 'ci-la', name: 'Los Angeles', state_id: 's-ca', country_id: 'c-united-states' },
    { id: 'ci-nyc', name: 'New York City', state_id: 's-ny', country_id: 'c-united-states' },
    { id: 'ci-austin', name: 'Austin', state_id: 's-tx', country_id: 'c-united-states' },
    { id: 'ci-miami', name: 'Miami', state_id: 's-fl', country_id: 'c-united-states' },
    { id: 'ci-london', name: 'London', state_id: 's-eng', country_id: 'c-united-kingdom' },
    { id: 'ci-manchester', name: 'Manchester', state_id: 's-eng', country_id: 'c-united-kingdom' },
    { id: 'ci-edinburgh', name: 'Edinburgh', state_id: 's-sco', country_id: 'c-united-kingdom' },
  ];
  for (const c of cities) {
    await prisma.city.upsert({ where: { id: c.id }, update: c, create: c });
  }

  // ---------------------------------------------------------------------------
  // Timezones
  // ---------------------------------------------------------------------------
  const timezones = [
    { id: 'tz-ist', name: 'Asia/Kolkata', utc_offset: '+05:30' },
    { id: 'tz-utc', name: 'UTC', utc_offset: '+00:00' },
    { id: 'tz-est', name: 'America/New_York', utc_offset: '-05:00' },
    { id: 'tz-pst', name: 'America/Los_Angeles', utc_offset: '-08:00' },
    { id: 'tz-gmt', name: 'Europe/London', utc_offset: '+00:00' },
    { id: 'tz-cet', name: 'Europe/Paris', utc_offset: '+01:00' },
    { id: 'tz-jst', name: 'Asia/Tokyo', utc_offset: '+09:00' },
    { id: 'tz-gst', name: 'Asia/Dubai', utc_offset: '+04:00' },
    { id: 'tz-aest', name: 'Australia/Sydney', utc_offset: '+10:00' },
    { id: 'tz-sgt', name: 'Asia/Singapore', utc_offset: '+08:00' },
  ];
  for (const tz of timezones) {
    await prisma.timezone.upsert({ where: { id: tz.id }, update: tz, create: tz });
  }

  // ---------------------------------------------------------------------------
  // Date formats
  // ---------------------------------------------------------------------------
  const dateFormats = [
    { id: 'df-dmy-slash', title: 'DD/MM/YYYY', format: 'DD/MM/YYYY', isActive: true, isDeleted: false },
    { id: 'df-mdy-slash', title: 'MM/DD/YYYY', format: 'MM/DD/YYYY', isActive: true, isDeleted: false },
    { id: 'df-ymd-dash', title: 'YYYY-MM-DD', format: 'YYYY-MM-DD', isActive: true, isDeleted: false },
    { id: 'df-dmy-dash', title: 'DD-MM-YYYY', format: 'DD-MM-YYYY', isActive: true, isDeleted: false },
  ];
  for (const df of dateFormats) {
    await prisma.dateFormat.upsert({ where: { id: df.id }, update: df, create: df });
  }

  // ---------------------------------------------------------------------------
  // Time formats
  // ---------------------------------------------------------------------------
  const timeFormats = [
    { id: 'tf-24h', name: '24 Hour', format: 'HH:mm', isActive: true, isDeleted: false },
    { id: 'tf-12h', name: '12 Hour', format: 'hh:mm A', isActive: true, isDeleted: false },
  ];
  for (const tf of timeFormats) {
    await prisma.timeFormat.upsert({ where: { id: tf.id }, update: tf, create: tf });
  }

  // ---------------------------------------------------------------------------
  // Currencies (createdBy = bootstrap user)
  // ---------------------------------------------------------------------------
  const currencies = [
    { id: 'cur-inr', name: 'Indian Rupee', code: 'INR', symbol: '₹', isDefault: true },
    { id: 'cur-usd', name: 'US Dollar', code: 'USD', symbol: '$', isDefault: false },
    { id: 'cur-eur', name: 'Euro', code: 'EUR', symbol: '€', isDefault: false },
    { id: 'cur-gbp', name: 'British Pound', code: 'GBP', symbol: '£', isDefault: false },
    { id: 'cur-aud', name: 'Australian Dollar', code: 'AUD', symbol: 'A$', isDefault: false },
    { id: 'cur-cad', name: 'Canadian Dollar', code: 'CAD', symbol: 'C$', isDefault: false },
    { id: 'cur-sgd', name: 'Singapore Dollar', code: 'SGD', symbol: 'S$', isDefault: false },
    { id: 'cur-jpy', name: 'Japanese Yen', code: 'JPY', symbol: '¥', isDefault: false },
    { id: 'cur-aed', name: 'UAE Dirham', code: 'AED', symbol: 'د.إ', isDefault: false },
  ];
  for (const cur of currencies) {
    await prisma.currency.upsert({
      where: { id: cur.id },
      update: { ...cur, status: true, isDeleted: false, createdBy: 'sys-bootstrap' },
      create: { ...cur, status: true, isDeleted: false, createdBy: 'sys-bootstrap' },
    });
  }

  // ---------------------------------------------------------------------------
  // Module hierarchy + custom-field type catalog. These drive the
  // roles/permissions tree and the Settings > Module Settings (custom fields)
  // screens. Both are idempotent. Without them, fresh installs show an empty
  // module tree and "Module … could not be found" on the module-settings pages.
  // ---------------------------------------------------------------------------
  const mods = await seedModules();
  console.log(`Modules seeded (created ${mods.created} new).`);
  const fts = await seedFieldTypes();
  console.log(`Field types seeded (created ${fts.created} new).`);

  // Notification types + tags drive the Email Templates / notification settings
  // screens. Idempotent. (EmailTemplate rows are user-created.)
  const notifs = await seedNotifications();
  console.log(`Notifications seeded (created ${notifs.types} types, ${notifs.tags} tags, ${notifs.links} links).`);

  // Baseline email templates (global content library, ready to use by any company).
  const tmpls = await seedEmailTemplates();
  console.log(`Email templates seeded (created ${tmpls.created}, skipped ${tmpls.skipped}).`);

  // Default roles (Admin, Vendor, Staff, Maintainer, Supplier) + backfill
  // existing users that have no roleId.
  const roles = await seedRoles();
  console.log(
    `Roles seeded (created ${roles.created} new, backfilled ${roles.backfilled} users).`,
  );

  console.log('Baseline seed complete: lookup data ready.');
  console.log('Fresh installs: visit / and use the onboarding flow (register → setup).');
  console.log('For CodeCanyon demo, also run:  npx ts-node prisma/seed-demo.ts');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
