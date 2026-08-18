import { useEffect, useMemo, useState } from "react";
import { PlusCircle } from "lucide-react";
import DateInput from "@components/admin/DateInput";
import axios from "axios";
import Constants from "@constants/api";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import { useDebounce } from "@hooks/useDebounce";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import CustomerCard from "@components/admin/CustomerCard";
import AdminCard from "@components/admin/AdminCard";
import FullPageLoader from "@components/admin/FullPageLoader";
import type { OptionType, SelectedAdmin } from "@models/common";
import type { Customer } from "@models/customer";
import type { Product, ProductItem } from "@models/product";
import CreateProductForm from "@components/admin/CreateProductForm";
import CreateCustomerForm from "@components/admin/CreateCustomerForm";
import SmartDropdown from "@components/admin/SmartDropdown";
import InvoiceTableRow from "@components/admin/InvoiceTableRow";
import { useCurrencies } from "@hooks/useCurrencies";

type TaxGroup = {
  id: string;
  tax_name: string;
  total_tax_rate: number;
};

type FormState = {
  billFrom: string;
  billTo: string;
  orderDate: Date | null;
  deliveryDate: Date | null;
  referenceNo: string;
  items: ProductItem[];
  notes: string;
  termsAndCondition: string;
  currencyCode: string;
};

function emptyItem(): ProductItem {
  return {
    id: crypto.randomUUID(),
    name: "",
    unit: "",
    qty: 1,
    rate: 0,
    discount: 0,
    tax: 0,
    amount: 0,
  };
}

function recalc(item: ProductItem, taxes: TaxGroup[]): ProductItem {
  const qty = Number(item.qty) || 0;
  const rate = Number(item.rate) || 0;
  const subtotal = qty * rate;
  const discountAmount =
    item.discount_type === "Percentage"
      ? (subtotal * (item.discount_value || 0)) / 100
      : Number(item.discount_value || item.discount || 0);
  const selected = taxes.find((t) => String(t.id) === String(item.tax_group_id));
  const taxRate = selected?.total_tax_rate || 0;
  const totalTax = ((rate * taxRate) / 100) * qty;
  return {
    ...item,
    discount: discountAmount,
    tax: totalTax,
    amount: subtotal - discountAmount + totalTax,
  };
}

