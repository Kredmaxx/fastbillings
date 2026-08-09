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

interface Form27eqData {
  form: string;
  period: {
    fy: string;
    quarter: string;
    quarterNumber: number;
    from: string;
    to: string;
  };
  collector: { name: string; gstin: string | null; tan: string | null };
  notes?: string;
  warnings?: string[];
  readiness: { canFile: boolean; blockers: string[] };
  summary: {
    collecteeRowCount: number;
    panMissingCount: number;
    totalAmountReceivedOrDebited: number;
    totalTcs: number;
  };
  challanSummary?: {
    count: number;
    completeCount: number;
    depositedTotal: number;
    totalTax: number;
    shortfall: number;
  };
  allocationSummary?: {
    mappedDocumentCount: number;
    unmappedDocumentCount: number;
    mappedTax: number;
    unmappedTax: number;
    challanAllocatedTotal: number;
    challanUnallocatedTotal: number;
  };
  challans?: Array<{
    id: string;
    bsrCode: string;
    challanNo: string;
    depositDate: string;
    section: string | null;
    amount: number;
    complete: boolean;
    allocatedTotal?: number;
  }>;
  bySection: Array<{
    section: string;
    collecteeCount: number;
    amountReceivedOrDebited: number;
    tcsAmount: number;
  }>;
  annexure: Array<{
    sno: number;
    collecteeName: string;
    collecteePan: string | null;
    collecteeGstin: string | null;
    panMissing: boolean;
    section: string;
    amountReceivedOrDebited: number;
    tcsAmount: number;
    allocatedAmount?: number;
    challanNos?: string[];
    ratePercent: number;
    dateOfReceiptOrDebit: string;
    documentNo: string | null;
  }>;
}

function currentQuarterLabel(d = new Date()): string {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const m = d.getMonth();
  let q = 1;
  if (m >= 3 && m <= 5) q = 1;
  else if (m >= 6 && m <= 8) q = 2;
  else if (m >= 9 && m <= 11) q = 3;
  else q = 4;
  return `${start}-${String(start + 1).slice(-2)}-Q${q}`;
}

function quarterOptions(count = 8): string[] {
  const cur = currentQuarterLabel();
  const startYear = Number(cur.slice(0, 4));
  const curQ = Number(cur.slice(-1));
  const out: string[] = [];
  let y = startYear;
  let q = curQ;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(y + 1).slice(-2)}-Q${q}`);
    q -= 1;
    if (q < 1) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}

export default function Form27eqReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [quarter, setQuarter] = useState(currentQuarterLabel());
  const [data, setData] = useState<Form27eqData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_FORM_27EQ_URL}?quarter=${encodeURIComponent(quarter)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load Form 27EQ worksheet');
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
            Form 27EQ
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Books worksheet — not TRACES filing
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Quarterly TCS return style annexure from invoice collections.
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
          <label className="block text-xs text-gray-500">FY quarter</label>
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="p-1 border rounded text-sm"
          >
            {quarterOptions().map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="form-27eq-print-root"
          title="Form 27EQ — Statement of TCS"
          subtitle={`FY ${data.period.fy} · ${data.period.quarter} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              <span className="font-semibold">Collector:</span> {data.collector.name}
            </div>
            <div>
              <span className="font-semibold">GSTIN:</span> {data.collector.gstin || '—'} ·{' '}
              <span className="font-semibold">TAN:</span> {data.collector.tan || 'Not captured'}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready for TRACES'} —{' '}
              {data.summary.panMissingCount} row(s) missing collectee PAN
              {data.challanSummary
                ? ` · challans deposited ₹${formatInr(data.challanSummary.depositedTotal)} vs TCS ₹${formatInr(data.challanSummary.totalTax)}`
                : ''}
              {data.allocationSummary
                ? ` · line-mapped ₹${formatInr(data.allocationSummary.mappedTax)} · unmapped docs ${data.allocationSummary.unmappedDocumentCount}`
                : ''}
              .
            </div>
          </div>

          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.thRight}>Rows</th>
                <th className={reportTable.thRight}>Amount received (₹)</th>
                <th className={reportTable.thRight}>TCS (₹)</th>
              </tr>
            </thead>
            <tbody>
              {data.bySection.map((s) => (
                <tr key={s.section}>
                  <td className={reportTable.td}>{s.section}</td>
                  <td className={reportTable.tdRight}>{s.collecteeCount}</td>
                  <td className={reportTable.tdRight}>{formatInr(s.amountReceivedOrDebited)}</td>
                  <td className={reportTable.tdRight}>{formatInr(s.tcsAmount)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${reportTable.td} font-bold`}>Total</td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {data.summary.collecteeRowCount}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.totalAmountReceivedOrDebited)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(data.summary.totalTcs)}
                </td>
              </tr>
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>BSR code</th>
                <th className={reportTable.th}>Challan no</th>
                <th className={reportTable.th}>Deposit date</th>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.thRight}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {!data.challans || data.challans.length === 0 ? (
                <tr>
                  <td colSpan={5} className={`${reportTable.td} text-center text-gray-500`}>
                    No TCS deposit challans recorded for this quarter.
                  </td>
                </tr>
              ) : (
                data.challans.map((c) => (
                  <tr key={c.id}>
                    <td className={reportTable.td}>{c.bsrCode}</td>
                    <td className={reportTable.td}>{c.challanNo}</td>
                    <td className={reportTable.td}>{formatDate(c.depositDate)}</td>
                    <td className={reportTable.td}>{c.section || '—'}</td>
                    <td className={reportTable.tdRight}>{formatInr(c.amount)}</td>
                  </tr>
                ))
              )}
              {data.challanSummary ? (
                <tr>
                  <td className={`${reportTable.td} font-bold`} colSpan={4}>
                    Deposited / books TCS
                    {data.challanSummary.shortfall > 0
                      ? ` (shortfall ₹${formatInr(data.challanSummary.shortfall)})`
                      : ''}
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(data.challanSummary.depositedTotal)} /{' '}
                    {formatInr(data.challanSummary.totalTax)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={`${reportTable.th} w-12`}>S.No</th>
                <th className={reportTable.th}>Collectee</th>
                <th className={reportTable.th}>PAN</th>
                <th className={reportTable.th}>GSTIN</th>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.th}>Date</th>
                <th className={reportTable.thRight}>Amount (₹)</th>
                <th className={reportTable.thRight}>Rate %</th>
                <th className={reportTable.thRight}>TCS (₹)</th>
              </tr>
            </thead>
            <tbody>
              {data.annexure.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${reportTable.td} text-center text-gray-500`}>
                    No TCS collections in this quarter.
                  </td>
                </tr>
              ) : (
                data.annexure.map((r) => (
                  <tr key={r.sno}>
                    <td className={reportTable.td}>{r.sno}</td>
                    <td className={reportTable.td}>
                      {r.collecteeName}
                      {r.documentNo ? (
                        <div className="text-[10px] text-gray-500">{r.documentNo}</div>
                      ) : null}
                    </td>
                    <td className={`${reportTable.td} ${r.panMissing ? 'text-amber-700' : ''}`}>
                      {r.collecteePan || 'Missing'}
                    </td>
                    <td className={reportTable.td}>{r.collecteeGstin || '—'}</td>
                    <td className={reportTable.td}>{r.section}</td>
                    <td className={reportTable.td}>{formatDate(r.dateOfReceiptOrDebit)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.amountReceivedOrDebited)}</td>
                    <td className={reportTable.tdRight}>{r.ratePercent.toFixed(2)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.tcsAmount)}</td>
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
