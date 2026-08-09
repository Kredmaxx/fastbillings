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

interface TdsRow {
  id: string;
  sourceType?: 'PURCHASE' | 'SALARY';
  documentNo?: string | null;
  documentDate?: string;
  partyName?: string;
  purchaseId: string | null;
  purchaseDate: string;
  vendorName: string;
  section: string;
  ratePercent: number;
  taxableAmount: number;
  totalTax: number;
  grossAmount: number;
  tdsAmount: number;
  netPayable: number;
  paidAmount: number;
  balanceAmount: number;
}

interface TdsRegisterData {
  period: { from: string; to: string };
  notes?: string;
  summary: {
    purchaseCount: number;
    salaryCount?: number;
    rowCount?: number;
    totalTds: number;
    totalGross: number;
    totalNetPayable: number;
  };
  bySection: Array<{ section: string; count: number; tdsAmount: number; grossAmount: number }>;
  rows: TdsRow[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function SectionHeading({ children, colSpan = 4 }: { children: ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={reportTable.section}>
        {children}
      </td>
    </tr>
  );
}

export default function TdsRegisterReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const now = new Date();
  const [from, setFrom] = useState(monthStart(now));
  const [to, setTo] = useState(isoDate(now));
  const [data, setData] = useState<TdsRegisterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_TDS_REGISTER_URL}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load TDS register');
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
          <h1 className="text-2xl font-bold">TDS register</h1>
          <p className="text-sm text-gray-500">
            Purchase + salary (u/s 192) deductions for books — not Form 24Q/26Q filing.
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
          printId="tds-register-print-root"
          title="TDS Register"
          subtitle={`for the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)}`}
          footnote={
            data.notes ||
            'Prepared from books maintained in FastBillings. Figures in Indian Rupees. Not Form 24Q/26Q filing.'
          }
          showSignatures={false}
        >
          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Summary</SectionHeading>
              <tr>
                <td className={reportTable.td}>Purchase rows</td>
                <td className={reportTable.tdRight}>{data.summary.purchaseCount}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Salary rows (u/s 192)</td>
                <td className={reportTable.tdRight}>{data.summary.salaryCount ?? 0}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Gross (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalGross)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>TDS deducted (₹)</td>
                <td className={`${reportTable.tdRight} font-semibold`}>{formatInr(data.summary.totalTds)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Net payable (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalNetPayable)}</td>
              </tr>
            </tbody>
          </table>

          {data.bySection.length > 0 && (
            <table className={`${reportTable.table} mb-4`}>
              <tbody>
                <SectionHeading colSpan={4}>By Section</SectionHeading>
                <tr>
                  <th className={reportTable.th}>Section</th>
                  <th className={reportTable.thRight}>Count</th>
                  <th className={reportTable.thRight}>Gross (₹)</th>
                  <th className={reportTable.thRight}>TDS (₹)</th>
                </tr>
                {data.bySection.map((s) => (
                  <tr key={s.section}>
                    <td className={reportTable.td}>{s.section}</td>
                    <td className={reportTable.tdRight}>{s.count}</td>
                    <td className={reportTable.tdRight}>{formatInr(s.grossAmount)}</td>
                    <td className={reportTable.tdRight}>{formatInr(s.tdsAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <table className={reportTable.table}>
            <tbody>
              <SectionHeading colSpan={10}>Deductions</SectionHeading>
              <tr>
                <th className={reportTable.th}>Date</th>
                <th className={reportTable.th}>Source</th>
                <th className={reportTable.th}>Document</th>
                <th className={reportTable.th}>Party</th>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.thRight}>Rate %</th>
                <th className={reportTable.thRight}>Gross (₹)</th>
                <th className={reportTable.thRight}>TDS (₹)</th>
                <th className={reportTable.thRight}>Net (₹)</th>
                <th className={reportTable.thRight}>Balance (₹)</th>
              </tr>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className={reportTable.td}>
                    No TDS deductions in this period.
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className={reportTable.td}>
                      {formatDate(r.documentDate || r.purchaseDate)}
                    </td>
                    <td className={reportTable.td}>{r.sourceType || 'PURCHASE'}</td>
                    <td className={reportTable.td}>
                      {r.documentNo || r.purchaseId || r.id.slice(0, 8)}
                    </td>
                    <td className={reportTable.td}>{r.partyName || r.vendorName}</td>
                    <td className={reportTable.td}>{r.section}</td>
                    <td className={reportTable.tdRight}>{r.ratePercent.toFixed(2)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.grossAmount)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.tdsAmount)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.netPayable)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.balanceAmount)}</td>
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
