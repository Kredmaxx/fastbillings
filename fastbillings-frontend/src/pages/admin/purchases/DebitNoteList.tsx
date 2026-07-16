import { useEffect, useState, type FC } from "react";
import { CirclePlusIcon, Eye, Trash2Icon } from "lucide-react";
import Table from "@components/admin/Table";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import TableRow from "@components/admin/TableRow";
import { toast } from "sonner";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import StatusBadge from "@components/admin/StatusBadge";
import PaymentModeBadge from "@components/admin/PaymentModeBadge";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import { useCurrencies } from "@hooks/useCurrencies";
import type { PermissionAction } from "@models/permissions";
import { hasPermission } from "@utils/hasPermission";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import useDateFormatter from "@hooks/useDateFormatter";
import ProfileCard from "@components/admin/ProfileImage";

interface DebitNoteList {
    id: string;
    debitNoteId: string;
    referenceNo: string;
    vendor: {
        id: string;
        name: string;
        email: string;
        phone: string;
        profileImage: string | null;
    };
    purchase: {
        id: string;
        purchaseId: string;
        purchaseDate: string;
        totalAmount: number;
    };
    paymentMode?: {
        id: string;
        name: string;
        slug: string;
    };
    debitNoteDate: string;
    status: string;
    totalAmount: number;
    currencyCode?: string | null;
    paidAmount: number;
    balanceAmount: number;
    sign_type: string;
    signatureName: string | null;
    signatureImage: string | null;
    notes: string;
    createdBy: {
        id: string;
        name: string;
    };
    approvedBy?: {
        id: string;
        name: string;
    };
    createdAt: string;
    updatedAt: string;
}

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

const DebitNoteList: FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const navigate = useNavigate();
    const { formatMoney } = useCurrencies();
    const { formatDate } = useDateFormatter();
    // State for the list of purchase orders and pagination
    const [debitNotes, setDebitNotes] = useState<DebitNoteList[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });

    // State for the delete confirmation modal
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [itemToDelete, setItemToDelete] = useState<DebitNoteList | null>(null);

    // Using URL search parameters to manage state for search, limit, and page
    const [searchParams, setSearchParams] = useSearchParams();
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);
    // Handlers for updating URL search parameters
    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    // Handler to navigate to the 'new purchase order' page
    const handleNewDebitNoteClick = () => {
        navigate("/admin/debit-notes/new");
    };

    // Fetch debitNotes whenever search, limit, or page changes
    useEffect(() => {
        fetchDebitNotes(search, limit, page);
    }, [search, limit, page, token]);

    const fetchDebitNotes = async (search?: string, limit?: number, page?: number) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.FETCH_FOR_DEBIT_NOTE_LIST_URL, {
                params: { search, limit, page },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setDebitNotes(response.data.data?.debitNotes ?? []);
            setPagination(response.data.data.pagination ?? { total: 0, page: 1, limit: 10, totalPages: 1 });
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
            toast.error('Failed to fetch purchase orders.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleViewClick = (item: DebitNoteList) => {
        navigate(`/admin/debit-notes/view/${item.id}`);
    };

    const handleDeleteClick = (item: DebitNoteList) => {
        setItemToDelete(item);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_DEBIT_NOTE_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Debit note deleted successfully');
            fetchDebitNotes(search, limit, page);
            setShowDeleteModal(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Failed to delete debit note:', error);
            toast.error('Failed to delete debit note.');
        } finally {
            setIsDeleting(false);
        }
    };

    const tableActions = [
        {
            label: 'View',
            icon: <Eye size={14} />,
            onClick: (item: DebitNoteList) => { handleViewClick(item) }
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: (item: DebitNoteList) => { handleDeleteClick(item) }
        }
    ];

    const tableHeaders = ["#", "Debit Note ID", "Purchase ID", "Debit Note Date", "Supplier", "Amount", "Payment Mode", "Created On", "Status", "Action"];
    const restrictedActions = ['view', 'edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        const actionLabel = action.label.toLowerCase() as PermissionAction;
        if (!restrictedActions.includes(actionLabel)) {
            return true;
        }
        return hasPermission(permissions, 'debit-notes', actionLabel);
    });

    if (allowedActions.length === 0) {
        tableHeaders.pop();
    }
    // Calculate pagination display text
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Debit Notes (Purchase Returns)</h1>
                {hasPermission(permissions, 'debit-notes', 'create') && (
                    <button
                        onClick={handleNewDebitNoteClick}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                        <CirclePlusIcon size={14} /> New Debit Note
                    </button>
                )}
            </div>

            {/* Search Input & PageLength */}
            <div className="flex justify-between items-center">
                <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
                <select
                    value={limit}
                    onChange={(e) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-950 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            <Table headers={tableHeaders}>
                {!isLoading && debitNotes && debitNotes.map((debitNote, index) => (
                    <TableRow
                        key={debitNote.id}
                        index={(page - 1) * limit + index + 1}
                        row={debitNote}
                        columns={[
                            <span className="text-indigo-600">{debitNote.debitNoteId}</span>,
                            debitNote.purchase?.purchaseId || "",
                            formatDate(debitNote.debitNoteDate, systemSettings?.dateFormat.format || 'd-m-Y'),
                            <ProfileCard
                                imageUrl={debitNote.vendor?.profileImage}
                                name={debitNote.vendor.name}
                            />,
                            formatMoney(debitNote.totalAmount, debitNote.currencyCode),
                            <PaymentModeBadge mode={debitNote.paymentMode?.name ?? "NA"} />,
                            formatDate(debitNote.createdAt, systemSettings?.dateFormat.format || 'd-m-Y'),
                            <StatusBadge status={debitNote.status} />,
                        ]}
                        actions={allowedActions.length > 0 ? allowedActions : undefined}
                        onRowClick={(item) => navigate(`/admin/debit-notes/view/${item.id}`)}
                    />
                ))}

                {!isLoading && debitNotes.length === 0 && (
                    <tr>
                        <td colSpan={8} className="text-center py-4 text-gray-950  font-semibold">
                            No debit notes found
                        </td>
                    </tr>
                )}

                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-2 text-gray-950  font-semibold" colSpan={8}>
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

            {/* Delete Confirmation Modal */}

            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
                title="Confirm Deletion"
                message="Are you sure you want to delete this debit note?"
            >
            </DeleteConfirmationModal>
        </div>
    );
}

export default DebitNoteList;