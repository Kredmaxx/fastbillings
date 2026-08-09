import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';

interface ImportSummary {
  id: string;
  periodMonth: string;
  sourceLabel: string | null;
  importedAt: string;
  lineCount: number;
  matchedCount: number;
  partialCount: number;
  missingCount: number;
}

interface Gstr2bLine {
  id: string;
  docType?: string;
  supplierGstin: string | null;
  invoiceNumber: string;
  invoiceDate: string | null;
  taxableValue: number | string;
  cgst: number | string;
  sgst: number | string;
  igst: number | string;
  itcEligible?: boolean;
  matchStatus: 'UNMATCHED' | 'MATCHED' | 'PARTIAL' | 'MISSING_IN_BOOKS';
  matchedPurchaseId: string | null;
  matchedDebitNoteId?: string | null;
  matchNotes: string | null;
  matchedPurchase?: { id: string; purchaseId: string | null; referenceNo: string | null } | null;
  matchedDebitNote?: { id: string; debitNoteId: string | null; referenceNo: string | null } | null;
}

interface ExcessRow {
  kind?: string;
  id: string;
  documentNumber: string;
  taxable: number;
  supplierGstin?: string | null;
}

type StatusFilter = 'ALL' | 'MATCHED' | 'PARTIAL' | 'MISSING_IN_BOOKS' | 'UNMATCHED';

const sampleJson = `{
  "periodMonth": "2026-07",
  "b2b": [
    {
      "ctin": "27AAAAA0000A1Z5",
      "trdnm": "Demo Supplier",
      "inv": [
        {
          "inum": "PUR-000001",
          "idt": "10-07-2026",
          "txval": 10000,
          "camt": 900,
          "samt": 900,
          "iamt": 0,
          "val": 11800
        }
      ]
    }
  ]
}`;

