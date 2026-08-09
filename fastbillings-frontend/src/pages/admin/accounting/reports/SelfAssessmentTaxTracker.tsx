import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import PageBackButton from '@components/admin/layouts/PageBackButton';

function currentFy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}

export default function SelfAssessmentTaxTracker() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<{
    notes?: string;
    summary: {
      taxStillPayableAfterSetoff: number | null;
      paidTotal: number;
      remaining: number | null;
      paymentCount: number;
      hasSetoff: boolean;
    };
    setoff: {
      provisionAmount: number;
      setoffAmount: number;
      taxStillPayable: number | null;
      setoffDate: string;
    } | null;
    payments: Array<{
      id: string;
      paidDate: string | null;
      amount: number;
      challanNo: string | null;
      notes: string | null;
    }>;
  } | null>(null);
  const [form, setForm] = useState({
    amount: '',
    paidDate: new Date().toISOString().slice(0, 10),
    challanNo: '',
    notes: '',
  });

  async function load() {
    try {
      const r = await axios.get(
        `${Constants.FETCH_SELF_ASSESSMENT_TAX_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load self-assessment tax');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  async function save() {
    try {
      await axios.post(
        Constants.FETCH_SELF_ASSESSMENT_TAX_URL,
        {
          fyLabel: fy,
          amount: Number(form.amount),
          paidDate: form.paidDate,
          challanNo: form.challanNo || null,
          notes: form.notes || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Payment recorded');
      setForm((f) => ({ ...f, amount: '', challanNo: '', notes: '' }));
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
      await axios.delete(`${Constants.FETCH_SELF_ASSESSMENT_TAX_URL}/${id}`, {
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
      <PageBackButton />
      <div>
        <h1 className="text-2xl font-bold">
          Self-assessment tax
          <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
            Worksheet — not OLTAS/ITR
          </span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Pay remaining income-tax after{' '}
          <Link to="/admin/accounting/reports/advance-tax" className="text-blue-700 underline">
            advance-tax setoff
          </Link>
          . When the ledger is live, posts Dr Tax Payable / Cr Bank — books only.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500">FY (YYYY-YY)</label>
          <input
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-28"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
          Refresh
        </button>
      </div>

      {data?.notes && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">{data.notes}</p>
      )}

      {data && (
        <>
          {!data.summary.hasSetoff && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
              No year-end advance-tax setoff for this FY yet — remaining liability is unknown until
              you run setoff on the advance tax tracker.
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border rounded p-4 bg-slate-50">
            <div>
              <div className="text-xs text-gray-500">Still payable after setoff</div>
              <div className="font-medium">
                {data.summary.taxStillPayableAfterSetoff == null
                  ? '—'
                  : data.summary.taxStillPayableAfterSetoff.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">SAT paid</div>
              <div className="font-medium">{data.summary.paidTotal.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Remaining</div>
              <div className="font-medium">
                {data.summary.remaining == null ? '—' : data.summary.remaining.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Payments</div>
              <div className="font-medium">{data.summary.paymentCount}</div>
            </div>
          </div>

          <section className="border rounded p-4 space-y-3">
            <h2 className="font-medium">Record payment</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="block text-xs text-gray-500">Amount</label>
                <input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Paid date</label>
                <input
                  type="date"
                  value={form.paidDate}
                  onChange={(e) => setForm((f) => ({ ...f, paidDate: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Challan no</label>
                <input
                  value={form.challanNo}
                  onChange={(e) => setForm((f) => ({ ...f, challanNo: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={save}
                  className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded w-full"
                >
                  Save
                </button>
              </div>
            </div>
          </section>

          <section className="border rounded overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 px-2">Paid</th>
                  <th className="py-2 px-2">Challan</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                  <th className="py-2 px-2">Notes</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 px-2 text-gray-400">
                      No self-assessment payments for this FY.
                    </td>
                  </tr>
                ) : (
                  data.payments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-1.5 px-2">{p.paidDate ?? '—'}</td>
                      <td className="py-1.5 px-2">{p.challanNo || '—'}</td>
                      <td className="py-1.5 px-2 text-right">{p.amount.toFixed(2)}</td>
                      <td className="py-1.5 px-2">{p.notes || '—'}</td>
                      <td className="py-1.5 px-2 text-right">
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
