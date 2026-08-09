import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';
import { CirclePlusIcon } from 'lucide-react';

import type { RootState } from '@store/index';
import Constants from '@constants/api';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import PageBackButton from '@components/admin/layouts/PageBackButton';

interface ProductOption {
  id: string;
  name: string;
  code?: string;
}

interface BomLine {
  id?: string;
  componentProductId: string;
  qtyPerBuild: number;
  componentProduct?: ProductOption;
}

interface Bom {
  id: string;
  name: string | null;
  isActive: boolean;
  finishedProduct: ProductOption;
  lines: BomLine[];
  _count?: { lines: number };
}

export default function BomList() {
  const token = useSelector((s: RootState) => s.auth.token);
  const [rows, setRows] = useState<Bom[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Bom | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [finishedProductId, setFinishedProductId] = useState('');
  const [name, setName] = useState('');
  const [lines, setLines] = useState<Array<{ componentProductId: string; qtyPerBuild: string }>>([
    { componentProductId: '', qtyPerBuild: '1' },
  ]);

  const headers = { Authorization: `Bearer ${token}` };

  async function load() {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        axios.get(Constants.FETCH_BOMS_URL, { headers }),
        axios.get(`${Constants.FETCH_PRODUCTS_URL}?limit=300`, { headers }),
      ]);
      setRows(b.data?.data?.boms ?? []);
      const pr = p.data?.data?.products ?? p.data?.data ?? [];
      setProducts(Array.isArray(pr) ? pr : []);
    } catch {
      toast.error('Failed to load BOMs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setName('');
    setFinishedProductId(products[0]?.id ?? '');
    setLines([{ componentProductId: products[1]?.id ?? products[0]?.id ?? '', qtyPerBuild: '1' }]);
    setShowModal(true);
  }

  function openEdit(bom: Bom) {
    setEditing(bom);
    setName(bom.name ?? '');
    setFinishedProductId(bom.finishedProduct.id);
    setLines(
      bom.lines.map((l) => ({
        componentProductId: l.componentProductId,
        qtyPerBuild: String(l.qtyPerBuild),
      })),
    );
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      finishedProductId,
      name: name.trim() || undefined,
      lines: lines
        .filter((l) => l.componentProductId)
        .map((l, i) => ({
          componentProductId: l.componentProductId,
          qtyPerBuild: Number(l.qtyPerBuild),
          sortOrder: i,
        })),
    };
    if (!payload.finishedProductId || payload.lines.length === 0) {
      toast.error('Finished product and at least one component required');
      return;
    }
    try {
      setSubmitting(true);
      if (editing) {
        await axios.put(`${Constants.FETCH_BOMS_URL}/${editing.id}`, payload, { headers });
        toast.success('BOM updated');
      } else {
        await axios.post(Constants.FETCH_BOMS_URL, payload, { headers });
        toast.success('BOM created');
      }
      setShowModal(false);
      await load();
    } catch (err) {
      toast.error(
        axios.isAxiosError(err)
          ? (err.response?.data as { message?: string })?.message ?? 'Save failed'
          : 'Save failed',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this BOM?')) return;
    try {
      await axios.delete(`${Constants.FETCH_BOMS_URL}/${id}`, { headers });
      toast.success('Deleted');
      await load();
    } catch {
      toast.error('Delete failed');
    }
  }

  async function showExplode(id: string) {
    try {
      const res = await axios.get(`${Constants.FETCH_BOMS_URL}/${id}/explode`, { headers });
      const leaves = (res.data?.data?.leaves ?? []) as Array<{
        qtyPerBuild: number;
        product?: { name?: string; code?: string };
      }>;
      if (leaves.length === 0) {
        toast.message('No leaf materials');
        return;
      }
      const summary = leaves
        .map((l) => `${l.product?.name ?? 'Item'}${l.product?.code ? ` (${l.product.code})` : ''}: ${l.qtyPerBuild}`)
        .join('\n');
      window.alert(`Leaf materials per 1 finished unit:\n\n${summary}`);
    } catch (err) {
      toast.error(
        axios.isAxiosError(err)
          ? (err.response?.data as { message?: string })?.message ?? 'Explode failed'
          : 'Explode failed',
      );
    }
  }

  return (
    <div className="p-6 space-y-4">
      <PageBackButton />
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Bills of materials</h1>
          <p className="text-sm text-gray-500">
            Define components per finished good. Nested BOMs explode to leaf materials on manufacture
            (sub-assemblies with their own BOM are expanded, not stock-consumed).
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-purple-600 text-white rounded"
        >
          <CirclePlusIcon size={16} /> New BOM
        </button>
      </div>

      {loading ? (
        <LoaderSpinner />
      ) : (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Finished good</th>
                <th className="p-2">Name</th>
                <th className="p-2">Components</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-gray-400">
                    No BOMs yet.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-2">
                      {b.finishedProduct.name}
                      <div className="text-xs text-gray-400">{b.finishedProduct.code}</div>
                    </td>
                    <td className="p-2">{b.name || '—'}</td>
                    <td className="p-2">{b._count?.lines ?? b.lines.length}</td>
                    <td className="p-2">{b.isActive ? 'Active' : 'Inactive'}</td>
                    <td className="p-2 space-x-2">
                      <button type="button" className="text-purple-700 underline text-xs" onClick={() => openEdit(b)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-gray-700 underline text-xs"
                        onClick={() => void showExplode(b.id)}
                      >
                        Explode
                      </button>
                      <button
                        type="button"
                        className="text-red-600 underline text-xs"
                        onClick={() => handleDelete(b.id)}
                      >
                        Delete
                      </button>
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
          <form onSubmit={handleSave} className="bg-white rounded-lg p-5 w-full max-w-lg space-y-3 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{editing ? 'Edit BOM' : 'New BOM'}</h2>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Finished product</label>
              <select
                className="w-full border rounded p-2 text-sm"
                value={finishedProductId}
                disabled={!!editing}
                onChange={(e) => setFinishedProductId(e.target.value)}
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name (optional)</label>
              <input
                className="w-full border rounded p-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-xs text-gray-500">Components</label>
                <button
                  type="button"
                  className="text-xs text-purple-700 underline"
                  onClick={() =>
                    setLines((prev) => [...prev, { componentProductId: products[0]?.id ?? '', qtyPerBuild: '1' }])
                  }
                >
                  Add line
                </button>
              </div>
              {lines.map((l, idx) => (
                <div key={idx} className="flex gap-2">
                  <select
                    className="flex-1 border rounded p-2 text-sm"
                    value={l.componentProductId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, componentProductId: e.target.value } : row,
                        ),
                      )
                    }
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0.0001"
                    step="any"
                    className="w-24 border rounded p-2 text-sm"
                    value={l.qtyPerBuild}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, qtyPerBuild: e.target.value } : row)),
                      )
                    }
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="px-3 py-1.5 text-sm border rounded" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
