import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Constants from "../../../constants/api";
import axios, { AxiosError } from "axios";
import Table from "../../../components/admin/Table";
import PaginationWrapper from "../../../components/admin/PaginationWrapper";
import { Edit, Trash2, CirclePlusIcon } from "lucide-react";
import { toast } from "sonner";
import Modal from "../../../components/admin/Modal";
import MultiSelect from "../../../components/admin/Multiselect";
import { useSelector } from "react-redux";
import type { RootState } from "../../../store";
import type { OnChangeValue } from "react-select";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import type { PermissionAction } from "@models/permissions";
import { hasPermission } from "@utils/hasPermission";
import TableRow from "@components/admin/TableRow";
import useDateFormatter from "@hooks/useDateFormatter";
import SubmitButton from "@components/admin/SubmitButton";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";

interface ITaxRate {
    id: string;
    tax_name: string;
    tax_rate: number;
}

interface ITaxGroup {
    id: string;
    tax_name: string;
    total_tax_rate: number;
    status: boolean;
    createdAt: string;
    tax_rate_ids: string[] | ITaxRate[];
}

interface ITaxGroupDetail extends Omit<ITaxGroup, 'tax_rate_ids'> {
    tax_rate_ids: ITaxRate[];
}

interface TaxGroupPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface ISelectOption {
    value: string;
    label: string;
}

interface FormErrors {
    tax_name?: string;
    tax_rate_ids?: string;
}

type TaxGroupFormData = Partial<{
    id: string;
    tax_name: string;
    status: boolean;
    tax_rate_ids: string[];
}>;

