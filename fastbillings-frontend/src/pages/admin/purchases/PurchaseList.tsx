import { useEffect, useState, useMemo, type FC } from "react";
import { CirclePlusIcon, Edit, EyeIcon, Sparkles, Trash2Icon } from "lucide-react";
import ScanBillModal from "@components/admin/ai/ScanBillModal";
import { useAiConfig } from "@hooks/useAiConfig";
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
import { hasPermission } from "@utils/hasPermission";
import type { PermissionAction } from "@models/permissions";
import { useCurrencies } from "@hooks/useCurrencies";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import useDateFormatter from "@hooks/useDateFormatter";
import ProfileCard from "@components/admin/ProfileImage";
import { useQuery } from "@tanstack/react-query";
import { fetchModuleHierarchy, fetchCustomFieldsByModule } from "@api/customFieldTypeApi";

interface Purchase {
    id: string;
    purchaseOrderId: string;
    purchaseId: string;
    purchaseDate: string;
    billFrom: string;
    billTo?: {
        id: string;
        name: string;
        email: string;
        phone: string;
        profileImage: string;
    };
    totalAmount: number;
    payment_mode: string;
    status: string;
    createdAt: string;
    currencyCode?: string | null;
    customFields?: Record<string, any>; // <-- Added to support dynamic custom fields
}

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// Helper to safely extract custom field values using the fieldSlug
const extractCustomFieldValue = (purchase: Purchase | any, fieldSlug: string) => {
    if (!purchase.customFields) return '-';
    if (typeof purchase.customFields === 'object') {
        const value = purchase.customFields[fieldSlug];

        if (Array.isArray(value)) {
            return value.length > 0 ? value.join(', ') : '-';
        }

        return value !== undefined && value !== null && String(value).trim() !== '' ? value : '-';
    }
    return '-';
};

