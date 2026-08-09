import { useEffect, useState, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import PageBackButton from '@components/admin/layouts/PageBackButton';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface TcsRow {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  customerName: string;
  customerGstin: string | null;
  status: string;
  section: string;
  ratePercent: number;
  taxableAmount: number;
  taxAmount: number;
  invoiceTotal: number;
  tcsAmount: number;
  amountWithTcs: number;
}

interface TcsRegisterData {
  period: { from: string; to: string };
  notes?: string;
  summary: {
    invoiceCount: number;
    totalTcs: number;
    totalInvoice: number;
    totalWithTcs: number;
  };
  bySection: Array<{
    section: string;
    count: number;
    tcsAmount: number;
    invoiceTotal: number;
    amountWithTcs: number;
  }>;
  rows: TcsRow[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function SectionHeading({ children, colSpan = 5 }: { children: ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={reportTable.section}>
        {children}
      </td>
    </tr>
  );
}

export default function TcsRegisterReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const now = new Date();
  const [from, setFrom] = useState(monthStart(now));
  const [to, setTo] = useState(isoDate(now));
  const [data, setData] = useState<TcsRegisterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_TCS_REGISTER_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load TCS register');
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
          <h1 className="text-2xl font-bold">TCS register</h1>
          <p className="text-sm text-gray-500">
            Invoice TCS collected for books — not Form 27EQ filing.
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
          <label className="block text-xs text-gray-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && !loading && (
        <ReportPrintShell
          printId="tcs-register-print-root"
          title="TCS Register"
          subtitle={`for the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)}`}
          footnote={
            data.notes ||
            'Prepared from books maintained in FastBillings. Figures in Indian Rupees. Not Form 27EQ filing.'
          }
          showSignatures={false}
        >
          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Summary</SectionHeading>
              <tr>
                <td className={reportTable.td}>Invoices</td>
                <td className={reportTable.tdRight}>{data.summary.invoiceCount}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Invoice total (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalInvoice)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>TCS collected (₹)</td>
                <td className={`${reportTable.tdRight} font-semibold`}>{formatInr(data.summary.totalTcs)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>With TCS / AR (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalWithTcs)}</td>
              </tr>
            </tbody>
          </table>

          {data.bySection.length > 0 && (
            <table className={`${reportTable.table} mb-4`}>
              <tbody>
                <SectionHeading colSpan={5}>By Section</SectionHeading>
                <tr>
                  <th className={reportTable.th}>Section</th>
                  <th className={reportTable.thRight}>Count</th>
                  <th className={reportTable.thRight}>Invoice (₹)</th>
                  <th className={reportTable.thRight}>TCS (₹)</th>
                  <th className={reportTable.thRight}>With TCS (₹)</th>
                </tr>
                {data.bySection.map((s) => (
                  <tr key={s.section}>
                    <td className={reportTable.td}>{s.section}</td>
                    <td className={reportTable.tdRight}>{s.count}</td>
                    <td className={reportTable.tdRight}>{formatInr(s.invoiceTotal)}</td>
                    <td className={reportTable.tdRight}>{formatInr(s.tcsAmount)}</td>
                    <td className={reportTable.tdRight}>{formatInr(s.amountWithTcs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <table className={reportTable.table}>
            <tbody>
              <SectionHeading colSpan={9}>Collections</SectionHeading>
              <tr>
                <th className={reportTable.th}>Date</th>
                <th className={reportTable.th}>Invoice</th>
                <th className={reportTable.th}>Customer</th>
                <th className={reportTable.th}>GSTIN</th>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.thRight}>Rate %</th>
                <th className={reportTable.thRight}>Invoice (₹)</th>
                <th className={reportTable.thRight}>TCS (₹)</th>
                <th className={reportTable.thRight}>With TCS (₹)</th>
              </tr>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className={reportTable.td}>
                    No TCS collections in this period.
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={reportTable.td}>{formatDate(r.invoiceDate)}</td>
                    <td className={reportTable.td}>{r.invoiceNumber || r.id.slice(0, 8)}</td>
                    <td className={reportTable.td}>{r.customerName}</td>
                    <td className={reportTable.td}>{r.customerGstin || '—'}</td>
                    <td className={reportTable.td}>{r.section}</td>
                    <td className={reportTable.tdRight}>{r.ratePercent.toFixed(2)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.invoiceTotal)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.tcsAmount)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.amountWithTcs)}</td>
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
