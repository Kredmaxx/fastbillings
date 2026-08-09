import { useEffect, useState, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface Row {
  purchaseId: string;
  purchaseNumber: string | null;
  purchaseDate: string;
  dueDate: string;
  vendorName: string;
  supplierName: string;
  msmeUdyam: string | null;
  balanceAmount: number;
  daysPastDue: number;
  beyondMsmeLimit: boolean;
}

interface ReportData {
  asOf: string;
  daysLimit: number;
  notes?: string;
  summary: {
    msmeSupplierCount: number;
    openBillCount: number;
    overdueCount: number;
    openBalance: number;
    overdueBalance: number;
  };
  rows: Row[];
}

function SectionHeading({ children, colSpan = 2 }: { children: ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={reportTable.section}>
        {children}
      </td>
    </tr>
  );
}

export default function MsmePayablesReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [days, setDays] = useState(45);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_MSME_PAYABLES_URL}?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load MSME payables');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap print:hidden">
        <div>
          <h1 className="text-2xl font-bold">MSME payables (45-day)</h1>
          <p className="text-sm text-gray-500 mt-1">
            Unpaid purchases matched to MSME-flagged suppliers (by vendor email).
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500">Day limit</label>
            <input
              type="number"
              min={1}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 45)}
              className="border rounded px-2 py-1 w-24 text-sm"
            />
          </div>
          <button type="button" onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
            Reload
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Print / Save PDF
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500 text-sm print:hidden">Loading…</p>}
      {error && <p className="text-red-600 text-sm print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="msme-payables-print-root"
          title="MSME Payables Statement"
          subtitle={`as at ${formatDate(data.asOf)} · ${data.daysLimit}-day limit`}
          footnote={
            data.notes ||
            'Prepared from books maintained in FastBillings. Figures in Indian Rupees.'
          }
          showSignatures={false}
        >
          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Summary</SectionHeading>
              <tr>
                <td className={reportTable.td}>MSME suppliers</td>
                <td className={reportTable.tdRight}>{data.summary.msmeSupplierCount}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Open bills</td>
                <td className={reportTable.tdRight}>{data.summary.openBillCount}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Beyond {data.daysLimit} days</td>
                <td className={reportTable.tdRight}>{data.summary.overdueCount}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Open balance (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.openBalance)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Overdue balance (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.overdueBalance)}</td>
              </tr>
            </tbody>
          </table>

          {data.rows.length === 0 ? (
            <p className="text-sm">
              No open MSME-matched purchase balances. Flag suppliers as MSME and ensure vendor email
              matches the supplier email.
            </p>
          ) : (
            <table className={reportTable.table}>
              <tbody>
                <SectionHeading colSpan={7}>Open MSME Payables</SectionHeading>
                <tr>
                  <th className={reportTable.th}>Purchase</th>
                  <th className={reportTable.th}>Supplier</th>
                  <th className={reportTable.th}>Udyam</th>
                  <th className={reportTable.th}>Due Date</th>
                  <th className={reportTable.thRight}>Balance (₹)</th>
                  <th className={reportTable.thRight}>Days Past Due</th>
                  <th className={reportTable.th}>Status</th>
                </tr>
                {data.rows.map((r) => (
                  <tr key={r.purchaseId}>
                    <td className={reportTable.td}>{r.purchaseNumber || r.purchaseId.slice(0, 8)}</td>
                    <td className={reportTable.td}>{r.supplierName || r.vendorName}</td>
                    <td className={reportTable.td}>{r.msmeUdyam || '—'}</td>
                    <td className={reportTable.td}>{formatDate(r.dueDate)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.balanceAmount)}</td>
                    <td className={reportTable.tdRight}>{r.daysPastDue}</td>
                    <td className={reportTable.td}>
                      {r.beyondMsmeLimit ? 'Beyond limit' : 'Within limit'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportPrintShell>
      )}
    </div>
  );
}
