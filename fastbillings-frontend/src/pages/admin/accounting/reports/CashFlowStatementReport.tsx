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

interface CashFlowData {
  period: { from: string; to: string };
  operatingActivities: {
    netIncome: number;
    adjustments: Record<string, number>;
    netCashFromOperating: number;
  };
  investingActivities: { netCashFromInvesting: number };
  financingActivities: { netCashFromFinancing: number };
  netIncreaseInCash: number;
  openingCash: number;
  closingCash: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export default function CashFlowStatementReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [from, setFrom] = useState(monthStart(new Date()));
  const [to, setTo] = useState(isoDate(new Date()));
  const [data, setData] = useState<CashFlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_CASH_FLOW_STATEMENT_URL}?from=${from}&to=${to}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load cash-flow statement (ledger must be initialized)');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Cash Flow Statement</h1>
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
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="cfs-print-root"
          title="Cash Flow Statement"
          subtitle={`for the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)} (Indirect method)`}
          footnote="Prepared from books maintained in FastBillings. Figures in Indian Rupees."
        >
          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={reportTable.th}>Particulars</th>
                <th className={`${reportTable.thRight} w-40`}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={2} className={reportTable.section}>
                  A. Cash flows from operating activities
                </td>
              </tr>
              <tr>
                <td className={`${reportTable.td} pl-4`}>Net income / (loss)</td>
                <td className={reportTable.tdRight}>
                  {formatInr(data.operatingActivities.netIncome)}
                </td>
              </tr>
              {Object.entries(data.operatingActivities.adjustments)
                .filter(([, v]) => Number(v) !== 0)
                .map(([k, v]) => (
                  <tr key={k}>
                    <td className={`${reportTable.td} pl-8 text-gray-700`}>{labelize(k)}</td>
                    <td className={reportTable.tdRight}>{formatInr(v)}</td>
                  </tr>
                ))}
              <tr>
                <td className={`${reportTable.td} pl-2 font-semibold`}>
                  Net cash from operating activities
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.subtotal}`}>
                  {formatInr(data.operatingActivities.netCashFromOperating)}
                </td>
              </tr>

              <tr>
                <td colSpan={2} className={reportTable.section}>
                  B. Cash flows from investing activities
                </td>
              </tr>
              <tr>
                <td className={`${reportTable.td} pl-4`}>Net cash from investing</td>
                <td className={reportTable.tdRight}>
                  {formatInr(data.investingActivities.netCashFromInvesting)}
                </td>
              </tr>

              <tr>
                <td colSpan={2} className={reportTable.section}>
                  C. Cash flows from financing activities
                </td>
              </tr>
              <tr>
                <td className={`${reportTable.td} pl-4`}>Net cash from financing</td>
                <td className={reportTable.tdRight}>
                  {formatInr(data.financingActivities.netCashFromFinancing)}
                </td>
              </tr>

              <tr>
                <td colSpan={2} className={reportTable.section}>
                  D. Net change in cash &amp; bank
                </td>
              </tr>
              <tr>
                <td className={`${reportTable.td} pl-2 font-semibold`}>
                  Net increase / (decrease) in cash
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.subtotal}`}>
                  {formatInr(data.netIncreaseInCash)}
                </td>
              </tr>
              <tr>
                <td className={`${reportTable.td} pl-4`}>Opening cash &amp; bank balances</td>
                <td className={reportTable.tdRight}>{formatInr(data.openingCash)}</td>
              </tr>
              <tr>
                <td className={`${reportTable.td} pl-2 font-bold`}>
                  Closing cash &amp; bank balances
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.closingCash)}
                </td>
              </tr>
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
