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
    clauseCount: number;
    readyBooksCount: number;
    partialCount: number;
    notStartedCount: number;
    totalPutativeDisallowance: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  clauses: Array<{
    clause: string;
    title: string;
    status: 'READY_BOOKS' | 'PARTIAL' | 'NOT_STARTED';
    amount: number | null;
    detailPath: string;
    notes: string;
  }>;
}

function statusLabel(s: ReportData['clauses'][0]['status']): string {
  if (s === 'READY_BOOKS') return 'Books ready';
  if (s === 'PARTIAL') return 'Partial';
  return 'Not started';
}

export default function TaxAuditPackReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_TAX_AUDIT_PACK_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load tax-audit pack');
    } finally {
      setLoading(false);
    }
  }

  async function download(format: 'json' | 'csv') {
    setDownloading(true);
    setError(null);
    try {
      const res = await axios.get(
        `${Constants.EXPORT_TAX_AUDIT_PACK_URL}?fy=${encodeURIComponent(fy)}&format=${format}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        },
      );
      const blob = new Blob([res.data], {
        type: format === 'csv' ? 'text/csv' : 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tax_audit_pack_${fy}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Failed to download tax-audit pack export');
    } finally {
      setDownloading(false);
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
            Tax-audit pack
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Form 3CD index — not e-filing
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Clause-style index into books worksheets. Open each detail report to review putative
            amounts. CSV/JSON export is a books dump — not Form 3CD XML / UDIN.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={() => download('json')}
            disabled={!data || downloading}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Download JSON
          </button>
          <button
            type="button"
            onClick={() => download('csv')}
            disabled={!data || downloading}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Download CSV
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
          printId="tax-audit-pack-print-root"
          title="Tax-audit pack — Form 3CD–style clause index"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Clauses: {data.summary.clauseCount} · Books ready {data.summary.readyBooksCount} ·
              Partial {data.summary.partialCount} · Not started {data.summary.notStartedCount}
            </div>
            <div>
              Sum of clause amounts (where present):{' '}
              {formatInr(data.summary.totalPutativeDisallowance)}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Clause</th>
                <th className="py-1 pr-2">Title</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 pr-2 text-right">Amount</th>
                <th className="py-1 pr-2 print:hidden">Open</th>
              </tr>
            </thead>
            <tbody>
              {data.clauses.map((c) => (
                <tr key={c.clause + c.title} className="border-b border-gray-300 align-top">
                  <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{c.clause}</td>
                  <td className="py-1.5 pr-2">
                    <div>{c.title}</div>
                    <div className="text-gray-500 mt-0.5">{c.notes}</div>
                  </td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{statusLabel(c.status)}</td>
                  <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                    {c.amount == null ? '—' : formatInr(c.amount)}
                  </td>
                  <td className="py-1.5 pr-2 print:hidden">
                    <Link to={c.detailPath} className="text-blue-700 underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
