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
  disallowRate: number;
  summary: {
    rowCount: number;
    nonDeductionCount: number;
    nonDepositCount: number;
    totalPutativeDisallowance: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  rows: Array<{
    purchaseId: string;
    purchaseNumber: string | null;
    purchaseDate: string;
    vendorName: string;
    section: string | null;
    tdsRatePercent: number;
    taxableAmount: number;
    tdsAmount: number;
    challanAllocated: number;
    tdsShortfall: number;
    issue: 'NON_DEDUCTION' | 'NON_DEPOSIT';
    putativeDisallowance: number;
  }>;
}

export default function Section40AiDisallowanceReport() {
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
        `${Constants.GET_SECTION_40A_I_DISALLOWANCE_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load §40(a)(i) disallowance worksheet');
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
            §40(a)(i) NR TDS disallowance
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Worksheet — not Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Non-resident purchases (supplier.isNonResident) with TDS not deducted or not mapped to a
            challan — 100% of taxable. Residents use{' '}
            <Link
              to="/admin/accounting/reports/section-40a-ia-disallowance"
              className="text-blue-700 underline"
            >
              §40(a)(ia)
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
          printId="section-40a-i-print-root"
          title="§40(a)(i) NR TDS — books screen"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Rows: {data.summary.rowCount} (non-deduction {data.summary.nonDeductionCount} ·
              non-deposit {data.summary.nonDepositCount}) · Rate:{' '}
              {Math.round(data.disallowRate * 100)}% of taxable
            </div>
            <div>
              Putative disallowance total: {formatInr(data.summary.totalPutativeDisallowance)}
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
                <th className="py-1 pr-2">Purchase</th>
                <th className="py-1 pr-2">Vendor</th>
                <th className="py-1 pr-2">Issue</th>
                <th className="py-1 pr-2">Section</th>
                <th className="py-1 pr-2 text-right">Taxable</th>
                <th className="py-1 pr-2 text-right">TDS</th>
                <th className="py-1 pr-2 text-right">Challan</th>
                <th className="py-1 text-right">Disallow</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-3 text-gray-500">
                    No §40(a)(i) issues in this FY.
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr key={r.purchaseId} className="border-b border-gray-300">
                    <td className="py-1 pr-2">{formatDate(r.purchaseDate)}</td>
                    <td className="py-1 pr-2">{r.purchaseNumber || '—'}</td>
                    <td className="py-1 pr-2">{r.vendorName}</td>
                    <td className="py-1 pr-2">
                      {r.issue === 'NON_DEDUCTION' ? 'Non-deduction' : 'Non-deposit'}
                    </td>
                    <td className="py-1 pr-2">{r.section || '—'}</td>
                    <td className="py-1 pr-2 text-right">{formatInr(r.taxableAmount)}</td>
                    <td className="py-1 pr-2 text-right">{formatInr(r.tdsAmount)}</td>
                    <td className="py-1 pr-2 text-right">
                      {formatInr(r.challanAllocated)}
                      {r.tdsShortfall > 0 ? ` (−${formatInr(r.tdsShortfall)})` : ''}
                    </td>
                    <td className="py-1 text-right font-medium">
                      {formatInr(r.putativeDisallowance)}
                    </td>
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
