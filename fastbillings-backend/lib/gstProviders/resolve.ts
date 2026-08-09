import type { EInvoiceProvider } from '../einvoiceProvider';
import type { EWayBillProvider } from '../ewayProvider';
import { mockEInvoiceProvider } from '../einvoiceProviders/mockProvider';
import { clearTaxEInvoiceProvider } from '../einvoiceProviders/cleartaxProvider';
import { mastersIndiaEInvoiceProvider } from '../einvoiceProviders/mastersIndiaProvider';
import { mockEWayBillProvider } from '../ewayProviders/mockProvider';
import { clearTaxEWayBillProvider } from '../ewayProviders/cleartaxProvider';
import { mastersIndiaEWayBillProvider } from '../ewayProviders/mastersIndiaProvider';
import { prisma } from '../prisma';
import {
  isGstProviderName,
  type GstComplianceSettings,
  type GstProviderCredentials,
  type GstProviderName,
} from './types';

const DEFAULTS: GstComplianceSettings = {
  eInvoiceProvider: 'mock',
  eWayProvider: 'mock',
  enabled: true,
  livemode: false,
  config: {},
};

/** Prefer workspace (tenant) config, then legacy user-owned row. */
export async function findGstComplianceConfig(userId: string, tenantId?: string | null) {
  if (tenantId) {
    const byTenant = await prisma.gstComplianceConfig.findUnique({ where: { tenantId } });
    if (byTenant) return byTenant;
  }
  return prisma.gstComplianceConfig.findUnique({ where: { userId } });
}

export async function loadGstComplianceSettings(
  userId: string,
  tenantId?: string | null,
): Promise<GstComplianceSettings> {
  const row = await findGstComplianceConfig(userId, tenantId);
  if (!row) return { ...DEFAULTS };
  const eInvoiceProvider = isGstProviderName(row.eInvoiceProvider) ? row.eInvoiceProvider : 'mock';
  const eWayProvider = isGstProviderName(row.eWayProvider) ? row.eWayProvider : 'mock';
  const config =
    row.config && typeof row.config === 'object' && !Array.isArray(row.config)
      ? (row.config as GstProviderCredentials)
      : {};
  return {
    eInvoiceProvider,
    eWayProvider,
    enabled: row.enabled,
    livemode: row.livemode,
    config,
  };
}

export function resolveEInvoiceProvider(name: GstProviderName): EInvoiceProvider {
  switch (name) {
    case 'cleartax':
      return clearTaxEInvoiceProvider;
    case 'masters_india':
      return mastersIndiaEInvoiceProvider;
    case 'mock':
    default:
      return mockEInvoiceProvider;
  }
}

export function resolveEWayProvider(name: GstProviderName): EWayBillProvider {
  switch (name) {
    case 'cleartax':
      return clearTaxEWayBillProvider;
    case 'masters_india':
      return mastersIndiaEWayBillProvider;
    case 'mock':
    default:
      return mockEWayBillProvider;
  }
}

export async function getEInvoiceRuntime(
  userId: string,
  tenantId?: string | null,
): Promise<{
  provider: EInvoiceProvider;
  config: GstProviderCredentials;
  settings: GstComplianceSettings;
}> {
  const settings = await loadGstComplianceSettings(userId, tenantId);
  if (!settings.enabled) {
    throw new Error('GST compliance integrations are disabled for this account');
  }
  return {
    provider: resolveEInvoiceProvider(settings.eInvoiceProvider),
    config: settings.config,
    settings,
  };
}

export async function getEWayRuntime(
  userId: string,
  tenantId?: string | null,
): Promise<{
  provider: EWayBillProvider;
  config: GstProviderCredentials;
  settings: GstComplianceSettings;
}> {
  const settings = await loadGstComplianceSettings(userId, tenantId);
  if (!settings.enabled) {
    throw new Error('GST compliance integrations are disabled for this account');
  }
  return {
    provider: resolveEWayProvider(settings.eWayProvider),
    config: settings.config,
    settings,
  };
}
