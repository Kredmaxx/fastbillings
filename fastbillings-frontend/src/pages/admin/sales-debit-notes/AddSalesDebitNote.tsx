import DateInput from '@components/admin/DateInput';
import FullPageLoader from '@components/admin/FullPageLoader';
import SearchableDropdown from '@components/admin/SearchableDropdown';
import SubmitButton from '@components/admin/SubmitButton';
import Constants from '@constants/api';
import { useDebounce } from '@hooks/useDebounce';
import type { OptionType } from '@models/common';
import type { RootState } from '@store/index';
import axios from 'axios';
import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface LineItem {
  id: string;
  name: string;
  unit: string;
  qty: number;
  rate: number;
  discount: number;
  tax: number;
  amount: number;
  tax_group_id?: string;
}

const REASONS = [
  { id: 'OVERCHARGE', name: 'Price increase / undercharge correction' },
  { id: 'OTHER', name: 'Other' },
  { id: 'WRONG_ITEM', name: 'Wrong item / quantity correction' },
  { id: 'DAMAGED_GOODS', name: 'Damaged goods adjustment' },
  { id: 'RETURN', name: 'Return-related debit' },
  { id: 'CANCELLATION', name: 'Cancellation adjustment' },
];

function recalculateAmount(item: LineItem): LineItem {
  const base = Math.max(0, item.qty * item.rate - (item.discount || 0));
  const amount = base + (item.tax || 0);
  return { ...item, amount };
}