// --- COMPONENT ---
const TaxGroups: React.FC = () => {

    // Hooks
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [searchParams, setSearchParams] = useSearchParams();

    // State
    const [taxGroups, setTaxGroups] = useState<ITaxGroup[]>([]);
    const [pagination, setPagination] = useState<TaxGroupPagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [taxRateOptions, setTaxRateOptions] = useState<ISelectOption[]>([]);
    const [taxGroup, setTaxGroup] = useState<TaxGroupFormData>({});
    const [selectedTaxRates, setSelectedTaxRates] = useState<string[]>([]);
    const [showModal, setShowModal] = useState<boolean>(false);
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [isDeleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
    const [itemToDelete, setItemToDelete] = useState<ITaxGroup | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const { formatDate } = useDateFormatter();
    // Get params from URL
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);

    // Fetch tax groups list with pagination
    const fetchTaxGroups = async (search?: string, limit?: number, page?: number) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.FETCH_TAX_GROUP_LIST_URL, {
                params: { search, limit, page },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setTaxGroups(response.data.data || []);
            setPagination(response.data.pagination);
        } catch (error) {
            console.error("Error fetching tax groups:", error);
            toast.error("Failed to fetch tax groups.");
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch all tax rates for the multiselect options
    const fetchAllTaxRates = async () => {
        try {
            const response = await axios.get(Constants.FETCH_TAX_RATE_LIST_URL, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const rates = response.data.data.taxRates || [];
            setTaxRateOptions(rates.map((rate: ITaxRate) => ({ value: rate.id, label: `${rate.tax_name} @ ${rate.tax_rate}%` })));
        } catch (error) {
            console.error("Error fetching tax rates:", error);
            toast.error("Failed to fetch tax rate options.");
        }
    };

    // Effects
    useEffect(() => {
        fetchTaxGroups(search, limit, page);
    }, [search, limit, page]);

    useEffect(() => {
        fetchAllTaxRates();
    }, []);

    // Handlers
    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    const handleTaxRateChange = (selectedOptions: OnChangeValue<ISelectOption, true>) => {
        const ids = selectedOptions.map((option) => option.value);
        setSelectedTaxRates(ids);
        setTaxGroup({ ...taxGroup, tax_rate_ids: ids });
    };

    const updateStatus = async (group: ITaxGroup) => {
        try {
            const updatedTaxGroup = { ...group, status: !group.status };
            await axios.put(`${Constants.UPDATE_TAX_GROUP_URL}/${group.id}`, updatedTaxGroup, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Status updated successfully');
            fetchTaxGroups(search, limit, page);
        } catch (error) {
            toast.error("Failed to update status.");
        }
    };

    const handleEditClick = async (group: ITaxGroup) => {
        try {
            const response = await axios.get<ITaxGroupDetail>(`${Constants.GET_TAX_GROUP_URL}/${group.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const groupData = response.data;
            const selectedIds = groupData.tax_rate_ids.map((rate) => rate.id);
            setTaxGroup({ ...groupData, tax_rate_ids: selectedIds });
            setSelectedTaxRates(selectedIds);
            setIsEditMode(true);
            setFormErrors({});
            setShowModal(true);
        } catch (error) {
            toast.error("Failed to load tax group for editing.");
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormErrors({});

        try {
            setIsSaving(true);
            const url = isEditMode
                ? `${Constants.UPDATE_TAX_GROUP_URL}/${taxGroup.id}`
                : Constants.CREATE_TAX_GROUP_URL;
            await axios[isEditMode ? 'put' : 'post'](url, taxGroup, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(`Tax group ${isEditMode ? 'updated' : 'added'} successfully`);
            setShowModal(false);
            fetchTaxGroups(search, limit, page);
        } catch (error) {
            const axiosError = error as AxiosError<{ errors: FormErrors }>;
            if (axiosError.response?.data?.errors) {
                setFormErrors(axiosError.response.data.errors);
            } else {
                toast.error("Failed to save tax group.");
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteClick = (group: ITaxGroup) => {
        setItemToDelete(group);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_TAX_GROUP_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Tax group deleted successfully');
            fetchTaxGroups(search, limit, page);
            setDeleteModalOpen(false);
        } catch (error) {
            toast.error("Failed to delete tax group.");
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
            icon: <Edit size={14} />,
            onClick: (item: ITaxGroup) => handleEditClick(item),
        },
        {
            label: 'Delete',
            icon: <Trash2 size={14} />,
            onClick: (item: ITaxGroup) => handleDeleteClick(item),
        },
    ];

    const tableHeaders = ["#", "Group Name", "Total Rate (%)", "Created On", "Status", "Actions"];
    const restrictedActions = ['edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        const actionLabel = action.label.toLowerCase() as PermissionAction;
        if (!restrictedActions.includes(actionLabel)) {
            return true;
        }
        return hasPermission(permissions, 'finance-settings', actionLabel);
    });
    if (allowedActions.length === 0) tableHeaders.pop();
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Tax Groups</h1>
                {hasPermission(permissions, 'finance-settings', 'create') && (
                    <button
                        onClick={() => {
                            setShowModal(true);
                            setFormErrors({});
                            setTaxGroup({ status: true, tax_rate_ids: [] });
                            setIsEditMode(false);
                            setSelectedTaxRates([]);
                        }}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                    >
                        <CirclePlusIcon size={14} /> New Tax Group
                    </button>
                )}
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-4">
                <input
                    type="text"
                    placeholder="Search by Tax Group Name..."
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
                {!isLoading && taxGroups.length > 0 && (
                    taxGroups.map((group, index) => (
                        <TableRow
                            key={group.id}
                            row={group}
                            index={index + 1}
                            columns={[
                                <span className="text-indigo-600 capitalize">{group.tax_name}</span>,
                                `${Number(group.total_tax_rate ?? 0).toFixed(2)}`,
                                formatDate(group.createdAt, systemSettings?.dateFormat.format || 'd-m-Y'),
                                <label className="inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={group.status} onChange={() => updateStatus(group)} disabled={!hasPermission(permissions, 'finance-settings', 'edit')} />
                                    <div className="relative w-11 h-6 bg-gray-200 peer-checked:bg-purple-600 rounded-full peer-focus:ring-2 peer-focus:ring-purple-600">
                                        <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${group.status ? 'translate-x-full' : ''}`}></div>
                                    </div>
                                </label>
                            ]}
                            actions={allowedActions.length > 0 ? allowedActions : undefined}
                        />
                    ))
                )}

                {!isLoading && taxGroups.length === 0 && (
                    <tr><td className="text-center py-4 font-semibold text-gray-500" colSpan={6}>No Tax Groups Found</td></tr>
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

            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditMode ? 'Edit Tax Group' : 'Add New Tax Group'}>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="tax_name" className="block text-sm font-medium text-gray-700  mb-1">Tax Group Name <span className="text-red-500">*</span></label>
                        <input id="tax_name" type="text" value={taxGroup.tax_name || ''} onChange={(e) => setTaxGroup({ ...taxGroup, tax_name: e.target.value })} placeholder="e.g., Standard GST" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600" />
                        {formErrors.tax_name && <p className="text-red-500 text-xs mt-1">{formErrors.tax_name}</p>}
                    </div>
                    <div>
                        <label htmlFor="tax_rates" className="block text-sm font-medium text-gray-700  mb-1">Tax Rates <span className="text-red-500">*</span></label>
                        <MultiSelect
                            options={taxRateOptions}
                            selectedOptions={taxRateOptions.filter(opt => selectedTaxRates.includes(opt.value))}
                            onChange={handleTaxRateChange}
                        />
                        {formErrors.tax_rate_ids && <p className="text-red-500 text-xs mt-1">{formErrors.tax_rate_ids}</p>}
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
                title="Delete Tax Group"
                message="Are you sure you want to delete this tax group?"
            />
        </div>
    );
}

export default TaxGroups;