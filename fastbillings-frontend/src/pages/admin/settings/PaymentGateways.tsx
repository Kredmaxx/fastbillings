import { useEffect, useState } from 'react';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';

import Constants from '@constants/api';
import type { GatewayConfigSummary, GatewayKind } from '@models/payment';
import type { RootState } from '@store/index';

export default function PaymentGateways() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [configs, setConfigs] = useState<GatewayConfigSummary[]>([]);

  useEffect(() => {
    axios
      .get(Constants.GET_GATEWAY_CONFIGS_URL, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setConfigs(r.data?.data?.gatewayConfigs ?? []))
      .catch(() => setConfigs([]));
  }, [token]);

  const status = (kind: GatewayKind) => configs.find((c) => c.kind === kind);

  const gateways: Array<{ kind: GatewayKind; name: string; note: string }> = [
    { kind: 'RAZORPAY', name: 'Razorpay', note: 'India-focused; supports UPI, cards, netbanking.' },
    { kind: 'STRIPE', name: 'Stripe', note: 'Global; supports cards, wallets, etc.' },
    { kind: 'OFFLINE', name: 'Offline / Manual', note: 'Record payments received outside the system.' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Payment Gateways</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configure how you accept payments.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {gateways.map((g) => {
          const c = status(g.kind);
          const enabled = !!c?.enabled;
          return (
            <div key={g.kind} className="border rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-medium">{g.name}</h2>
                <span className={
                  'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                  (enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700')
                }>
                  {enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{g.note}</p>
              {g.kind === 'RAZORPAY' && (
                <Link to="/admin/settings/payment-gateways/razorpay" className="text-sm text-purple-700 underline">
                  Configure
                </Link>
              )}
              {g.kind === 'STRIPE' && (
                <Link to="/admin/settings/payment-gateways/stripe" className="text-sm text-purple-700 underline">
                  Configure
                </Link>
              )}
              {g.kind === 'OFFLINE' && (
                <button
                  type="button"
                  disabled
                  className="text-sm text-purple-700 underline disabled:opacity-50"
                >
                  Always available
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
