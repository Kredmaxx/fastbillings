import { Eye } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import Table from "@components/admin/Table";
import Modal from "@components/admin/Modal";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import { useEffect, useState, type FC, type ReactNode } from "react";
import { toast } from "sonner";
import axios from "axios";
import TableRow from "@components/admin/TableRow";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import NoRecords from "@components/admin/NoRecords";
import useDateFormatter from "@hooks/useDateFormatter";
import type {
    GatewayKind,
    PaymentTransactionDetail,
    PaymentTransactionStatus,
    PaymentTransactionSummary,
    RefundSummary,
} from "@models/payment";

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

type StatusFilter = 'all' | 'CREATED' | 'CAPTURED' | 'FAILED' | 'REFUNDED';

const gatewayBadgeClasses = (kind: GatewayKind): string => {
    switch (kind) {
        case 'RAZORPAY':
            return 'bg-indigo-100 text-indigo-700';
        case 'STRIPE':
            return 'bg-purple-100 text-purple-700';
        case 'OFFLINE':
        default:
            return 'bg-gray-100 text-gray-700';
    }
};

const statusBadgeClasses = (status: PaymentTransactionStatus): string => {
    switch (status) {
        case 'CAPTURED':
            return 'bg-green-100 text-green-700';
        case 'FAILED':
            return 'bg-red-100 text-red-700';
        case 'REFUNDED':
        case 'PARTIALLY_REFUNDED':
            return 'bg-gray-200 text-gray-700';
        case 'PENDING':
        case 'CREATED':
        default:
            return 'bg-amber-100 text-amber-700';
    }
};

const formatAmount = (amount: string | number, currency: string): string => {
    const numeric = typeof amount === 'string' ? Number(amount) : amount;
    const safe = Number.isFinite(numeric) ? numeric : 0;
    return `${currency} ${safe.toFixed(2)}`;
};

const DetailRow: FC<{ label: string; value: ReactNode }> = ({ label, value }) => (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm">
        <span className="text-gray-500 shrink-0">{label}</span>
        <span className="text-gray-800 font-medium text-right break-all">{value}</span>
    </div>
);

