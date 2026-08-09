import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import PageBackButton from '@components/admin/layouts/PageBackButton';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

const SAMPLE = `[
  { "section": "194C", "amount": 2000, "pan": "ABCDE1234F", "name": "Vendor One", "challanNo": "KMX-TDS-000001" },
  { "section": "194J", "amount": 1000, "pan": "FGHIJ5678K" },
  { "section": "206C(1H)", "amount": 150, "pan": "AABCN8821R", "name": "Customer One", "challanNo": "KMX-TCS-000002" }
]`;

export default function Form26AsReconcile() {
  const token = useSelector((s: RootState) => s.auth.token);
  const today = isoDate(new Date());
  const [periodFrom, setPeriodFrom] = useState(monthStart(new Date()));
  const [periodTo, setPeriodTo] = useState(today);
  const [label, setLabel] = useState('Portal export');
  const [linesJson, setLinesJson] = useState(SAMPLE);
  const [imports, setImports] = useState<
    Array<{ id: string; label: string | null; lineCount: number; periodFrom: string; periodTo: string }>
  >([]);
  const [importId, setImportId] = useState('');
  const [result, setResult] = useState<{
    notes?: string;
    summary: {
      importLines: number;
      booksTdsRows: number;
      booksPurchaseRows?: number;
      booksSalaryRows?: number;
      booksTcsRows?: number;
      matched: number;
      unmatchedImport: number;
      unmatchedBooks: number;
      importTotal: number;
      booksTotal: number;
      matchedByReason?: { challan: number; pan: number; amount: number };
      tdsChallansInPeriod?: number;
      tcsChallansInPeriod?: number;
    };
    matches: Array<{
      status: string;
      matchReason: 'challan' | 'pan' | 'amount' | null;
      import: {
        section: string;
        amount: number;
        pan?: string | null;
        name?: string | null;
        challanNo?: string | null;
      };
      book: {
        sourceType?: 'PURCHASE' | 'SALARY' | 'INVOICE';
        purchaseNumber: string | null;
        amount: number;
        vendorName: string;
        vendorPan: string | null;
      } | null;
    }>;
    unmatchedBooks: Array<{
      sourceType?: 'PURCHASE' | 'SALARY' | 'INVOICE';
      purchaseNumber: string | null;
      section: string;
      amount: number;
      vendorName: string;
      vendorPan: string | null;
    }>;
  } | null>(null);

  async function loadImports() {
    try {
      const r = await axios.get(Constants.FETCH_FORM26AS_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = r.data?.data?.imports ?? [];
      setImports(list);
      if (!importId && list[0]?.id) setImportId(list[0].id);
    } catch {
      toast.error('Failed to load imports');
    }
  }

  useEffect(() => {
    loadImports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveImport() {
    let lines: unknown;
    try {
      lines = JSON.parse(linesJson);
    } catch {
      toast.error('Invalid JSON in lines');
      return;
    }
    try {
      await axios.post(
        Constants.FETCH_FORM26AS_URL,
        { periodFrom, periodTo, label, lines },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Import saved');
      loadImports();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to save import';
      toast.error(msg);
    }
  }

  async function reconcile() {
    try {
      const q = importId ? `?importId=${importId}` : '';
      const r = await axios.get(`${Constants.FETCH_FORM26AS_RECONCILE_URL}${q}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResult(r.data?.data ?? null);
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Reconcile failed';
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-6">
      <PageBackButton />
      <div>
        <h1 className="text-2xl font-bold">
          Form 26AS reconcile
          <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
            Stub — not AIS/Form 26AS
          </span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Import portal TDS/TCS rows as JSON and match to purchase + salary TDS + invoice TCS: challan
          no → party PAN → section + amount (±₹1).
        </p>
      </div>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-medium">Import lines</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500">Period from</label>
            <input
              type="date"
              value={periodFrom}
              onChange={(e) => setPeriodFrom(e.target.value)}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Period to</label>
            <input
              type="date"
              value={periodTo}
              onChange={(e) => setPeriodTo(e.target.value)}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
        </div>
        <textarea
          value={linesJson}
          onChange={(e) => setLinesJson(e.target.value)}
          rows={8}
          className="w-full border rounded p-2 text-xs font-mono"
        />
        <button type="button" onClick={saveImport} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded">
          Save import
        </button>
      </section>

      <section className="border rounded p-4 space-y-3">
        <h2 className="font-medium">Reconcile</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-gray-500">Import</label>
            <select
              value={importId}
              onChange={(e) => setImportId(e.target.value)}
              className="border rounded px-2 py-1 text-sm min-w-[220px]"
            >
              <option value="">Latest</option>
              {imports.map((i) => (
                <option key={i.id} value={i.id}>
                  {(i.label || 'Import') + ` · ${i.lineCount} lines · ${i.periodFrom}`}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={reconcile} className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded">
            Run match
          </button>
        </div>

        {result && (
          <div className="space-y-3 text-sm">
            {result.notes && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">
                {result.notes}
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="border rounded p-2">Matched: {result.summary.matched}</div>
              <div className="border rounded p-2">Unmatched import: {result.summary.unmatchedImport}</div>
              <div className="border rounded p-2">Unmatched books: {result.summary.unmatchedBooks}</div>
              <div className="border rounded p-2">
                Totals {result.summary.importTotal.toFixed(2)} / {result.summary.booksTotal.toFixed(2)}
              </div>
            </div>
            {result.summary.matchedByReason && (
              <div className="text-xs text-gray-600">
                Match reasons — challan: {result.summary.matchedByReason.challan}, PAN:{' '}
                {result.summary.matchedByReason.pan}, amount: {result.summary.matchedByReason.amount}
                {typeof result.summary.booksPurchaseRows === 'number'
                  ? ` · books purchase ${result.summary.booksPurchaseRows} / salary ${result.summary.booksSalaryRows ?? 0} / TCS ${result.summary.booksTcsRows ?? 0}`
                  : ''}
                {typeof result.summary.tdsChallansInPeriod === 'number'
                  ? ` · TDS challans: ${result.summary.tdsChallansInPeriod}`
                  : ''}
                {typeof result.summary.tcsChallansInPeriod === 'number'
                  ? ` · TCS challans: ${result.summary.tcsChallansInPeriod}`
                  : ''}
              </div>
            )}
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-1 px-2">Status</th>
                    <th className="py-1 px-2">Reason</th>
                    <th className="py-1 px-2">Section</th>
                    <th className="py-1 px-2">Import PAN</th>
                    <th className="py-1 px-2">Challan</th>
                    <th className="py-1 px-2 text-right">Import amt</th>
                    <th className="py-1 px-2">Source</th>
                    <th className="py-1 px-2">Books ref</th>
                    <th className="py-1 px-2">Books PAN</th>
                    <th className="py-1 px-2 text-right">Books amt</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-1 px-2">{m.status}</td>
                      <td className="py-1 px-2">{m.matchReason || '—'}</td>
                      <td className="py-1 px-2">{m.import.section}</td>
                      <td className="py-1 px-2">{m.import.pan || '—'}</td>
                      <td className="py-1 px-2">{m.import.challanNo || '—'}</td>
                      <td className="py-1 px-2 text-right">{m.import.amount.toFixed(2)}</td>
                      <td className="py-1 px-2">{m.book?.sourceType || '—'}</td>
                      <td className="py-1 px-2">
                        {m.book ? `${m.book.purchaseNumber || '—'} · ${m.book.vendorName}` : '—'}
                      </td>
                      <td className="py-1 px-2">{m.book?.vendorPan || '—'}</td>
                      <td className="py-1 px-2 text-right">
                        {m.book ? m.book.amount.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.unmatchedBooks.length > 0 && (
              <div>
                <h3 className="text-xs font-medium text-gray-600 mb-1">
                  Books TDS/TCS with no import match
                </h3>
                <ul className="text-xs text-gray-600 space-y-0.5">
                  {result.unmatchedBooks.map((b, i) => (
                    <li key={i}>
                      {b.sourceType ? `${b.sourceType} · ` : ''}
                      {b.section} · {b.amount.toFixed(2)} · {b.purchaseNumber || '—'} · {b.vendorName}
                      {b.vendorPan ? ` · PAN ${b.vendorPan}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
