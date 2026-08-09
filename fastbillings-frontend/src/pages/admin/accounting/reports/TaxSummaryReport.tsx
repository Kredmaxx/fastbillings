import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface TaxBuckets {
  [kind: string]: number;
}

interface TaxSummaryData {
  period: { from: string; to: string };
  outwardTaxes: TaxBuckets;
  inwardTaxes: TaxBuckets;
  netTaxLiability: TaxBuckets;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function bucketRows(buckets: TaxBuckets) {
  return Object.entries(buckets).filter(([k]) => k !== 'TOTAL');
}

export default function TaxSummaryReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const start = monthStart(new Date());
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<TaxSummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_TAX_SUMMARY_URL}?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load tax summary');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Tax Summary</h1>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="flex items-end gap-4 mb-4 print:hidden">
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
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="tax-summary-print-root"
          title="Tax Summary Statement"
          subtitle={`for the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)}`}
          footnote="Memo of GST components from books. Use GSTR-3B / GSTR-1 for statutory filing."
        >
          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={reportTable.th}>Particulars</th>
                <th className={`${reportTable.thRight} w-40`}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={2} className={reportTable.section}>
                  A. Outward taxes (collected on sales)
                </td>
              </tr>
              {bucketRows(data.outwardTaxes).length === 0 ? (
                <tr>
                  <td className={`${reportTable.td} pl-4 text-gray-500`}>Nil</td>
                  <td className={reportTable.tdRight}>{formatInr(0)}</td>
                </tr>
              ) : (
                bucketRows(data.outwardTaxes).map(([kind, amt]) => (
                  <tr key={`o-${kind}`}>
                    <td className={`${reportTable.td} pl-4`}>{kind}</td>
                    <td className={reportTable.tdRight}>{formatInr(amt)}</td>
                  </tr>
                ))
              )}
              <tr>
                <td className={`${reportTable.td} font-semibold`}>Total outward</td>
                <td className={`${reportTable.tdRight} ${reportTable.subtotal}`}>
                  {formatInr(Number(data.outwardTaxes.TOTAL ?? 0))}
                </td>
              </tr>

              <tr>
                <td colSpan={2} className={reportTable.section}>
                  B. Inward taxes (paid on purchases / ITC)
                </td>
              </tr>
              {bucketRows(data.inwardTaxes).length === 0 ? (
                <tr>
                  <td className={`${reportTable.td} pl-4 text-gray-500`}>Nil</td>
                  <td className={reportTable.tdRight}>{formatInr(0)}</td>
                </tr>
              ) : (
                bucketRows(data.inwardTaxes).map(([kind, amt]) => (
                  <tr key={`i-${kind}`}>
                    <td className={`${reportTable.td} pl-4`}>{kind}</td>
                    <td className={reportTable.tdRight}>{formatInr(amt)}</td>
                  </tr>
                ))
              )}
              <tr>
                <td className={`${reportTable.td} font-semibold`}>Total inward</td>
                <td className={`${reportTable.tdRight} ${reportTable.subtotal}`}>
                  {formatInr(Number(data.inwardTaxes.TOTAL ?? 0))}
                </td>
              </tr>

              <tr>
                <td colSpan={2} className={reportTable.section}>
                  C. Net tax liability
                </td>
              </tr>
              {bucketRows(data.netTaxLiability).map(([kind, amt]) => (
                <tr key={`n-${kind}`}>
                  <td className={`${reportTable.td} pl-4`}>{kind}</td>
                  <td className={reportTable.tdRight}>{formatInr(amt)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${reportTable.td} font-bold`}>Net tax liability</td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(Number(data.netTaxLiability.TOTAL ?? 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
