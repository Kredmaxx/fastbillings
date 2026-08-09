import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

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
    relatedSupplierCount: number;
    purchaseRowCount: number;
    expenseRowCount: number;
    purchaseAmount: number;
    expenseAmount: number;
    totalRelatedPartyPayments: number;
    fmvTaggedRowCount?: number;
    totalExcessOverFmv?: number;
  };
  readiness: { canFile: boolean; blockers: string[] };
  relatedSuppliers: Array<{
    id: string;
    name: string;
    email: string;
    pan: string | null;
  }>;
  purchaseRows: Array<{
    purchaseId: string;
    purchaseNumber: string | null;
    purchaseDate: string;
    supplierName: string;
    pan: string | null;
    taxableAmount: number;
    paymentAmount: number;
    fairMarketValue: number | null;
    fmvNote: string | null;
    excessOverFmv: number;
  }>;
  expenseRows: Array<{
    expenseId: string;
    expenseNumber: string | null;
    expenseDate: string;
    supplierName: string;
    categoryTitle: string;
    amount: number;
    fairMarketValue: number | null;
    fmvNote: string | null;
    excessOverFmv: number;
  }>;
}

export default function Section40A2RelatedPartyReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftFmv, setDraftFmv] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_SECTION_40A_2_RELATED_PARTY_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const payload = (r.data?.data ?? null) as ReportData | null;
      setData(payload);
      const drafts: Record<string, string> = {};
      for (const row of payload?.purchaseRows ?? []) {
        drafts[`PURCHASE:${row.purchaseId}`] =
          row.fairMarketValue != null ? String(row.fairMarketValue) : '';
      }
      for (const row of payload?.expenseRows ?? []) {
        drafts[`EXPENSE:${row.expenseId}`] =
          row.fairMarketValue != null ? String(row.fairMarketValue) : '';
      }
      setDraftFmv(drafts);
    } catch {
      setError('Failed to load §40A(2) related-party worksheet');
    } finally {
      setLoading(false);
    }
  }

  async function saveFmv(docType: 'PURCHASE' | 'EXPENSE', id: string) {
    const key = `${docType}:${id}`;
    const raw = draftFmv[key] ?? '';
    setBusyId(id);
    try {
      await axios.patch(
        Constants.PATCH_SECTION_40A_2_FMV_TAG_URL,
        {
          docType,
          id,
          fairMarketValue: raw.trim() === '' ? null : Number(raw),
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success(raw.trim() ? 'FMV tag saved' : 'FMV tag cleared');
      await load();
    } catch {
      toast.error('Failed to update FMV tag');
    } finally {
      setBusyId(null);
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
            §40A(2) related-party payments
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Disclosure — not Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Payments to suppliers flagged related / specified person. Optional FMV tags add putative
            excess (payment − FMV). Tag suppliers on the{' '}
            <Link to="/admin/suppliers" className="text-blue-700 underline">
              suppliers
            </Link>{' '}
            screen.
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
          printId="section-40a-2-print-root"
          title="§40A(2) related-party payments — books disclosure"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Related suppliers: {data.summary.relatedSupplierCount} · Purchases:{' '}
              {data.summary.purchaseRowCount} ({formatInr(data.summary.purchaseAmount)}) · Expenses:{' '}
              {data.summary.expenseRowCount} ({formatInr(data.summary.expenseAmount)})
            </div>
            <div className="font-medium">
              Total related-party payments: {formatInr(data.summary.totalRelatedPartyPayments)}
            </div>
            <div>
              FMV-tagged rows: {data.summary.fmvTaggedRowCount ?? 0} · Putative excess:{' '}
              {formatInr(data.summary.totalExcessOverFmv ?? 0)}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready'} —{' '}
              {data.readiness.blockers.join('; ')}
            </div>
          </div>

          <h3 className="text-sm font-medium mb-1">Purchases</h3>
          <table className="w-full text-xs border-collapse mb-4">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Purchase</th>
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Supplier</th>
                <th className="py-1 pr-2 text-right">Payment</th>
                <th className="py-1 pr-2 text-right">FMV</th>
                <th className="py-1 text-right">Excess</th>
              </tr>
            </thead>
            <tbody>
              {data.purchaseRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-3 text-gray-500">
                    No purchases to related-party suppliers in this FY.
                  </td>
                </tr>
              ) : (
                data.purchaseRows.map((r) => {
                  const key = `PURCHASE:${r.purchaseId}`;
                  return (
                    <tr key={r.purchaseId} className="border-b border-gray-300">
                      <td className="py-1 pr-2">{r.purchaseNumber || '—'}</td>
                      <td className="py-1 pr-2">{formatDate(r.purchaseDate)}</td>
                      <td className="py-1 pr-2">
                        {r.supplierName}
                        {r.pan ? ` · ${r.pan}` : ''}
                      </td>
                      <td className="py-1 pr-2 text-right">{formatInr(r.paymentAmount)}</td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <div className="inline-flex items-center gap-1">
                          <input
                            value={draftFmv[key] ?? ''}
                            onChange={(e) =>
                              setDraftFmv((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            placeholder="—"
                            className="w-20 border rounded px-1 py-0.5 text-right"
                          />
                          <button
                            type="button"
                            disabled={busyId === r.purchaseId}
                            onClick={() => saveFmv('PURCHASE', r.purchaseId)}
                            className="px-1.5 py-0.5 border rounded text-[10px] disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="py-1 pr-2 text-right hidden print:table-cell">
                        {r.fairMarketValue != null ? formatInr(r.fairMarketValue) : '—'}
                      </td>
                      <td className="py-1 text-right font-medium">
                        {formatInr(r.excessOverFmv)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <h3 className="text-sm font-medium mb-1">Expenses</h3>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1 pr-2">Expense</th>
                <th className="py-1 pr-2">Date</th>
                <th className="py-1 pr-2">Supplier</th>
                <th className="py-1 pr-2">Category</th>
                <th className="py-1 pr-2 text-right">Amount</th>
                <th className="py-1 pr-2 text-right">FMV</th>
                <th className="py-1 text-right">Excess</th>
              </tr>
            </thead>
            <tbody>
              {data.expenseRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-gray-500">
                    No expenses linked to related-party suppliers in this FY.
                  </td>
                </tr>
              ) : (
                data.expenseRows.map((r) => {
                  const key = `EXPENSE:${r.expenseId}`;
                  return (
                    <tr key={r.expenseId} className="border-b border-gray-300">
                      <td className="py-1 pr-2">{r.expenseNumber || '—'}</td>
                      <td className="py-1 pr-2">{formatDate(r.expenseDate)}</td>
                      <td className="py-1 pr-2">{r.supplierName}</td>
                      <td className="py-1 pr-2">{r.categoryTitle}</td>
                      <td className="py-1 pr-2 text-right">{formatInr(r.amount)}</td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <div className="inline-flex items-center gap-1">
                          <input
                            value={draftFmv[key] ?? ''}
                            onChange={(e) =>
                              setDraftFmv((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            placeholder="—"
                            className="w-20 border rounded px-1 py-0.5 text-right"
                          />
                          <button
                            type="button"
                            disabled={busyId === r.expenseId}
                            onClick={() => saveFmv('EXPENSE', r.expenseId)}
                            className="px-1.5 py-0.5 border rounded text-[10px] disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="py-1 pr-2 text-right hidden print:table-cell">
                        {r.fairMarketValue != null ? formatInr(r.fairMarketValue) : '—'}
                      </td>
                      <td className="py-1 text-right font-medium">
                        {formatInr(r.excessOverFmv)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
