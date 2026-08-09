export type GstProviderName = 'mock' | 'cleartax' | 'masters_india';

export interface GstProviderCredentials {
  /** Vendor API base URL (sandbox or production). */
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  username?: string;
  password?: string;
  /** Optional GSTIN override for auth context. */
  gstin?: string;
  /** Extra vendor-specific fields. */
  [key: string]: unknown;
}

export interface GstComplianceSettings {
  eInvoiceProvider: GstProviderName;
  eWayProvider: GstProviderName;
  enabled: boolean;
  livemode: boolean;
  config: GstProviderCredentials;
}

export function isGstProviderName(v: unknown): v is GstProviderName {
  return v === 'mock' || v === 'cleartax' || v === 'masters_india';
}
