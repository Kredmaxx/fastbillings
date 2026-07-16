import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';

interface RazorpayFormData {
  enabled: boolean;
  livemode: boolean;
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

const initial: RazorpayFormData = {
  enabled: false,
  livemode: false,
  keyId: '',
  keySecret: '',
  webhookSecret: '',
};

export default function RazorpayConfig() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [data, setData] = useState<RazorpayFormData>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    axios
      .get(`${Constants.GET_GATEWAY_CONFIGS_URL}/RAZORPAY?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const cfg = r.data?.data?.gatewayConfig;
        if (!cfg) return;
        const c = (cfg.config ?? {}) as Record<string, string | undefined>;
        setData({
          enabled: cfg.enabled ?? false,
          livemode: cfg.livemode ?? false,
          keyId: c.keyId ?? '',
          keySecret: c.keySecret ?? '',
          webhookSecret: c.webhookSecret ?? '',
        });
      })
      .catch(() => { /* not configured yet */ });
  }, [token]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.put(
        `${Constants.UPSERT_GATEWAY_CONFIG_URL}/RAZORPAY`,
        {
          enabled: data.enabled,
          livemode: data.livemode,
          config: { keyId: data.keyId, keySecret: data.keySecret, webhookSecret: data.webhookSecret },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Razorpay config saved');
    } catch {
      toast.error('Failed to save config');
    } finally {
      setSaving(false);
    }
  }

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/public/razorpay/webhook` : '';

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">Razorpay Configuration</h1>
      <p className="text-sm text-gray-500 mb-6">
        Enter your Razorpay API credentials. Use test-mode keys for development, then flip the Live mode toggle when ready for production.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={data.enabled} onChange={(e) => setData((p) => ({ ...p, enabled: e.target.checked }))} />
            <span className="text-sm">Enabled</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={data.livemode} onChange={(e) => setData((p) => ({ ...p, livemode: e.target.checked }))} />
            <span className="text-sm">Live mode</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Key ID</label>
          <input type="text" value={data.keyId} onChange={(e) => setData((p) => ({ ...p, keyId: e.target.value }))} className="mt-1 p-2 w-full border rounded text-sm" placeholder="rzp_test_..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Key Secret</label>
          <input type="password" value={data.keySecret} onChange={(e) => setData((p) => ({ ...p, keySecret: e.target.value }))} className="mt-1 p-2 w-full border rounded text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-600">Webhook Secret</label>
          <input type="password" value={data.webhookSecret} onChange={(e) => setData((p) => ({ ...p, webhookSecret: e.target.value }))} className="mt-1 p-2 w-full border rounded text-sm" />
          <p className="text-xs text-gray-500 mt-1">
            Register this webhook URL in Razorpay dashboard:{' '}
            <code className="bg-gray-100 px-2 py-1 rounded">{webhookUrl}</code>
          </p>
        </div>
        <div>
          <button type="submit" disabled={saving} className="px-3 py-2 bg-purple-600 text-white rounded text-sm disabled:opacity-50">
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
