import DeleteConfirmationModal from '@components/admin/DeleteConfirmationModal';
import InvoiceStatusBadge from '@components/admin/InvoiceStatusBadge';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import Constants from '@constants/api';
import { useCurrencies } from '@hooks/useCurrencies';
import useDateFormatter from '@hooks/useDateFormatter';
import type { RootState } from '@store/index';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

interface LineItem {
  id?: string;
  name?: string;
  qty?: number;
  rate?: number;
  discount?: number;
  tax?: number;
  amount?: number;
  unit?: string;
}

interface SalesDebitNoteDetail {
  id: string;
  debitNoteNumber: string | null;
  debitNoteDate: string | null;
  referenceNo: string | null;
  reason: string | null;
  description: string | null;
  status: string;
  taxableAmount: number | string;
  totalDiscount: number | string | null;
  vat: number | string | null;
  totalAmount: number | string;
  currencyCode: string | null;
  notes: string | null;
  items: LineItem[] | null;
  invoice?: { id: string; invoiceNumber: string | null; invoiceDate?: string | null } | null;
  billToCustomer?: {
    id: string;
    name: string | null;
    gstin?: string | null;
    email?: string | null;
  } | null;
}

const ViewSalesDebitNote: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useSelector((state: RootState) => state.auth);
  const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
  const { formatMoney } = useCurrencies();
  const { formatDate } = useDateFormatter();
  const [row, setRow] = useState<SalesDebitNoteDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const fetchRow = async (noteId: string) => {
    try {
      setIsLoading(true);
      setNotFound(false);
      const response = await axios.get(`${Constants.FETCH_SALES_DEBIT_NOTE_URL}/${noteId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRow(response.data.data);
    } catch {
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) void fetchRow(id);
  }, [id, token]);

  const handleCancel = async () => {
    if (!id || !row || row.status === 'CANCELLED') return;
    try {
      setIsCancelling(true);
      await axios.post(
        `${Constants.CANCEL_SALES_DEBIT_NOTE_URL}/${id}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Sales debit note cancelled');
      await fetchRow(id);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.message) {
        toast.error(String(error.response.data.message));
      } else {
        toast.error('Failed to cancel sales debit note');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const confirmDelete = async () => {
    if (!id) return;
    try {
      setIsDeleting(true);
      await axios.delete(`${Constants.DELETE_SALES_DEBIT_NOTE_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Sales debit note deleted');
      navigate('/admin/sales-debit-notes');
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.message) {
        toast.error(String(error.response.data.message));
      } else {
        toast.error('Failed to delete sales debit note');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoaderSpinner />
      </div>
    );
  }

  if (notFound || !row) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-10">
        <p className="text-gray-950 font-semibold">Sales debit note not found</p>
        <button
          type="button"
          onClick={() => navigate('/admin/sales-debit-notes')}
          className="bg-gray-200 hover:bg-gray-300 text-gray-950 px-3 py-1 rounded-md shadow"
        >
          Back
        </button>
      </div>
    );
  }

  const items = Array.isArray(row.items) ? row.items : [];
  const dateFmt = systemSettings?.dateFormat.format || 'd-m-Y';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">
            {row.debitNoteNumber || 'Sales Debit Note'}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Against invoice {row.invoice?.invoiceNumber || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {row.status !== 'CANCELLED' && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={isCancelling}
              className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md shadow text-sm disabled:opacity-60"
            >
              {isCancelling ? 'Cancelling…' : 'Cancel note'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-md shadow text-sm"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/sales-debit-notes')}
            className="bg-gray-200 hover:bg-gray-300 text-gray-950 px-3 py-1.5 rounded-md shadow text-sm"
          >
            Back
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Customer</div>
            <div className="font-medium text-gray-950">{row.billToCustomer?.name || '—'}</div>
            {row.billToCustomer?.gstin && (
              <div className="text-gray-600">GSTIN: {row.billToCustomer.gstin}</div>
            )}
          </div>
          <div>
            <div className="text-gray-500">Date</div>
            <div className="font-medium text-gray-950">
              {formatDate(row.debitNoteDate || '', dateFmt)}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Status</div>
            <InvoiceStatusBadge status={row.status} />
          </div>
          <div>
            <div className="text-gray-500">Reason</div>
            <div className="font-medium text-gray-950">{row.reason || '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">Reference</div>
            <div className="font-medium text-gray-950">{row.referenceNo || '—'}</div>
          </div>
          <div>
            <div className="text-gray-500">Total</div>
            <div className="font-semibold text-gray-950">
              {formatMoney(Number(row.totalAmount), row.currencyCode)}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border border-gray-100 rounded-md">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Discount</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id || idx} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-950">{item.name || '—'}</td>
                  <td className="px-3 py-2 text-right">{Number(item.qty || 0)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(Number(item.rate || 0), row.currencyCode)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(Number(item.discount || 0), row.currencyCode)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(Number(item.tax || 0), row.currencyCode)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatMoney(Number(item.amount || 0), row.currencyCode)}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-gray-500">
                    No line items
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col md:flex-row md:justify-between gap-4 text-sm">
          <div className="text-gray-700 whitespace-pre-wrap max-w-xl">
            <div className="text-gray-500 mb-1">Notes</div>
            {row.notes || '—'}
          </div>
          <div className="bg-gray-50 rounded-md p-3 space-y-1 min-w-[220px]">
            <div className="flex justify-between">
              <span>Taxable</span>
              <span>{formatMoney(Number(row.taxableAmount), row.currencyCode)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>{formatMoney(Number(row.totalDiscount || 0), row.currencyCode)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span>{formatMoney(Number(row.vat || 0), row.currencyCode)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
              <span>Total</span>
              <span>{formatMoney(Number(row.totalAmount), row.currencyCode)}</span>
            </div>
          </div>
        </div>
      </div>

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        title="Confirm Deletion"
        message="Delete this sales debit note? The ledger entry will be reversed."
      />
    </div>
  );
};

export default ViewSalesDebitNote;
