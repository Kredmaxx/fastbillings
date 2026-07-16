import { Edit, PauseCircle, PlayCircle, PlayIcon, ListIcon } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Table from "@components/admin/Table";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import TableRow from "@components/admin/TableRow";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import NoRecords from "@components/admin/NoRecords";
import useDateFormatter from "@hooks/useDateFormatter";
import type { RecurringInvoiceSummary, ChildInvoiceSummary } from "@models/recurringInvoice";

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const formatFrequency = (row: RecurringInvoiceSummary): string => {
    if (!row.repeatEvery) return '—';
    if (row.repeatEvery === 'custom') {
        const n = row.customIntervalNumber ?? 0;
        const t = row.customIntervalType ?? 'day';
        return `Every ${n} ${t}(s)`;
    }
    return capitalize(row.repeatEvery);
};

const RecurringInvoiceList: React.FC = () => {
    const { formatDate } = useDateFormatter();
    const [searchParams, setSearchParams] = useSearchParams();
    const [recurringInvoices, setRecurringInvoices] = useState<RecurringInvoiceSummary[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const navigate = useNavigate();
    const { token } = useSelector((state: RootState) => state.auth);
    const [isLoading, setIsLoading] = useState(false);
    const [busyRowId, setBusyRowId] = useState<string | null>(null);

    const [viewingChildrenOf, setViewingChildrenOf] = useState<RecurringInvoiceSummary | null>(null);
    const [children, setChildren] = useState<ChildInvoiceSummary[]>([]);
    const [childrenLoading, setChildrenLoading] = useState(false);

    const fetchRecurringInvoices = async (
        searchValue?: string,
        limitValue?: number,
        pageValue?: number,
    ) => {
        try {
            setIsLoading(true);
            const params: Record<string, string | number> = {
                search: searchValue ?? '',
                limit: limitValue ?? 10,
                page: pageValue ?? 1,
            };
            const response = await axios.get(Constants.GET_RECURRING_INVOICES_URL, {
                params,
                headers: { 'Authorization': `Bearer ${token}` },
            });
            setRecurringInvoices(response.data.data?.recurringInvoices || []);
            setPagination(response.data.data?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
        } catch (error) {
            console.error("Error fetching recurring invoices:", error);
            toast.error("Failed to fetch recurring invoices.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRecurringInvoices(search, limit, page);
    }, [search, limit, page]);

    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    const handleEditClick = (row: RecurringInvoiceSummary) => {
        navigate(`/admin/invoices/edit-invoice/${row.id}`);
    };

    const handleStopResume = async (row: RecurringInvoiceSummary) => {
        if (busyRowId) return;
        try {
            setBusyRowId(row.id);
            await axios.patch(
                `${Constants.SET_RECURRING_STATUS_URL}/${row.id}/recurring-status`,
                { stopped: !row.stopped },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success(row.stopped ? 'Schedule resumed' : 'Schedule stopped');
            await fetchRecurringInvoices(search, limit, page);
        } catch (error) {
            const msg = axios.isAxiosError(error)
                ? (error.response?.data as { message?: string } | undefined)?.message
                : null;
            console.error('Error toggling stopped:', error);
            toast.error(msg ?? 'Failed to update');
        } finally {
            setBusyRowId(null);
        }
    };

    const handleRunNow = async (row: RecurringInvoiceSummary) => {
        if (busyRowId) return;
        try {
            setBusyRowId(row.id);
            const resp = await axios.post(
                `${Constants.RUN_RECURRING_NOW_URL}/${row.id}/run-recurring-now`,
                {},
                { headers: { 'Authorization': `Bearer ${token}` } },
            );
            if (resp.status === 201) {
                const newNum = resp.data?.data?.newInvoiceNumber ?? '';
                toast.success(`Created ${newNum}`);
                await fetchRecurringInvoices(search, limit, page);
            }
        } catch (error: unknown) {
            const msg =
                (axios.isAxiosError(error) && error.response?.data?.message) ||
                'Failed to run recurring iteration.';
            console.error('Error running recurring now:', error);
            toast.error(msg);
        } finally {
            setBusyRowId(null);
        }
    };

    const handleViewChildren = async (row: RecurringInvoiceSummary) => {
        setViewingChildrenOf(row);
        setChildren([]);
        try {
            setChildrenLoading(true);
            const resp = await axios.get(
                `${Constants.GET_INVOICE_CHILDREN_URL}/${row.id}/children`,
                { headers: { 'Authorization': `Bearer ${token}` } },
            );
            setChildren(resp.data?.data?.children || []);
        } catch (error) {
            console.error('Error fetching children:', error);
            toast.error('Failed to fetch child invoices.');
        } finally {
            setChildrenLoading(false);
        }
    };

    const tableActions = [
        {
            label: 'Edit schedule',
            icon: <Edit size={14} />,
            onClick: (row: RecurringInvoiceSummary) => { handleEditClick(row); },
        },
        {
            label: 'Stop',
            icon: <PauseCircle size={14} />,
            onClick: (row: RecurringInvoiceSummary) => { void handleStopResume(row); },
        },
        {
            label: 'Resume',
            icon: <PlayCircle size={14} />,
            onClick: (row: RecurringInvoiceSummary) => { void handleStopResume(row); },
        },
        {
            label: 'Run now',
            icon: <PlayIcon size={14} />,
            onClick: (row: RecurringInvoiceSummary) => { void handleRunNow(row); },
        },
        {
            label: 'View children',
            icon: <ListIcon size={14} />,
            onClick: (row: RecurringInvoiceSummary) => { void handleViewChildren(row); },
        },
    ];

    const buildActionsFor = (row: RecurringInvoiceSummary) => {
        return tableActions.filter((a) => {
            if (a.label === 'Stop') return !row.stopped;
            if (a.label === 'Resume') return row.stopped;
            return true;
        });
    };

    const tableHeaders = ['#', 'Invoice #', 'Customer', 'Frequency', 'Next run', 'Last run', 'Children', 'Status', 'Actions'];

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 ">Recurring Invoices</h1>
            </div>

            {/* Search Input & PageLength */}
            <div className="flex justify-between items-center">
                <input
                    type="text"
                    placeholder="Search by invoice number..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-80 text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
                <select
                    value={limit}
                    onChange={(e) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-800 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <Table headers={tableHeaders}>
                {!isLoading && recurringInvoices && recurringInvoices.map((row, index) => (
                    <TableRow
                        key={row.id}
                        index={index + 1}
                        row={row}
                        columns={[
                            row.invoiceNumber
                                ? (
                                    <Link
                                        to={`/admin/invoices/edit-invoice/${row.id}`}
                                        className="text-purple-600 hover:underline"
                                    >
                                        {row.invoiceNumber}
                                    </Link>
                                )
                                : '—',
                            row.customer
                                ? (
                                    <Link
                                        to={`/admin/customers/edit/${row.customer.id}`}
                                        className="text-purple-600 hover:underline"
                                    >
                                        {row.customer.name}
                                    </Link>
                                )
                                : '—',
                            formatFrequency(row),
                            formatDate(row.nextRecurringDate),
                            formatDate(row.lastRecurringDate),
                            row.childrenCount,
                            <span
                                className={
                                    'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                                    (!row.stopped
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-700')
                                }
                            >
                                {!row.stopped ? 'Active' : 'Stopped'}
                            </span>,
                        ]}
                        actions={buildActionsFor(row)}
                    />
                ))}
                {!isLoading && !recurringInvoices.length &&
                    <NoRecords colSpan={9} message="No recurring invoices found" />
                }
                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-1 text-gray-950 font-semibold" colSpan={9}>
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>

            {/* Pagination Component */}
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

            {viewingChildrenOf && (
                <div
                    className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
                    onClick={() => setViewingChildrenOf(null)}
                >
                    <div
                        className="bg-white rounded-md p-4 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-medium mb-3">
                            Children of {viewingChildrenOf.invoiceNumber ?? '—'}
                        </h3>
                        {childrenLoading && <LoaderSpinner />}
                        {!childrenLoading && children.length === 0 && (
                            <p className="text-sm text-gray-500">No children yet.</p>
                        )}
                        {!childrenLoading && children.length > 0 && (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b">
                                        <th className="py-2">#</th>
                                        <th>Invoice</th>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {children.map((c, idx) => (
                                        <tr key={c.id} className="border-b">
                                            <td className="py-2">{idx + 1}</td>
                                            <td>
                                                <Link
                                                    className="text-purple-700 underline"
                                                    to={`/admin/invoices/edit-invoice/${c.id}`}
                                                >
                                                    {c.invoiceNumber ?? '—'}
                                                </Link>
                                            </td>
                                            <td>{formatDate(c.invoiceDate)}</td>
                                            <td>{c.status}</td>
                                            <td>{c.TotalAmount ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div className="text-right mt-3">
                            <button
                                type="button"
                                onClick={() => setViewingChildrenOf(null)}
                                className="px-3 py-1 text-sm border rounded"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RecurringInvoiceList;
