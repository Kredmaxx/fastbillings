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
  threshold: number;
  summary: {
    bucketCount: number;
    receiptCount: number;
    totalReportableReceipts: number;
    cashReceiptLineCount: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  buckets: Array<{
    date: string;
    customer: string;
    docCount: number;
    totalAmount: number;
    reportableAmount: number;
    docs: Array<{
      id: string;
      invoiceNumber: string | null;
      date: string;
      customer: string;
      paymentMode: string | null;
      amount: number;
    }>;
  }>;
}

export default function CashReceipt269StReport() {
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
        `${Constants.GET_CASH_RECEIPT_269ST_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load §269ST cash receipt worksheet');
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
            §269ST cash receipts
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Worksheet — not Form 3CD / §271DA
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Cash invoice receipts over ₹2,00,000 per day+customer (books proxy). Cash payments →{' '}
            <Link
              to="/admin/accounting/reports/cash-expense-disallowance"
              className="text-blue-700 underline"
            >
              §40A(3)
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
          printId="cash-receipt-269st-print-root"
          title="Clause 31 / §269ST — Cash receipts exceeding threshold"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Threshold: {formatInr(data.threshold)} · Cash receipt lines:{' '}
              {data.summary.cashReceiptLineCount} · Reportable buckets:{' '}
              {data.summary.bucketCount}
            </div>
            <div>
              Reportable receipts (pack amount): {formatInr(data.summary.totalReportableReceipts)}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Customer</th>
                <th className="py-1 pr-2 text-right">Docs</th>
                <th className="py-1 pr-2 text-right">Bucket total</th>
                <th className="py-1 text-right">Reportable</th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-2 text-center text-gray-500">
                    No cash receipt buckets over threshold in this FY.
                  </td>
                </tr>
              ) : (
                data.buckets.map((b) => (
                  <tr key={`${b.date}|${b.customer}`} className="border-b border-gray-300 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{formatDate(b.date)}</td>
                    <td className="py-1.5 pr-2">
                      <div>{b.customer}</div>
                      <div className="text-gray-500 mt-0.5">
                        {b.docs
                          .map((d) => `${d.invoiceNumber || d.id.slice(0, 8)} ${formatInr(d.amount)}`)
                          .join(' · ')}
                      </div>
                    </td>
                    <td className="py-1.5 pr-2 text-right">{b.docCount}</td>
                    <td className="py-1.5 pr-2 text-right">{formatInr(b.totalAmount)}</td>
                    <td className="py-1.5 text-right font-medium">
                      {formatInr(b.reportableAmount)}
                    </td>
                  </tr>
                ))
              )}
              <tr>
                <td className="py-1.5 pr-2 font-bold" colSpan={4}>
                  Total reportable
                </td>
                <td className="py-1.5 text-right font-bold">
                  {formatInr(data.summary.totalReportableReceipts)}
                </td>
              </tr>
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
