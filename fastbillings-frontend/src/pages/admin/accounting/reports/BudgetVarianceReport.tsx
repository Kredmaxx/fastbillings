import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// API returns these as strings (Prisma Decimal) and variancePct may be null —
// coerce defensively so the report never crashes.
function fmt(n: number | string | null | undefined): string {
  return Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number | string | null | undefined): string {
  return Number(n ?? 0).toFixed(1) + '%';
}

// Numeric fields come back as strings (Prisma Decimal); variancePct can be null.
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

function FavorableBadge({ favorable }: { favorable: boolean }) {
  return favorable ? (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Favorable</span>
  ) : (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Unfavorable</span>
  );
}

export default function BudgetVarianceReport() {
  const token = useSelector((s: RootState) => s.auth.token);
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
        <button type="button" onClick={() => window.print()} className="px-3 py-1 text-sm border rounded">
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

      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && data && (
        <>
          {data.rows.length === 0 ? (
            <p className="text-gray-400 text-sm">No budget data found for this period.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left bg-gray-50">
                  <th className="py-2 px-2">Account</th>
                  <th className="py-2 px-2">Type</th>
                  <th className="py-2 px-2 text-right">Budget</th>
                  <th className="py-2 px-2 text-right">Actual</th>
                  <th className="py-2 px-2 text-right">Variance</th>
                  <th className="py-2 px-2 text-right">Variance %</th>
                  <th className="py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.accountId} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{row.accountName}</td>
                    <td className="py-2 px-2 text-xs text-gray-500">{row.accountType}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(row.budget)}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(row.actual)}</td>
                    <td className={`py-2 px-2 text-right font-mono ${Number(row.variance) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {fmt(row.variance)}
                    </td>
                    <td className="py-2 px-2 text-right">{fmtPct(row.variancePct)}</td>
                    <td className="py-2 px-2"><FavorableBadge favorable={row.favorable} /></td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="border-t-2 font-medium bg-gray-50">
                  <td className="py-2 px-2" colSpan={2}>Totals</td>
                  <td className="py-2 px-2 text-right font-mono">{fmt(data.totals.totalBudget)}</td>
                  <td className="py-2 px-2 text-right font-mono">{fmt(data.totals.totalActual)}</td>
                  <td className={`py-2 px-2 text-right font-mono ${Number(data.totals.totalVariance) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {fmt(data.totals.totalVariance)}
                  </td>
                  <td className="py-2 px-2" colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
