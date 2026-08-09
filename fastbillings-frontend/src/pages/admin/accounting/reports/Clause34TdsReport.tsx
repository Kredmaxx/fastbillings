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
  warnings?: string[];
  readiness: { canFile: boolean; blockers: string[] };
  summary: {
    lineCount: number;
    shortfallLineCount: number;
    totalDeducted: number;
    totalDeposited: number;
    totalShortfall: number;
    challanDepositTotal: number;
    challanAllocatedTotal: number;
    challanUnallocatedTotal: number;
    byForm: Array<{
      form: string;
      deducted: number;
      deposited: number;
      shortfall: number;
      lineCount: number;
    }>;
  };
  byFormQuarter: Array<{
    form: string;
    quarter: string;
    lineCount: number;
    deducted: number;
    deposited: number;
    shortfall: number;
  }>;
  clause34b: {
    applicableCount: number;
    filedCount: number;
    unfiledCount: number;
    hasAnyFilingRecord: boolean;
    buckets: Array<{
      form: string;
      quarter: string;
      deducted: number;
      applicable: boolean;
      filingStatus: 'FILED' | 'UNFILED' | 'NOT_APPLICABLE';
      filingId: string | null;
      isFiled: boolean;
      filedDate: string | null;
      acknowledgementNo: string | null;
      notes: string | null;
    }>;
  };
  lines: Array<{
    form: string;
    quarter: string;
    sourceType: string;
    sourceId: string;
    docNumber: string | null;
    date: string;
    section: string | null;
    partyName: string;
    deducted: number;
    deposited: number;
    shortfall: number;
  }>;
}

