export const LEDGER_ROLES = [
  'AR',                     // Accounts Receivable
  'AP',                     // Accounts Payable
  'SALES_REVENUE',          // Revenue from sales
  'SALES_RETURNS',          // Returns and allowances
  'PURCHASES',              // Purchase expense
  'COGS',                   // Cost of Goods Sold
  'INVENTORY',              // Inventory asset
  'WIP',                    // Work in progress (manufacturing)
  'OUTPUT_TAX',             // Tax collected on sales (rollup / non-India)
  'INPUT_TAX',              // Tax paid on purchases (rollup / non-India)
  // India GST split control accounts (aliased to OUTPUT/INPUT tax outside IN pack)
  'OUTPUT_CGST',
  'OUTPUT_SGST',
  'OUTPUT_IGST',
  'INPUT_CGST',
  'INPUT_SGST',
  'INPUT_IGST',
  'TCS_PAYABLE',            // Tax collected at source (sales) liability
  'TDS_PAYABLE',            // Tax deducted at source (purchases) liability
  'ADVANCE_TAX',            // Prepaid income-tax (advance tax instalments)
  'TAX_PAYABLE',            // Current income-tax liability (provision)
  'INCOME_TAX_EXPENSE',     // Income-tax expense (P&L provision)
  'BANK',                   // Bank clearing / settlement
  'CASH',                   // Petty cash / cash on hand
  'ROUNDING',               // Rounding differences
  'OPENING_BALANCE_EQUITY', // Equity used for opening balances
  'RETAINED_EARNINGS',      // Accumulated retained earnings
  'CURRENT_YEAR_EARNINGS',  // P&L summary for current year
  'FX_GAIN_LOSS',           // Foreign-exchange realised gain/loss
  'FIXED_ASSET',            // Fixed assets (property, plant & equipment)
  'ACCUMULATED_DEPRECIATION', // Contra-asset: accumulated depreciation
  'DEPRECIATION_EXPENSE',   // Periodic depreciation charge
] as const;

export type LedgerRole = (typeof LEDGER_ROLES)[number];

const ROLE_SET: ReadonlySet<string> = new Set(LEDGER_ROLES);

export function isLedgerRole(value: string): value is LedgerRole {
  return ROLE_SET.has(value);
}
