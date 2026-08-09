import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';

interface ReversalRow {
  id: string;
  reversalDate: string;
  reason: string;
  description: string | null;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function ItcReversalList() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const [from, setFrom] = useState(monthStart(new Date()));
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<ReversalRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    reversalDate: today,
    reason: 'RULE_42',
    description: '',
    cgst: '',
    sgst: '',
    igst: '',
    cess: '',
  });

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get(
        `${Constants.FETCH_ITC_REVERSALS_URL}?from=${from}&to=${to}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setRows(r.data?.data?.reversals ?? []);
    } catch {
      toast.error('Failed to load ITC reversals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    try {
      await axios.post(
        Constants.FETCH_ITC_REVERSALS_URL,
        {
          ...form,
          cgst: Number(form.cgst || 0),
          sgst: Number(form.sgst || 0),
          igst: Number(form.igst || 0),
          cess: Number(form.cess || 0),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('ITC reversal saved');
      setForm((f) => ({ ...f, description: '', cgst: '', sgst: '', igst: '', cess: '' }));
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to save';
      toast.error(msg);
    }
  }

  async function remove(id: string) {
    try {
      await axios.delete(`${Constants.FETCH_ITC_REVERSALS_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ITC reversal (GSTR-3B 4B)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manual Rule 42 / 43 / other reversals for the books worksheet. Amounts reduce net ITC in
          GSTR-3B for the period.
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-medium">Add reversal</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500">Date</label>
            <input
              type="date"
              value={form.reversalDate}
              onChange={(e) => setForm((f) => ({ ...f, reversalDate: e.target.value }))}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Reason</label>
            <select
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="border rounded px-2 py-1 w-full"
            >
              <option value="RULE_42">Rule 42</option>
              <option value="RULE_43">Rule 43</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          {(['cgst', 'sgst', 'igst', 'cess'] as const).map((k) => (
            <div key={k}>
              <label className="block text-xs text-gray-500 uppercase">{k}</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                className="border rounded px-2 py-1 w-full"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={create}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded"
        >
          Save reversal
        </button>
      </section>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-gray-800 text-white rounded">
          Reload
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-400 text-sm">No reversals in this period.</p>
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 px-2">Date</th>
                <th className="py-2 px-2">Reason</th>
                <th className="py-2 px-2">Description</th>
                <th className="py-2 px-2 text-right">CGST</th>
                <th className="py-2 px-2 text-right">SGST</th>
                <th className="py-2 px-2 text-right">IGST</th>
                <th className="py-2 px-2 text-right">Total</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-1.5 px-2">{formatDate(r.reversalDate)}</td>
                  <td className="py-1.5 px-2">{r.reason}</td>
                  <td className="py-1.5 px-2">{r.description || '—'}</td>
                  <td className="py-1.5 px-2 text-right">{r.cgst.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right">{r.sgst.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right">{r.igst.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right font-medium">{r.total.toFixed(2)}</td>
                  <td className="py-1.5 px-2 text-right">
                    <button
                      type="button"
                      onClick={() => remove(r.id)}
                      className="text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
