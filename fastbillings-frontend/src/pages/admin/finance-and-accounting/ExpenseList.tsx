import type { RootState } from "@store/index";
import { hasPermission } from "@utils/hasPermission";
import { CirclePlusIcon, Edit, Link, Trash2Icon } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import ExpenseFormModal from "./ExpenseFormModal";
import Constants from "@constants/api";
import axios from "axios";
import type { ExpenseListShape } from "@models/expense";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import type { PermissionAction } from "@models/permissions";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import { toast } from "sonner";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import { useCurrencyFormatter } from "@hooks/useCurrencyFormatter";
import useDateFormatter from "@hooks/useDateFormatter";
import InvoiceStatusBadge from "@components/admin/InvoiceStatusBadge";
import { useQuery } from "@tanstack/react-query";
import { fetchModuleHierarchy, fetchCustomFieldsByModule } from "@api/customFieldTypeApi";

interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface ExpenseResponse {
    success: boolean;
    message: string;
    data: {
        expenses: ExpenseListShape[]
        pagination: Pagination
    }
}

interface FilterParams {
    search?: string;
    limit?: number;
    page?: number;
    supplierId?: string;
}

interface SupplierOption {
    id: string;
    supplier_name: string;
}

// Helper to safely extract custom field values using the fieldSlug
const extractCustomFieldValue = (expense: ExpenseListShape | any, fieldSlug: string) => {
    if (!expense.customFields) return '-';
    if (typeof expense.customFields === 'object') {
        const value = expense.customFields[fieldSlug];

        if (Array.isArray(value)) {
            return value.length > 0 ? value.join(', ') : '-';
        }

        return value !== undefined && value !== null && String(value).trim() !== '' ? value : '-';
    }
    return '-';
};

