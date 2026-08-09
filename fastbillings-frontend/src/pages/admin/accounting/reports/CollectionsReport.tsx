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

type DunningStage = 'reminder' | 'first_notice' | 'second_notice' | 'final_notice';

interface CollectionRow {
  id: string;
  label: string;
  amount: number;
  dueDate: string;
  daysOverdue: number;
  bucket: string;
  dunningStage: DunningStage | string;
}

interface AgingBuckets {
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
}

interface CollectionsData {
  rows: CollectionRow[];
  buckets: AgingBuckets;
}

const DUNNING_LABELS: Record<DunningStage, string> = {
  reminder: 'Reminder',
  first_notice: '1st Notice',
  second_notice: '2nd Notice',
  final_notice: 'Final Notice',
};

function dunningLabel(stage: string): string {
  return DUNNING_LABELS[stage as DunningStage] ?? stage;
}

export default function CollectionsReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<CollectionsData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(`${Constants.FETCH_COLLECTIONS_URL}?asOf=${asOf}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load Collections report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = data?.rows
    ? [...data.rows].sort((a, b) => b.daysOverdue - a.daysOverdue)
    : [];

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Collections</h1>
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
          printId="collections-print-root"
          title="Collections Register"
          subtitle={`Overdue receivables as at ${formatDate(asOf)}, sorted by days overdue`}
          footnote="Prepared from books maintained in FastBillings. Figures in Indian Rupees."
        >
          {rows.length === 0 ? (
            <p className="text-sm">No overdue collections as of this date.</p>
          ) : (
            <table className={reportTable.table}>
              <thead>
                <tr>
                  <th className={reportTable.th}>Customer</th>
                  <th className={reportTable.th}>Due Date</th>
                  <th className={reportTable.thRight}>Days Overdue</th>
                  <th className={reportTable.th}>Bucket</th>
                  <th className={reportTable.th}>Dunning Stage</th>
                  <th className={`${reportTable.thRight} w-32`}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className={reportTable.td}>{row.label}</td>
                    <td className={reportTable.td}>{formatDate(row.dueDate)}</td>
                    <td className={reportTable.tdRight}>{row.daysOverdue}</td>
                    <td className={reportTable.td}>{row.bucket}</td>
                    <td className={reportTable.td}>{dunningLabel(row.dunningStage)}</td>
                    <td className={reportTable.tdRight}>{formatInr(row.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} className={`${reportTable.td} ${reportTable.total}`}>
                    Total Overdue
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(totalAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </ReportPrintShell>
      )}
    </div>
  );
}
