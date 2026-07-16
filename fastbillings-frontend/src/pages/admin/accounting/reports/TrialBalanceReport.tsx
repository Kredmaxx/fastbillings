import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';

interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  totalDebit: number;
  totalCredit: number;
  net: number;
}

interface TrialBalanceData {
  asOf: string;
  accounts: TrialBalanceRow[];
  totals: { debit: number; credit: number };
  balanced: boolean;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function TrialBalanceReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_TRIAL_BALANCE_URL}?asOf=${asOf}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load trial balance');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Trial Balance</h1>
        <button type="button" onClick={() => window.print()} className="px-3 py-1 text-sm border rounded">
          Print / Save PDF
        </button>
      </div>

      <div className="flex items-end gap-4 mb-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">As Of</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {data && (
        <>
          <div className="text-xs text-gray-400 mb-2">As of {formatDate(data.asOf)}</div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b text-left bg-gray-50">
                <th className="py-2 px-2">Code</th>
                <th className="py-2 px-2">Account</th>
                <th className="py-2 px-2">Type</th>
                <th className="py-2 px-2 text-right">Debit</th>
                <th className="py-2 px-2 text-right">Credit</th>
                <th className="py-2 px-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="py-2 px-2 font-mono">{a.code}</td>
                  <td className="py-2 px-2">{a.name}</td>
                  <td className="py-2 px-2 text-xs text-gray-500">{a.accountType}</td>
                  <td className="py-2 px-2 text-right">{a.totalDebit > 0 ? a.totalDebit.toFixed(2) : '—'}</td>
                  <td className="py-2 px-2 text-right">{a.totalCredit > 0 ? a.totalCredit.toFixed(2) : '—'}</td>
                  <td className="py-2 px-2 text-right">{a.net.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-medium bg-gray-50">
                <td className="py-2 px-2" colSpan={3}>
                  Totals
                </td>
                <td className="py-2 px-2 text-right">{data.totals.debit.toFixed(2)}</td>
                <td className="py-2 px-2 text-right">{data.totals.credit.toFixed(2)}</td>
                <td className="py-2 px-2 text-right">
                  <span
                    className={
                      data.balanced
                        ? 'text-green-600 font-medium'
                        : 'text-red-600 font-medium'
                    }
                  >
                    {data.balanced ? 'Balanced' : 'OUT OF BALANCE'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
