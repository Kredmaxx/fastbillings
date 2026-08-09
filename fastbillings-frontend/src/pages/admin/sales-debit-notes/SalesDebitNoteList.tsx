import DeleteConfirmationModal from '@components/admin/DeleteConfirmationModal';
import InvoiceStatusBadge from '@components/admin/InvoiceStatusBadge';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import NoRecords from '@components/admin/NoRecords';
import PaginationWrapper from '@components/admin/PaginationWrapper';
import Table from '@components/admin/Table';
import TableRow from '@components/admin/TableRow';
import Constants from '@constants/api';
import { useCurrencies } from '@hooks/useCurrencies';
import useDateFormatter from '@hooks/useDateFormatter';
import type { PermissionAction } from '@models/permissions';
import type { RootState } from '@store/index';
import { hasPermission } from '@utils/hasPermission';
import axios from 'axios';
import { CirclePlusIcon, Eye, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

interface SalesDebitNoteRow {
  id: string;
  debitNoteNumber: string | null;
  debitNoteDate: string | null;
  status: string;
  totalAmount: number | string;
  currencyCode?: string | null;
  createdAt: string;
  invoice?: { id: string; invoiceNumber: string | null } | null;
  billToCustomer?: { id: string; name: string | null; gstin?: string | null } | null;
}

interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const SalesDebitNoteList: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useSelector((state: RootState) => state.auth);
  const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
  const permissions = systemSettings?.permissions || [];
  const [rows, setRows] = useState<SalesDebitNoteRow[]>([]);
  const [itemToDelete, setItemToDelete] = useState<SalesDebitNoteRow | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const { formatDate } = useDateFormatter();
  const { formatMoney } = useCurrencies();
  const search = searchParams.get('search') || '';
  const limit = Number(searchParams.get('limit') || 10);
  const page = Number(searchParams.get('page') || 1);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRows = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(Constants.SALES_DEBIT_NOTE_LIST_URL, {
        params: { search, limit, page },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data.data;
      setRows(data?.salesDebitNotes ?? []);
      if (data?.pagination) setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching sales debit notes:', error);
      toast.error('Failed to load sales debit notes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
  }, [search, limit, page, token]);

  const handleSearch = (value: string) => {
    setSearchParams({ search: value, limit: String(limit), page: '1' });
  };

  const handlePageLengthChange = (value: number) => {
    setSearchParams({ search, limit: String(value), page: '1' });
  };

  const handlePageChange = (nextPage: number) => {
    setSearchParams({
      search: search || '',
      limit: limit ? String(limit) : '10',
      page: String(nextPage),
    });
  };

  const tableActions = [
    {
      label: 'View',
      icon: <Eye size={14} />,
      onClick: (item: SalesDebitNoteRow) => navigate(`/admin/sales-debit-notes/view/${item.id}`),
    },
    {
      label: 'Delete',
      icon: <Trash2Icon size={14} />,
      onClick: (item: SalesDebitNoteRow) => {
        setItemToDelete(item);
        setShowDeleteModal(true);
      },
    },
  ];

  const tableHeaders = ['#', 'Debit Note', 'Invoice', 'Customer', 'Amount', 'Date', 'Status', 'Actions'];
  const restrictedActions = ['delete'];
  const allowedActions = tableActions.filter((action) => {
    const actionLabel = action.label.toLowerCase() as PermissionAction;
    if (!restrictedActions.includes(actionLabel)) return true;
    return hasPermission(permissions, 'credit-notes', actionLabel);
  });

  if (allowedActions.length === 0) tableHeaders.pop();

  const confirmDelete = async () => {
    try {
      setIsDeleting(true);
      await axios.delete(`${Constants.DELETE_SALES_DEBIT_NOTE_URL}/${itemToDelete?.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Sales debit note deleted');
      setShowDeleteModal(false);
      await fetchRows();
    } catch (error) {
      console.error('Failed to delete sales debit note:', error);
      toast.error('Failed to delete sales debit note');
    } finally {
      setIsDeleting(false);
    }
  };

  const from = (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-950">Sales Debit Notes</h1>
        {hasPermission(permissions, 'credit-notes', 'create') && (
          <button
            type="button"
            onClick={() => navigate('/admin/sales-debit-notes/new')}
            className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
          >
            <CirclePlusIcon size={14} /> New Sales Debit Note
          </button>
        )}
      </div>

      <div className="flex justify-between items-center">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64 text-gray-950 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
        />
        <select
          value={limit}
          onChange={(e) => handlePageLengthChange(Number(e.target.value))}
          className="border border-gray-300 px-3 py-2 rounded-md bg-white text-gray-950 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
        >
          {[10, 25, 50].map((num) => (
            <option className="text-gray-950" key={num} value={num}>
              {num} / page
            </option>
          ))}
        </select>
      </div>

      <Table headers={tableHeaders}>
        {!isLoading &&
          rows.map((row, index) => (
            <TableRow
              key={row.id}
              index={(page - 1) * limit + index + 1}
              row={row}
              columns={[
                <span className="text-indigo-600">{row.debitNoteNumber || '—'}</span>,
                <span className="text-gray-950">{row.invoice?.invoiceNumber || '—'}</span>,
                <span className="text-gray-950">{row.billToCustomer?.name || '—'}</span>,
                <span className="font-semibold text-gray-950">
                  {formatMoney(Number(row.totalAmount), row.currencyCode)}
                </span>,
                <span className="font-semibold text-gray-950">
                  {formatDate(
                    row.debitNoteDate || row.createdAt,
                    systemSettings?.dateFormat.format || 'd-m-Y',
                  )}
                </span>,
                <InvoiceStatusBadge status={row.status} />,
              ]}
              actions={allowedActions.length > 0 ? allowedActions : undefined}
              onRowClick={(item) => navigate(`/admin/sales-debit-notes/view/${item.id}`)}
            />
          ))}
        {!isLoading && rows.length === 0 && (
          <NoRecords colSpan={8} message="No sales debit notes found" />
        )}
        {isLoading && (
          <tr key="table-loader">
            <td className="text-center py-1 text-gray-950 font-semibold" colSpan={8}>
              <LoaderSpinner />
            </td>
          </tr>
        )}
      </Table>

      <PaginationWrapper
        count={pagination.totalPages}
        page={page}
        from={from}
        to={to}
        total={pagination.total}
        onChange={(_, newPage) => handlePageChange(newPage)}
        paginationVariant="outlined"
        paginationShape="rounded"
      />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        isDeleting={isDeleting}
        title="Confirm Deletion"
        message="Are you sure you want to delete this sales debit note?"
      />
    </div>
  );
};

export default SalesDebitNoteList;
