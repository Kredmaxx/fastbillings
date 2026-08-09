import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

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
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
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

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="tb-print-root"
          title="Trial Balance"
          subtitle={`as at ${formatDate(data.asOf)}`}
          footnote={
            data.balanced
              ? 'Debits equal credits — trial balance is balanced.'
              : 'WARNING: Trial balance is OUT OF BALANCE. Investigate before filing.'
          }
        >
          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={`${reportTable.th} w-20`}>Code</th>
                <th className={reportTable.th}>Account</th>
                <th className={`${reportTable.th} w-24`}>Type</th>
                <th className={`${reportTable.thRight} w-32`}>Debit (₹)</th>
                <th className={`${reportTable.thRight} w-32`}>Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id}>
                  <td className={`${reportTable.td} font-mono text-xs`}>{a.code}</td>
                  <td className={reportTable.td}>{a.name}</td>
                  <td className={`${reportTable.td} text-xs`}>{a.accountType}</td>
                  <td className={reportTable.tdRight}>
                    {a.totalDebit > 0 ? formatInr(a.totalDebit) : '—'}
                  </td>
                  <td className={reportTable.tdRight}>
                    {a.totalCredit > 0 ? formatInr(a.totalCredit) : '—'}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className={`${reportTable.td} font-bold`}>
                  Totals {data.balanced ? '(Balanced)' : '(OUT OF BALANCE)'}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.totals.debit)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.totals.credit)}
                </td>
              </tr>
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
