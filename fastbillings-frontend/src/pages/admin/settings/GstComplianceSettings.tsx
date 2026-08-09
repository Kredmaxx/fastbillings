import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import PageBackButton from '@components/admin/layouts/PageBackButton';

type ProviderId = 'mock' | 'cleartax' | 'masters_india';

interface GstCompliance {
  eInvoiceProvider: ProviderId;
  eWayProvider: ProviderId;
  enabled: boolean;
  livemode: boolean;
  config: Record<string, string>;
  updatedAt: string | null;
}

interface ProviderOption {
  id: ProviderId;
  label: string;
}

export default function GstComplianceSettings() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [form, setForm] = useState<GstCompliance>({
    eInvoiceProvider: 'mock',
    eWayProvider: 'mock',
    enabled: true,
    livemode: false,
    config: {},
    updatedAt: null,
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(Constants.GET_GST_COMPLIANCE_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = r.data?.data;
      setProviders(data?.providers ?? []);
      const gc = data?.gstCompliance;
      if (gc) {
        setForm({
          eInvoiceProvider: gc.eInvoiceProvider ?? 'mock',
          eWayProvider: gc.eWayProvider ?? 'mock',
          enabled: gc.enabled !== false,
          livemode: !!gc.livemode,
          config: (gc.config as Record<string, string>) ?? {},
          updatedAt: gc.updatedAt ?? null,
        });
      }
    } catch {
      toast.error('Failed to load GST compliance settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setConfigField(key: string, value: string) {
    setForm((p) => ({ ...p, config: { ...p.config, [key]: value } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const r = await axios.put(
        Constants.UPSERT_GST_COMPLIANCE_URL,
        {
          eInvoiceProvider: form.eInvoiceProvider,
          eWayProvider: form.eWayProvider,
          enabled: form.enabled,
          livemode: form.livemode,
          config: form.config,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success(r.data?.message ?? 'Saved');
      const gc = r.data?.data?.gstCompliance;
      if (gc) {
        setForm((p) => ({
          ...p,
          eInvoiceProvider: gc.eInvoiceProvider,
          eWayProvider: gc.eWayProvider,
          enabled: gc.enabled,
          livemode: gc.livemode,
          config: (gc.config as Record<string, string>) ?? {},
          updatedAt: gc.updatedAt ?? null,
        }));
      }
    } catch (e) {
      toast.error(
        axios.isAxiosError(e)
          ? (e.response?.data as { message?: string })?.message ?? 'Save failed'
          : 'Save failed',
      );
    } finally {
      setSaving(false);
    }
  }

  const needsClearTax =
    form.eInvoiceProvider === 'cleartax' || form.eWayProvider === 'cleartax';
  const needsMasters =
    form.eInvoiceProvider === 'masters_india' || form.eWayProvider === 'masters_india';

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-4">
        <PageBackButton />
      </div>
      <h1 className="text-2xl font-bold mb-2">GST compliance (e-invoice / e-way)</h1>
      <p className="text-sm text-gray-500 mb-4">
        Choose mock for demo IRNs, or ClearTax / Masters India with your sandbox or production credentials.
        Redacted secrets are preserved on save unless you enter new values.
      </p>

      {(form.eInvoiceProvider === 'mock' || form.eWayProvider === 'mock') && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          E-invoice / e-way provider is MOCK — IRNs are not live
          {form.eInvoiceProvider === 'mock' && form.eWayProvider !== 'mock' && ' (e-invoice only)'}
          {form.eWayProvider === 'mock' && form.eInvoiceProvider !== 'mock' && ' (e-way only)'}
        </div>
      )}

      <div className="space-y-4 border rounded-md p-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
          />
          Integrations enabled
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.livemode}
            onChange={(e) => setForm((p) => ({ ...p, livemode: e.target.checked }))}
          />
          Live mode (use production endpoints / credentials)
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">E-invoice provider</label>
            <select
              className="w-full border rounded p-2 text-sm"
              value={form.eInvoiceProvider}
              onChange={(e) =>
                setForm((p) => ({ ...p, eInvoiceProvider: e.target.value as ProviderId }))
              }
            >
              {(providers.length ? providers : [
                { id: 'mock' as const, label: 'Mock (dev / demo)' },
                { id: 'cleartax' as const, label: 'ClearTax' },
                { id: 'masters_india' as const, label: 'Masters India' },
              ]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">E-way bill provider</label>
            <select
              className="w-full border rounded p-2 text-sm"
              value={form.eWayProvider}
              onChange={(e) =>
                setForm((p) => ({ ...p, eWayProvider: e.target.value as ProviderId }))
              }
            >
              {(providers.length ? providers : [
                { id: 'mock' as const, label: 'Mock (dev / demo)' },
                { id: 'cleartax' as const, label: 'ClearTax' },
                { id: 'masters_india' as const, label: 'Masters India' },
              ]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">API base URL</label>
          <input
            type="text"
            className="w-full border rounded p-2 text-sm"
            placeholder="https://api-sandbox.example.com"
            value={form.config.baseUrl ?? ''}
            onChange={(e) => setConfigField('baseUrl', e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">GSTIN (auth context, optional)</label>
          <input
            type="text"
            className="w-full border rounded p-2 text-sm"
            value={form.config.gstin ?? ''}
            onChange={(e) => setConfigField('gstin', e.target.value)}
          />
        </div>

        {needsClearTax && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">ClearTax API key</label>
              <input
                type="password"
                autoComplete="off"
                className="w-full border rounded p-2 text-sm"
                value={form.config.apiKey ?? ''}
                onChange={(e) => setConfigField('apiKey', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">ClearTax API secret</label>
              <input
                type="password"
                autoComplete="off"
                className="w-full border rounded p-2 text-sm"
                value={form.config.apiSecret ?? ''}
                onChange={(e) => setConfigField('apiSecret', e.target.value)}
              />
            </div>
          </div>
        )}

        {needsMasters && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Masters India username</label>
              <input
                type="text"
                className="w-full border rounded p-2 text-sm"
                value={form.config.username ?? ''}
                onChange={(e) => setConfigField('username', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Masters India password</label>
              <input
                type="password"
                autoComplete="off"
                className="w-full border rounded p-2 text-sm"
                value={form.config.password ?? ''}
                onChange={(e) => setConfigField('password', e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {form.updatedAt && (
            <span className="text-xs text-gray-400">
              Last saved {new Date(form.updatedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
