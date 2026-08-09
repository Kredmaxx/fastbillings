import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import PageBackButton from '@components/admin/layouts/PageBackButton';
import ReportPrintShell, { formatInr } from '@components/admin/reports/ReportPrintShell';

function currentFy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}

interface ReportData {
  notes: string;
  period: { fy: string; from: string; to: string };
  returnDueDate: string;
  summary: {
    disallowRowCount: number;
    totalPutativeDisallowance: number;
    latePaidRowCount: number;
    latePaidAmount: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  disallowRows: Array<{
    expenseId: string;
    expenseNumber: string | null;
    expenseDate: string;
    categoryTitle: string;
    nature: string;
    amount: number;
    paymentStatus: string;
    putativeDisallowance: number;
  }>;
  latePaidRows: Array<{
    expenseNumber: string | null;
    expenseDate: string;
    paidDate: string;
    returnDueDate: string;
    categoryTitle: string;
    nature: string;
    amount: number;
  }>;
}

export default function Section43BDisallowanceReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_SECTION_43B_DISALLOWANCE_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load §43B disallowance worksheet');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-4">
      <PageBackButton />
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">
            §43B statutory dues
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Worksheet — not Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Unpaid bonus/PF/ESI etc. by expense category nature tag. See also{' '}
            <Link to="/admin/accounting/reports/msme-43bh-disallowance" className="text-blue-700 underline">
              §43B(h) MSME
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">FY (YYYY-YY)</label>
          <input
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="p-1 border rounded text-sm w-28"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="section-43b-print-root"
          title="§43B unpaid statutory dues — books screen"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)} · return due proxy ${formatDate(data.returnDueDate)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Disallow rows: {data.summary.disallowRowCount} · Putative disallowance:{' '}
              {formatInr(data.summary.totalPutativeDisallowance)}
            </div>
            <div>
              Late paid (after due proxy): {data.summary.latePaidRowCount} ·{' '}
              {formatInr(data.summary.latePaidAmount)}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <h3 className="text-sm font-medium mb-1">Unpaid at FY end (putative disallowance)</h3>
          <table className="w-full text-xs border-collapse mb-4">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Expense</th>
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Category</th>
                <th className="py-1 pr-2">Nature</th>
                <th className="py-1 pr-2 text-right">Amount</th>
                <th className="py-1 text-right">Disallow</th>
              </tr>
            </thead>
            <tbody>
              {data.disallowRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-gray-500">
                    No unpaid §43B-tagged expenses at FY end.
                  </td>
                </tr>
              ) : (
                data.disallowRows.map((r) => (
                  <tr key={r.expenseId} className="border-b border-gray-300">
                    <td className="py-1 pr-2">{r.expenseNumber || '—'}</td>
                    <td className="py-1 pr-2">{formatDate(r.expenseDate)}</td>
                    <td className="py-1 pr-2">{r.categoryTitle}</td>
                    <td className="py-1 pr-2">{r.nature}</td>
                    <td className="py-1 pr-2 text-right">{formatInr(r.amount)}</td>
                    <td className="py-1 text-right font-medium">
                      {formatInr(r.putativeDisallowance)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3 className="text-sm font-medium mb-1">Paid after return due-date proxy (review)</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Expense</th>
                <th className="py-1 pr-2">Accrued</th>
                <th className="py-1 pr-2">Paid</th>
                <th className="py-1 pr-2">Due proxy</th>
                <th className="py-1 pr-2">Nature</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.latePaidRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-gray-500">
                    No late-paid §43B-tagged expenses (needs Expense.paidDate after due proxy).
                  </td>
                </tr>
              ) : (
                data.latePaidRows.map((r, i) => (
                  <tr key={`${r.expenseNumber}-${r.paidDate}-${i}`} className="border-b border-gray-300">
                    <td className="py-1 pr-2">{r.expenseNumber || '—'}</td>
                    <td className="py-1 pr-2">{formatDate(r.expenseDate)}</td>
                    <td className="py-1 pr-2">{formatDate(r.paidDate)}</td>
                    <td className="py-1 pr-2">{formatDate(r.returnDueDate)}</td>
                    <td className="py-1 pr-2">{r.nature}</td>
                    <td className="py-1 text-right">{formatInr(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
