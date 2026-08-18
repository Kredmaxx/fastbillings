import { stateCodeFromGstin } from '../einvoicePayload';

/** GST numeric state/UT codes (first 2 digits of GSTIN). */
const NAME_TO_CODE: Record<string, string> = {
  'jammu and kashmir': '01',
  'jammu & kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  orissa: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'daman and diu': '25',
  'dadra and nagar haveli': '26',
  'dadra & nagar haveli': '26',
  maharashtra: '27',
  'andhra pradesh (old)': '28',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  pondicherry: '34',
  'andaman and nicobar islands': '35',
  'andaman & nicobar': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Resolve place of supply to 2-digit GST state code.
 * Prefers buyer GSTIN prefix, then state name lookup.
 */
export function resolvePlaceOfSupplyCode(input: {
  placeOfSupply?: string | null;
  gstin?: string | null;
}): string | null {
  const fromGstin = input.gstin ? stateCodeFromGstin(input.gstin) : null;
  if (fromGstin) return fromGstin;

  const pos = String(input.placeOfSupply ?? '').trim();
  if (!pos || pos.toLowerCase() === 'unknown') return null;

  if (/^\d{2}$/.test(pos)) return pos;

  const code = NAME_TO_CODE[normName(pos)];
  if (code) return code;

  // Partial match (e.g. "Maharashtra" in longer string)
  const n = normName(pos);
  for (const [name, c] of Object.entries(NAME_TO_CODE)) {
    if (n.includes(name) || name.includes(n)) return c;
  }

  return null;
}
