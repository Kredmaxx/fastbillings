import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "sonner";
import { CirclePlusIcon } from "lucide-react";

import type { RootState } from "@store/index";
import Constants from "@constants/api";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import NoRecords from "@components/admin/NoRecords";
import useDateFormatter from "@hooks/useDateFormatter";

interface Warehouse {
  id: string;
  name: string;
  code: string | null;
}

interface ProductOption {
  id: string;
  name: string;
  code?: string;
}

interface TransferLine {
  productId: string;
  quantity: number;
  product?: { id: string; name: string; code?: string | null };
}

interface StockTransfer {
  id: string;
  transferNumber: string;
  transferDate: string;
  status: string;
  notes: string | null;
  fromWarehouse: Warehouse;
  toWarehouse: Warehouse;
  lines: TransferLine[];
}

const StockTransferList: React.FC = () => {
  const { token } = useSelector((state: RootState) => state.auth);
  const { formatDate } = useDateFormatter();
  const [rows, setRows] = useState<StockTransfer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const fetchRows = async () => {
    try {
      setIsLoading(true);
      const resp = await axios.get(Constants.FETCH_STOCK_TRANSFERS_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(resp.data?.data?.transfers ?? []);
    } catch (err) {
      console.error("Failed to fetch stock transfers:", err);
      toast.error("Failed to fetch stock transfers");
    } finally {
      setIsLoading(false);
    }
  };

  const loadLookups = async () => {
    try {
      const [wh, pr] = await Promise.all([
        axios.get(Constants.FETCH_WAREHOUSES_URL, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${Constants.FETCH_PRODUCTS_URL}?limit=200`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const whRows: Warehouse[] = wh.data?.data?.warehouses ?? [];
      setWarehouses(whRows);
      const productRows: ProductOption[] =
        pr.data?.data?.products ?? pr.data?.data ?? [];
      setProducts(Array.isArray(productRows) ? productRows : []);
      if (whRows.length >= 2) {
        setFromWarehouseId(whRows[0].id);
        setToWarehouseId(whRows[1].id);
      } else if (whRows.length === 1) {
        setFromWarehouseId(whRows[0].id);
      }
    } catch (err) {
      console.error("Failed to load transfer lookups:", err);
    }
  };

  useEffect(() => {
    fetchRows();
    loadLookups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setNotes("");
    setQuantity("1");
    setProductId(products[0]?.id ?? "");
    setTransferDate(new Date().toISOString().slice(0, 10));
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    if (!fromWarehouseId || !toWarehouseId) {
      toast.error("Select source and destination warehouses");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      toast.error("Source and destination must differ");
      return;
    }
    if (!productId || !(qty > 0)) {
      toast.error("Product and positive quantity are required");
      return;
    }
    try {
      setSubmitting(true);
      await axios.post(
        Constants.CREATE_STOCK_TRANSFER_URL,
        {
          fromWarehouseId,
          toWarehouseId,
          transferDate,
          notes: notes || null,
          lines: [{ productId, quantity: qty }],
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success("Stock transferred");
      setShowModal(false);
      fetchRows();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
      toast.error(msg || "Failed to create stock transfer");
    } finally {
      setSubmitting(false);
    }
  };

  const headers = ["#", "Number", "Date", "From", "To", "Lines", "Status"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Stock transfers</h1>
          <p className="text-sm text-gray-500">Move quantity between warehouses.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
        >
          <CirclePlusIcon size={16} /> New transfer
        </button>
      </div>

      <Table headers={headers}>
        {!isLoading &&
          rows.map((row, idx) => (
            <TableRow
              key={row.id}
              index={idx + 1}
              row={row}
              columns={[
                row.transferNumber,
                formatDate(row.transferDate),
                row.fromWarehouse?.name ?? "—",
                row.toWarehouse?.name ?? "—",
                row.lines
                  .map((l) => `${l.product?.name ?? l.productId} × ${l.quantity}`)
                  .join(", "),
                row.status,
              ]}
            />
          ))}
        {!isLoading && rows.length === 0 && (
          <NoRecords colSpan={7} message="No stock transfers yet." />
        )}
        {isLoading && (
          <tr>
            <td className="py-2 text-center" colSpan={7}>
              <LoaderSpinner />
            </td>
          </tr>
        )}
      </Table>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleSubmit} className="w-full max-w-md p-5 bg-white rounded shadow">
            <h2 className="mb-3 text-lg font-semibold">New stock transfer</h2>
            <label className="block mb-2 text-sm">
              From warehouse
              <select
                className="w-full p-2 mt-1 border rounded"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block mb-2 text-sm">
              To warehouse
              <select
                className="w-full p-2 mt-1 border rounded"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block mb-2 text-sm">
              Date
              <input
                type="date"
                className="w-full p-2 mt-1 border rounded"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
              />
            </label>
            <label className="block mb-2 text-sm">
              Product
              <select
                className="w-full p-2 mt-1 border rounded"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.code ? ` (${p.code})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block mb-2 text-sm">
              Quantity
              <input
                type="number"
                min="0.001"
                step="any"
                className="w-full p-2 mt-1 border rounded"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
            <label className="block mb-4 text-sm">
              Notes
              <input
                className="w-full p-2 mt-1 border rounded"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-2 text-sm border rounded">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-2 text-sm text-white bg-purple-600 rounded disabled:opacity-50"
              >
                {submitting ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default StockTransferList;