const ExpenseList: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const { format } = useCurrencyFormatter();
    const { formatDate } = useDateFormatter();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [expenses, setExpenses] = useState<ExpenseListShape[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [filterParams, setFilterParams] = useState<FilterParams>({});
    const { search = '', limit = 10, page = 1, supplierId: supplierIdFilter = '' } = filterParams;
    const [isLoading, setIsLoading] = useState(false);
    const [supplierFilterOptions, setSupplierFilterOptions] = useState<SupplierOption[]>([]);

    const [itemToEdit, setEditingItem] = useState<ExpenseListShape | null>(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteItem, setDeletingItem] = useState<ExpenseListShape | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // --- DYNAMIC CUSTOM FIELDS FETCHING (Inlined) ---
    // 1. Fetch Module Hierarchy & Find Module ID for 'expenses'
    const { data: moduleHierarchyResponse, isLoading: isModulesLoading } = useQuery({
        queryKey: ['moduleHierarchy'],
        queryFn: () => fetchModuleHierarchy(token!),
        refetchOnMount: false,
        enabled: !!token,
        staleTime: 1000 * 60 * 60
    });

    const expensesModuleId = useMemo(() => {
        if (!moduleHierarchyResponse?.data) return null;
        for (const mod of moduleHierarchyResponse.data) {
            if (mod.moduleSlug === 'expenses') return mod.id;
            if (mod.children) {
                const child = mod.children.find((c: any) => c.moduleSlug === 'expenses');
                if (child) return child.id;
            }
        }
        return null;
    }, [moduleHierarchyResponse]);

    // 2. Fetch Custom Fields specifically for the expenses module
    const { data: customFieldsResponse, isLoading: isCustomFieldsLoading } = useQuery({
        queryKey: ['customFields', expensesModuleId],
        queryFn: () => fetchCustomFieldsByModule(token!, expensesModuleId!),
        refetchOnMount: false,
        enabled: !!token && !!expensesModuleId
    });

    // 3. Filter to only include fields marked "showInTable"
    const tableCustomFields = useMemo(() => {
        return customFieldsResponse?.data?.fields?.filter((f: any) => f.showInTable) || [];
    }, [customFieldsResponse]);

    // 4. Construct Dynamic Table Headers
    const baseHeaders = ['#', 'Expense ID', 'Amount', 'Expense Date', 'Vendor', 'Payment Status', 'Created On'];
    const dynamicHeaders = tableCustomFields.map((f: any) => f.labelName);
    const tableHeaders = [...baseHeaders, ...dynamicHeaders, 'Actions'];

    // Unified loading state
    const isPageLoading = isLoading || isModulesLoading || isCustomFieldsLoading;
    // ------------------------------------------------

    useEffect(() => {
        fetchExpenses();
    }, [filterParams, token]);

    useEffect(() => {
        const fetchSupplierFilterOptions = async () => {
            try {
                const response = await axios.get(Constants.GET_SUPPLIERS_URL, {
                    params: { limit: 100, page: 1 },
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.data?.data?.suppliers) {
                    setSupplierFilterOptions(response.data.data.suppliers);
                }
            } catch (error) {
                console.error("Failed to fetch suppliers for filter", error);
            }
        }
        if (token) fetchSupplierFilterOptions();
    }, [token]);

    const fetchExpenses = async () => {
        try {
            setIsLoading(true);
            const params: FilterParams = { ...filterParams };
            if (!params.supplierId) delete params.supplierId;
            const response = await axios.get<ExpenseResponse>(Constants.FETCH_EXPENSES_FOR_LIST_URL, {
                params,
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data.success && response.data.data.expenses) {
                setExpenses(response.data.data.expenses);
                setPagination(response.data.data.pagination);
            }
        } catch (error) {
            console.error("Failed to fetch expenses", error);
        } finally {
            setIsLoading(false);
        }
    }

    const handleCreateClick = () => {
        setIsModalOpen(true);
        setEditingItem(null);
    };

    const handleSuccess = () => {
        setIsModalOpen(false);
        fetchExpenses();
    }

    const handleFilterChange = (key: string, value: string | number) => {
        setFilterParams({ ...filterParams, [key]: value });
    }

    const handleEditClick = (item: ExpenseListShape) => {
        setEditingItem({ ...item });
        setIsModalOpen(true);
    }

    const handleDeleteClick = (item: ExpenseListShape) => {
        setDeletingItem({ ...item });
        setDeleteModalOpen(true);
    }

    const handleDelete = async () => {
        try {
            setIsDeleting(true);
            const response = await axios.delete(`${Constants.DELETE_EXPENSE_URL}/${deleteItem?.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data.success) {
                toast.success(response.data.message);
                setDeleteModalOpen(false);
                fetchExpenses();
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            toast.error('Something went wrong');
        } finally {
            setIsDeleting(false);
        }
    }

    const handleAttachmentClick = (item: ExpenseListShape) => {
        if (item.attachment) {
            window.open(item.attachment, '_blank');
        } else {
            toast.error('No attachment found');
        }
    }

    const tableActions = [
        {
            label: 'Edit',
            icon: <Edit size={14} />,
            onClick: (item: ExpenseListShape) => { handleEditClick(item) }
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: (item: ExpenseListShape) => { handleDeleteClick(item) }
        },
        {
            label: 'View Attachment',
            icon: <Link size={14} />,
            onClick: (item: ExpenseListShape) => { handleAttachmentClick(item) }
        }
    ];

    const restrictedActions = ['edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        let actionaLabel = action.label.toLowerCase();
        if (restrictedActions.includes(actionaLabel)) {
            const actionKey = actionaLabel.toLowerCase() as PermissionAction;
            return hasPermission(permissions, 'expenses', actionKey);
        }
        return true;
    });

    if (allowedActions.length === 0) tableHeaders.pop();

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Expenses</h1>
                {hasPermission(permissions, 'expenses', 'create') &&
                    <button
                        onClick={() => { handleCreateClick(); }}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                        <CirclePlusIcon size={14} /> New Expense
                    </button>
                }
            </div>

            {/* Search Input & PageLength */}
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2 flex-1 mr-2">
                    <input
                        type="text"
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => handleFilterChange('search', e.target.value)}
                        className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    />
                    <select
                        value={supplierIdFilter}
                        onChange={(e) => handleFilterChange('supplierId', e.target.value)}
                        className="border border-gray-300 px-3 py-2 rounded-md bg-white text-gray-950 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                    >
                        <option value="">All Vendors</option>
                        {supplierFilterOptions.map((s) => (
                            <option key={s.id} value={s.id}>{s.supplier_name}</option>
                        ))}
                    </select>
                </div>
                <select
                    value={limit}
                    onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-950 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            <Table headers={tableHeaders}>
                {!isPageLoading && expenses && expenses.map((expense, index) => (
                    <TableRow
                        key={expense.id}
                        row={expense}
                        index={(page - 1) * limit + index + 1}
                        columns={[
                            <span className="text-indigo-600 font-medium">{expense.expenseId}</span>,
                            <span className="font-semibold text-gray-700">{format(expense.amount)}</span>,
                            formatDate(expense.expenseDate, systemSettings?.dateFormat.format || 'd-m-Y'),
                            <span className="text-gray-700">{expense.supplier?.name ?? '—'}</span>,
                            <InvoiceStatusBadge status={expense.paymentStatus} />,
                            formatDate(expense.createdAt, systemSettings?.dateFormat.format || 'd-m-Y'),

                            ...tableCustomFields.map((f: any) => (
                                <span key={f.id} className="text-gray-600 font-medium">
                                    {extractCustomFieldValue(expense, f.fieldSlug || f.id)}
                                </span>
                            ))
                        ]}
                        actions={allowedActions && allowedActions.length > 0 ? allowedActions : undefined}
                        onRowClick={(item) => handleEditClick(item)}
                    />
                ))}

                {!isPageLoading && expenses && expenses.length === 0 && (
                    <tr>
                        <td colSpan={tableHeaders.length} className="text-center text-gray-500 py-6 font-medium">No Records Found</td>
                    </tr>
                )}

                {isPageLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-6 text-gray-950 font-semibold" colSpan={tableHeaders.length}>
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
                    onChange={(_, newPage) => handleFilterChange('page', newPage)}
                    paginationVariant="outlined"
                    paginationShape="rounded"
                />
            )}

            {/* Expense Form Modal */}
            {isModalOpen &&
                <ExpenseFormModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => handleSuccess()}
                    editItem={itemToEdit || undefined}
                />
            }

            <DeleteConfirmationModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleDelete}
                title="Delete Expense"
                message="Are you sure you want to delete this expense?"
                isDeleting={isDeleting}
            ></DeleteConfirmationModal>
        </div>
    );
};

export default ExpenseList;