const AddSalesDebitNote: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useSelector((state: RootState) => state.auth);
  const [invoiceOptions, setInvoiceOptions] = useState<OptionType[]>([]);
  const [invoiceSearchInput, setInvoiceSearchInput] = useState('');
  const debouncedInvoiceSearch = useDebounce(invoiceSearchInput, 400);
  const [selectedInvoice, setSelectedInvoice] = useState<OptionType | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [invoiceId, setInvoiceId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [billFrom, setBillFrom] = useState('');
  const [billTo, setBillTo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [debitNoteDate, setDebitNoteDate] = useState<Date | null>(new Date());
  const [reason, setReason] = useState('OVERCHARGE');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        const response = await axios.post(
          Constants.SEARCH_INVOICES_FOR_CREDIT_NOTE_URL,
          { search: debouncedInvoiceSearch },
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = response.data.data ?? [];
        setInvoiceOptions(
          data.map((inv: { id: string; invoiceNumber: string }) => ({
            id: inv.id,
            name: inv.invoiceNumber,
          })),
        );
      } catch (error) {
        console.error('Error searching invoices:', error);
      }
    };
    if (token) fetchInvoices();
  }, [debouncedInvoiceSearch, token]);

  const handleInvoiceChange = async (option: OptionType) => {
    try {
      setIsFetching(true);
      setSelectedInvoice(option);
      setFormErrors((prev) => ({ ...prev, invoiceId: '' }));
      const response = await axios.get(`${Constants.FETCH_INVOICE_FOR_EDIT_URL}/${option.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const inv = response.data.data;
      if (!inv) {
        toast.error('Invoice not found');
        return;
      }
      setInvoiceId(inv.id);
      setInvoiceNumber(inv.invoiceNumber ?? option.name);
      setBillFrom(inv.billFrom?.id ?? inv.billFrom ?? '');
      setBillTo(inv.billTo?.id ?? inv.billTo ?? '');
      setCustomerId(inv.billTo?.id ?? inv.customerId ?? inv.billTo ?? '');
      setCustomerName(inv.billTo?.name ?? inv.customer?.name ?? '');
      setCurrencyCode(inv.currencyCode ?? '');
      setReferenceNo(inv.invoiceNumber ?? '');
      const mapped: LineItem[] = Array.isArray(inv.items)
        ? inv.items.map((item: Record<string, unknown>) =>
            recalculateAmount({
              id: String(item.id ?? crypto.randomUUID()),
              name: String(item.name ?? ''),
              unit: String(item.unit ?? ''),
              qty: Number(item.qty ?? 1) || 1,
              rate: Number(item.rate ?? 0) || 0,
              discount: Number(item.discount ?? 0) || 0,
              tax: Number(item.tax ?? 0) || 0,
              amount: Number(item.amount ?? 0) || 0,
              tax_group_id: item.tax_group_id ? String(item.tax_group_id) : undefined,
            }),
          )
        : [];
      setItems(
        mapped.length
          ? mapped
          : [
              recalculateAmount({
                id: crypto.randomUUID(),
                name: '',
                unit: '',
                qty: 1,
                rate: 0,
                discount: 0,
                tax: 0,
                amount: 0,
              }),
            ],
      );
    } catch (error) {
      console.error('Error loading invoice:', error);
      toast.error('Failed to load invoice');
    } finally {
      setIsFetching(false);
    }
  };

  const totals = useMemo(() => {
    const taxableAmount = items.reduce(
      (sum, item) => sum + Math.max(0, item.qty * item.rate - (item.discount || 0)),
      0,
    );
    const totalDiscount = items.reduce((sum, item) => sum + (item.discount || 0), 0);
    const totalTax = items.reduce((sum, item) => sum + (item.tax || 0), 0);
    const grandTotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);
    return { taxableAmount, totalDiscount, totalTax, grandTotal };
  }, [items]);

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, [field]: value };
        if (['qty', 'rate', 'discount', 'tax'].includes(field)) {
          return recalculateAmount({
            ...next,
            qty: Number(next.qty) || 0,
            rate: Number(next.rate) || 0,
            discount: Number(next.discount) || 0,
            tax: Number(next.tax) || 0,
          });
        }
        return next;
      }),
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((item) => item.id !== id)));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      recalculateAmount({
        id: crypto.randomUUID(),
        name: '',
        unit: '',
        qty: 1,
        rate: 0,
        discount: 0,
        tax: 0,
        amount: 0,
      }),
    ]);
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!invoiceId) errors.invoiceId = 'Select an invoice';
    if (!debitNoteDate) errors.debitNoteDate = 'Date is required';
    if (!items.some((item) => item.name.trim())) errors.items = 'At least one line item is required';
    setFormErrors(errors);
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) return;

    const year = debitNoteDate!.getFullYear();
    const month = String(debitNoteDate!.getMonth() + 1).padStart(2, '0');
    const day = String(debitNoteDate!.getDate()).padStart(2, '0');

    try {
      setIsSaving(true);
      await axios.post(
        Constants.CREATE_SALES_DEBIT_NOTE_URL,
        {
          invoiceId,
          customerId,
          billFrom,
          billTo,
          debitNoteDate: `${year}-${month}-${day}`,
          reason,
          referenceNo,
          notes,
          currencyCode: currencyCode || undefined,
          status: 'PENDING',
          items: items.filter((item) => item.name.trim()),
          taxableAmount: totals.taxableAmount,
          totalDiscount: totals.totalDiscount,
          totalTax: totals.totalTax,
          vat: totals.totalTax,
          grandTotal: totals.grandTotal,
          totalAmount: totals.grandTotal,
          subTotal: totals.taxableAmount,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Sales debit note created');
      navigate('/admin/sales-debit-notes');
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data?.message) {
        toast.error(String(error.response.data.message));
      } else {
        toast.error('Failed to create sales debit note');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {isFetching && <FullPageLoader />}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-950">New Sales Debit Note</h1>
        <button
          type="button"
          onClick={() => navigate('/admin/sales-debit-notes')}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <SearchableDropdown
              label="Invoice"
              required
              options={invoiceOptions}
              value={selectedInvoice}
              inputValue={invoiceSearchInput}
              onInputChange={(_, value) => setInvoiceSearchInput(value)}
              onChange={(_, value) => {
                if (value) void handleInvoiceChange(value);
              }}
              placeholder="Search invoice..."
            />
            {formErrors.invoiceId && (
              <span className="text-red-500 text-sm">{formErrors.invoiceId}</span>
            )}
            {customerName && (
              <p className="mt-1 text-sm text-gray-600">
                Customer: <span className="font-medium text-gray-900">{customerName}</span>
                {invoiceNumber ? ` · ${invoiceNumber}` : ''}
              </p>
            )}
          </div>
          <div>
            <DateInput
              label="Debit note date"
              isRequired
              value={debitNoteDate}
              onChange={(d) => setDebitNoteDate(d)}
            />
            {formErrors.debitNoteDate && (
              <span className="text-red-500 text-sm">{formErrors.debitNoteDate}</span>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-950"
            >
              {REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
            <input
              type="text"
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-950"
              placeholder="Optional reference"
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold text-gray-900">Line items</h2>
            <button
              type="button"
              onClick={addItem}
              className="text-sm text-purple-700 hover:underline"
            >
              + Add line
            </button>
          </div>
          {formErrors.items && <span className="text-red-500 text-sm">{formErrors.items}</span>}
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Discount</th>
                  <th className="px-2 py-2 text-right">Tax</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      <input
                        value={item.name}
                        onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.qty}
                        onChange={(e) => updateItem(item.id, 'qty', Number(e.target.value))}
                        className="w-20 border border-gray-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.rate}
                        onChange={(e) => updateItem(item.id, 'rate', Number(e.target.value))}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.discount}
                        onChange={(e) => updateItem(item.id, 'discount', Number(e.target.value))}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={item.tax}
                        onChange={(e) => updateItem(item.id, 'tax', Number(e.target.value))}
                        className="w-24 border border-gray-200 rounded px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-2 py-1 text-right font-medium">
                      {item.amount.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-red-500 hover:text-red-700"
                        aria-label="Remove line"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-950"
            />
          </div>
          <div className="bg-gray-50 rounded-md p-3 space-y-1 text-sm text-gray-800">
            <div className="flex justify-between">
              <span>Taxable</span>
              <span>{totals.taxableAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>{totals.totalDiscount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{totals.totalTax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-base pt-1 border-t border-gray-200">
              <span>Total</span>
              <span>{totals.grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate('/admin/sales-debit-notes')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <SubmitButton isLoading={isSaving}>Create sales debit note</SubmitButton>
        </div>
      </form>
    </div>
  );
};

export default AddSalesDebitNote;
