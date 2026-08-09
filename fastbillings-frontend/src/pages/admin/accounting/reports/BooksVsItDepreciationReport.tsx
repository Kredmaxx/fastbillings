import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

interface ReportData {
  period: { fy: string; from: string; to: string };
  notes?: string;
  warnings?: string[];
  readiness: { canFile: boolean; blockers: string[] };
  summary: {
    assetCount: number;
    missingItFieldsCount: number;
    totalItDepreciation: number;
    totalBooksDepreciation: number;
    totalDifferenceBooksMinusIt: number;
  };
  assets: Array<{
    assetId: string;
    name: string;
    itBlock: string;
    itRatePercent: number;
    acquisitionDate: string;
    openingWdv: number;
    additions: number;
    putToUseHalfYear: boolean;
    itDepreciation: number;
    closingWdv: number;
    monthlyBooksDepreciation: number;
    booksMonths: number;
    booksDepreciation: number;
    differenceBooksMinusIt: number;
    missingItFields: boolean;
  }>;
}

function currentFy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}

export default function BooksVsItDepreciationReport() {
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
        `${Constants.GET_BOOKS_VS_IT_DEPRECIATION_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load books vs IT depreciation worksheet');
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
            Books vs IT depreciation
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Worksheet — not Schedule DPM / Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Form 3CD–style cl. 13/18: IT block dep vs books SLM proxy. See also{' '}
            <Link to="/admin/accounting/reports/it-wdv" className="text-blue-700 underline">
              IT WDV
            </Link>{' '}
            and{' '}
            <Link to="/admin/accounting/reports/tax-audit-pack" className="text-blue-700 underline">
              tax-audit pack
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
          printId="books-vs-it-dep-print-root"
          title="Books vs income-tax depreciation — cl. 13/18"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Assets: {data.summary.assetCount} · Missing IT fields:{' '}
              {data.summary.missingItFieldsCount}
            </div>
            <div>
              IT depreciation (pack cl. 13/18): {formatInr(data.summary.totalItDepreciation)}
            </div>
            <div>Books SLM depreciation: {formatInr(data.summary.totalBooksDepreciation)}</div>
            <div>
              Difference (books − IT): {formatInr(data.summary.totalDifferenceBooksMinusIt)} —
              reconciliation only, not auto-disallowance
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={reportTable.th}>Asset</th>
                <th className={reportTable.th}>Block</th>
                <th className={reportTable.thRight}>IT rate %</th>
                <th className={reportTable.thRight}>IT dep</th>
                <th className={reportTable.thRight}>Books mo</th>
                <th className={reportTable.thRight}>Books months</th>
                <th className={reportTable.thRight}>Books dep</th>
                <th className={reportTable.thRight}>Books − IT</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.length === 0 ? (
                <tr>
                  <td colSpan={8} className={`${reportTable.td} text-center text-gray-500`}>
                    No fixed assets in this FY.
                  </td>
                </tr>
              ) : (
                data.assets.map((a) => (
                  <tr key={a.assetId}>
                    <td className={reportTable.td}>
                      {a.name}
                      {a.missingItFields ? (
                        <div className="text-[10px] text-amber-700">Missing IT block/rate</div>
                      ) : null}
                      <div className="text-[10px] text-gray-500">
                        Acquired {formatDate(a.acquisitionDate)}
                        {a.putToUseHalfYear ? ' · ½ yr IT' : ''}
                      </div>
                    </td>
                    <td className={reportTable.td}>{a.itBlock}</td>
                    <td className={reportTable.tdRight}>{a.itRatePercent.toFixed(2)}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.itDepreciation)}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.monthlyBooksDepreciation)}</td>
                    <td className={reportTable.tdRight}>{a.booksMonths}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.booksDepreciation)}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.differenceBooksMinusIt)}</td>
                  </tr>
                ))
              )}
              <tr>
                <td className={`${reportTable.td} font-bold`} colSpan={3}>
                  Total
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.totalItDepreciation)}
                </td>
                <td className={reportTable.tdRight} colSpan={2} />
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.totalBooksDepreciation)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.totalDifferenceBooksMinusIt)}
                </td>
              </tr>
            </tbody>
          </table>

          {data.warnings && data.warnings.length > 0 ? (
            <ul className="mt-4 text-[11px] text-gray-600 list-disc pl-5 space-y-0.5">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </ReportPrintShell>
      )}
    </div>
  );
}
