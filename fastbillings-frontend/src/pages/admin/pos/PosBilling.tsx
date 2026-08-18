import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import { ArrowLeft, CloudOff, Delete, Keyboard, ScanLine, Wifi } from "lucide-react";

import Constants from "@constants/api";
import { BRAND } from "@constants/brand";
import type { RootState } from "@store/index";
import { upiDeepLink } from "@/lib/upiDeepLink";
import {
  billedQtyToPrimary,
  convertRateBetweenUnits,
  parseBillingUnit,
  type DualUomApi,
} from "@/lib/dualUom";
import {
  catalogSyncedAt,
  decrementLocalStock,
  enqueueSale,
  findCatalogProduct,
  listQueuedSales,
  loadBootstrap,
  saveBootstrap,
  saveCatalog,
  applyQueuedStockHolds,
} from "@/offline/posDb";
import { flushPosQueue, newClientSaleId } from "@/offline/posSync";
import PosReceipt, { type PosReceiptData } from "./PosReceipt";

type TaxRate = {
  id: string;
  name: string;
  rate: number;
  isActive: boolean;
  taxKind: string | null;
};

type ScannedProduct = {
  id: string;
  name: string;
  code: string;
  barcode: string;
  sellingPrice: number;
  unit: { id: string; name: string } | null;
  dualUom?: DualUomApi | null;
  hsnSac: string | null;
  gstSupplyType: string;
  taxGroupId: string | null;
  taxRates: TaxRate[];
  enableInventory: boolean;
  itemType: string;
  stockQty: number;
};

type CartLine = {
  productId: string;
  name: string;
  qty: number;
  rate: number;
  tax: number;
  amount: number;
  stockQty: number;
  enableInventory: boolean;
  itemType: string;
  unitKind: "PRIMARY" | "SECONDARY";
  conversion: number | null;
  primaryUnitName: string;
  secondaryUnitName: string;
};

type PaymentMode = { id: string; name: string; slug: string | null };

type Bootstrap = {
  walkInCustomer: { id: string; name: string };
  paymentModes: PaymentMode[];
  bank: { id: string; bankName: string } | null;
  warehouseId: string;
  company: {
    companyName: string;
    gstin?: string | null;
    address?: string | null;
    phone?: string | null;
    merchantUpiId?: string | null;
    merchantName?: string | null;
  } | null;
};

function lineTax(qty: number, rate: number, taxRates: TaxRate[]): number {
  const base = qty * rate;
  return Math.round(
    taxRates.reduce((s, t) => s + (base * Number(t.rate)) / 100, 0) * 100,
  ) / 100;
}