const PurchaseList: FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const navigate = useNavigate();

    // State for the list of purchase orders and pagination
    const [purchases, setPurchases] = useState<Purchase[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });

    // State for the delete confirmation modal
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [itemToDelete, setItemToDelete] = useState<Purchase | null>(null);

    // Cluster H, slice H.2 — Scan Bill (AI) modal
    const [showScanBill, setShowScanBill] = useState<boolean>(false);
    const { config: aiConfig } = useAiConfig();

    // Using URL search parameters to manage state for search, limit, and page
    const [searchParams, setSearchParams] = useSearchParams();
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    const { formatMoney } = useCurrencies();
    const { formatDate } = useDateFormatter();

    // --- DYNAMIC CUSTOM FIELDS FETCHING (Inlined) ---
    const { data: moduleHierarchyResponse, isLoading: isModulesLoading } = useQuery({
        queryKey: ['moduleHierarchy'],
        queryFn: () => fetchModuleHierarchy(token!),
        refetchOnMount: false,
        enabled: !!token,
        staleTime: 1000 * 60 * 60
    });

    const purchasesModuleId = useMemo(() => {
        if (!moduleHierarchyResponse?.data) return null;
        for (const mod of moduleHierarchyResponse.data) {
            // Checking both common slug variations just in case
            if (mod.moduleSlug === 'purchases' || mod.moduleSlug === 'purchase') return mod.id;
            if (mod.children) {
                const child = mod.children.find((c: any) => c.moduleSlug === 'purchases' || c.moduleSlug === 'purchase');
                if (child) return child.id;
            }
        }
        return null;
    }, [moduleHierarchyResponse]);

    const { data: customFieldsResponse, isLoading: isCustomFieldsLoading } = useQuery({
        queryKey: ['customFields', purchasesModuleId],
        queryFn: () => fetchCustomFieldsByModule(token!, purchasesModuleId!),
        refetchOnMount: false,
        enabled: !!token && !!purchasesModuleId
    });

    const tableCustomFields = useMemo(() => {
        return customFieldsResponse?.data?.fields?.filter((f: any) => f.showInTable) || [];
    }, [customFieldsResponse]);

    // Construct Dynamic Table Headers
    const baseHeaders = ["#", "Purchase Number", "Purchase Date", "Supplier", "Amount", "Payment Mode", "Created On", "Status"];
    const dynamicHeaders = tableCustomFields.map((f: any) => f.labelName);
    const tableHeaders = [...baseHeaders, ...dynamicHeaders, "Action"];

    // Unified loading state
    const isPageLoading = isLoading || isModulesLoading || isCustomFieldsLoading;
    // ------------------------------------------------

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
    const handleNewPurchaseClick = () => {
        navigate("/admin/purchases/new");
    };

    // Fetch purchases whenever search, limit, or page changes
    useEffect(() => {
        fetchPurchases(search, limit, page);
    }, [search, limit, page, token]);

    const fetchPurchases = async (searchParam?: string, limitParam?: number, pageParam?: number) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.GET_PURCHASE_URL, {
                params: { search: searchParam, limit: limitParam, page: pageParam },
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setPurchases(response.data.data?.purchases ?? []);
            setPagination(response.data.data.pagination ?? { total: 0, page: 1, limit: 10, totalPages: 1 });
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
            toast.error('Failed to fetch purchase orders.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditClick = (item: Purchase) => {
        navigate(`/admin/purchases/edit/${item.id}`);
    };

    const handleDeleteClick = (item: Purchase) => {
        setItemToDelete(item);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_PURCHASE_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Purchase deleted successfully');
            fetchPurchases(search, limit, page);
            setShowDeleteModal(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Failed to delete purchase:', error);
            toast.error('Failed to delete purchase.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleViewClick = (item: Purchase) => {
        navigate(`/admin/purchases/view/${item.id}`);
    }

    const restrictedActions = ['edit', 'delete'];

    const getTableActions = (item: Purchase) => {
        const actions = [
            {
                label: 'Edit',
                icon: <Edit size={14} />,
                onClick: (item: Purchase) => { handleEditClick(item) },
                hideWhen: ['paid', 'partially_paid', 'completed']
            },
            {
                label: 'View',
                icon: <EyeIcon size={14} />,
                onClick: (item: Purchase) => { handleViewClick(item) },
                hideWhen: []
            },
            {
                label: 'Delete',
                icon: <Trash2Icon size={14} />,
                onClick: (item: Purchase) => { handleDeleteClick(item) },
                hideWhen: ['paid', 'partially_paid', 'completed']
            }
        ]

        return actions.filter((action) => {
            const actionLabel = action.label.toLowerCase();

            //Hide if status matches
            if (action.hideWhen?.includes(item.status)) {
                return false;
            }

            //If restricted action, check permission
            if (restrictedActions.includes(actionLabel)) {
                const permissionAction: PermissionAction =
                    actionLabel === 'delete' ? 'delete' : 'edit';
                return hasPermission(permissions, 'purchase-list', permissionAction);
            }

            //Otherwise always allow
            return true;
        });
    }

    // Calculate pagination display text
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Purchases</h1>
                <div className="flex items-center gap-2">
                    {aiConfig?.enabled && hasPermission(permissions, 'purchase-list', 'create') && (
                        <div className="flex items-center gap-1.5">
                            <button
                                onClick={() => setShowScanBill(true)}
                                title="Extract a purchase from a bill with AI · ≈ $0.003 / scan"
                                className="bg-white border border-purple-600 text-purple-700 hover:bg-purple-50 px-2 py-1 rounded-md shadow-sm cursor-pointer flex items-center gap-2">
                                <Sparkles size={14} /> Scan Bill
                            </button>
                            <span className="text-[11px] text-gray-400 whitespace-nowrap">≈ $0.003 / scan</span>
                        </div>
                    )}
                    {hasPermission(permissions, 'purchase-list', 'create') &&
                        <button
                            onClick={handleNewPurchaseClick}
                            className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                            <CirclePlusIcon size={14} /> New Purchase
                        </button>
                    }
                </div>
            </div>

            <ScanBillModal
                isOpen={showScanBill}
                onClose={() => setShowScanBill(false)}
                onConfirmed={(purchaseId) => {
                    setShowScanBill(false);
                    navigate(`/admin/purchases/edit/${purchaseId}`);
                }}
            />

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
                {!isPageLoading && purchases && purchases.map((purchase, index) => (
                    <TableRow
                        key={purchase.id}
                        index={(page - 1) * limit + index + 1}
                        row={purchase}
                        columns={[
                            <span className="text-indigo-600">{purchase.purchaseId}</span>,
                            formatDate(purchase.purchaseDate, systemSettings?.dateFormat.format || 'd-m-Y'),
                            <ProfileCard
                                imageUrl={purchase.billTo?.profileImage}
                                name={purchase.billTo?.name || ''}
                            />,
                            formatMoney(purchase.totalAmount, purchase.currencyCode),
                            <PaymentModeBadge mode={purchase.payment_mode || 'cash'} />,
                            formatDate(purchase.createdAt, systemSettings?.dateFormat.format || 'd-m-Y'),
                            <StatusBadge status={purchase.status} />,

                            // Inject dynamic custom field columns
                            ...tableCustomFields.map((f: any) => (
                                <span key={f.id} className="text-gray-600 font-medium">
                                    {extractCustomFieldValue(purchase, f.fieldSlug || f.id)}
                                </span>
                            ))
                        ]}
                        actions={getTableActions(purchase)}
                        onRowClick={(item) => navigate(`/admin/purchases/view/${item.id}`)}
                    />
                ))}

                {!isPageLoading && purchases.length === 0 && (
                    <tr>
                        <td colSpan={tableHeaders.length} className="text-center py-4 text-gray-950  font-semibold">
                            No purchases found
                        </td>
                    </tr>
                )}

                {isPageLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-6 text-gray-950  font-semibold" colSpan={tableHeaders.length}>
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>

            {/* Pagination Component */}
            {!isPageLoading && pagination.totalPages > 1 && (
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
            )}

            {/* Delete Confirmation Modal */}
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
                title="Confirm Deletion"
                message={`Are you sure you want to delete the purchase ${itemToDelete?.purchaseId}?`}
            >
            </DeleteConfirmationModal>
        </div>
    );
}

export default PurchaseList;