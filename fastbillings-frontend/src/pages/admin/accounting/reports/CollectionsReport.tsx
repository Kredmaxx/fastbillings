import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

const DUNNING_COLORS: Record<DunningStage, string> = {
  reminder: 'bg-blue-100 text-blue-700',
  first_notice: 'bg-yellow-100 text-yellow-700',
  second_notice: 'bg-orange-100 text-orange-700',
  final_notice: 'bg-red-100 text-red-700',
};

function DunningBadge({ stage }: { stage: string }) {
  const s = stage as DunningStage;
  const label = DUNNING_LABELS[s] ?? stage;
  const color = DUNNING_COLORS[s] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
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

  // Sort rows by daysOverdue descending
  const rows = data?.rows
    ? [...data.rows].sort((a, b) => b.daysOverdue - a.daysOverdue)
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Collections</h1>
        <button type="button" onClick={() => window.print()} className="px-3 py-1 text-sm border rounded">
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

      {loading && <p className="text-gray-500">Loading…</p>}

      {!loading && data && (
        <>
          <div className="text-xs text-gray-400 mb-4">Overdue receivables as of {formatDate(asOf)}, sorted by days overdue</div>

          {rows.length === 0 ? (
            <p className="text-gray-400 text-sm">No overdue collections as of this date.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left bg-gray-50">
                  <th className="py-2 px-2">Customer</th>
                  <th className="py-2 px-2">Due Date</th>
                  <th className="py-2 px-2 text-right">Days Overdue</th>
                  <th className="py-2 px-2">Bucket</th>
                  <th className="py-2 px-2">Dunning Stage</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{row.label}</td>
                    <td className="py-2 px-2">{formatDate(row.dueDate)}</td>
                    <td className="py-2 px-2 text-right">{row.daysOverdue}</td>
                    <td className="py-2 px-2 text-xs text-gray-500">{row.bucket}</td>
                    <td className="py-2 px-2"><DunningBadge stage={row.dunningStage} /></td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(row.amount)}</td>
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
