import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';

type Provider = '' | 'twilio' | 'whatsapp_cloud';

interface FormState {
  whatsappEnabled: boolean;
  whatsappProvider: Provider;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioSender: string;
  cloudPhoneNumberId: string;
  cloudAccessToken: string;
  defaultTemplate: string;
}

const DEFAULT_TEMPLATE = 'Hi {customer}, your invoice {invoiceNumber} for {amount} is ready. {link}';

export default function MessagingSettings() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [form, setForm] = useState<FormState>({
    whatsappEnabled: false,
    whatsappProvider: '',
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioSender: '',
    cloudPhoneNumberId: '',
    cloudAccessToken: '',
    defaultTemplate: DEFAULT_TEMPLATE,
  });
  const [loading, setLoading] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);

  async function load() {
    try {
      const r = await axios.get(Constants.GET_MESSAGING_CONFIG_URL, { headers: { Authorization: `Bearer ${token}` } });
      const cfg = r.data?.data?.config;
      if (cfg) {
        setForm((prev) => ({
          ...prev,
          whatsappEnabled: !!cfg.whatsappEnabled,
          whatsappProvider: (cfg.whatsappProvider ?? '') as Provider,
          defaultTemplate: cfg.defaultTemplate ?? DEFAULT_TEMPLATE,
        }));
        setHasCredentials(!!cfg.hasCredentials);
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setLoading(true);
    try {
      const whatsappConfig: Record<string, unknown> = {};
      if (form.whatsappProvider === 'twilio') {
        whatsappConfig.accountSid = form.twilioAccountSid;
        whatsappConfig.authToken = form.twilioAuthToken;
        whatsappConfig.sender = form.twilioSender;
      } else if (form.whatsappProvider === 'whatsapp_cloud') {
        whatsappConfig.phoneNumberId = form.cloudPhoneNumberId;
        whatsappConfig.accessToken = form.cloudAccessToken;
      }
      const body = {
        whatsappEnabled: form.whatsappEnabled,
        whatsappProvider: form.whatsappProvider || null,
        whatsappConfig,
        defaultTemplate: form.defaultTemplate,
      };
      await axios.put(Constants.UPSERT_MESSAGING_CONFIG_URL, body, { headers: { Authorization: `Bearer ${token}` } });
      toast.success('Messaging config saved');
      load();
    } catch (e) {
      toast.error(axios.isAxiosError(e) ? (e.response?.data as { message?: string })?.message ?? 'Save failed' : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-2">
        Messaging (WhatsApp)
        <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
          Provider send may be stub / wa.me fallback
        </span>
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Configure WhatsApp delivery for invoices and reminders. If no provider is selected, sends fall back to a <code>wa.me</code> deep link
        which opens WhatsApp pre-filled. For automated provider delivery, choose Twilio or WhatsApp Cloud API.
      </p>

      <div className="space-y-5 border rounded-md p-5">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.whatsappEnabled}
            onChange={(e) => update('whatsappEnabled', e.target.checked)}
          />
          <span className="text-sm font-medium">Enable WhatsApp messaging</span>
        </label>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Provider</label>
          <select
            value={form.whatsappProvider}
            onChange={(e) => update('whatsappProvider', e.target.value as Provider)}
            className="p-2 w-full border rounded text-sm"
          >
            <option value="">(none — use wa.me link fallback)</option>
            <option value="twilio">Twilio</option>
            <option value="whatsapp_cloud">WhatsApp Cloud API (Meta)</option>
          </select>
        </div>

        {form.whatsappProvider === 'twilio' && (
          <div className="space-y-2 border-l-2 border-purple-200 pl-3">
            <div>
              <label className="block text-xs text-gray-500">Account SID</label>
              <input
                type="text"
                value={form.twilioAccountSid}
                onChange={(e) => update('twilioAccountSid', e.target.value)}
                placeholder={hasCredentials ? '(stored — leave blank to keep)' : ''}
                className="p-2 w-full border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Auth Token</label>
              <input
                type="password"
                value={form.twilioAuthToken}
                onChange={(e) => update('twilioAuthToken', e.target.value)}
                placeholder={hasCredentials ? '(stored — leave blank to keep)' : ''}
                className="p-2 w-full border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Sender (whatsapp:+14155238886)</label>
              <input
                type="text"
                value={form.twilioSender}
                onChange={(e) => update('twilioSender', e.target.value)}
                className="p-2 w-full border rounded text-sm"
              />
            </div>
          </div>
        )}

        {form.whatsappProvider === 'whatsapp_cloud' && (
          <div className="space-y-2 border-l-2 border-purple-200 pl-3">
            <div>
              <label className="block text-xs text-gray-500">Phone Number ID</label>
              <input
                type="text"
                value={form.cloudPhoneNumberId}
                onChange={(e) => update('cloudPhoneNumberId', e.target.value)}
                placeholder={hasCredentials ? '(stored — leave blank to keep)' : ''}
                className="p-2 w-full border rounded text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500">Access Token</label>
              <input
                type="password"
                value={form.cloudAccessToken}
                onChange={(e) => update('cloudAccessToken', e.target.value)}
                placeholder={hasCredentials ? '(stored — leave blank to keep)' : ''}
                className="p-2 w-full border rounded text-sm"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-500 mb-1">Default invoice template</label>
          <textarea
            rows={3}
            value={form.defaultTemplate}
            onChange={(e) => update('defaultTemplate', e.target.value)}
            className="p-2 w-full border rounded text-sm"
          />
          <p className="text-xs text-gray-400 mt-1">
            Tokens: <code>{'{customer}'}</code>, <code>{'{invoiceNumber}'}</code>, <code>{'{amount}'}</code>, <code>{'{link}'}</code>
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white text-sm rounded disabled:opacity-50"
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
