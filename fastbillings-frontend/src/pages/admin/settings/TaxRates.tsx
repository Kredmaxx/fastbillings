import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Constants from "../../../constants/api";
import axios, { AxiosError } from "axios";
import Table from "../../../components/admin/Table";
import PaginationWrapper from "../../../components/admin/PaginationWrapper";
import { EditIcon, Trash2Icon, CirclePlusIcon } from "lucide-react";
import { toast } from "sonner";
import Modal from "../../../components/admin/Modal";
import { useSelector } from "react-redux";
import type { RootState } from "../../../store";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import TableRow from "@components/admin/TableRow";
import type { PermissionAction } from "@models/permissions";
import { hasPermission } from "@utils/hasPermission";
import SubmitButton from "@components/admin/SubmitButton";
import useDateFormatter from "@hooks/useDateFormatter";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";

// Define an interface for the Tax Rate object for type safety
interface ITaxRate {
    id: string;
    tax_name: string;
    tax_rate: number;
    status: boolean;
    createdAt: string;
}

// Interface for pagination data from the API
interface TaxRatePagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}


// Define the shape of form errors
interface FormErrors {
    tax_name?: string;
    tax_rate?: string;
}

const TaxRateList: React.FC = () => {
    // Hooks
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [searchParams, setSearchParams] = useSearchParams();

    // State
    const [taxRates, setTaxRates] = useState<ITaxRate[]>([]);
    const [pagination, setPagination] = useState<TaxRatePagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [taxRate, setTaxRate] = useState<Partial<ITaxRate>>({});
    const [showModal, setShowModal] = useState<boolean>(false);
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [isDeleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
    const [itemToDelete, setItemToDelete] = useState<ITaxRate | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { formatDate } = useDateFormatter();
    // Get params from URL
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);

    // Fetch tax rates based on URL params
    const fetchTaxRates = async (search?: string, limit?: number, page?: number) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.FETCH_TAX_RATE_LIST_URL, {
                params: { search, limit, page },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setTaxRates(response.data.data.taxRates || []);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error("Error fetching tax rates:", error);
            toast.error("Failed to fetch tax rates.");
        } finally {
            setIsLoading(false);
        }
    };

    // Effect to fetch data when URL params change
    useEffect(() => {
        fetchTaxRates(search, limit, page);
    }, [search, limit, page]);

    // Handlers for search and pagination controls
    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    // CRUD Operations
    const updateStatus = async (rate: ITaxRate) => {
        try {
            const updatedTaxRate = { ...rate, status: !rate.status };
            await axios.put(`${Constants.UPDATE_TAX_RATE_URL}/${rate.id}`, updatedTaxRate, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Tax rate status updated successfully');
            fetchTaxRates(search, limit, page); // Refetch current page
        } catch (error) {
            console.error('Failed to update tax rate status:', error);
            toast.error("Failed to update tax rate status.");
        }
    };

    const handleEditClick = async (rate: ITaxRate) => {
        try {
            const response = await axios.get<ITaxRate>(`${Constants.GET_TAX_RATE_URL}/${rate.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setTaxRate(response.data);
            setIsEditMode(true);
            setFormErrors({});
            setShowModal(true);
        } catch (error) {
            console.error('Failed to load tax rate:', error);
            toast.error("Failed to load tax rate for editing.");
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormErrors({});

        try {
            setIsSaving(true);
            if (isEditMode) {
                await axios.put(Constants.UPDATE_TAX_RATE_URL + `/${taxRate.id}`, taxRate, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Tax rate updated successfully');
            } else {
                await axios.post(Constants.CREATE_TAX_RATE_URL, taxRate, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Tax rate added successfully');
            }
            setShowModal(false);
            fetchTaxRates(search, limit, page); // Refetch current page
        } catch (error) {
            const axiosError = error as AxiosError<{ errors: FormErrors }>;
            if (axiosError.response?.data?.errors) {
                setFormErrors(axiosError.response.data.errors);
            } else {
                console.error("Error saving tax rate:", error);
                toast.error("Failed to save tax rate.");
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClick = (rate: ITaxRate) => {
        setItemToDelete(rate);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_TAX_RATE_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Tax rate deleted successfully');
            fetchTaxRates(search, limit, page); // Refetch current page
            setDeleteModalOpen(false);
        } catch (error) {
            console.error('Failed to delete tax rate:', error);
            toast.error("Failed to delete tax rate.");
        } finally {
            setIsDeleting(false);
        }
    };

    // Calculate display range for pagination text
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    const tableActions = [
        {
            label: 'Edit',
            icon: <EditIcon size={14} />,
            onClick: handleEditClick,
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: handleDeleteClick,
        },
    ];
    const tableHeaders = ["#", "Tax Name", "Tax Rate (%)", "Created On", "Status", "Actions"]
    const restrictedActions = ['edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        const actionLabel = action.label.toLowerCase() as PermissionAction;
        if (!restrictedActions.includes(actionLabel)) {
            return true;
        }
        return hasPermission(permissions, 'finance-settings', actionLabel);
    })
    if (allowedActions.length === 0) tableHeaders.pop();
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Tax Rates</h1>
                {hasPermission(permissions, 'finance-settings', 'create') &&
                    <button
                        onClick={() => {
                            setShowModal(true);
                            setFormErrors({});
                            setTaxRate({ status: true });
                            setIsEditMode(false);
                        }}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                    >
                        <CirclePlusIcon size={14} /> New Tax Rate
                    </button>
                }
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-4">
                <input
                    type="text"
                    placeholder="Search by Tax Name..."
                    value={search}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
                <select
                    value={limit}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-950 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            <Table headers={tableHeaders}>
                {!isLoading && taxRates.length > 0 && (
                    taxRates.map((rate, index) => (
                        <TableRow
                            key={rate.id}
                            row={rate}
                            index={index + 1}
                            columns={[
                                <span className="text-indigo-600 capitalize">{rate.tax_name}</span>,
                                rate.tax_rate + "%",
                                formatDate(rate.createdAt, systemSettings?.dateFormat.format || 'd-m-Y'),
                                <label className="inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={rate.status} onChange={() => updateStatus(rate)} disabled={!hasPermission(permissions, 'finance-settings', 'edit')} />
                                    <div className="relative w-11 h-6 bg-gray-200 peer-checked:bg-purple-600 rounded-full peer-focus:ring-2 peer-focus:ring-purple-600">
                                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${rate.status ? 'translate-x-full' : ''}`}></div>
                                    </div>
                                </label>
                            ]}
                            actions={allowedActions.length > 0 ? allowedActions : undefined}
                        />
                    ))
                )}

                {!isLoading && taxRates.length === 0 && (
                    <tr><td className="text-center py-4 font-semibold text-gray-500" colSpan={6}>No Tax Rates Found</td></tr>
                )}

                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-2 text-gray-950  font-semibold" colSpan={7}>
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

            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditMode ? 'Edit Tax Rate' : 'Add New Tax Rate'}>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="tax_name" className="block text-sm font-medium text-gray-700  mb-1">Tax Name <span className="text-red-500">*</span></label>
                        <input id="tax_name" type="text" value={taxRate.tax_name || ''} onChange={(e) => setTaxRate({ ...taxRate, tax_name: e.target.value })} placeholder="Enter Tax Name (e.g., GST, VAT)" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600" />
                        {formErrors.tax_name && <p className="text-red-500 text-xs mt-1">{formErrors.tax_name}</p>}
                    </div>

                    <div>
                        <label htmlFor="tax_rate" className="block text-sm font-medium text-gray-700  mb-1">Tax Rate (%) <span className="text-red-500">*</span></label>
                        <input id="tax_rate" type="number" step="0.01" value={taxRate.tax_rate ?? ''} onChange={(e) => setTaxRate({ ...taxRate, tax_rate: e.target.value ? parseFloat(e.target.value) : undefined })} placeholder="Enter Tax Rate (e.g., 5, 18)" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600" />
                        {formErrors.tax_rate && <p className="text-red-500 text-xs mt-1">{formErrors.tax_rate}</p>}
                    </div>

                    <div className="flex justify-end pt-2 space-x-2">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 text-gray-700  ">Cancel</button>
                        <SubmitButton isDisabled={isSaving} isLoading={isSaving} mode={isEditMode ? 'edit' : 'create'} />
                    </div>
                </form>
            </Modal>

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
                title="Delete Tax Rate"
                message="Are you sure you want to delete this tax rate?"
            />
        </div>
    );
}

export default TaxRateList;