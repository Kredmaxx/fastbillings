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
    taggedTotal: number;
    worksheetPutativeTotal: number;
    overlapCashInDisallowable: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  taggedByClass: Array<{
    taxClass: string;
    categoryCount: number;
    expenseCount: number;
    amount: number;
  }>;
  worksheetLinks: Array<{
    key: string;
    label: string;
    amount: number;
    detailPath: string;
    countsTowardPutative: boolean;
  }>;
  overlapCashInDisallowable: number;
}

export default function Clause21aInadmissibleReport() {
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
        `${Constants.GET_CLAUSE_21A_INADMISSIBLE_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load clause 21(a) inadmissible schedule');
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
            Clause 21(a) inadmissible schedule
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Worksheet — not Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Tax-class tagged amounts plus links to statutory worksheets. See also{' '}
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
          printId="clause-21a-print-root"
          title="Clause 21(a) inadmissible amounts — books schedule"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div className="font-medium">
              Section A tagged total: {formatInr(data.summary.taggedTotal)}
            </div>
            <div>
              Section B worksheet putative (linked, not added to A):{' '}
              {formatInr(data.summary.worksheetPutativeTotal)}
            </div>
            {data.summary.overlapCashInDisallowable > 0 && (
              <div className="text-amber-800">
                Overlap warning: cash/petty in DISALLOWABLE (excl. Rule 6DD tags){' '}
                {formatInr(data.summary.overlapCashInDisallowable)} may also appear under §40A(3) —
                not auto-deduped.
              </div>
            )}
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <h3 className="text-sm font-medium mb-1">Section A — Expense tax class tags</h3>
          <table className="w-full text-xs border-collapse mb-4">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Tax class</th>
                <th className="py-1 pr-2 text-right">Categories</th>
                <th className="py-1 pr-2 text-right">Expenses</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.taggedByClass.map((r) => (
                <tr key={r.taxClass} className="border-b border-gray-300">
                  <td className="py-1 pr-2">{r.taxClass}</td>
                  <td className="py-1 pr-2 text-right">{r.categoryCount}</td>
                  <td className="py-1 pr-2 text-right">{r.expenseCount}</td>
                  <td className="py-1 text-right font-medium">{formatInr(r.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-1 pr-2 font-bold" colSpan={3}>
                  Tagged total
                </td>
                <td className="py-1 text-right font-bold">
                  {formatInr(data.summary.taggedTotal)}
                </td>
              </tr>
            </tbody>
          </table>

          <h3 className="text-sm font-medium mb-1">Section B — Statutory worksheet roll-up</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Worksheet</th>
                <th className="py-1 pr-2 text-right">Putative</th>
                <th className="py-1 print:hidden">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.worksheetLinks.map((w) => (
                <tr key={w.key} className="border-b border-gray-300">
                  <td className="py-1 pr-2">{w.label}</td>
                  <td className="py-1 pr-2 text-right">{formatInr(w.amount)}</td>
                  <td className="py-1 print:hidden">
                    <Link to={w.detailPath} className="text-blue-700 underline">
                      Detail
                    </Link>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-1 pr-2 font-bold">Worksheet putative total</td>
                <td className="py-1 pr-2 text-right font-bold">
                  {formatInr(data.summary.worksheetPutativeTotal)}
                </td>
                <td className="print:hidden" />
              </tr>
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
