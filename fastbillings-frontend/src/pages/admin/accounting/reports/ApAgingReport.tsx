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

interface ApAgingData {
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

export default function ApAgingReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<ApAgingData | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(`${Constants.FETCH_AP_AGING_URL}?asOf=${asOf}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load AP Aging report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buckets = data?.buckets;

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Accounts Payable Aging</h1>
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
          <div className="text-xs text-gray-400 mb-4">As of {formatDate(data.asOf)}</div>

          {/* Bucket summary cards */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
            {buckets && (Object.keys(BUCKET_LABELS) as (keyof AgingBuckets)[]).map((key) => (
              <div key={key} className="border rounded p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">{BUCKET_LABELS[key]}</div>
                <div className="text-sm font-semibold text-right">{fmt(buckets[key])}</div>
              </div>
            ))}
            <div className="border-2 border-purple-600 rounded p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">Total</div>
              <div className="text-sm font-bold text-right text-purple-700">{fmt(data.total)}</div>
            </div>
          </div>

          {/* Rows table */}
          {data.rows.length === 0 ? (
            <p className="text-gray-400 text-sm">No outstanding payables as of this date.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-left bg-gray-50">
                  <th className="py-2 px-2">Supplier</th>
                  <th className="py-2 px-2">Due Date</th>
                  <th className="py-2 px-2 text-right">Days Overdue</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                  <th className="py-2 px-2">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-2">{row.label}</td>
                    <td className="py-2 px-2">{formatDate(row.dueDate)}</td>
                    <td className="py-2 px-2 text-right">{row.daysOverdue}</td>
                    <td className="py-2 px-2 text-right font-mono">{fmt(row.amount)}</td>
                    <td className="py-2 px-2 text-xs text-gray-500">{row.bucket}</td>
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