export default function PosBilling() {
  const navigate = useNavigate();
  const token = useSelector((s: RootState) => s.auth.token);
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const scanRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [ratesByProduct, setRatesByProduct] = useState<Record<string, TaxRate[]>>({});
  const [paymentModeId, setPaymentModeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<PosReceiptData | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [catalogAt, setCatalogAt] = useState<string | null>(null);
  const [posCustomerId, setPosCustomerId] = useState("");
  const [partyRates, setPartyRates] = useState<Record<string, number>>({});
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<Array<{ id: string; name: string }>>([]);

  const printReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: lastReceipt?.invoiceNumber ?? "POS Receipt",
    pageStyle: `
      @page { size: 80mm auto; margin: 4mm; }
      html, body { margin: 0; }
    `,
  });

  useEffect(() => {
    if (!lastReceipt) return;
    printReceipt();
  }, [lastReceipt, printReceipt]);

  const totals = useMemo(() => {
    const taxable = cart.reduce((s, l) => s + l.qty * l.rate, 0);
    const tax = cart.reduce((s, l) => s + l.tax, 0);
    return {
      taxable: Math.round(taxable * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      total: Math.round((taxable + tax) * 100) / 100,
    };
  }, [cart]);

  const focusScan = useCallback(() => {
    window.setTimeout(() => scanRef.current?.focus(), 50);
  }, []);

  const applyBoot = useCallback((data: Bootstrap) => {
    setBoot(data);
    setPosCustomerId((prev) => prev || data.walkInCustomer.id);
    setPaymentModeId((prev) => {
      if (prev && data.paymentModes.some((m) => m.id === prev)) return prev;
      const cash = data.paymentModes.find((m) => m.slug === "cash");
      return cash?.id ?? data.paymentModes[0]?.id ?? "";
    });
  }, []);

  const refreshQueueCounts = useCallback(async () => {
    const queued = await listQueuedSales();
    setPendingCount(queued.filter((s) => !s.lastError).length);
    setFailedCount(queued.filter((s) => Boolean(s.lastError)).length);
  }, []);

  const syncFromServer = useCallback(async () => {
    if (!token) return;
    const flush = await flushPosQueue(token);
    if (flush.synced > 0) toast.success(`Synced ${flush.synced} offline sale(s)`);
    if (flush.failed > 0) toast.error(`${flush.failed} sale(s) could not sync — check stock or bank`);
    await refreshQueueCounts();

    try {
      const [bootRes, catRes] = await Promise.all([
        axios.get(Constants.POS_BOOTSTRAP_URL, { headers }),
        axios.get(Constants.POS_CATALOG_URL, { headers, params: { limit: 1500 } }),
      ]);
      const bootData = bootRes.data?.data as Bootstrap;
      applyBoot(bootData);
      await saveBootstrap(bootData);

      const catalog = catRes.data?.data as {
        products: ScannedProduct[];
        syncedAt: string;
      };
      if (catalog?.products) {
        await saveCatalog(catalog.products, catalog.syncedAt);
        await applyQueuedStockHolds();
        setCatalogAt(catalog.syncedAt);
      }
    } catch {
      const cached = await loadBootstrap();
      if (cached) applyBoot(cached);
      const at = await catalogSyncedAt();
      setCatalogAt(at);
    }
    await refreshQueueCounts();
  }, [token, headers, applyBoot, refreshQueueCounts]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const cached = await loadBootstrap();
      if (!cancelled && cached) applyBoot(cached);
      const at = await catalogSyncedAt();
      if (!cancelled) setCatalogAt(at);
      await refreshQueueCounts();

      if (navigator.onLine && token) {
        await syncFromServer();
      } else if (!cached && !cancelled) {
        toast.error("Open POS once while online to cache the catalog");
      }
      if (!cancelled) focusScan();
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [token, applyBoot, refreshQueueCounts, syncFromServer, focusScan]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void syncFromServer();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncFromServer]);

  useEffect(() => {
    const walkIn = boot?.walkInCustomer.id;
    if (!posCustomerId || !token || posCustomerId === walkIn) {
      setPartyRates({});
      return;
    }
    axios
      .get(`${Constants.CUSTOMER_PRODUCT_RATES_URL}/${posCustomerId}/product-rates`, { headers })
      .then((r) => {
        const map: Record<string, number> = {};
        for (const row of r.data.data ?? []) map[row.productId] = Number(row.sellingPrice);
        setPartyRates(map);
      })
      .catch(() => setPartyRates({}));
  }, [posCustomerId, boot?.walkInCustomer.id, token, headers]);

  useEffect(() => {
    if (!customerQuery.trim() || !token) {
      setCustomerHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      axios
        .get(Constants.GET_CUSTOMERS_WITH_SEARCH_URL, {
          params: { search: customerQuery, limit: 20, page: 1 },
          headers,
        })
        .then((r) => {
          const list = (r.data.data?.customers ?? []).map((c: { id: string; name: string }) => ({
            id: c.id,
            name: c.name,
          }));
          setCustomerHits(list);
        })
        .catch(() => setCustomerHits([]));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [customerQuery, token, headers]);

  const addProduct = useCallback(
    (product: ScannedProduct) => {
      setRatesByProduct((prev) => ({ ...prev, [product.id]: product.taxRates ?? [] }));
      const dual = product.dualUom;
      const unitKind = parseBillingUnit(dual?.billingUnit);
      const conversion = dual?.conversion ?? null;
      const primaryUnitName = dual?.primary?.name || product.unit?.name || "";
      const secondaryUnitName = dual?.secondary?.name || "";
      setCart((prev) => {
        const existing = prev.find((l) => l.productId === product.id);
        if (existing) {
          const qty = existing.qty + 1;
          const need = billedQtyToPrimary(qty, existing.unitKind, existing.conversion);
          if (product.enableInventory && product.itemType !== "Service" && need > product.stockQty) {
            toast.error(`Only ${product.stockQty} in stock`);
            return prev;
          }
          const tax = lineTax(qty, existing.rate, product.taxRates ?? []);
          return prev.map((l) =>
            l.productId === product.id
              ? { ...l, qty, tax, amount: Math.round((qty * l.rate + tax) * 100) / 100 }
              : l,
          );
        }
        const need = billedQtyToPrimary(1, unitKind, conversion);
        if (product.enableInventory && product.itemType !== "Service" && product.stockQty < need) {
          toast.error(`${product.name} is out of stock`);
          return prev;
        }
        const qty = 1;
        const rate = product.sellingPrice;
        const tax = lineTax(qty, rate, product.taxRates ?? []);
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            qty,
            rate,
            tax,
            amount: Math.round((qty * rate + tax) * 100) / 100,
            stockQty: product.stockQty,
            enableInventory: product.enableInventory,
            itemType: product.itemType,
            unitKind,
            conversion,
            primaryUnitName,
            secondaryUnitName,
          },
        ];
      });
    },
    [],
  );

  async function lookupBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    let product: ScannedProduct | null = null;
    if (navigator.onLine) {
      try {
        const r = await axios.get(
          `${Constants.FETCH_PRODUCT_BY_BARCODE_URL}/${encodeURIComponent(trimmed)}`,
          {
            headers,
            params:
              posCustomerId && posCustomerId !== boot?.walkInCustomer.id
                ? { customerId: posCustomerId }
                : undefined,
          },
        );
        product = r.data.data as ScannedProduct;
      } catch (err) {
        const networkDown = axios.isAxiosError(err) && !err.response;
        if (networkDown || (axios.isAxiosError(err) && err.response?.status === 404)) {
          product = (await findCatalogProduct(trimmed)) as ScannedProduct | null;
        }
      }
    } else {
      product = (await findCatalogProduct(trimmed)) as ScannedProduct | null;
    }
    if (product) {
      const party = partyRates[product.id];
      addProduct(party != null ? { ...product, sellingPrice: party } : product);
    }
    else toast.error(`No item for ${trimmed}`);
    setScan("");
    focusScan();
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((l) => l.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const need = billedQtyToPrimary(qty, l.unitKind, l.conversion);
        if (l.enableInventory && l.itemType !== "Service" && need > l.stockQty) {
          toast.error(`Only ${l.stockQty} in stock`);
          return l;
        }
        const tax = lineTax(qty, l.rate, ratesByProduct[productId] ?? []);
        return { ...l, qty, tax, amount: Math.round((qty * l.rate + tax) * 100) / 100 };
      }),
    );
  }

  function setUnitKind(productId: string, unitKind: "PRIMARY" | "SECONDARY") {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId || l.unitKind === unitKind) return l;
        const rate = convertRateBetweenUnits(l.rate, l.unitKind, unitKind, l.conversion);
        const need = billedQtyToPrimary(l.qty, unitKind, l.conversion);
        if (l.enableInventory && l.itemType !== "Service" && need > l.stockQty) {
          toast.error(`Only ${l.stockQty} in stock for that unit`);
          return l;
        }
        const tax = lineTax(l.qty, rate, ratesByProduct[productId] ?? []);
        return {
          ...l,
          unitKind,
          rate,
          tax,
          amount: Math.round((l.qty * rate + tax) * 100) / 100,
        };
      }),
    );
  }

  function buildReceipt(opts: {
    invoiceNumber: string;
    pending?: boolean;
    upiLink?: string | null;
    paymentModeName?: string;
  }): PosReceiptData {
    const mode = boot?.paymentModes.find((m) => m.id === paymentModeId);
    return {
      companyName: boot?.company?.companyName || BRAND.name,
      address: boot?.company?.address,
      phone: boot?.company?.phone,
      gstin: boot?.company?.gstin,
      invoiceNumber: opts.invoiceNumber,
      dateLabel: new Date().toLocaleString(),
      paymentMode: opts.paymentModeName || mode?.name || "Payment",
      lines: cart.map((l) => ({
        name: l.name,
        qty: l.qty,
        rate: l.rate,
        tax: l.tax,
        amount: l.amount,
      })),
      taxable: totals.taxable,
      tax: totals.tax,
      total: totals.total,
      upiLink: opts.upiLink,
      pending: opts.pending,
    };
  }

  async function queueOfflineSale(clientSaleId: string) {
    const mode = boot?.paymentModes.find((m) => m.id === paymentModeId);
    await enqueueSale({
      clientSaleId,
      createdAt: new Date().toISOString(),
      payload: {
        clientSaleId,
        lines: cart.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          rate: l.rate,
          unitKind: l.unitKind,
          qtyPrimary: billedQtyToPrimary(l.qty, l.unitKind, l.conversion),
        })),
        paymentModeId,
        warehouseId: boot?.warehouseId,
        bankId: boot?.bank?.id,
        customerId: posCustomerId || boot?.walkInCustomer.id,
      },
      receipt: {
        lines: cart.map((l) => ({
          name: l.name,
          qty: l.qty,
          rate: l.rate,
          tax: l.tax,
          amount: l.amount,
        })),
        taxable: totals.taxable,
        tax: totals.tax,
        total: totals.total,
        paymentModeName: mode?.name ?? "Payment",
      },
    });
    for (const line of cart) {
      await decrementLocalStock(line.productId, billedQtyToPrimary(line.qty, line.unitKind, line.conversion));
    }
    await refreshQueueCounts();
    toast.success("Saved offline — will sync when back online");
    setLastReceipt(
      buildReceipt({
        invoiceNumber: `PENDING-${clientSaleId.slice(0, 8).toUpperCase()}`,
        pending: true,
      }),
    );
    setCart([]);
  }

  async function checkout() {
    if (!cart.length || busy) return;
    if (!paymentModeId) {
      toast.error("Select a payment mode");
      return;
    }
    setBusy(true);
    const clientSaleId = newClientSaleId();
    const payload = {
      clientSaleId,
      lines: cart.map((l) => ({
        productId: l.productId,
        qty: l.qty,
        rate: l.rate,
        unitKind: l.unitKind,
      })),
      paymentModeId,
      warehouseId: boot?.warehouseId,
      bankId: boot?.bank?.id,
      customerId: posCustomerId || boot?.walkInCustomer.id,
    };
    try {
      if (!navigator.onLine) {
        await queueOfflineSale(clientSaleId);
        return;
      }
      const r = await axios.post(Constants.POS_SALES_URL, payload, { headers });
      const sale = r.data?.data as { invoiceId: string; invoiceNumber: string; total: number; paymentMode: string };
      toast.success(`Saved ${sale.invoiceNumber}`);
      const mode = boot?.paymentModes.find((m) => m.id === paymentModeId);
      const upi =
        mode?.slug === "upi" && boot?.company?.merchantUpiId
          ? upiDeepLink({
              vpa: boot.company.merchantUpiId,
              payeeName: boot.company.merchantName || boot.company.companyName,
              amount: totals.total,
              note: sale.invoiceNumber,
            })
          : null;
      for (const line of cart) {
        await decrementLocalStock(line.productId, line.qty);
      }
      setLastReceipt(
        buildReceipt({
          invoiceNumber: sale.invoiceNumber,
          upiLink: upi,
          paymentModeName: mode?.name || sale.paymentMode,
        }),
      );
      setCart([]);
    } catch (err: unknown) {
      const networkDown = axios.isAxiosError(err) && !err.response;
      if (networkDown) {
        await queueOfflineSale(clientSaleId);
        return;
      }
      const msg =
        axios.isAxiosError(err) ? String(err.response?.data?.message ?? "Sale failed") : "Sale failed";
      toast.error(msg);
    } finally {
      setBusy(false);
      focusScan();
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F8") {
        e.preventDefault();
        void checkout();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        navigate("/admin/invoices");
      }
      if (e.key === "F4") {
        e.preventDefault();
        focusScan();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, paymentModeId, busy, boot]);

  return (
    <div className="flex h-screen flex-col bg-[#F0F7FF] text-[#000D33]">
      <header className="flex items-center justify-between border-b border-[#D6E8FF] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/admin/invoices")}
            className="rounded-lg border border-[#D6E8FF] p-2 hover:bg-[#F0F7FF]"
          >
            <ArrowLeft size={18} />
          </button>
          <ScanLine className="text-[#007BFF]" size={22} />
          <div>
            <h1 className="text-lg font-semibold">POS Counter</h1>
            <p className="text-xs text-slate-500">
              Scan barcode · F8 pay · Esc exit
              {catalogAt ? ` · Catalog ${new Date(catalogAt).toLocaleTimeString()}` : ""}
            </p>
          </div>
          <div className="relative ml-2 hidden min-w-[14rem] md:block">
            <input
              className="w-full rounded-lg border border-[#D6E8FF] px-3 py-1.5 text-sm"
              placeholder="Customer (walk-in default)"
              value={
                customerQuery ||
                (posCustomerId && posCustomerId === boot?.walkInCustomer.id
                  ? boot.walkInCustomer.name
                  : "")
              }
              onChange={(e) => setCustomerQuery(e.target.value)}
              onFocus={() => {
                if (posCustomerId === boot?.walkInCustomer.id) setCustomerQuery("");
              }}
            />
            {customerHits.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow">
                <li>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#F0F7FF]"
                    onClick={() => {
                      if (boot?.walkInCustomer.id) setPosCustomerId(boot.walkInCustomer.id);
                      setCustomerQuery("");
                      setCustomerHits([]);
                    }}
                  >
                    {boot?.walkInCustomer.name ?? "Walk-in"}
                  </button>
                </li>
                {customerHits.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-[#F0F7FF]"
                      onClick={() => {
                        setPosCustomerId(c.id);
                        setCustomerQuery(c.name);
                        setCustomerHits([]);
                      }}
                    >
                      {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div
            className={`flex items-center gap-1 rounded-full px-2 py-1 ${
              online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
            }`}
          >
            {online ? <Wifi size={14} /> : <CloudOff size={14} />}
            <span>{online ? "Online" : "Offline"}</span>
          </div>
          {pendingCount > 0 && (
            <span className="rounded-full bg-[#007BFF]/10 px-2 py-1 text-[#007BFF]">
              {pendingCount} pending sync
            </span>
          )}
          {failedCount > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
              {failedCount} failed
            </span>
          )}
          <div className="hidden items-center gap-2 text-slate-500 md:flex">
            <Keyboard size={14} />
            <span>Enter = add · +/− qty · F4 scan · F8 pay</span>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_22rem]">
        <section className="flex min-h-0 flex-col p-4">
          <form
            className="mb-3"
            onSubmit={(e) => {
              e.preventDefault();
              void lookupBarcode(scan);
            }}
          >
            <input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder="Scan or type barcode / SKU, then Enter"
              className="w-full rounded-xl border border-[#007BFF]/30 bg-white px-4 py-3 text-lg outline-none ring-[#007BFF]/20 focus:ring-2"
              autoComplete="off"
            />
          </form>

          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[#D6E8FF] bg-white">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#F7FBFF] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-12 text-center text-slate-400">
                      Scan an item to start the bill
                    </td>
                  </tr>
                )}
                {cart.map((line) => (
                  <tr key={line.productId} className="border-t border-[#EEF5FF]">
                    <td className="px-3 py-2 font-medium">{line.name}</td>
                    <td className="px-3 py-2">
                      {line.secondaryUnitName ? (
                        <select
                          className="h-7 rounded border bg-white px-1 text-xs"
                          value={line.unitKind}
                          onChange={(e) =>
                            setUnitKind(line.productId, parseBillingUnit(e.target.value))
                          }
                        >
                          <option value="PRIMARY">{line.primaryUnitName || "Stock"}</option>
                          <option value="SECONDARY">{line.secondaryUnitName}</option>
                        </select>
                      ) : (
                        <span className="text-xs text-slate-500">{line.primaryUnitName}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className="h-7 w-7 rounded border"
                          onClick={() => setQty(line.productId, line.qty - 1)}
                        >
                          −
                        </button>
                        <input
                          className="h-7 w-12 rounded border text-center"
                          value={line.qty}
                          onChange={(e) => setQty(line.productId, Number(e.target.value) || 0)}
                        />
                        <button
                          type="button"
                          className="h-7 w-7 rounded border"
                          onClick={() => setQty(line.productId, line.qty + 1)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{line.rate.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{line.tax.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{line.amount.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setQty(line.productId, 0)} className="text-slate-400">
                        <Delete size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="flex flex-col gap-3 border-t border-[#D6E8FF] bg-white p-4 lg:border-l lg:border-t-0">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Payment</p>
            <div className="flex flex-wrap gap-2">
              {(boot?.paymentModes ?? []).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setPaymentModeId(mode.id)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    paymentModeId === mode.id
                      ? "border-[#007BFF] bg-[#007BFF] text-white"
                      : "border-[#D6E8FF] hover:bg-[#F0F7FF]"
                  }`}
                >
                  {mode.name}
                </button>
              ))}
            </div>
          </div>

          {!boot?.bank && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              Add a bank account in Settings before taking POS payments.
            </p>
          )}
          {!online && (
            <p className="rounded-lg border border-[#007BFF]/30 bg-[#F0F7FF] p-2 text-xs text-[#000D33]">
              Offline mode: sales are queued locally and posted as invoices when you reconnect. Same
              bill will not be created twice.
            </p>
          )}

          <div className="mt-auto space-y-1 rounded-xl bg-[#000D33] p-4 text-white">
            <div className="flex justify-between text-sm text-white/70">
              <span>Taxable</span>
              <span>{totals.taxable.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-white/70">
              <span>Tax</span>
              <span>{totals.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-2xl font-bold">
              <span>Total</span>
              <span>{totals.total.toFixed(2)}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!cart.length || busy || !boot?.bank}
            onClick={() => void checkout()}
            className="rounded-xl bg-[#007BFF] py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : online ? "Pay & Print (F8)" : "Pay offline & Print (F8)"}
          </button>
        </aside>
      </div>

      <div className="hidden">
        <div ref={receiptRef}>{lastReceipt && <PosReceipt data={lastReceipt} />}</div>
      </div>
    </div>
  );
}
