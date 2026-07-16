import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface ForecastBucket {
  monthStart: string;
  inflow: number;
  outflow: number;
  net: number;
  runningCash: number;
}

interface CashFlowForecastData {
  buckets: ForecastBucket[];
  droppedBeyondHorizon: number;
}

const MONTHS_OPTIONS = [3, 6, 12] as const;
type MonthsOption = typeof MONTHS_OPTIONS[number];

export default function CashFlowForecastReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [months, setMonths] = useState<MonthsOption>(6);
  const [data, setData] = useState<CashFlowForecastData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(`${Constants.FETCH_CASH_FLOW_FORECAST_URL}?months=${months}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load Cash Flow Forecast');
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
        <h1 className="text-2xl font-bold">Cash Flow Forecast</h1>
        <button type="button" onClick={() => window.print()} className="px-3 py-1 text-sm border rounded">
          Print / Save PDF
        </button>
      </div>

      <div className="flex items-end gap-4 mb-6 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">Horizon (months)</label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) as MonthsOption)}
            className="p-1 border rounded text-sm"
          >
            {MONTHS_OPTIONS.map((m) => (
              <option key={m} value={m}>{m} months</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && data && (
        <>
          {data.droppedBeyondHorizon > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              Note: {data.droppedBeyondHorizon} transaction(s) beyond the {months}-month horizon were excluded.
            </div>
          )}

          {data.buckets.length === 0 ? (
            <p className="text-gray-400 text-sm">No forecast data available for this horizon.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left bg-gray-50">
                  <th className="py-2 px-2">Month</th>
                  <th className="py-2 px-2 text-right">Inflow</th>
                  <th className="py-2 px-2 text-right">Outflow</th>
                  <th className="py-2 px-2 text-right">Net</th>
                  <th className="py-2 px-2 text-right">Running Cash</th>
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((bucket) => (
                  <tr key={bucket.monthStart} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{formatDate(bucket.monthStart, 'M Y')}</td>
                    <td className="py-2 px-2 text-right font-mono text-green-700">{fmt(bucket.inflow)}</td>
                    <td className="py-2 px-2 text-right font-mono text-red-600">{fmt(bucket.outflow)}</td>
                    <td className={`py-2 px-2 text-right font-mono ${bucket.net < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {fmt(bucket.net)}
                    </td>
                    <td className={`py-2 px-2 text-right font-mono font-medium ${bucket.runningCash < 0 ? 'text-red-600' : ''}`}>
                      {fmt(bucket.runningCash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
