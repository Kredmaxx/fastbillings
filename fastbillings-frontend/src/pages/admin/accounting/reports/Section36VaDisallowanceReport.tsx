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
  summary: {
    lineCount: number;
    pfReceived: number;
    esiReceived: number;
    disallowRowCount: number;
    totalPutativeDisallowance: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  disallowRows: Array<{
    deductionId: string;
    employeeName: string;
    employeePan: string | null;
    payDate: string;
    amountPaid: number;
    pfReceived: number;
    esiReceived: number;
    pfDueDate: string;
    pfDepositedDate: string | null;
    esiDueDate: string;
    esiDepositedDate: string | null;
    pfIssue: string;
    esiIssue: string;
    putativeDisallowance: number;
  }>;
}

export default function Section36VaDisallowanceReport() {
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
        `${Constants.GET_SECTION_36_1_VA_DISALLOWANCE_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load §36(1)(va) disallowance worksheet');
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
            §36(1)(va) employee PF/ESI
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Worksheet — not Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Employee contributions on salary TDS lines undeposited or late vs due-date proxy. Separate
            from{' '}
            <Link to="/admin/accounting/reports/section-43b-disallowance" className="text-blue-700 underline">
              §43B employer PF
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
          printId="section-36-1-va-print-root"
          title="§36(1)(va) employee PF/ESI — books screen"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Salary lines with PF/ESI: {data.summary.lineCount} · PF received:{' '}
              {formatInr(data.summary.pfReceived)} · ESI received:{' '}
              {formatInr(data.summary.esiReceived)}
            </div>
            <div className="font-medium">
              Disallow rows: {data.summary.disallowRowCount} · Putative disallowance:{' '}
              {formatInr(data.summary.totalPutativeDisallowance)}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <h3 className="text-sm font-medium mb-1">Undeposited / late (putative disallowance)</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Employee</th>
                <th className="py-1 pr-2">Pay date</th>
                <th className="py-1 pr-2 text-right">PF</th>
                <th className="py-1 pr-2">PF issue</th>
                <th className="py-1 pr-2 text-right">ESI</th>
                <th className="py-1 pr-2">ESI issue</th>
                <th className="py-1 text-right">Disallow</th>
              </tr>
            </thead>
            <tbody>
              {data.disallowRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-gray-500">
                    No undeposited or late employee PF/ESI lines in this FY.
                  </td>
                </tr>
              ) : (
                data.disallowRows.map((r) => (
                  <tr key={r.deductionId} className="border-b border-gray-300">
                    <td className="py-1 pr-2">
                      {r.employeeName}
                      {r.employeePan ? ` · ${r.employeePan}` : ''}
                    </td>
                    <td className="py-1 pr-2">{formatDate(r.payDate)}</td>
                    <td className="py-1 pr-2 text-right">{formatInr(r.pfReceived)}</td>
                    <td className="py-1 pr-2">{r.pfIssue}</td>
                    <td className="py-1 pr-2 text-right">{formatInr(r.esiReceived)}</td>
                    <td className="py-1 pr-2">{r.esiIssue}</td>
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
