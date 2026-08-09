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

export default function AdvanceTaxTracker() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [fy, setFy] = useState(currentFy());
  const [estimated, setEstimated] = useState('200000');
  const [data, setData] = useState<{
    defaultSetoffDate?: string | null;
    summary: {
      paidTotal: number;
      remaining: number | null;
      paymentCount: number;
      suggestedSetoff?: number;
      hasSetoff?: boolean;
      hasInterest234Provision?: boolean;
      interest234Total?: number | null;
      interest234Provisioned?: number | null;
    };
    schedule: Array<{
      installment: string;
      dueDate: string | null;
      cumulativeTarget: number;
      paidThrough: number;
      shortfall: number;
      paidInInstallment: number;
    }>;
    payments: Array<{
      id: string;
      installment: string;
      paidDate: string | null;
      amount: number;
      challanNo: string | null;
    }>;
    setoff: {
      id: string;
      setoffDate: string;
      provisionAmount: number;
      setoffAmount: number;
      taxStillPayable: number;
      notes: string | null;
    } | null;
    interestEstimate: {
      notes: string;
      totalInterest: number;
      section234C: {
        total: number;
        lines: Array<{
          installment: string;
          shortfall: number;
          months: number;
          interest: number;
        }>;
      };
      section234B: {
        applies: boolean;
        threshold90: number;
        unpaid: number;
        months: number;
        interest: number;
        asOfDate: string | null;
      };
    } | null;
    interestProvision: {
      id: string;
      provisionDate: string;
      amount234B: number;
      amount234C: number;
      totalAmount: number;
      notes: string | null;
    } | null;
    notes?: string;
  } | null>(null);
  const [form, setForm] = useState({
    installment: 'Q1',
    amount: '',
    paidDate: new Date().toISOString().slice(0, 10),
    challanNo: '',
    notes: '',
  });
  const [setoffBusy, setSetoffBusy] = useState(false);
  const [interestBusy, setInterestBusy] = useState(false);

  async function load() {
    try {
      const r = await axios.get(
        `${Constants.FETCH_ADVANCE_TAX_URL}?fy=${encodeURIComponent(fy)}&estimatedLiability=${encodeURIComponent(estimated || '0')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load advance tax');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  async function save() {
    try {
      await axios.post(
        Constants.FETCH_ADVANCE_TAX_URL,
        {
          fyLabel: fy,
          installment: form.installment,
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
      await axios.delete(`${Constants.FETCH_ADVANCE_TAX_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Deleted');
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to delete';
      toast.error(msg);
    }
  }

  async function runSetoff() {
    const liability = Number(estimated);
    if (!Number.isFinite(liability) || liability <= 0) {
      toast.error('Enter estimated tax liability before year-end setoff');
      return;
    }
    setSetoffBusy(true);
    try {
      await axios.post(
        `${Constants.FETCH_ADVANCE_TAX_URL}/setoff`,
        {
          fyLabel: fy,
          estimatedLiability: liability,
          setoffDate: data?.defaultSetoffDate || undefined,
          notes: 'Books year-end setoff — not ITR / OLTAS',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Year-end setoff recorded');
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Setoff failed';
      toast.error(msg);
    } finally {
      setSetoffBusy(false);
    }
  }

  async function removeSetoff(id: string) {
    setSetoffBusy(true);
    try {
      await axios.delete(`${Constants.FETCH_ADVANCE_TAX_URL}/setoff/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Setoff deleted');
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to delete setoff';
      toast.error(msg);
    } finally {
      setSetoffBusy(false);
    }
  }

  async function postInterestProvision() {
    const liability = Number(estimated);
    if (!Number.isFinite(liability) || liability <= 0) {
      toast.error('Enter estimated tax liability before posting interest');
      return;
    }
    setInterestBusy(true);
    try {
      await axios.post(
        `${Constants.FETCH_ADVANCE_TAX_URL}/interest-provision`,
        {
          fyLabel: fy,
          estimatedLiability: liability,
          notes: 'Books interest u/s 234B/C provision — not CPC / ITR / OLTAS',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Interest 234B/C provision recorded');
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Interest provision failed';
      toast.error(msg);
    } finally {
      setInterestBusy(false);
    }
  }

  async function removeInterestProvision(id: string) {
    setInterestBusy(true);
    try {
      await axios.delete(`${Constants.FETCH_ADVANCE_TAX_URL}/interest-provision/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Interest provision deleted');
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to delete interest provision';
      toast.error(msg);
    } finally {
      setInterestBusy(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-6">
      <PageBackButton />
      <div>
        <h1 className="text-2xl font-bold">
          Advance tax tracker
          <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
            Worksheet — not OLTAS/ITR
          </span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          India FY instalments (15 Jun / 15 Sep / 15 Dec / 15 Mar). Payments post Dr Advance Tax / Cr
          Bank when the ledger is live. Year-end setoff provisions tax payable then applies advances
          (Dr Tax Payable / Cr Advance Tax) — books only.
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
        <div>
          <label className="block text-xs text-gray-500">Estimated tax liability</label>
          <input
            type="number"
            min={0}
            value={estimated}
            onChange={(e) => setEstimated(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-36"
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border rounded p-4 bg-slate-50">
            <div>
              <div className="text-xs text-gray-500">Paid total</div>
              <div className="font-medium">{data.summary.paidTotal.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Remaining vs estimate</div>
              <div className="font-medium">
                {data.summary.remaining == null ? '—' : data.summary.remaining.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Payments</div>
              <div className="font-medium">{data.summary.paymentCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Suggested setoff</div>
              <div className="font-medium">
                {(data.summary.suggestedSetoff ?? 0).toFixed(2)}
              </div>
            </div>
          </div>

          <section className="border rounded overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 px-2">Instalment</th>
                  <th className="py-2 px-2">Due</th>
                  <th className="py-2 px-2 text-right">Paid in Q</th>
                  <th className="py-2 px-2 text-right">Cumulative target</th>
                  <th className="py-2 px-2 text-right">Paid through</th>
                  <th className="py-2 px-2 text-right">Shortfall</th>
                </tr>
              </thead>
              <tbody>
                {data.schedule.map((s) => (
                  <tr key={s.installment} className="border-b">
                    <td className="py-1.5 px-2 font-medium">{s.installment}</td>
                    <td className="py-1.5 px-2">{s.dueDate ?? '—'}</td>
                    <td className="py-1.5 px-2 text-right">{s.paidInInstallment.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right">{s.cumulativeTarget.toFixed(2)}</td>
                    <td className="py-1.5 px-2 text-right">{s.paidThrough.toFixed(2)}</td>
                    <td
                      className={`py-1.5 px-2 text-right ${s.shortfall > 0 ? 'text-red-700 font-medium' : 'text-green-700'}`}
                    >
                      {s.shortfall.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {data.interestEstimate && (
            <section className="border rounded p-4 space-y-3">
              <h2 className="font-medium">
                Interest u/s 234B / 234C
                <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
                  Estimate — not CPC
                </span>
              </h2>
              <p className="text-xs text-gray-500">{data.interestEstimate.notes}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="border rounded p-2">
                  234C total: {data.interestEstimate.section234C.total.toFixed(2)}
                </div>
                <div className="border rounded p-2">
                  234B:{' '}
                  {data.interestEstimate.section234B.applies
                    ? data.interestEstimate.section234B.interest.toFixed(2)
                    : 'n/a'}
                </div>
                <div className="border rounded p-2 font-medium">
                  Combined: {data.interestEstimate.totalInterest.toFixed(2)}
                </div>
                <div className="border rounded p-2">
                  234B as-of: {data.interestEstimate.section234B.asOfDate || '—'}
                </div>
              </div>
              <table className="w-full text-xs border rounded overflow-hidden">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-1.5 px-2">Instalment</th>
                    <th className="py-1.5 px-2 text-right">Shortfall</th>
                    <th className="py-1.5 px-2 text-right">Months</th>
                    <th className="py-1.5 px-2 text-right">234C interest</th>
                  </tr>
                </thead>
                <tbody>
                  {data.interestEstimate.section234C.lines.map((l) => (
                    <tr key={l.installment} className="border-b">
                      <td className="py-1 px-2">{l.installment}</td>
                      <td className="py-1 px-2 text-right">{l.shortfall.toFixed(2)}</td>
                      <td className="py-1 px-2 text-right">{l.months}</td>
                      <td className="py-1 px-2 text-right">{l.interest.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.interestEstimate.section234B.applies && (
                <p className="text-xs text-gray-600">
                  234B: advance tax {data.summary.paidTotal.toFixed(2)} &lt; 90% threshold{' '}
                  {data.interestEstimate.section234B.threshold90.toFixed(2)} → unpaid{' '}
                  {data.interestEstimate.section234B.unpaid.toFixed(2)} × 1% ×{' '}
                  {data.interestEstimate.section234B.months} months.
                </p>
              )}
              {data.interestProvision ? (
                <div className="text-sm space-y-2 border-t pt-3">
                  <p className="text-xs text-gray-600">
                    Posted to books (Dr Income Tax Expense / Cr Tax Payable). Settle via{' '}
                    <Link
                      to="/admin/accounting/reports/self-assessment-tax"
                      className="text-blue-700 underline"
                    >
                      self-assessment tax
                    </Link>
                    .
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div className="border rounded p-2">
                      Date: {data.interestProvision.provisionDate}
                    </div>
                    <div className="border rounded p-2">
                      234C: {data.interestProvision.amount234C.toFixed(2)}
                    </div>
                    <div className="border rounded p-2">
                      234B: {data.interestProvision.amount234B.toFixed(2)}
                    </div>
                    <div className="border rounded p-2 font-medium">
                      Total: {data.interestProvision.totalAmount.toFixed(2)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1 text-sm border border-red-300 text-red-700 rounded disabled:opacity-50"
                    disabled={interestBusy}
                    onClick={() => removeInterestProvision(data.interestProvision!.id)}
                  >
                    Delete interest provision
                  </button>
                </div>
              ) : (
                <div className="border-t pt-3 space-y-2">
                  <p className="text-xs text-gray-600">
                    Post estimate to GL as a books provision (same roles as tax provision). Not CPC /
                    auto interest.
                  </p>
                  <button
                    type="button"
                    className="px-3 py-1 text-sm bg-purple-600 text-white rounded disabled:opacity-50"
                    disabled={
                      interestBusy ||
                      !data.interestEstimate ||
                      data.interestEstimate.totalInterest <= 0
                    }
                    onClick={postInterestProvision}
                  >
                    Post interest provision to books
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="border rounded p-4 space-y-3">
            <h2 className="font-medium">Year-end setoff</h2>
            <p className="text-xs text-gray-500">
              Posts provision (Dr Income Tax Expense / Cr Tax Payable) then applies advances (Dr Tax
              Payable / Cr Advance Tax) for min(paid, estimated liability). Not ITR computation.
            </p>
            {data.setoff ? (
              <div className="text-sm space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="border rounded p-2">
                    Date: {data.setoff.setoffDate}
                  </div>
                  <div className="border rounded p-2">
                    Provision: {data.setoff.provisionAmount.toFixed(2)}
                  </div>
                  <div className="border rounded p-2">
                    Setoff: {data.setoff.setoffAmount.toFixed(2)}
                  </div>
                  <div className="border rounded p-2">
                    Still payable: {data.setoff.taxStillPayable.toFixed(2)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.setoff.taxStillPayable > 0 && (
                    <Link
                      to="/admin/accounting/reports/self-assessment-tax"
                      className="px-3 py-1.5 text-sm bg-emerald-700 text-white rounded"
                    >
                      Pay self-assessment tax
                    </Link>
                  )}
                  <button
                    type="button"
                    disabled={setoffBusy}
                    onClick={() => removeSetoff(data.setoff!.id)}
                    className="px-3 py-1.5 text-sm text-red-700 border border-red-200 rounded"
                  >
                    Delete setoff
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={setoffBusy || data.summary.paymentCount === 0}
                onClick={runSetoff}
                className="px-3 py-1.5 text-sm bg-emerald-700 text-white rounded disabled:opacity-50"
              >
                Run year-end setoff
              </button>
            )}
          </section>

          <section className="border rounded p-4 space-y-3">
            <h2 className="font-medium">Record payment</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <div>
                <label className="block text-xs text-gray-500">Instalment</label>
                <select
                  value={form.installment}
                  onChange={(e) => setForm((f) => ({ ...f, installment: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                >
                  {['Q1', 'Q2', 'Q3', 'Q4', 'OTHER'].map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
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
                  <th className="py-2 px-2">Instalment</th>
                  <th className="py-2 px-2">Paid</th>
                  <th className="py-2 px-2">Challan</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {data.payments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 px-2 text-gray-400">
                      No payments recorded for this FY.
                    </td>
                  </tr>
                ) : (
                  data.payments.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-1.5 px-2">{p.installment}</td>
                      <td className="py-1.5 px-2">{p.paidDate ?? '—'}</td>
                      <td className="py-1.5 px-2">{p.challanNo || '—'}</td>
                      <td className="py-1.5 px-2 text-right">{p.amount.toFixed(2)}</td>
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
