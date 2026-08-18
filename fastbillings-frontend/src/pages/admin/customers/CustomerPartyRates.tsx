import { useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { PlusCircle, Trash2 } from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import { useDebounce } from "@hooks/useDebounce";

type RateRow = {
  productId: string;
  productName: string;
  productCode: string;
  listPrice: number;
  sellingPrice: number;
};

type SearchProduct = {
  id: string;
  name: string;
  code: string;
  prices: { selling: number };
};

export default function CustomerPartyRates({ customerId }: { customerId: string }) {
  const { token } = useSelector((state: RootState) => state.auth);
  const [rows, setRows] = useState<RateRow[]>([]);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 400);
  const [hits, setHits] = useState<SearchProduct[]>([]);
  const [price, setPrice] = useState("");
  const [picked, setPicked] = useState<SearchProduct | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  async function load() {
    const r = await axios.get(`${Constants.CUSTOMER_PRODUCT_RATES_URL}/${customerId}/product-rates`, { headers });
    setRows(r.data.data ?? []);
  }

  useEffect(() => {
    if (!customerId || !token) return;
    void load().catch(() => toast.error("Failed to load party rates"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, token]);

  useEffect(() => {
    if (!debounced || !token) {
      setHits([]);
      return;
    }
    axios
      .get(Constants.FETCH_PRODUCTS_WITH_SEARCH_URL, {
        params: { search: debounced },
        headers,
      })
      .then((r) => setHits((r.data.data ?? []).slice(0, 8)))
      .catch(() => setHits([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, token]);

  async function save() {
    if (!picked) {
      toast.error("Pick a product");
      return;
    }
    const sellingPrice = Number(price);
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      toast.error("Enter a valid party rate");
      return;
    }
    setBusy(true);
    try {
      await axios.put(
        `${Constants.CUSTOMER_PRODUCT_RATES_URL}/${customerId}/product-rates`,
        { productId: picked.id, sellingPrice },
        { headers },
      );
      toast.success("Party rate saved");
      setPicked(null);
      setSearch("");
      setPrice("");
      await load();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? String(err.response?.data?.message ?? "Save failed") : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(productId: string) {
    setBusy(true);
    try {
      await axios.delete(`${Constants.CUSTOMER_PRODUCT_RATES_URL}/${customerId}/product-rates/${productId}`, {
        headers,
      });
      await load();
    } catch {
      toast.error("Failed to remove rate");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-950">Party-wise item rates</h2>
      <p className="mb-4 text-sm text-slate-500">
        These prices auto-fill on invoices, quotations, sale orders, and POS when this customer is selected. Leave a
        product off the list to use the catalog selling price.
      </p>

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_8rem_auto]">
        <div className="relative">
          <input
            className="w-full rounded-md border px-3 py-2"
            placeholder="Search product to add a rate"
            value={picked ? `${picked.name} (${picked.code})` : search}
            onChange={(e) => {
              setPicked(null);
              setSearch(e.target.value);
            }}
          />
          {!picked && hits.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-white shadow">
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#F0F7FF]"
                    onClick={() => {
                      setPicked(p);
                      setSearch("");
                      setHits([]);
                      if (!price) setPrice(String(p.prices.selling));
                    }}
                  >
                    {p.name}{" "}
                    <span className="text-slate-400">
                      {p.code} · list {Number(p.prices.selling).toFixed(2)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          type="number"
          min="0"
          step="0.01"
          className="rounded-md border px-3 py-2"
          placeholder="Party rate"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="flex items-center justify-center gap-1 rounded-md bg-[#007BFF] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <PlusCircle size={14} /> Save rate
        </button>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2 text-right">List price</th>
            <th className="px-3 py-2 text-right">Party rate</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                No party rates yet
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.productId} className="border-t">
              <td className="px-3 py-2">
                {row.productName}
                <div className="text-xs text-slate-400">{row.productCode}</div>
              </td>
              <td className="px-3 py-2 text-right">{Number(row.listPrice).toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-semibold">{Number(row.sellingPrice).toFixed(2)}</td>
              <td className="px-3 py-2 text-right">
                <button type="button" className="text-slate-400 hover:text-red-600" onClick={() => void remove(row.productId)}>
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
