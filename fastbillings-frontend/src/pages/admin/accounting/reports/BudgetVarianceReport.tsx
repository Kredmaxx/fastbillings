import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtPct(n: number | string | null | undefined): string {
  return Number(n ?? 0).toFixed(1) + '%';
}

interface BudgetVarianceRow {
  accountId: string;
  accountName: string;
  accountType: string;
  budget: string;
  actual: string;
  variance: string;
  variancePct: string | null;
  favorable: boolean;
}

interface BudgetVarianceTotals {
  totalBudget: string;
  totalActual: string;
  totalVariance: string;
}

interface BudgetVarianceData {
  rows: BudgetVarianceRow[];
  totals: BudgetVarianceTotals;
}

export default function BudgetVarianceReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const yearStart = isoDate(new Date(new Date().getFullYear(), 0, 1));
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<BudgetVarianceData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(`${Constants.FETCH_BUDGET_VARIANCE_URL}?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load Budget Variance report');
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
        <h1 className="text-2xl font-bold">Budget Variance</h1>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="flex items-end gap-4 mb-6 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}

      {!loading && data && (
        <ReportPrintShell
          printId="budget-variance-print-root"
          title="Budget Variance Statement"
          subtitle={`for the period from ${formatDate(from)} to ${formatDate(to)}`}
          footnote="Prepared from books maintained in FastBillings. Figures in Indian Rupees."
        >
          {data.rows.length === 0 ? (
            <p className="text-sm">No budget data found for this period.</p>
          ) : (
            <table className={reportTable.table}>
              <thead>
                <tr>
                  <th className={reportTable.th}>Account</th>
                  <th className={reportTable.th}>Type</th>
                  <th className={reportTable.thRight}>Budget (₹)</th>
                  <th className={reportTable.thRight}>Actual (₹)</th>
                  <th className={reportTable.thRight}>Variance (₹)</th>
                  <th className={reportTable.thRight}>Variance %</th>
                  <th className={reportTable.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.accountId}>
                    <td className={reportTable.td}>{row.accountName}</td>
                    <td className={reportTable.td}>{row.accountType}</td>
                    <td className={reportTable.tdRight}>{formatInr(Number(row.budget))}</td>
                    <td className={reportTable.tdRight}>{formatInr(Number(row.actual))}</td>
                    <td className={reportTable.tdRight}>{formatInr(Number(row.variance))}</td>
                    <td className={reportTable.tdRight}>{fmtPct(row.variancePct)}</td>
                    <td className={reportTable.td}>
                      {row.favorable ? 'Favourable' : 'Unfavourable'}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} className={`${reportTable.td} ${reportTable.total}`}>
                    Totals
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(Number(data.totals.totalBudget))}
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(Number(data.totals.totalActual))}
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(Number(data.totals.totalVariance))}
                  </td>
                  <td colSpan={2} className={reportTable.td} />
                </tr>
              </tbody>
            </table>
          )}
        </ReportPrintShell>
      )}
    </div>
  );
}