export default function Clause34TdsReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_CLAUSE_34_TDS_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load clause 34 TDS/TCS worksheet');
    } finally {
      setLoading(false);
    }
  }

  async function toggleFiled(bucket: ReportData['clause34b']['buckets'][number]) {
    if (!bucket.applicable) return;
    const key = `${bucket.form}|${bucket.quarter}`;
    setSavingKey(key);
    setError(null);
    try {
      await axios.put(
        Constants.PUT_TDS_TCS_RETURN_FILING_URL,
        {
          fyLabel: fy,
          form: bucket.form,
          quarter: bucket.quarter,
          isFiled: !bucket.isFiled,
          acknowledgementNo: bucket.acknowledgementNo,
          notes: bucket.notes,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await load();
    } catch {
      setError('Failed to save return-filed flag');
    } finally {
      setSavingKey(null);
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
            Clause 34(a) TDS/TCS
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Worksheet — not TRACES / Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Deducted vs challan-allocated deposit by 24Q/26Q/27Q/27EQ. See also{' '}
            <Link to="/admin/accounting/reports/tds-register" className="text-blue-700 underline">
              TDS register
            </Link>
            ,{' '}
            <Link
              to="/admin/accounting/reports/tax-deposit-challans"
              className="text-blue-700 underline"
            >
              deposit challans
            </Link>
            , and{' '}
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
          printId="clause-34-tds-print-root"
          title="Clause 34(a) — Tax deducted / collected vs deposited"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Lines: {data.summary.lineCount} · Shortfall lines:{' '}
              {data.summary.shortfallLineCount}
            </div>
            <div>
              Deducted: {formatInr(data.summary.totalDeducted)} · Deposited (allocated):{' '}
              {formatInr(data.summary.totalDeposited)} · Shortfall (pack amount):{' '}
              {formatInr(data.summary.totalShortfall)}
            </div>
            <div>
              Challans in period: deposit {formatInr(data.summary.challanDepositTotal)} ·
              allocated {formatInr(data.summary.challanAllocatedTotal)} · unallocated{' '}
              {formatInr(data.summary.challanUnallocatedTotal)}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <h3 className="text-sm font-medium mb-1">By form</h3>
          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Form</th>
                <th className={reportTable.thRight}>Lines</th>
                <th className={reportTable.thRight}>Deducted</th>
                <th className={reportTable.thRight}>Deposited</th>
                <th className={reportTable.thRight}>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.byForm.map((r) => (
                <tr key={r.form}>
                  <td className={reportTable.td}>{r.form}</td>
                  <td className={reportTable.tdRight}>{r.lineCount}</td>
                  <td className={reportTable.tdRight}>{formatInr(r.deducted)}</td>
                  <td className={reportTable.tdRight}>{formatInr(r.deposited)}</td>
                  <td className={reportTable.tdRight}>{formatInr(r.shortfall)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="text-sm font-medium mb-1">By form × quarter</h3>
          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Form</th>
                <th className={reportTable.th}>Quarter</th>
                <th className={reportTable.thRight}>Lines</th>
                <th className={reportTable.thRight}>Deducted</th>
                <th className={reportTable.thRight}>Deposited</th>
                <th className={reportTable.thRight}>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {data.byFormQuarter.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${reportTable.td} text-center text-gray-500`}>
                    No TDS/TCS lines in this FY.
                  </td>
                </tr>
              ) : (
                data.byFormQuarter.map((r) => (
                  <tr key={`${r.form}-${r.quarter}`}>
                    <td className={reportTable.td}>{r.form}</td>
                    <td className={reportTable.td}>{r.quarter}</td>
                    <td className={reportTable.tdRight}>{r.lineCount}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.deducted)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.deposited)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.shortfall)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h3 className="text-sm font-medium mb-1">
            Clause 34(b) — Statements filed (books flags)
          </h3>
          <div className="mb-2 text-xs text-gray-600">
            Applicable: {data.clause34b.applicableCount} · Filed: {data.clause34b.filedCount} ·
            Unfiled (pack amount): {data.clause34b.unfiledCount}. Toggle is a books tag only — not
            TRACES / CPC proof.
          </div>
          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Form</th>
                <th className={reportTable.th}>Quarter</th>
                <th className={reportTable.thRight}>Deducted</th>
                <th className={reportTable.th}>Status</th>
                <th className={reportTable.th}>Ack / filed</th>
                <th className={`${reportTable.th} print:hidden`}>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.clause34b.buckets.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${reportTable.td} text-center text-gray-500`}>
                    No applicable form×quarter activity in this FY.
                  </td>
                </tr>
              ) : (
                data.clause34b.buckets.map((b) => {
                  const key = `${b.form}|${b.quarter}`;
                  return (
                    <tr key={key}>
                      <td className={reportTable.td}>{b.form}</td>
                      <td className={reportTable.td}>{b.quarter}</td>
                      <td className={reportTable.tdRight}>{formatInr(b.deducted)}</td>
                      <td className={reportTable.td}>{b.filingStatus}</td>
                      <td className={reportTable.td}>
                        {b.acknowledgementNo || '—'}
                        {b.filedDate ? (
                          <div className="text-[10px] text-gray-500">{formatDate(b.filedDate)}</div>
                        ) : null}
                      </td>
                      <td className={`${reportTable.td} print:hidden`}>
                        {b.applicable ? (
                          <button
                            type="button"
                            disabled={savingKey === key}
                            onClick={() => toggleFiled(b)}
                            className="px-2 py-0.5 text-xs border rounded disabled:opacity-50"
                          >
                            {savingKey === key
                              ? 'Saving…'
                              : b.isFiled
                                ? 'Mark unfiled'
                                : 'Mark filed'}
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <h3 className="text-sm font-medium mb-1">Lines</h3>
          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={reportTable.th}>Date</th>
                <th className={reportTable.th}>Form</th>
                <th className={reportTable.th}>Doc</th>
                <th className={reportTable.th}>Party</th>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.thRight}>Deducted</th>
                <th className={reportTable.thRight}>Deposited</th>
                <th className={reportTable.thRight}>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={`${l.sourceType}-${l.sourceId}`}>
                  <td className={reportTable.td}>{formatDate(l.date)}</td>
                  <td className={reportTable.td}>
                    {l.form}/{l.quarter}
                  </td>
                  <td className={reportTable.td}>{l.docNumber || l.sourceType}</td>
                  <td className={reportTable.td}>{l.partyName}</td>
                  <td className={reportTable.td}>{l.section || '—'}</td>
                  <td className={reportTable.tdRight}>{formatInr(l.deducted)}</td>
                  <td className={reportTable.tdRight}>{formatInr(l.deposited)}</td>
                  <td className={reportTable.tdRight}>{formatInr(l.shortfall)}</td>
                </tr>
              ))}
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
