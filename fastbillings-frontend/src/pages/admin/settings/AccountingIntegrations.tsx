import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';

type Kind = 'XERO' | 'QUICKBOOKS';

interface Integration {
  id: string;
  kind: Kind;
  enabled: boolean;
  lastSyncedAt: string | null;
  syncStatus: string | null;
  errorMessage: string | null;
}

export default function AccountingIntegrations() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDateTime } = useDateFormatter();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [clientIds, setClientIds] = useState<Record<Kind, string>>({ XERO: '', QUICKBOOKS: '' });
  const [redirectUris, setRedirectUris] = useState<Record<Kind, string>>({
    XERO: typeof window !== 'undefined' ? `${window.location.origin}/admin/integrations/xero/callback` : '',
    QUICKBOOKS: typeof window !== 'undefined' ? `${window.location.origin}/admin/integrations/quickbooks/callback` : '',
  });

  async function load() {
    try {
      const r = await axios.get(Constants.GET_ACCOUNTING_INTEGRATIONS_URL, { headers: { Authorization: `Bearer ${token}` } });
      setIntegrations(r.data?.data?.integrations ?? []);
    } catch { /* ignore */ }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function getStatus(kind: Kind) {
    return integrations.find((i) => i.kind === kind);
  }

  async function handleConnect(kind: Kind) {
    try {
      const r = await axios.post(
        `${Constants.CONNECT_ACCOUNTING_INTEGRATION_URL}/${kind}/connect`,
        { clientId: clientIds[kind], redirectUri: redirectUris[kind] },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const oauthUrl = r.data?.data?.oauthUrl;
      if (oauthUrl) {
        window.open(oauthUrl, '_blank');
        toast.success('Opened OAuth flow in new tab');
      }
    } catch {
      toast.error('Failed to start OAuth');
    }
  }

  async function handleSync(kind: Kind) {
    try {
      const r = await axios.post(
        `${Constants.SYNC_ACCOUNTING_INTEGRATION_URL}/${kind}/sync`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success(r.data?.message ?? 'Synced');
      load();
    } catch (e) {
      toast.error(axios.isAxiosError(e) ? (e.response?.data as { message?: string })?.message ?? 'Sync failed' : 'Sync failed');
    }
  }

  async function handleDisconnect(kind: Kind) {
    if (!window.confirm(`Disconnect ${kind}?`)) return;
    try {
      await axios.delete(`${Constants.DISCONNECT_ACCOUNTING_INTEGRATION_URL}/${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Disconnected');
      load();
    } catch {
      toast.error('Failed to disconnect');
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-2">
        Accounting Integrations (Stub)
        <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
          Not live sync
        </span>
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Connect UI for Xero or QuickBooks — provider implementations are stubbed. OAuth and two-way invoice sync are not live in this MVP.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['XERO', 'QUICKBOOKS'] as const).map((kind) => {
          const status = getStatus(kind);
          const enabled = !!status?.enabled;
          return (
            <div key={kind} className="border rounded-md p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-medium">{kind === 'XERO' ? 'Xero' : 'QuickBooks Online'}</h2>
                <span className={'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' + (enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700')}>
                  {enabled ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {!enabled ? (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500">Client ID</label>
                    <input type="text" value={clientIds[kind]} onChange={(e) => setClientIds((p) => ({ ...p, [kind]: e.target.value }))} className="p-1 w-full border rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500">Redirect URI</label>
                    <input type="text" value={redirectUris[kind]} onChange={(e) => setRedirectUris((p) => ({ ...p, [kind]: e.target.value }))} className="p-1 w-full border rounded text-sm" />
                  </div>
                  <button onClick={() => handleConnect(kind)} className="px-3 py-1 bg-purple-600 text-white text-sm rounded">Connect</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">Last synced: {status?.lastSyncedAt ? formatDateTime(status.lastSyncedAt) : 'Never'}</p>
                  <p className="text-xs text-gray-500">Status: {status?.syncStatus ?? '—'}</p>
                  {status?.errorMessage && <p className="text-xs text-red-600">Error: {status.errorMessage}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => handleSync(kind)} className="px-3 py-1 bg-purple-600 text-white text-sm rounded">Sync Now</button>
                    <button onClick={() => handleDisconnect(kind)} className="px-3 py-1 border text-sm rounded">Disconnect</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
