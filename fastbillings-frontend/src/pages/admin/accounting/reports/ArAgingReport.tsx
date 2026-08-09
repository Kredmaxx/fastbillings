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

interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
}

interface AgingRow {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  bucket: string;
}

interface ArAgingData {
  asOf: string;
  buckets: AgingBuckets;
  total: number;
  rows: AgingRow[];
}

const BUCKET_LABELS: Record<keyof AgingBuckets, string> = {
  current: 'Current',
  d1_30: '1–30 Days',
  d31_60: '31–60 Days',
  d61_90: '61–90 Days',
  d90plus: '90+ Days',
};

export default function ArAgingReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<ArAgingData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(`${Constants.FETCH_AR_AGING_URL}?asOf=${asOf}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load AR Aging report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buckets = data?.buckets;
  const bucketKeys = Object.keys(BUCKET_LABELS) as (keyof AgingBuckets)[];

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Accounts Receivable Aging</h1>
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

      {!loading && data && (
        <ReportPrintShell
          printId="ar-aging-print-root"
          title="Accounts Receivable Ageing Statement"
          subtitle={`as at ${formatDate(data.asOf)}`}
          footnote="Prepared from books maintained in FastBillings. Figures in Indian Rupees."
        >
          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Ageing Bucket</th>
                <th className={`${reportTable.thRight} w-40`}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {buckets &&
                bucketKeys.map((key) => (
                  <tr key={key}>
                    <td className={reportTable.td}>{BUCKET_LABELS[key]}</td>
                    <td className={reportTable.tdRight}>{formatInr(buckets[key])}</td>
                  </tr>
                ))}
              <tr>
                <td className={`${reportTable.td} ${reportTable.total}`}>Total Outstanding</td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.total)}
                </td>
              </tr>
            </tbody>
          </table>

          {data.rows.length === 0 ? (
            <p className="text-sm">No outstanding receivables as of this date.</p>
          ) : (
            <table className={reportTable.table}>
              <thead>
                <tr>
                  <th className={reportTable.th}>Customer</th>
                  <th className={reportTable.th}>Due Date</th>
                  <th className={reportTable.thRight}>Days Overdue</th>
                  <th className={`${reportTable.thRight} w-32`}>Amount (₹)</th>
                  <th className={reportTable.th}>Bucket</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td className={reportTable.td}>{row.label}</td>
                    <td className={reportTable.td}>{formatDate(row.dueDate)}</td>
                    <td className={reportTable.tdRight}>{row.daysOverdue}</td>
                    <td className={reportTable.tdRight}>{formatInr(row.amount)}</td>
                    <td className={reportTable.td}>{row.bucket}</td>
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
