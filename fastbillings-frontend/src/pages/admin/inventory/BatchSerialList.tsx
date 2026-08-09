import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import PageBackButton from '@components/admin/layouts/PageBackButton';
import useDateFormatter from '@hooks/useDateFormatter';

type Tab = 'batches' | 'serials';

interface BatchRow {
  id: string;
  lotNumber: string;
  qtyOnHand: number;
  unitCost: number | null;
  expiryDate: string | null;
  product: { id: string; name: string; code: string };
  warehouse: { id: string; name: string; code: string | null };
}

interface SerialRow {
  id: string;
  serialNumber: string;
  status: string;
  soldAt: string | null;
  product: { id: string; name: string; code: string };
  warehouse: { id: string; name: string; code: string | null } | null;
  batch: { id: string; lotNumber: string } | null;
}

export default function BatchSerialList() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [tab, setTab] = useState<Tab>('batches');
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [serials, setSerials] = useState<SerialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('AVAILABLE');

  async function load() {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      if (tab === 'batches') {
        const r = await axios.get(Constants.FETCH_INVENTORY_BATCHES_URL, {
          headers,
          params: { limit: 100, inStock: true },
        });
        setBatches(r.data?.data?.batches ?? []);
      } else {
        const r = await axios.get(Constants.FETCH_INVENTORY_SERIALS_URL, {
          headers,
          params: { limit: 100, status: statusFilter || undefined },
        });
        setSerials(r.data?.data?.serials ?? []);
      }
    } catch {
      toast.error('Failed to load tracking data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, statusFilter]);

  return (
    <div className="p-6 space-y-4">
      <PageBackButton />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Batch & serial stock</h1>
          <p className="text-sm text-gray-500 mt-1">
            Lots and serial numbers by warehouse. Set product tracking to Batch or Serial to populate these.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('batches')}
            className={`px-3 py-1.5 text-sm rounded border ${tab === 'batches' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700'}`}
          >
            Batches
          </button>
          <button
            type="button"
            onClick={() => setTab('serials')}
            className={`px-3 py-1.5 text-sm rounded border ${tab === 'serials' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700'}`}
          >
            Serials
          </button>
        </div>
      </div>

      {tab === 'serials' && (
        <div className="max-w-xs">
          <label className="block text-xs text-gray-500 mb-1">Status</label>
          <select
            className="w-full border rounded p-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="AVAILABLE">Available</option>
            <option value="SOLD">Sold</option>
            <option value="RETURNED">Returned</option>
            <option value="">All</option>
          </select>
        </div>
      )}

      {loading ? (
        <LoaderSpinner />
      ) : tab === 'batches' ? (
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-2">Product</th>
                <th className="p-2">Lot</th>
                <th className="p-2">Warehouse</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2">Expiry</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-gray-400">
                    No batch stock yet.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="border-t">
                    <td className="p-2">
                      {b.product.name}
                      <div className="text-xs text-gray-400">{b.product.code}</div>
                    </td>
                    <td className="p-2 font-mono">{b.lotNumber}</td>
                    <td className="p-2">{b.warehouse.name}</td>
                    <td className="p-2 text-right">{b.qtyOnHand}</td>
                    <td className="p-2">{b.expiryDate ? formatDate(b.expiryDate) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-2">Product</th>
                <th className="p-2">Serial</th>
                <th className="p-2">Status</th>
                <th className="p-2">Warehouse</th>
                <th className="p-2">Lot</th>
              </tr>
            </thead>
            <tbody>
              {serials.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-gray-400">
                    No serials yet.
                  </td>
                </tr>
              ) : (
                serials.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="p-2">
                      {s.product.name}
                      <div className="text-xs text-gray-400">{s.product.code}</div>
                    </td>
                    <td className="p-2 font-mono">{s.serialNumber}</td>
                    <td className="p-2">{s.status}</td>
                    <td className="p-2">{s.warehouse?.name ?? '—'}</td>
                    <td className="p-2">{s.batch?.lotNumber ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
