import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

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

interface DocRow {
  docType: 'EXPENSE' | 'SUPPLIER_PAYMENT';
  id: string;
  docNumber: string | null;
  date: string;
  payee: string;
  category: string | null;
  taxClass: string | null;
  sourceType: string;
  paymentMode: string | null;
  amount: number;
  rule6DdExceptionCode?: string | null;
  rule6DdExceptionLabel?: string | null;
}

interface ReportData {
  notes: string;
  period: { fy: string; from: string; to: string };
  threshold: number;
  rule6DdCodes?: Array<{ code: string; label: string }>;
  summary: {
    bucketCount: number;
    rowCount: number;
    expenseCount: number;
    supplierPaymentCount: number;
    exceptedCount?: number;
    exceptedAmount?: number;
    totalPutativeDisallowance: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  buckets: Array<{
    date: string;
    payee: string;
    docCount: number;
    totalAmount: number;
    putativeDisallowance: number;
    docs: DocRow[];
  }>;
  exceptedRows?: DocRow[];
}

export default function CashExpenseDisallowanceReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_CASH_EXPENSE_DISALLOWANCE_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load cash expense disallowance worksheet');
    } finally {
      setLoading(false);
    }
  }

  async function setException(doc: DocRow, code: string) {
    setBusyId(doc.id);
    try {
      await axios.patch(
        `${Constants.GET_CASH_EXPENSE_DISALLOWANCE_URL}/exception`,
        {
          docType: doc.docType,
          id: doc.id,
          rule6DdExceptionCode: code || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success(code ? 'Rule 6DD exception tagged' : 'Exception cleared');
      await load();
    } catch {
      toast.error('Failed to update Rule 6DD exception');
    } finally {
      setBusyId(null);
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
            Cash expense disallowance
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              §40A(3) worksheet — not Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Cash / petty-cash by day + payee when the aggregate exceeds ₹10,000. Rule 6DD tags
            exclude lines from aggregation (books only). Cross-check{' '}
            <Link
              to="/admin/accounting/reports/tax-audit-classification"
              className="text-blue-700 underline"
            >
              tax-audit classification
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
          printId="cash-40a3-print-root"
          title="§40A(3) cash payments — books screen"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Buckets: {data.summary.bucketCount} · Docs: {data.summary.rowCount} (expenses{' '}
              {data.summary.expenseCount} · supplier payments {data.summary.supplierPaymentCount}) ·
              Threshold: {formatInr(data.threshold)} per day + payee
            </div>
            <div>
              Rule 6DD excepted: {data.summary.exceptedCount ?? 0} ·{' '}
              {formatInr(data.summary.exceptedAmount ?? 0)}
            </div>
            <div>
              Putative disallowance total: {formatInr(data.summary.totalPutativeDisallowance)}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          {(data.buckets?.length ?? 0) === 0 ? (
            <p className="text-xs text-gray-500 py-3">
              No day+payee cash aggregates above threshold in this FY (after Rule 6DD exclusions).
            </p>
          ) : (
            <div className="space-y-4">
              {data.buckets.map((b) => (
                <div key={`${b.date}|${b.payee}`} className="border border-black">
                  <div className="px-2 py-1.5 text-xs font-medium border-b border-black bg-gray-50 flex flex-wrap justify-between gap-2">
                    <span>
                      {formatDate(b.date)} · {b.payee} · {b.docCount} doc(s)
                    </span>
                    <span>
                      Day+payee total {formatInr(b.totalAmount)} · Disallow{' '}
                      {formatInr(b.putativeDisallowance)}
                    </span>
                  </div>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-400 text-left">
                        <th className="py-1 px-2">Type</th>
                        <th className="py-1 px-2">Doc</th>
                        <th className="py-1 px-2">Category</th>
                        <th className="py-1 px-2">Mode</th>
                        <th className="py-1 px-2 text-right">Amount</th>
                        <th className="py-1 px-2 print:hidden">Rule 6DD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {b.docs.map((r) => (
                        <tr key={`${r.docType}-${r.id}`} className="border-b border-gray-200">
                          <td className="py-1 px-2">
                            {r.docType === 'EXPENSE' ? 'Expense' : 'Supplier pay'}
                          </td>
                          <td className="py-1 px-2">{r.docNumber || '—'}</td>
                          <td className="py-1 px-2">
                            {r.category || '—'}
                            {r.taxClass ? ` (${r.taxClass})` : ''}
                          </td>
                          <td className="py-1 px-2">
                            {r.sourceType}
                            {r.paymentMode ? ` / ${r.paymentMode}` : ''}
                          </td>
                          <td className="py-1 px-2 text-right">{formatInr(r.amount)}</td>
                          <td className="py-1 px-2 print:hidden">
                            <select
                              className="border rounded text-xs max-w-[10rem]"
                              disabled={busyId === r.id}
                              value=""
                              onChange={(e) => setException(r, e.target.value)}
                            >
                              <option value="">Tag exception…</option>
                              {(data.rule6DdCodes || []).map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.code}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {(data.exceptedRows?.length ?? 0) > 0 && (
            <div className="mt-4 border border-black">
              <div className="px-2 py-1.5 text-xs font-medium border-b border-black bg-amber-50">
                Rule 6DD excepted (excluded from §40A(3) aggregation)
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-400 text-left">
                    <th className="py-1 px-2">Date</th>
                    <th className="py-1 px-2">Doc</th>
                    <th className="py-1 px-2">Payee</th>
                    <th className="py-1 px-2">Exception</th>
                    <th className="py-1 px-2 text-right">Amount</th>
                    <th className="py-1 px-2 print:hidden">Clear</th>
                  </tr>
                </thead>
                <tbody>
                  {data.exceptedRows!.map((r) => (
                    <tr key={`ex-${r.docType}-${r.id}`} className="border-b border-gray-200">
                      <td className="py-1 px-2">{formatDate(r.date)}</td>
                      <td className="py-1 px-2">{r.docNumber || '—'}</td>
                      <td className="py-1 px-2">{r.payee}</td>
                      <td className="py-1 px-2">
                        {r.rule6DdExceptionCode}
                        {r.rule6DdExceptionLabel ? ` — ${r.rule6DdExceptionLabel}` : ''}
                      </td>
                      <td className="py-1 px-2 text-right">{formatInr(r.amount)}</td>
                      <td className="py-1 px-2 print:hidden">
                        <button
                          type="button"
                          className="text-blue-700 underline disabled:opacity-50"
                          disabled={busyId === r.id}
                          onClick={() => setException(r, '')}
                        >
                          Clear
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ReportPrintShell>
      )}
    </div>
  );
}