export default function SaleOrderForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { token, user } = useSelector((state: RootState) => state.auth);
  const { defaultCurrencyCode, resolveCurrency } = useCurrencies();

  const [adminUsers, setAdminUsers] = useState<OptionType[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearchInput, setCustomerSearchInput] = useState("");
  const debouncedCustomer = useDebounce(customerSearchInput, 400);
  const [selectedAdmin, setSelectedAdmin] = useState<OptionType | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [companyDetails, setCompanyDetails] = useState<SelectedAdmin | null>(null);
  const [taxes, setTaxes] = useState<TaxGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>({
    billFrom: "",
    billTo: "",
    orderDate: new Date(),
    deliveryDate: null,
    referenceNo: "",
    items: [emptyItem()],
    notes: "",
    termsAndCondition: "",
    currencyCode: defaultCurrencyCode || "INR",
  });

  const totals = useMemo(() => {
    const subTotal = form.items.reduce((s, i) => s + i.rate * i.qty, 0);
    const totalDiscount = form.items.reduce((s, i) => s + (i.discount || 0), 0);
    const totalTax = form.items.reduce((s, i) => s + (i.tax || 0), 0);
    return {
      subTotal: Math.round(subTotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      grandTotal: Math.round((subTotal - totalDiscount + totalTax) * 100) / 100,
    };
  }, [form.items]);

  const currencySymbol = resolveCurrency(form.currencyCode).symbol;

  useEffect(() => {
    if (!token) return;
    axios
      .get(`${Constants.FETCH_USERS_URL}/1`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        const users = (r.data.data ?? []).map((u: { id: string; firstName: string; lastName?: string }) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName ?? ""}`.trim(),
        }));
        setAdminUsers(users);
        const me = users.find((u: OptionType) => u.id === user?.id) ?? users[0];
        if (me && !form.billFrom) void selectAdmin(me);
      })
      .catch(() => undefined);
    axios
      .get(Constants.FETCH_TAX_GROUPS_URL, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => setTaxes(r.data.data ?? []))
      .catch(() => setTaxes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    axios
      .get(Constants.GET_CUSTOMERS_WITH_SEARCH_URL, {
        params: { search: debouncedCustomer, limit: 100, page: 1 },
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setCustomers(r.data.data?.customers ?? []))
      .catch(() => setCustomers([]));
  }, [debouncedCustomer, token]);

  useEffect(() => {
    if (!isEdit || !id || !token) return;
    setBusy(true);
    axios
      .get(`${Constants.FETCH_SALE_ORDER_URL}/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const data = r.data.data;
        const items = Array.isArray(data.items) && data.items.length ? data.items : [emptyItem()];
        setForm({
          billFrom: data.billFrom,
          billTo: data.billTo,
          orderDate: data.orderDate ? new Date(data.orderDate) : new Date(),
          deliveryDate: data.deliveryDate ? new Date(data.deliveryDate) : null,
          referenceNo: data.referenceNo ?? "",
          items,
          notes: data.notes ?? "",
          termsAndCondition: data.termsAndCondition ?? "",
          currencyCode: data.currencyCode || defaultCurrencyCode || "INR",
        });
        setLocked(data.status === "invoiced" || Boolean(data.invoiceId));
        if (data.billToCustomer) {
          setSelectedCustomer(data.billToCustomer);
          setCustomerSearchInput(data.billToCustomer.name ?? "");
        }
        if (data.billFromUser) {
          const admin = {
            id: data.billFromUser.id,
            name: `${data.billFromUser.firstName} ${data.billFromUser.lastName ?? ""}`.trim(),
          };
          await selectAdmin(admin);
        }
      })
      .catch(() => toast.error("Failed to load sale order"))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit, token]);

  async function selectAdmin(admin: OptionType) {
    setSelectedAdmin(admin);
    try {
      const r = await axios.get(`${Constants.FETCH_COMPANY_SETTINGS_URL}/${admin.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCompanyDetails(r.data.data);
      setForm((prev) => ({ ...prev, billFrom: admin.id }));
    } catch {
      setCompanyDetails(null);
    }
  }

  function patchItem(rowId: string, product: ProductItem) {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === rowId ? recalc(product, taxes) : item)),
    }));
  }

  function addRow() {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  }

  function onProductCreated(product: Product) {
    const rate = product.prices?.selling ?? 0;
    const taxRate = product.tax?.total_rate ?? 0;
    const tax = (rate * taxRate) / 100;
    const next: ProductItem = {
      id: product.id,
      name: product.name,
      unit: product.unit?.name ?? "",
      qty: 1,
      rate,
      discount: 0,
      tax,
      amount: rate + tax,
      tax_group_id: product.tax?.group_id,
    };
    setForm((prev) => {
      const blank = prev.items.findIndex((i) => !i.name);
      if (blank >= 0) {
        const items = [...prev.items];
        items[blank] = next;
        return { ...prev, items };
      }
      return { ...prev, items: [...prev.items, next] };
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.billFrom) next.billFrom = "Bill from is required";
    if (!form.billTo) next.billTo = "Customer is required";
    if (!form.orderDate) next.orderDate = "Order date is required";
    if (!form.items.some((i) => (i.name ?? "").trim())) next.items = "Add at least one item";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save(status: "draft" | "confirmed") {
    if (locked) return;
    if (!validate()) return;
    setBusy(true);
    const payload = {
      ...form,
      orderDate: form.orderDate?.toISOString(),
      deliveryDate: form.deliveryDate?.toISOString() ?? null,
      status,
      subTotal: totals.subTotal,
      totalDiscount: totals.totalDiscount,
      totalTax: totals.totalTax,
      grandTotal: totals.grandTotal,
      customerId: form.billTo,
    };
    try {
      if (isEdit && id) {
        await axios.put(`${Constants.UPDATE_SALE_ORDER_URL}/${id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(Constants.CREATE_SALE_ORDER_URL, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      toast.success(status === "confirmed" ? "Sale order confirmed" : "Sale order saved");
      navigate("/admin/sale-orders");
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? String(err.response?.data?.message ?? "Save failed") : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {busy && <FullPageLoader />}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{isEdit ? "Edit Sale Order" : "New Sale Order"}</h1>
          <p className="text-sm text-slate-500">Does not post stock or GL until converted and the invoice is issued.</p>
        </div>
      </div>
      {locked && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This order has been converted to an invoice and can no longer be edited.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="font-bold text-gray-950">
            Bill From <span className="text-red-500">*</span>
          </h3>
          <div className="mt-3">
            <SmartDropdown
              items={adminUsers}
              value={selectedAdmin?.name ?? ""}
              onChange={() => undefined}
              onSelect={(item) => void selectAdmin(item as OptionType)}
              selectedItem={selectedAdmin}
              placeholder="Select company / bill from"
            />
            {errors.billFrom && <span className="text-sm text-red-500">{errors.billFrom}</span>}
            {selectedAdmin && companyDetails && (
              <div className="mt-3">
                <AdminCard
                  logoUrl={companyDetails.siteLogo}
                  companyName={companyDetails.companyName}
                  city={companyDetails.city?.name}
                  state={companyDetails.state?.name}
                  address={companyDetails.address}
                />
              </div>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-950">
              Customer <span className="text-red-500">*</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsCustomerModalOpen(true)}
              className="flex items-center text-sm font-semibold text-[#007BFF]"
            >
              <PlusCircle className="mr-1 h-4 w-4" /> New
            </button>
          </div>
          <div className="mt-3">
            <SmartDropdown
              items={customers}
              value={customerSearchInput}
              onChange={setCustomerSearchInput}
              onSelect={(c) => {
                const customer = c as Customer;
                setSelectedCustomer(customer);
                setCustomerSearchInput(customer.name ?? "");
                setForm((prev) => ({
                  ...prev,
                  billTo: customer.id,
                  currencyCode: customer.currencyCode || prev.currencyCode,
                }));
              }}
              onAddNew={() => setIsCustomerModalOpen(true)}
              selectedItem={selectedCustomer}
              addNewLabel="New Customer"
              placeholder="Type to search customer"
            />
            {errors.billTo && <span className="text-sm text-red-500">{errors.billTo}</span>}
            {selectedCustomer && (
              <div className="mt-3">
                <CustomerCard
                  image={selectedCustomer.image}
                  name={selectedCustomer.name}
                  email={selectedCustomer.email}
                  phone={selectedCustomer.phone}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-3">
        <DateInput
          label="Order date"
          isRequired
          value={form.orderDate}
          onChange={(d) => setForm((p) => ({ ...p, orderDate: d }))}
        />
        <DateInput
          label="Delivery date"
          value={form.deliveryDate}
          onChange={(d) => setForm((p) => ({ ...p, deliveryDate: d }))}
        />
        <div>
          <label className="block pb-1 text-sm font-medium text-gray-700">Reference</label>
          <input
            className="w-full rounded-md border px-3 py-2"
            value={form.referenceNo}
            onChange={(e) => setForm((p) => ({ ...p, referenceNo: e.target.value }))}
          />
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {errors.items && <p className="px-4 pt-3 text-sm text-red-500">{errors.items}</p>}
        <div className="overflow-x-auto p-4">
          <table className="w-full border-separate border-spacing-0">
            <thead className="bg-gray-950 text-white">
              <tr>
                <th className="p-3 text-left text-sm">Product</th>
                <th className="p-3 text-left text-sm">Unit</th>
                <th className="p-3 text-left text-sm">Qty</th>
                <th className="p-3 text-left text-sm">Rate</th>
                <th className="p-3 text-left text-sm">Discount</th>
                <th className="p-3 text-left text-sm">Tax</th>
                <th className="p-3 text-left text-sm">Amount</th>
                <th className="p-3 text-left text-sm">Action</th>
              </tr>
            </thead>
            <tbody>
              {form.items.map((item) => (
                <InvoiceTableRow
                  key={item.id}
                  item={item}
                  currencySymbol={currencySymbol}
                  currencyCode={form.currencyCode}
                  customerId={form.billTo || undefined}
                  onInLineItemChange={(updated) => patchItem(item.id, updated)}
                  onEditItem={() => undefined}
                  onDeleteItem={(row) =>
                    setForm((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== row.id) }))
                  }
                  availableItems={form.items}
                  addNewProduct={() => setIsProductModalOpen(true)}
                />
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addRow} className="mt-3 flex items-center text-sm font-semibold text-[#007BFF]">
            <PlusCircle className="mr-1 h-4 w-4" /> Add row
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <label className="text-sm font-semibold">Notes</label>
          <textarea
            className="mt-1 w-full rounded-md border px-3 py-2"
            rows={4}
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          />
        </div>
        <div className="rounded-xl bg-[#000D33] p-4 text-white">
          <div className="flex justify-between text-sm text-white/70">
            <span>Taxable</span>
            <span>{totals.subTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-white/70">
            <span>Discount</span>
            <span>{totals.totalDiscount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm text-white/70">
            <span>Tax</span>
            <span>{totals.totalTax.toFixed(2)}</span>
          </div>
          <div className="mt-2 flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>{totals.grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => navigate("/admin/sale-orders")}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={locked || busy}
          onClick={() => void save("draft")}
          className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
        >
          Save draft
        </button>
        <button
          type="button"
          disabled={locked || busy}
          onClick={() => void save("confirmed")}
          className="rounded-md bg-[#007BFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Confirm order
        </button>
      </div>

      <CreateProductForm
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSuccess={(product: Product) => {
          onProductCreated(product);
          setIsProductModalOpen(false);
        }}
      />
      <CreateCustomerForm
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={(customer: Customer) => {
          setCustomers((prev) => [customer, ...prev]);
          setSelectedCustomer(customer);
          setForm((prev) => ({ ...prev, billTo: customer.id }));
          setIsCustomerModalOpen(false);
        }}
      />
    </div>
  );
}