const PaymentTransactionList: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [transactions, setTransactions] = useState<PaymentTransactionSummary[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const { token } = useSelector((state: RootState) => state.auth);
    const { formatDate } = useDateFormatter();
    const [isLoading, setIsLoading] = useState(false);
    const [viewTransaction, setViewTransaction] = useState<PaymentTransactionSummary | null>(null);
    const [transactionDetail, setTransactionDetail] = useState<PaymentTransactionDetail | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);

    const closeDetailModal = () => {
        setViewTransaction(null);
        setTransactionDetail(null);
    };

    const handleViewClick = async (item: PaymentTransactionSummary) => {
        setViewTransaction(item);
        setTransactionDetail(null);
        setIsDetailLoading(true);
        try {
            const response = await axios.get(`${Constants.GET_PAYMENT_TRANSACTION_URL}/${item.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setTransactionDetail(response.data?.data?.paymentTransaction ?? null);
        } catch (error) {
            console.error('Error fetching payment transaction detail:', error);
            toast.error('Failed to load transaction details.');
            setViewTransaction(null);
        } finally {
            setIsDetailLoading(false);
        }
    };

    const displayedTransaction = transactionDetail ?? viewTransaction;

    const tableActions = [
        {
            label: 'View',
            icon: <Eye size={14} />,
            onClick: (item: PaymentTransactionSummary) => { handleViewClick(item); },
        },
    ];

    const tableHeaders = ['#', 'Date', 'Invoice', 'Gateway', 'Status', 'Amount', 'Actions'];

    const fetchTransactions = async (
        searchValue?: string,
        limitValue?: number,
        pageValue?: number,
        statusValue?: StatusFilter,
    ) => {
        try {
            setIsLoading(true);
            const params: Record<string, string | number> = {
                limit: limitValue ?? 10,
                page: pageValue ?? 1,
            };
            if (searchValue && searchValue.trim()) {
                params.search = searchValue.trim();
            }
            if (statusValue && statusValue !== 'all') {
                params.status = statusValue;
            }
            const response = await axios.get(Constants.GET_PAYMENT_TRANSACTIONS_URL, {
                params,
                headers: { 'Authorization': `Bearer ${token}` },
            });
            setTransactions(response.data?.data?.paymentTransactions || []);
            setPagination(
                response.data?.data?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 },
            );
        } catch (error) {
            console.error('Error fetching payment transactions:', error);
            toast.error('Failed to fetch payment transactions.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions(search, limit, page, statusFilter);
    }, [search, limit, page, statusFilter]);

    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    const handleStatusFilterChange = (opt: StatusFilter) => {
        setStatusFilter(opt);
        setSearchParams({ search, limit: String(limit), page: '1' });
    };

    const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    // Search by invoice number (client-side filter on the page since the backend
    // doesn't yet support a free-text search param for payment transactions).
    const visibleTransactions = search.trim()
        ? transactions.filter((t) => {
            const inv = t.invoice?.invoiceNumber || '';
            return inv.toLowerCase().includes(search.trim().toLowerCase());
        })
        : transactions;

    const statusFilters: StatusFilter[] = ['all', 'CREATED', 'CAPTURED', 'FAILED', 'REFUNDED'];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Payment Transactions</h1>
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
                        <option className="text-gray-800" key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            {/* Status filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
                {statusFilters.map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => handleStatusFilterChange(opt)}
                        className={
                            'px-3 py-1 text-sm rounded-full border cursor-pointer ' +
                            (statusFilter === opt
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                        }
                    >
                        {opt === 'all' ? 'All' : opt}
                    </button>
                ))}
            </div>

            {/* Table */}
            <Table headers={tableHeaders}>
                {!isLoading && visibleTransactions && visibleTransactions.map((tx, index) => (
                    <TableRow
                        key={tx.id}
                        index={index + 1}
                        row={tx}
                        columns={[
                            formatDate(tx.createdAt),
                            tx.invoice && tx.invoice.id
                                ? (
                                    <Link
                                        to={`/admin/invoices/edit-invoice/${tx.invoice.id}`}
                                        className="text-purple-600 hover:underline"
                                    >
                                        {tx.invoice.invoiceNumber ?? tx.invoice.id.slice(0, 8)}
                                    </Link>
                                )
                                : '—',
                            <span
                                className={
                                    'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                                    gatewayBadgeClasses(tx.kind)
                                }
                            >
                                {tx.kind}
                            </span>,
                            <span
                                className={
                                    'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                                    statusBadgeClasses(tx.status)
                                }
                            >
                                {tx.status}
                            </span>,
                            formatAmount(tx.amount, tx.currency),
                        ]}
                        actions={tableActions}
                    />
                ))}
                {!isLoading && !visibleTransactions.length &&
                    <NoRecords colSpan={7} message="No payment transactions found" />
                }
                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-1 text-gray-950 font-semibold" colSpan={7}>
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>

            {/* Pagination */}
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

            {viewTransaction && displayedTransaction && (
                <Modal
                    isOpen={!!viewTransaction}
                    onClose={closeDetailModal}
                    title={`Transaction ${displayedTransaction.id.slice(0, 8)}`}
                    size="lg"
                >
                    {isDetailLoading ? (
                        <div className="py-8 flex justify-center">
                            <LoaderSpinner />
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <DetailRow label="Transaction ID" value={displayedTransaction.id} />
                                <DetailRow
                                    label="Date"
                                    value={formatDate(displayedTransaction.createdAt)}
                                />
                                {transactionDetail?.updatedAt && (
                                    <DetailRow
                                        label="Last Updated"
                                        value={formatDate(transactionDetail.updatedAt)}
                                    />
                                )}
                                <DetailRow
                                    label="Invoice"
                                    value={
                                        displayedTransaction.invoice?.id ? (
                                            <Link
                                                to={`/admin/invoices/edit-invoice/${displayedTransaction.invoice.id}`}
                                                className="text-purple-600 hover:underline"
                                                onClick={closeDetailModal}
                                            >
                                                {displayedTransaction.invoice.invoiceNumber
                                                    ?? displayedTransaction.invoice.id.slice(0, 8)}
                                            </Link>
                                        ) : '—'
                                    }
                                />
                                <DetailRow
                                    label="Gateway"
                                    value={
                                        <span
                                            className={
                                                'inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ' +
                                                gatewayBadgeClasses(displayedTransaction.kind)
                                            }
                                        >
                                            {displayedTransaction.kind}
                                        </span>
                                    }
                                />
                                <DetailRow
                                    label="Status"
                                    value={
                                        <span
                                            className={
                                                'inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ' +
                                                statusBadgeClasses(displayedTransaction.status)
                                            }
                                        >
                                            {displayedTransaction.status}
                                        </span>
                                    }
                                />
                                <DetailRow
                                    label="Amount"
                                    value={formatAmount(displayedTransaction.amount, displayedTransaction.currency)}
                                />
                                <DetailRow
                                    label="Gateway Order ID"
                                    value={displayedTransaction.gatewayOrderId ?? '—'}
                                />
                                <DetailRow
                                    label="Gateway Payment ID"
                                    value={displayedTransaction.gatewayPaymentId ?? '—'}
                                />
                            </div>

                            {transactionDetail?.refunds && transactionDetail.refunds.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Refunds</h3>
                                    <div className="space-y-2">
                                        {transactionDetail.refunds.map((refund: RefundSummary) => (
                                            <div
                                                key={refund.id}
                                                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                                            >
                                                <div className="flex justify-between gap-2">
                                                    <span className="text-gray-600">
                                                        {formatAmount(refund.amount, displayedTransaction.currency)}
                                                    </span>
                                                    <span
                                                        className={
                                                            'inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium ' +
                                                            statusBadgeClasses(refund.status)
                                                        }
                                                    >
                                                        {refund.status}
                                                    </span>
                                                </div>
                                                {refund.reason && (
                                                    <p className="text-gray-500 mt-1">{refund.reason}</p>
                                                )}
                                                <p className="text-gray-400 text-xs mt-1">
                                                    {formatDate(refund.createdAt)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {transactionDetail?.metadata && Object.keys(transactionDetail.metadata).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-700 mb-1">Metadata</h3>
                                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-auto max-h-40">
                                        {JSON.stringify(transactionDetail.metadata, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            )}
        </div>
    );
};

export default PaymentTransactionList;
