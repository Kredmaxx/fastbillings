import { buildStandardPack } from './buildStandardPack';
import type { CountryPack, PackAccount } from './types';

/** India: keep OUTPUT_TAX / INPUT_TAX rollups and add CGST/SGST/IGST control accounts. */
function withIndiaGstSplitAccounts(pack: CountryPack): CountryPack {
  const extras: PackAccount[] = [
    { code: '2101', name: 'Output CGST', accountType: 'LIABILITY', parentCode: '2100', role: 'OUTPUT_CGST' },
    { code: '2102', name: 'Output SGST', accountType: 'LIABILITY', parentCode: '2100', role: 'OUTPUT_SGST' },
    { code: '2103', name: 'Output IGST', accountType: 'LIABILITY', parentCode: '2100', role: 'OUTPUT_IGST' },
    { code: '1301', name: 'Input CGST', accountType: 'ASSET', parentCode: '1000', role: 'INPUT_CGST' },
    { code: '1302', name: 'Input SGST', accountType: 'ASSET', parentCode: '1000', role: 'INPUT_SGST' },
    { code: '1303', name: 'Input IGST', accountType: 'ASSET', parentCode: '1000', role: 'INPUT_IGST' },
  ];
  const accounts = [...pack.accounts, ...extras];
  return {
    ...pack,
    accounts,
    roleMap: {
      ...pack.roleMap,
      OUTPUT_CGST: '2101',
      OUTPUT_SGST: '2102',
      OUTPUT_IGST: '2103',
      TCS_PAYABLE: '2105',
      TDS_PAYABLE: '2106',
      INPUT_CGST: '1301',
      INPUT_SGST: '1302',
      INPUT_IGST: '1303',
    },
  };
}

export const COUNTRY_PACKS: Record<string, CountryPack> = {
  IN: withIndiaGstSplitAccounts(
    buildStandardPack({
      countryCode: 'IN', name: 'India', defaultFunctionalCurrency: 'INR', fiscalYearStartMonth: 4,
      taxRegime: 'GST_INDIA', outputTaxName: 'GST Payable (Output)', inputTaxName: 'GST Receivable (Input)',
    }),
  ),
  GB: buildStandardPack({
    countryCode: 'GB', name: 'United Kingdom', defaultFunctionalCurrency: 'GBP', fiscalYearStartMonth: 4,
    taxRegime: 'VAT_UK', outputTaxName: 'VAT Payable (Output)', inputTaxName: 'VAT Reclaimable (Input)',
  }),
  EU: buildStandardPack({
    countryCode: 'EU', name: 'European Union', defaultFunctionalCurrency: 'EUR', fiscalYearStartMonth: 1,
    taxRegime: 'VAT_EU', outputTaxName: 'VAT Payable', inputTaxName: 'VAT Deductible',
  }),
  US: buildStandardPack({
    countryCode: 'US', name: 'United States', defaultFunctionalCurrency: 'USD', fiscalYearStartMonth: 1,
    taxRegime: 'SALES_TAX_US', outputTaxName: 'Sales Tax Payable', inputTaxName: 'Sales Tax Paid', inputTaxIsExpense: true,
  }),
  AU: buildStandardPack({
    countryCode: 'AU', name: 'Australia', defaultFunctionalCurrency: 'AUD', fiscalYearStartMonth: 7,
    taxRegime: 'GST_AU', outputTaxName: 'GST Collected', inputTaxName: 'GST Paid',
  }),
  NZ: buildStandardPack({
    countryCode: 'NZ', name: 'New Zealand', defaultFunctionalCurrency: 'NZD', fiscalYearStartMonth: 4,
    taxRegime: 'GST_NZ', outputTaxName: 'GST Payable', inputTaxName: 'GST Receivable',
  }),
};

export const COUNTRY_CODES = Object.keys(COUNTRY_PACKS);

export function getPack(countryCode: string): CountryPack | null {
  return COUNTRY_PACKS[countryCode] ?? null;
}
