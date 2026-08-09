import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';
import { CirclePlusIcon } from 'lucide-react';

import type { RootState } from '@store/index';
import Constants from '@constants/api';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import PageBackButton from '@components/admin/layouts/PageBackButton';
import useDateFormatter from '@hooks/useDateFormatter';

interface Warehouse {
  id: string;
  name: string;
  code: string | null;
}

interface TrackedProduct {
  id: string;
  name: string;
  code: string;
  trackingMode?: 'NONE' | 'BATCH' | 'SERIAL';
}

interface BomOption {
  id: string;
  name: string | null;
  finishedProduct: TrackedProduct;
  lines?: Array<{
    componentProductId: string;
    qtyPerBuild: number | string;
    componentProduct: TrackedProduct;
  }>;
}

interface Order {
  id: string;
  orderNumber: string | null;
  quantity: number | string;
  status: string;
  totalBuildCost: number | string | null;
  completedAt: string | null;
  createdAt: string;
  warehouse: Warehouse;
  bom: BomOption;
  lines?: Array<{
    role: string;
    quantity: number | string;
    unitCost: number | string;
    product: { name: string; code: string };
  }>;
}

export default function ManufactureOrderList() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [rows, setRows] = useState<Order[]>([]);
  const [boms, setBoms] = useState<BomOption[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bomId, setBomId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [completeNow, setCompleteNow] = useState(true);
  const [detail, setDetail] = useState<Order | null>(null);
  const [fgLotNumber, setFgLotNumber] = useState('');
  const [fgSerials, setFgSerials] = useState('');
  const [componentSerials, setComponentSerials] = useState<Record<string, string>>({});

  const headers = { Authorization: `Bearer ${token}` };
  const selectedBom = boms.find((b) => b.id === bomId) ?? null;

  async function load() {
    setLoading(true);
    try {
      const [o, b, w] = await Promise.all([
        axios.get(Constants.FETCH_MANUFACTURE_ORDERS_URL, { headers }),
        axios.get(Constants.FETCH_BOMS_URL, { headers }),
        axios.get(Constants.FETCH_WAREHOUSES_URL, { headers }),
      ]);
      setRows(o.data?.data?.orders ?? []);
      const bomRows: BomOption[] = b.data?.data?.boms ?? [];
      setBoms(bomRows);
      const wh: Warehouse[] = w.data?.data?.warehouses ?? [];
      setWarehouses(wh);
      if (!bomId && bomRows[0]) setBomId(bomRows[0].id);
      if (!warehouseId && wh[0]) setWarehouseId(wh[0].id);
    } catch {
      toast.error('Failed to load manufacture orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildTrackingPayload() {
    const qty = Number(quantity);
    const componentTracking: Record<string, { serialNumbers?: string[] }> = {};
    for (const line of selectedBom?.lines ?? []) {
      const mode = line.componentProduct.trackingMode;
      if (mode === 'SERIAL') {
        const raw = componentSerials[line.componentProductId] ?? '';
        const serials = raw
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (serials.length) {
          componentTracking[line.componentProductId] = { serialNumbers: serials };
        }
      }
    }
    const finishedTracking: {
      lotNumber?: string;
      serialNumbers?: string[];
    } = {};
    const fgMode = selectedBom?.finishedProduct.trackingMode;
    if (fgMode === 'BATCH' && fgLotNumber.trim()) {
      finishedTracking.lotNumber = fgLotNumber.trim();
    }
    if (fgMode === 'SERIAL') {
      finishedTracking.serialNumbers = fgSerials
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (finishedTracking.serialNumbers.length !== qty) {
        throw new Error(`Finished good is SERIAL — provide exactly ${qty} serial number(s)`);
      }
    }
    return {
      componentTracking: Object.keys(componentTracking).length ? componentTracking : undefined,
      finishedTracking: Object.keys(finishedTracking).length ? finishedTracking : undefined,
    };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSubmitting(true);
      const tracking = buildTrackingPayload();
      const r = await axios.post(
        Constants.FETCH_MANUFACTURE_ORDERS_URL,
        {
          bomId,
          warehouseId,
          quantity: Number(quantity),
          notes: notes || undefined,
          completeNow,
          ...tracking,
        },
        { headers },
      );
      toast.success(r.data?.message ?? 'Created');
      setShowModal(false);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error && !axios.isAxiosError(err)
          ? err.message
          : axios.isAxiosError(err)
            ? (err.response?.data as { message?: string })?.message ?? 'Create failed'
            : 'Create failed',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(id: string) {
    if (!window.confirm('Complete build? This will consume components and add finished goods.')) return;
    try {
      await axios.post(`${Constants.FETCH_MANUFACTURE_ORDERS_URL}/${id}/complete`, {}, { headers });
      toast.success('Build completed');
      await load();
    } catch (err) {
      toast.error(
        axios.isAxiosError(err)
          ? (err.response?.data as { message?: string })?.message ?? 'Complete failed'
          : 'Complete failed',
      );
    }
  }

  async function handleCancel(id: string) {
    try {
      await axios.post(`${Constants.FETCH_MANUFACTURE_ORDERS_URL}/${id}/cancel`, {}, { headers });
      toast.success('Cancelled');
      await load();
    } catch {
      toast.error('Cancel failed');
    }
  }

  async function openDetail(id: string) {
    try {
      const r = await axios.get(`${Constants.FETCH_MANUFACTURE_ORDERS_URL}/${id}`, { headers });
      setDetail(r.data?.data?.order ?? null);
    } catch {
      toast.error('Failed to load order');
    }
  }

  const statusClass: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-700',
    COMPLETED: 'bg-green-100 text-green-800',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="p-6 space-y-4">
      <PageBackButton />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Manufacture orders</h1>
          <p className="text-sm text-gray-500">
            Build finished goods from a BOM — multi-level BOMs explode to leaf materials, then consume
            stock, receipt FG at WAC build cost, and post WIP ↔ Inventory when the ledger is live.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-purple-600 text-white rounded"
          disabled={boms.length === 0}
        >
          <CirclePlusIcon size={16} /> New build
        </button>
      </div>

      {boms.length === 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded p-3">
          Create a BOM first under Inventory → Bills of materials.
        </p>
      )}

      {loading ? (
        <LoaderSpinner />
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Order</th>
                <th className="p-2">Finished good</th>
                <th className="p-2">Warehouse</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2">Status</th>
                <th className="p-2 text-right">Build cost</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-gray-400">
                    No manufacture orders yet.
                  </td>
                </tr>
              ) : (
                rows.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="p-2">
                      <button type="button" className="underline text-purple-700" onClick={() => openDetail(o.id)}>
                        {o.orderNumber || o.id.slice(0, 8)}
                      </button>
                      <div className="text-xs text-gray-400">{formatDate(o.createdAt)}</div>
                    </td>
                    <td className="p-2">{o.bom?.finishedProduct?.name}</td>
                    <td className="p-2">{o.warehouse?.name}</td>
                    <td className="p-2 text-right">{Number(o.quantity)}</td>
                    <td className="p-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${statusClass[o.status] ?? ''}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="p-2 text-right">
                      {o.totalBuildCost != null ? Number(o.totalBuildCost).toFixed(2) : '—'}
                    </td>
                    <td className="p-2 space-x-2">
                      {o.status === 'DRAFT' && (
                        <>
                          <button
                            type="button"
                            className="text-xs text-green-700 underline"
                            onClick={() => handleComplete(o.id)}
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            className="text-xs text-red-600 underline"
                            onClick={() => handleCancel(o.id)}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-lg p-5 w-full max-w-md space-y-3">
            <h2 className="text-lg font-semibold">New manufacture order</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">BOM</label>
              <select
                className="w-full border rounded p-2 text-sm"
                value={bomId}
                onChange={(e) => setBomId(e.target.value)}
              >
                {boms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.finishedProduct.name}
                    {b.name ? ` — ${b.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Warehouse</label>
              <select
                className="w-full border rounded p-2 text-sm"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Build quantity</label>
              <input
                type="number"
                min="0.0001"
                step="any"
                className="w-full border rounded p-2 text-sm"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                className="w-full border rounded p-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {selectedBom?.finishedProduct.trackingMode === 'BATCH' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Finished good lot (optional — defaults to MFG-…)
                </label>
                <input
                  className="w-full border rounded p-2 text-sm font-mono"
                  value={fgLotNumber}
                  onChange={(e) => setFgLotNumber(e.target.value)}
                  placeholder="MFG-LOT-001"
                />
              </div>
            )}
            {selectedBom?.finishedProduct.trackingMode === 'SERIAL' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Finished good serials (one per build qty, comma or newline)
                </label>
                <textarea
                  className="w-full border rounded p-2 text-sm font-mono h-20"
                  value={fgSerials}
                  onChange={(e) => setFgSerials(e.target.value)}
                  placeholder="SN-001&#10;SN-002"
                />
              </div>
            )}
            {(selectedBom?.lines ?? [])
              .filter((l) => l.componentProduct.trackingMode === 'SERIAL')
              .map((l) => (
                <div key={l.componentProductId}>
                  <label className="block text-xs text-gray-500 mb-1">
                    Serials for {l.componentProduct.name} (optional — else oldest available)
                  </label>
                  <textarea
                    className="w-full border rounded p-2 text-sm font-mono h-16"
                    value={componentSerials[l.componentProductId] ?? ''}
                    onChange={(e) =>
                      setComponentSerials((prev) => ({
                        ...prev,
                        [l.componentProductId]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            <p className="text-xs text-gray-400">
              Batch components use FEFO automatically. SERIAL finished goods require serials when
              completing.
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={completeNow} onChange={(e) => setCompleteNow(e.target.checked)} />
              Complete immediately (consume &amp; receipt stock)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-1.5 text-sm border rounded" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">{detail.orderNumber}</h2>
              <button type="button" className="text-xs underline" onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
            <p className="text-sm text-gray-500">
              {detail.bom?.finishedProduct?.name} × {Number(detail.quantity)} @ {detail.warehouse?.name}
            </p>
            <table className="min-w-full text-sm border">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2">Role</th>
                  <th className="p-2">Product</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit cost</th>
                </tr>
              </thead>
              <tbody>
                {(detail.lines ?? []).map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2 text-xs">{l.role}</td>
                    <td className="p-2">{l.product.name}</td>
                    <td className="p-2 text-right">{Number(l.quantity)}</td>
                    <td className="p-2 text-right">{Number(l.unitCost).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
