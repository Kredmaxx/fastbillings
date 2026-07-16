import cron from 'node-cron';

import { runDueRecurringInvoices } from './lib/recurringInvoiceRunner';

const ENABLED = (process.env.RECURRING_INVOICES_CRON_ENABLED ?? '1') !== '0';

export async function runRecurringInvoiceCron(): Promise<void> {
  console.log(`[recurringInvoicesCron] Tick at ${new Date().toISOString()}`);
  try {
    const { processed, successes, failures } = await runDueRecurringInvoices();
    if (processed === 0) {
      console.log('[recurringInvoicesCron] No due invoices.');
      return;
    }
    console.log(`[recurringInvoicesCron] Processed ${processed}. Successes: ${successes.length}, Failures: ${failures.length}`);
    for (const s of successes) console.log(`  ✓ ${s}`);
    for (const f of failures) console.error(`  ✗ ${f.id}: ${f.error}`);
  } catch (err) {
    console.error('[recurringInvoicesCron] Top-level error:', err);
  }
}

if (ENABLED) {
  cron.schedule('0 0 * * *', runRecurringInvoiceCron);
  console.log('[recurringInvoicesCron] Scheduled (daily 00:00).');
} else {
  console.log('[recurringInvoicesCron] Disabled via env.');
}

module.exports = { runRecurringInvoiceCron };