export default function GSTR2BReconcile() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [imports, setImports] = useState<ImportSummary[]>([]);
  const [periodFilter, setPeriodFilter] = useState('');
  const [jsonText, setJsonText] = useState(sampleJson);
  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lines, setLines] = useState<Gstr2bLine[]>([]);
  const [excess, setExcess] = useState<ExcessRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [itcEligibleTax, setItcEligibleTax] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [linkLineId, setLinkLineId] = useState<string | null>(null);
  const [purchaseQuery, setPurchaseQuery] = useState('');
  const [purchaseHits, setPurchaseHits] = useState<
    Array<{ id: string; purchaseId: string | null; referenceNo: string | null }>
  >([]);

  const headers = { Authorization: `Bearer ${token}` };

  async function loadImports(period?: string) {
    try {
      const r = await axios.get(Constants.GSTR2B_IMPORTS_URL, {
        headers,
        params: period ? { periodMonth: period } : undefined,
      });
      setImports(r.data?.data?.imports ?? []);
    } catch {
      toast.error('Failed to load GSTR-2B imports');
    }
  }

  async function openImport(id: string) {
    try {
      setActiveId(id);
      const r = await axios.get(`${Constants.GSTR2B_IMPORTS_URL}/${id}`, { headers });
      const imp = r.data?.data?.import;
      setLines(imp?.lines ?? []);
      const meta = imp?.metadata as { excessInBooks?: ExcessRow[]; excessInBooksCount?: number } | null;
      setExcess(meta?.excessInBooks ?? []);
      setItcEligibleTax(Number(r.data?.data?.itcEligibleTax ?? 0));
      setSummary({
        matched: imp?.matchedCount ?? 0,
        partial: imp?.partialCount ?? 0,
        missing: imp?.missingCount ?? 0,
        total: imp?.lineCount ?? 0,
        excess: Number(meta?.excessInBooksCount ?? meta?.excessInBooks?.length ?? 0),
      });
    } catch {
      toast.error('Failed to load import detail');
    }
  }

  async function handleImport() {
    let payload: unknown;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      toast.error('Invalid JSON');
      return;
    }
    try {
      setSubmitting(true);
      const r = await axios.post(Constants.GSTR2B_IMPORT_URL, payload, { headers });
      toast.success(r.data?.message ?? 'Imported');
      const id = r.data?.data?.import?.id as string | undefined;
      await loadImports(periodFilter || undefined);
      if (id) await openImport(id);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || 'Import failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this GSTR-2B import and all lines?')) return;
    try {
      await axios.delete(`${Constants.GSTR2B_IMPORTS_URL}/${id}`, { headers });
      toast.success('Deleted');
      if (activeId === id) {
        setActiveId(null);
        setLines([]);
        setSummary(null);
        setExcess([]);
      }
      await loadImports(periodFilter || undefined);
    } catch {
      toast.error('Delete failed');
    }
  }

  async function handleReReconcile() {
    if (!activeId) return;
    try {
      setSubmitting(true);
      await axios.post(`${Constants.GSTR2B_IMPORTS_URL}/${activeId}/reconcile`, {}, { headers });
      toast.success('Re-reconciled');
      await openImport(activeId);
      await loadImports(periodFilter || undefined);
    } catch {
      toast.error('Re-reconcile failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function patchLine(lineId: string, body: Record<string, unknown>) {
    if (!activeId) return;
    try {
      await axios.patch(`${Constants.GSTR2B_IMPORTS_URL}/${activeId}/lines/${lineId}`, body, {
        headers,
      });
      await openImport(activeId);
      await loadImports(periodFilter || undefined);
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.message : null;
      toast.error(msg || 'Update failed');
    }
  }

  async function searchPurchases(q: string) {
    setPurchaseQuery(q);
    if (q.trim().length < 1) {
      setPurchaseHits([]);
      return;
    }
    try {
      const r = await axios.get(Constants.GSTR2B_PURCHASE_SEARCH_URL, {
        headers,
        params: { q },
      });
      setPurchaseHits(r.data?.data?.purchases ?? []);
    } catch {
      setPurchaseHits([]);
    }
  }

  function exportCsv() {
    if (!activeId) return;
    axios
      .get(`${Constants.GSTR2B_IMPORTS_URL}/${activeId}/export-mismatches.csv`, {
        headers,
        responseType: 'blob',
      })
      .then((r) => {
        const url = URL.createObjectURL(r.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gstr2b-mismatches.csv`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error('CSV export failed'));
  }

  useEffect(() => {
    loadImports(periodFilter || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodFilter]);

  const filteredLines = useMemo(() => {
    if (statusFilter === 'ALL') return lines;
    return lines.filter((l) => l.matchStatus === statusFilter);
  }, [lines, statusFilter]);

  const statusClass: Record<string, string> = {
    MATCHED: 'bg-green-100 text-green-800',
    PARTIAL: 'bg-amber-100 text-amber-800',
    MISSING_IN_BOOKS: 'bg-red-100 text-red-700',
    UNMATCHED: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          GSTR-2B ITC reconcile
          <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
            Books worksheet — not GSTN portal filing
          </span>
        </h1>
        <p className="text-sm text-gray-500">
          Import portal JSON (B2B / CDNR), match to purchases & debit notes (GSTIN + invoice #, ±1 month
          books window), then review mismatches.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Import JSON</label>
          <textarea
            className="w-full h-64 p-2 font-mono text-xs border rounded"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          <button
            type="button"
            disabled={submitting}
            onClick={handleImport}
            className="mt-2 px-3 py-2 text-sm text-white bg-purple-600 rounded disabled:opacity-50"
          >
            {submitting ? 'Importing…' : 'Import & reconcile'}
          </button>
        </div>
        <div>
          <div className="flex items-end gap-2 mb-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Filter by period</label>
              <input
                type="month"
                className="w-full border rounded p-2 text-sm"
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value)}
              />
            </div>
            {periodFilter && (
              <button
                type="button"
                className="text-xs text-gray-500 underline pb-2"
                onClick={() => setPeriodFilter('')}
              >
                Clear
              </button>
            )}
          </div>
          <h2 className="text-sm font-medium mb-2">Recent imports</h2>
          <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">
            {imports.length === 0 && <li className="text-gray-500">No imports yet.</li>}
            {imports.map((imp) => (
              <li key={imp.id} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => openImport(imp.id)}
                  className={`flex-1 text-left px-3 py-2 border rounded hover:bg-gray-50 ${
                    activeId === imp.id ? 'border-purple-500 bg-purple-50' : ''
                  }`}
                >
                  <div className="font-medium">{imp.periodMonth}</div>
                  <div className="text-xs text-gray-500">
                    {imp.lineCount} lines · matched {imp.matchedCount} · partial {imp.partialCount} ·
                    missing {imp.missingCount}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(imp.id)}
                  className="px-2 text-xs text-red-600 border rounded hover:bg-red-50"
                  title="Delete import"
                >
                  Del
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {summary && activeId && (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleReReconcile}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
            >
              Re-reconcile
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50"
            >
              Export mismatches CSV
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
            <div className="p-3 border rounded">
              <div className="text-xs text-gray-500">Portal lines</div>
              <div className="font-semibold">{summary.total}</div>
            </div>
            <div className="p-3 border rounded">
              <div className="text-xs text-gray-500">Matched</div>
              <div className="font-semibold text-green-700">{summary.matched}</div>
            </div>
            <div className="p-3 border rounded">
              <div className="text-xs text-gray-500">Partial</div>
              <div className="font-semibold text-amber-700">{summary.partial}</div>
            </div>
            <div className="p-3 border rounded">
              <div className="text-xs text-gray-500">Missing in books</div>
              <div className="font-semibold text-red-700">{summary.missing}</div>
            </div>
            <div className="p-3 border rounded">
              <div className="text-xs text-gray-500">Excess in books</div>
              <div className="font-semibold">{summary.excess}</div>
            </div>
            <div className="p-3 border rounded">
              <div className="text-xs text-gray-500">Eligible ITC (tax ₹)</div>
              <div className="font-semibold">{itcEligibleTax.toFixed(2)}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {(['ALL', 'MATCHED', 'PARTIAL', 'MISSING_IN_BOOKS', 'UNMATCHED'] as StatusFilter[]).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-2 py-1 rounded border text-xs ${
                    statusFilter === s ? 'bg-purple-600 text-white border-purple-600' : 'bg-white'
                  }`}
                >
                  {s.replace(/_/g, ' ')}
                </button>
              ),
            )}
          </div>

          <div className="overflow-x-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Supplier GSTIN</th>
                  <th className="px-3 py-2">Invoice</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Taxable</th>
                  <th className="px-3 py-2 text-right">CGST</th>
                  <th className="px-3 py-2 text-right">SGST</th>
                  <th className="px-3 py-2 text-right">IGST</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">ITC</th>
                  <th className="px-3 py-2">Books link</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((l) => (
                  <tr key={l.id} className="border-t align-top">
                    <td className="px-3 py-2 text-xs">{l.docType || 'B2B'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.supplierGstin || '—'}</td>
                    <td className="px-3 py-2">{l.invoiceNumber}</td>
                    <td className="px-3 py-2">{l.invoiceDate ? formatDate(l.invoiceDate) : '—'}</td>
                    <td className="px-3 py-2 text-right">{Number(l.taxableValue).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{Number(l.cgst).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{Number(l.sgst).toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{Number(l.igst).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusClass[l.matchStatus]}`}>
                        {l.matchStatus}
                      </span>
                      {l.matchNotes && (
                        <div className="text-xs text-gray-400 mt-1 max-w-[10rem] truncate" title={l.matchNotes}>
                          {l.matchNotes}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={l.itcEligible !== false}
                        onChange={(e) => patchLine(l.id, { itcEligible: e.target.checked })}
                        title="ITC eligible"
                      />
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {l.matchedPurchaseId && (
                        <Link
                          className="text-purple-700 underline"
                          to={`/admin/purchases/view/${l.matchedPurchaseId}`}
                        >
                          {l.matchedPurchase?.purchaseId ||
                            l.matchedPurchase?.referenceNo ||
                            l.matchedPurchaseId.slice(0, 8)}
                        </Link>
                      )}
                      {l.matchedDebitNoteId && (
                        <Link
                          className="text-purple-700 underline"
                          to={`/admin/debit-notes/view/${l.matchedDebitNoteId}`}
                        >
                          DN{' '}
                          {l.matchedDebitNote?.debitNoteId ||
                            l.matchedDebitNote?.referenceNo ||
                            l.matchedDebitNoteId.slice(0, 8)}
                        </Link>
                      )}
                      {!l.matchedPurchaseId && !l.matchedDebitNoteId && '—'}
                    </td>
                    <td className="px-3 py-2 space-y-1">
                      {(l.matchedPurchaseId || l.matchedDebitNoteId) && (
                        <button
                          type="button"
                          className="block text-xs text-red-600 underline"
                          onClick={() => patchLine(l.id, { unmatch: true })}
                        >
                          Unmatch
                        </button>
                      )}
                      <button
                        type="button"
                        className="block text-xs text-purple-700 underline"
                        onClick={() => {
                          setLinkLineId(l.id);
                          setPurchaseQuery('');
                          setPurchaseHits([]);
                        }}
                      >
                        Link purchase
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {linkLineId && (
            <div className="border rounded p-4 space-y-2 bg-gray-50">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-medium">Link purchase to line</h3>
                <button type="button" className="text-xs underline" onClick={() => setLinkLineId(null)}>
                  Close
                </button>
              </div>
              <input
                type="text"
                className="w-full border rounded p-2 text-sm"
                placeholder="Search purchase number…"
                value={purchaseQuery}
                onChange={(e) => searchPurchases(e.target.value)}
              />
              <ul className="text-sm space-y-1 max-h-40 overflow-y-auto">
                {purchaseHits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="text-left w-full px-2 py-1 hover:bg-white rounded"
                      onClick={async () => {
                        await patchLine(linkLineId, { purchaseId: p.id });
                        setLinkLineId(null);
                        toast.success('Linked');
                      }}
                    >
                      {p.purchaseId || p.referenceNo || p.id.slice(0, 8)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {excess.length > 0 && (
            <div>
              <h2 className="text-sm font-medium mb-2">Excess in books (not in portal)</h2>
              <div className="overflow-x-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-left">
                    <tr>
                      <th className="px-3 py-2">Kind</th>
                      <th className="px-3 py-2">Document</th>
                      <th className="px-3 py-2">GSTIN</th>
                      <th className="px-3 py-2 text-right">Taxable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excess.map((e) => (
                      <tr key={`${e.kind}-${e.id}`} className="border-t">
                        <td className="px-3 py-2 text-xs">{e.kind || 'purchase'}</td>
                        <td className="px-3 py-2">
                          {e.kind === 'debit_note' ? (
                            <Link className="text-purple-700 underline" to={`/admin/debit-notes/view/${e.id}`}>
                              {e.documentNumber}
                            </Link>
                          ) : (
                            <Link className="text-purple-700 underline" to={`/admin/purchases/view/${e.id}`}>
                              {e.documentNumber}
                            </Link>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{e.supplierGstin || '—'}</td>
                        <td className="px-3 py-2 text-right">{Number(e.taxable).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
