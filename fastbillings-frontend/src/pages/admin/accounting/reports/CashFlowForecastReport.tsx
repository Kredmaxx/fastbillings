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

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}

      {!loading && data && (
        <ReportPrintShell
          printId="cash-flow-forecast-print-root"
          title="Cash Flow Forecast"
          subtitle={`${months}-month horizon from ${formatDate(new Date().toISOString().slice(0, 10))}`}
          footnote={
            data.droppedBeyondHorizon > 0
              ? `Note: ${data.droppedBeyondHorizon} transaction(s) beyond the ${months}-month horizon were excluded. Figures in Indian Rupees.`
              : 'Prepared from books maintained in FastBillings. Figures in Indian Rupees.'
          }
        >
          {data.buckets.length === 0 ? (
            <p className="text-sm">No forecast data available for this horizon.</p>
          ) : (
            <table className={reportTable.table}>
              <thead>
                <tr>
                  <th className={reportTable.th}>Month</th>
                  <th className={reportTable.thRight}>Inflow (₹)</th>
                  <th className={reportTable.thRight}>Outflow (₹)</th>
                  <th className={reportTable.thRight}>Net (₹)</th>
                  <th className={reportTable.thRight}>Running Cash (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.buckets.map((bucket) => (
                  <tr key={bucket.monthStart}>
                    <td className={reportTable.td}>{formatDate(bucket.monthStart, 'M Y')}</td>
                    <td className={reportTable.tdRight}>{formatInr(bucket.inflow)}</td>
                    <td className={reportTable.tdRight}>{formatInr(bucket.outflow)}</td>
                    <td className={reportTable.tdRight}>{formatInr(bucket.net)}</td>
                    <td className={`${reportTable.tdRight} font-semibold`}>
                      {formatInr(bucket.runningCash)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportPrintShell>
      )}
    </div>
  );
}
