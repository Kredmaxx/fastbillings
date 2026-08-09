import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import PageBackButton from '@components/admin/layouts/PageBackButton';

function currentFy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}

function currentQuarter(): string {
  const m = new Date().getMonth();
  if (m >= 3 && m <= 5) return 'Q1';
  if (m >= 6 && m <= 8) return 'Q2';
  if (m >= 9 && m <= 11) return 'Q3';
  return 'Q4';
}

interface ChallanRow {
  id: string;
  kind: string;
  fyLabel: string;
  quarter: string;
  section: string | null;
  bsrCode: string;
  challanNo: string;
  depositDate: string;
  amount: number;
  complete: boolean;
  allocatedTotal?: number;
  unallocatedAmount?: number;
}

interface CandidateRow {
  sourceType: 'PURCHASE' | 'INVOICE';
  sourceId: string;
  documentNo: string | null;
  date: string;
  section: string | null;
  taxAmount: number;
  allocatedAmount: number;
  remainingAmount: number;
}

export default function TaxDepositChallanTracker() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [fy, setFy] = useState(currentFy());
  const [kindFilter, setKindFilter] = useState('');
  const [quarterFilter, setQuarterFilter] = useState('');
  const [data, setData] = useState<{
    notes?: string;
    summary: {
      count: number;
      completeCount: number;
      depositedTotal: number;
      allocatedTotal?: number;
      unallocatedTotal?: number;
      allComplete: boolean;
    };
    challans: ChallanRow[];
  } | null>(null);
  const [form, setForm] = useState({
    kind: 'TDS',
    quarter: currentQuarter(),
    section: '',
    bsrCode: '',
    challanNo: '',
    depositDate: new Date().toISOString().slice(0, 10),
    amount: '',
    notes: '',
  });
  const [mapChallan, setMapChallan] = useState<ChallanRow | null>(null);
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [savingMap, setSavingMap] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams({ fy });
      if (kindFilter) params.set('kind', kindFilter);
      if (quarterFilter) params.set('quarter', quarterFilter);
      const r = await axios.get(`${Constants.FETCH_TAX_DEPOSIT_CHALLANS_URL}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load deposit challans');
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy, kindFilter, quarterFilter]);

  async function save() {
    try {
      await axios.post(
        Constants.FETCH_TAX_DEPOSIT_CHALLANS_URL,
        {
          kind: form.kind,
          fyLabel: fy,
          quarter: form.quarter,
          section: form.section || null,
          bsrCode: form.bsrCode,
          challanNo: form.challanNo,
          depositDate: form.depositDate,
          amount: Number(form.amount),
          notes: form.notes || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Challan recorded');
      setForm((f) => ({
        ...f,
        section: '',
        bsrCode: '',
        challanNo: '',
        amount: '',
        notes: '',
      }));
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to save';
      toast.error(msg);
    }
  }

  async function remove(id: string) {
    try {
      await axios.delete(`${Constants.FETCH_TAX_DEPOSIT_CHALLANS_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Deleted');
      load();
    } catch {
      toast.error('Failed to delete');
    }
  }

  async function openMap(c: ChallanRow) {
    try {
      const [allocRes, candRes] = await Promise.all([
        axios.get(`${Constants.FETCH_TAX_DEPOSIT_CHALLANS_URL}/${c.id}/allocations`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(
          `${Constants.FETCH_TAX_DEPOSIT_CHALLANS_URL}/candidates?kind=${encodeURIComponent(c.kind)}&fy=${encodeURIComponent(c.fyLabel)}&quarter=${encodeURIComponent(c.quarter)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      ]);
      const existing = (allocRes.data?.data?.allocations || []) as Array<{
        sourceId: string;
      }>;
      const cand = (candRes.data?.data?.candidates || []) as CandidateRow[];
      const sel: Record<string, boolean> = {};
      for (const a of existing) sel[a.sourceId] = true;
      for (const row of cand) {
        if (row.remainingAmount <= 0 && !sel[row.sourceId]) continue;
      }
      setCandidates(cand);
      setSelected(sel);
      setMapChallan(c);
    } catch {
      toast.error('Failed to load mapping candidates');
    }
  }

  async function saveMap() {
    if (!mapChallan) return;
    setSavingMap(true);
    try {
      const sourceType = mapChallan.kind === 'TCS' ? 'INVOICE' : 'PURCHASE';
      const allocations = candidates
        .filter((c) => selected[c.sourceId])
        .map((c) => ({
          sourceType,
          sourceId: c.sourceId,
          amount: c.taxAmount,
        }));
      await axios.put(
        `${Constants.FETCH_TAX_DEPOSIT_CHALLANS_URL}/${mapChallan.id}/allocations`,
        { allocations },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Line mapping saved');
      setMapChallan(null);
      load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to save mapping';
      toast.error(msg);
    } finally {
      setSavingMap(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-6">
      <PageBackButton />
      <div>
        <h1 className="text-2xl font-bold">
          TDS / TCS deposit challans
          <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
            Books tracker — not OLTAS / TRACES
          </span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Record BSR code, challan number, deposit date, map deductee/collectee lines, and settle
          GL (Dr TDS/TCS payable / Cr bank when ledger is live). Not OLTAS / TRACES.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500">FY (YYYY-YY)</label>
          <input
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-28"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">Kind</label>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            <option value="TDS">TDS</option>
            <option value="TCS">TCS</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">Quarter</label>
          <select
            value={quarterFilter}
            onChange={(e) => setQuarterFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
          Refresh
        </button>
      </div>

      {data?.notes && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded p-2">
          {data.notes}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border rounded p-4 bg-slate-50">
            <div>
              <div className="text-xs text-gray-500">Challans</div>
              <div className="font-medium">
                {data.summary.completeCount}/{data.summary.count} complete
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Deposited total</div>
              <div className="font-medium">{data.summary.depositedTotal.toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Line-mapped</div>
              <div className="font-medium">{(data.summary.allocatedTotal ?? 0).toFixed(2)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Unallocated</div>
              <div className="font-medium">{(data.summary.unallocatedTotal ?? 0).toFixed(2)}</div>
            </div>
          </div>

          <section className="border rounded p-4 space-y-3">
            <h2 className="font-medium">Record challan</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <label className="block text-xs text-gray-500">Kind</label>
                <select
                  value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                >
                  <option value="TDS">TDS</option>
                  <option value="TCS">TCS</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500">Quarter</label>
                <select
                  value={form.quarter}
                  onChange={(e) => setForm((f) => ({ ...f, quarter: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                >
                  {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500">Section (optional)</label>
                <input
                  value={form.section}
                  onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                  placeholder="194C / 206C(1H)"
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Amount</label>
                <input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">BSR code</label>
                <input
                  value={form.bsrCode}
                  onChange={(e) => setForm((f) => ({ ...f, bsrCode: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Challan no</label>
                <input
                  value={form.challanNo}
                  onChange={(e) => setForm((f) => ({ ...f, challanNo: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Deposit date</label>
                <input
                  type="date"
                  value={form.depositDate}
                  onChange={(e) => setForm((f) => ({ ...f, depositDate: e.target.value }))}
                  className="border rounded px-2 py-1 w-full"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={save}
                  className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded w-full"
                >
                  Save
                </button>
              </div>
            </div>
          </section>

          <section className="border rounded overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 px-2">Kind</th>
                  <th className="py-2 px-2">Quarter</th>
                  <th className="py-2 px-2">Section</th>
                  <th className="py-2 px-2">BSR</th>
                  <th className="py-2 px-2">Challan</th>
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2 text-right">Amount</th>
                  <th className="py-2 px-2 text-right">Mapped</th>
                  <th className="py-2 px-2" />
                </tr>
              </thead>
              <tbody>
                {data.challans.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-3 px-2 text-gray-400">
                      No deposit challans for this filter.
                    </td>
                  </tr>
                ) : (
                  data.challans.map((c) => (
                    <tr key={c.id} className="border-b">
                      <td className="py-1.5 px-2">{c.kind}</td>
                      <td className="py-1.5 px-2">{c.quarter}</td>
                      <td className="py-1.5 px-2">{c.section || '—'}</td>
                      <td className="py-1.5 px-2">{c.bsrCode}</td>
                      <td className="py-1.5 px-2">{c.challanNo}</td>
                      <td className="py-1.5 px-2">{c.depositDate}</td>
                      <td className="py-1.5 px-2 text-right">{c.amount.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right">
                        {(c.allocatedTotal ?? 0).toFixed(2)}
                      </td>
                      <td className="py-1.5 px-2 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openMap(c)}
                          className="text-blue-600 hover:underline"
                        >
                          Map lines
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {mapChallan && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  Map lines — {mapChallan.kind} {mapChallan.challanNo}
                </h2>
                <p className="text-xs text-gray-500">
                  Challan ₹{mapChallan.amount.toFixed(2)} · select documents to allocate full tax
                  amount (books mapping only).
                </p>
              </div>
              <button type="button" onClick={() => setMapChallan(null)} className="text-sm">
                Close
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-1 px-1" />
                  <th className="py-1 px-1">Document</th>
                  <th className="py-1 px-1">Section</th>
                  <th className="py-1 px-1 text-right">Tax</th>
                  <th className="py-1 px-1 text-right">Already mapped</th>
                </tr>
              </thead>
              <tbody>
                {candidates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-gray-400">
                      No {mapChallan.kind} documents in this quarter.
                    </td>
                  </tr>
                ) : (
                  candidates.map((c) => (
                    <tr key={c.sourceId} className="border-b">
                      <td className="py-1 px-1">
                        <input
                          type="checkbox"
                          checked={!!selected[c.sourceId]}
                          onChange={(e) =>
                            setSelected((s) => ({ ...s, [c.sourceId]: e.target.checked }))
                          }
                        />
                      </td>
                      <td className="py-1 px-1">
                        {c.documentNo || c.sourceId.slice(0, 8)}
                        <div className="text-[10px] text-gray-400">{c.date}</div>
                      </td>
                      <td className="py-1 px-1">{c.section || '—'}</td>
                      <td className="py-1 px-1 text-right">{c.taxAmount.toFixed(2)}</td>
                      <td className="py-1 px-1 text-right">{c.allocatedAmount.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMapChallan(null)}
                className="px-3 py-1 text-sm border rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingMap}
                onClick={saveMap}
                className="px-3 py-1 text-sm bg-purple-600 text-white rounded disabled:opacity-50"
              >
                {savingMap ? 'Saving…' : 'Save mapping'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
