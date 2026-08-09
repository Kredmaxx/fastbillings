import { useEffect, useState } from 'react';
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

interface ItWdvData {
  period: { fy: string; from: string; to: string };
  notes?: string;
  warnings?: string[];
  readiness: { canFile: boolean; blockers: string[] };
  summary: {
    assetCount: number;
    missingItFieldsCount: number;
    openingWdv: number;
    additions: number;
    depreciation: number;
    closingWdv: number;
  };
  byBlock: Array<{
    itBlock: string;
    ratePercent: number;
    openingWdv: number;
    additions: number;
    depreciation: number;
    closingWdv: number;
    assetCount: number;
  }>;
  assets: Array<{
    assetId: string;
    name: string;
    itBlock: string;
    itRatePercent: number;
    acquisitionDate: string;
    openingWdv: number;
    additions: number;
    putToUseHalfYear: boolean;
    depreciation: number;
    closingWdv: number;
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

export default function ItWdvReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<ItWdvData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_IT_WDV_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load IT WDV worksheet');
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
            IT WDV schedule
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Books worksheet — not ITR Schedule DPM
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Block-wise WDV with half-year rate when put to use on/after 1 Oct.
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
          printId="it-wdv-print-root"
          title="Income-tax WDV — Block of assets"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Assets: {data.summary.assetCount} · Missing IT fields:{' '}
              {data.summary.missingItFieldsCount}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready for ITR'} — books
              worksheet only.
            </div>
          </div>

          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Block</th>
                <th className={reportTable.thRight}>Rate %</th>
                <th className={reportTable.thRight}>Assets</th>
                <th className={reportTable.thRight}>Opening WDV</th>
                <th className={reportTable.thRight}>Additions</th>
                <th className={reportTable.thRight}>Depreciation</th>
                <th className={reportTable.thRight}>Closing WDV</th>
              </tr>
            </thead>
            <tbody>
              {data.byBlock.map((b) => (
                <tr key={b.itBlock}>
                  <td className={reportTable.td}>{b.itBlock}</td>
                  <td className={reportTable.tdRight}>{b.ratePercent.toFixed(2)}</td>
                  <td className={reportTable.tdRight}>{b.assetCount}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.openingWdv)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.additions)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.depreciation)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.closingWdv)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${reportTable.td} font-bold`} colSpan={3}>
                  Total
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.openingWdv)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.additions)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.depreciation)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.closingWdv)}
                </td>
              </tr>
            </tbody>
          </table>

          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={reportTable.th}>Asset</th>
                <th className={reportTable.th}>Block</th>
                <th className={reportTable.thRight}>Rate %</th>
                <th className={reportTable.th}>Acquired</th>
                <th className={reportTable.thRight}>Opening</th>
                <th className={reportTable.thRight}>Additions</th>
                <th className={reportTable.th}>½ yr</th>
                <th className={reportTable.thRight}>Depreciation</th>
                <th className={reportTable.thRight}>Closing</th>
              </tr>
            </thead>
            <tbody>
              {data.assets.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${reportTable.td} text-center text-gray-500`}>
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
                    </td>
                    <td className={reportTable.td}>{a.itBlock}</td>
                    <td className={reportTable.tdRight}>{a.itRatePercent.toFixed(2)}</td>
                    <td className={reportTable.td}>{formatDate(a.acquisitionDate)}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.openingWdv)}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.additions)}</td>
                    <td className={reportTable.td}>{a.putToUseHalfYear ? 'Yes' : 'No'}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.depreciation)}</td>
                    <td className={reportTable.tdRight}>{formatInr(a.closingWdv)}</td>
                  </tr>
                ))
              )}
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
