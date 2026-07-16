import React, { type FC, useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import axios, { AxiosError } from "axios";
import { toast } from "sonner";
import { Edit, Trash2Icon, CirclePlusIcon, EyeIcon } from "lucide-react";
import Modal from "@components/admin/Modal";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import Switch from "@components/admin/Switch";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import Constants from "@constants/api";
import type { RootState } from "@store/index";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import type { PermissionAction } from "@models/permissions";
import { hasPermission } from "@utils/hasPermission";
import SubmitButton from "@components/admin/SubmitButton";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import SmartDropdown from "@components/admin/SmartDropdown";
import type { OptionType, Pagination } from "@models/common";
import { useCurrencies } from "@hooks/useCurrencies";
import CurrencySelect from "@components/admin/CurrencySelect";
import { BANK_CODE_TYPES, getBankCodeType } from "@constants/bankCodeTypes";
import type { BankAccount, BankAccountFormData } from "@models/bank-account";
import BankAccountDetailsModal from "./BankAccountDetailsModal";

const bankAccountTypes: OptionType[] = [
    { id: "savings", name: "Savings" },
    { id: "current", name: "Current" },
];
const initialFormData: BankAccountFormData = {
    userId: "",
    accountHoldername: "",
    bankName: "",
    branchName: "",
    accountNumber: "",
    IFSCCode: "",
    status: true,
    accountType: "",
    bankCodeType: "IFSC",
    openingBalance: 0,
    currencyCode: "",
};

const BankAccountList: FC = () => {
    const { token, user } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    initialFormData.userId = user.id;
    const [searchParams, setSearchParams] = useSearchParams();
    const [showModal, setShowModal] = useState<boolean>(false);
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [itemToDelete, setItemToDelete] = useState<BankAccount | null>(null);
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [formData, setFormData] = useState<BankAccountFormData>(initialFormData);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const [isDeleting, setIsDeleting] = useState(false);
    const [accountTypeSearchInput, setAccountTypeSearchInput] = useState<string>("");
    const { formatMoney, defaultCurrencyCode } = useCurrencies();
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [itemToView, setItemToView] = useState<BankAccount | null>(null);
    const fetchBankAccounts = async (currentSearch = search, currentLimit = limit, currentPage = page) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.GET_BANK_ACCOUNTS_URL, {
                params: { search: currentSearch, limit: currentLimit, page: currentPage },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setBankAccounts(response.data.data.bankDetails);
            if (response.data.data.pagination) setPagination(response.data.data.pagination);
        } catch (error) {
            console.error("Error fetching bank accounts:", error);
            toast.error("Failed to fetch bank accounts.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBankAccounts();
    }, [search, limit, page, token]);

    // --- Search and Pagination Handlers ---
    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    const handleEditClick = (item: BankAccount) => {
        setFormData({
            ...item,
            bankCodeType: item.bankCodeType || "IFSC",
            currencyCode: item.currencyCode || defaultCurrencyCode,
        });
        setIsEditMode(true);
        setFormErrors({});
        setShowModal(true);
    };

    const handleDeleteClick = (account: BankAccount) => {
        setItemToDelete(account);
        setShowDeleteModal(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_BANK_ACCOUNT_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Bank account deleted successfully');
            fetchBankAccounts();
            setShowDeleteModal(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Failed to delete bank account:', error);
            toast.error('Failed to delete bank account.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleStatusChange = async (id: string, newStatus: boolean) => {
        setBankAccounts(prev =>
            prev.map(acc =>
                acc.id === id ? { ...acc, status: newStatus } : acc
            )
        );
        try {
            await axios.patch(`${Constants.UPDATE_BANK_ACCOUNT_STATUS_URL}/${id}`, { status: newStatus }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Status updated successfully');
            fetchBankAccounts();
        } catch (error) {
            toast.error('Failed to update status.');
            fetchBankAccounts();
        }
    };

    const tableActions = [
        { label: 'View', icon: <EyeIcon size={14} />, onClick: (item: BankAccount) => handleViewDetails(item) },
        { label: 'Edit', icon: <Edit size={14} />, onClick: (item: BankAccount) => handleEditClick(item) },
        { label: 'Delete', icon: <Trash2Icon size={14} />, onClick: (item: BankAccount) => handleDeleteClick(item) }
    ];
    const tableHeaders = ["#", "Bank Name", "Account Holder", "Account Number", "Currency", "Current Balance", "Bank Code", "Status", "Actions"]
    const restrictedActions = ['edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        const actionLabel = action.label.toLowerCase() as PermissionAction;
        if (!restrictedActions.includes(actionLabel)) return true;
        return hasPermission(permissions, 'finance-settings', actionLabel);
    });
    if (allowedActions.length === 0) tableHeaders.pop();

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.accountHoldername.trim()) newErrors.accountHoldername = 'Account holder name is required.';
        if (!formData.bankName.trim()) newErrors.bankName = 'Bank name is required.';
        if (!formData.accountNumber.trim()) newErrors.accountNumber = 'Account number is required.';
        if (!formData.IFSCCode.trim()) newErrors.IFSCCode = `${getBankCodeType(formData.bankCodeType).label} is required.`;
        if (!formData.accountType) newErrors.accountType = 'Account type is required.';
        if (!formData.openingBalance) {
            newErrors.openingBalance = 'Opening balance is required.';
        } else if (formData.openingBalance < 0) {
            newErrors.openingBalance = 'Opening balance cannot be negative.';
        } else if (formData.openingBalance > 9999999999) {
            newErrors.openingBalance = 'Opening balance cannot exceed 9,999,999,999.';
        }
        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };
    const handleOptionTypeChange = (option: OptionType | null) => {
        if (option) {
            setFormData(prev => ({
                ...prev,
                accountType: option.id,
            }));
        }
    }
    const handleCurrencyChange = (code: string) => {
        setFormData(prev => ({ ...prev, currencyCode: code }));
    }
    const handleBankCodeTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, bankCodeType: e.target.value }));
    }
    const handleViewDetails = (item: BankAccount) => {
        setItemToView(item);
        setIsDetailsModalOpen(true);
    }
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;

        const payload = {
            ...formData,
            IFSCCode: formData.IFSCCode.toUpperCase()
        };

        try {
            setIsSaving(true);
            if (isEditMode) {
                await axios.put(`${Constants.UPDATE_BANK_ACCOUNT_URL}/${formData.id}`, payload, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Bank account updated successfully');
            } else {
                await axios.post(Constants.CREATE_BANK_ACCOUNT_URL, payload, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Bank account created successfully');
            }
            fetchBankAccounts();
            setShowModal(false);
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Bank Accounts</h1>
                {hasPermission(permissions, 'finance-settings', 'create') && (
                    <button
                        onClick={() => {
                            setIsEditMode(false);
                            setFormData({ ...initialFormData, currencyCode: defaultCurrencyCode });
                            setFormErrors({});
                            setShowModal(true);
                        }}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                        <CirclePlusIcon size={14} /> New Bank Account
                    </button>
                )}
            </div>

            {/* Search and Page Length */}
            <div className="flex justify-between items-center">
                <input
                    type="text"
                    placeholder="Search bank accounts..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
                <select
                    value={limit}
                    onChange={(e) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600 cursor-pointer"
                >
                    {[10, 25, 50].map((num) => (
                        <option key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            {/* Table */}
            <Table headers={tableHeaders}>
                {!isLoading && bankAccounts && bankAccounts.length > 0 && bankAccounts.map((acc, index) => (
                    <TableRow
                        key={acc.id}
                        index={from + index}
                        row={acc}
                        columns={[
                            <span className="text-indigo-600 capitalize cursor-pointer" onClick={() => handleViewDetails(acc)}>{acc.bankName}</span>,
                            acc.accountHoldername,
                            acc.accountNumber,
                            acc.currencyCode || defaultCurrencyCode,
                            formatMoney(acc.currentBalance ?? 0, acc.currencyCode),
                            acc.IFSCCode,
                            <Switch name={`status-${acc.id}`} checked={acc.status} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleStatusChange(acc.id, e.target.checked)} disabled={!hasPermission(permissions, 'finance-settings', 'edit')} />,
                        ]}
                        actions={allowedActions.length > 0 ? allowedActions : undefined}
                    />
                ))}

                {!isLoading && bankAccounts && bankAccounts.length === 0 &&
                    <tr>
                        <td colSpan={9} className="text-center py-4 text-gray-500 font-medium">No Bank Accounts Found</td>
                    </tr>
                }

                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-2 text-gray-950  font-semibold" colSpan={9}>
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

            {/* Add/Edit Modal */}
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditMode ? 'Update Bank Account' : 'Create Bank Account'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Account Holder Name */}
                        <div>
                            <label className="block font-medium text-sm text-gray-700 ">Account Holder Name <span className="text-red-500">*</span></label>
                            <input name="accountHoldername" value={formData.accountHoldername} onChange={handleChange} type="text" placeholder="Enter Account Holder Name" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.accountHoldername && <p className="text-red-500 text-xs mt-1">{formErrors.accountHoldername}</p>}
                        </div>

                        {/* Bank Name */}
                        <div>
                            <label className="block font-medium text-sm text-gray-700 ">Bank Name <span className="text-red-500">*</span></label>
                            <input name="bankName" value={formData.bankName} onChange={handleChange} type="text" placeholder="Enter Bank Name" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.bankName && <p className="text-red-500 text-xs mt-1">{formErrors.bankName}</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Branch Name */}
                        <div>
                            <label className="block font-medium text-sm text-gray-700 ">Branch Name <span className="text-red-500">*</span> </label>
                            <input name="branchName" value={formData.branchName} onChange={handleChange} type="text" placeholder="Enter Branch Name" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.branchName && <p className="text-red-500 text-xs mt-1">{formErrors.branchName}</p>}
                        </div>

                        {/* accountType */}
                        <div>
                            <label className="block font-medium text-sm text-gray-700 ">Account Type <span className="text-red-500">*</span></label>
                            <SmartDropdown
                                items={bankAccountTypes}
                                value={accountTypeSearchInput}
                                onChange={(value) => setAccountTypeSearchInput(value)}
                                onSelect={(option) => handleOptionTypeChange(option as OptionType)}
                                selectedItem={bankAccountTypes.find(option => option.id == formData.accountType) || null}
                                placeholder="Select Account Type"
                                serverside={false}
                            />
                            {formErrors.accountType && <p className="text-red-500 text-xs mt-1">{formErrors.accountType}</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Account Number */}
                        <div>
                            <label className="block font-medium text-sm text-gray-700 ">Account Number <span className="text-red-500">*</span></label>
                            <input name="accountNumber" value={formData.accountNumber} onChange={handleChange} type="text" placeholder="Enter Account Number" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.accountNumber && <p className="text-red-500 text-xs mt-1">{formErrors.accountNumber}</p>}
                        </div>

                        {/* Bank Code Type */}
                        <div>
                            <label className="block font-medium text-sm text-gray-700 ">Bank Code Type</label>
                            <select name="bankCodeType" value={formData.bankCodeType || "IFSC"} onChange={handleBankCodeTypeChange} className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full bg-white text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600">
                                {BANK_CODE_TYPES.map((t) => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Bank Code (label + placeholder adapt to selected type) */}
                        <div>
                            <label className="block font-medium text-sm text-gray-700 ">{getBankCodeType(formData.bankCodeType).label} <span className="text-red-500">*</span></label>
                            <input name="IFSCCode" value={formData.IFSCCode} onChange={handleChange} type="text" placeholder={getBankCodeType(formData.bankCodeType).placeholder} className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.IFSCCode && <p className="text-red-500 text-xs mt-1">{formErrors.IFSCCode}</p>}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Opening Balance */}
                        <div >
                            <label className="block font-medium text-sm text-gray-700 ">Opening Balance <span className="text-red-500">*</span></label>
                            <input
                                placeholder="Enter Opening Balance"
                                disabled={isEditMode}
                                type="number" name="openingBalance" value={formData.openingBalance} onChange={handleChange}
                                className={`mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 ${isEditMode ? 'cursor-not-allowed bg-gray-100' : ''}`}
                            />
                            {formErrors.openingBalance && <p className="text-red-500 text-xs mt-1">{formErrors.openingBalance}</p>}
                        </div>

                        {/* Currency */}
                        <div>
                            <CurrencySelect
                                label="Currency"
                                value={formData.currencyCode || defaultCurrencyCode}
                                onChange={handleCurrencyChange}
                            />
                            {formErrors.currencyCode && <p className="text-red-500 text-xs mt-1">{formErrors.currencyCode}</p>}
                        </div>
                    </div>

                    {/* Status Switch */}
                    <div className="flex items-center gap-3 pt-2">
                        <label htmlFor="status" className="font-medium text-sm text-gray-700 ">Status</label>
                        <Switch name="status" checked={formData.status ?? false} onChange={handleChange} />
                    </div>

                    {/* Buttons */}
                    <div className="flex justify-end pt-4 space-x-2">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 cursor-pointer">Cancel</button>
                        <SubmitButton isDisabled={isSaving} isLoading={isSaving} mode={isEditMode ? "edit" : "create"} />
                    </div>
                </form>
            </Modal>

            {/* Delete Confirmation Modal */}
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
                title="Delete Account"
                message={`Are you sure you want to delete the account for ${itemToDelete?.accountHoldername}? This action cannot be undone.`}
            />
            {/* Details Modal */}
            {isDetailsModalOpen && itemToView && (
                <BankAccountDetailsModal isOpen={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} bankAccount={itemToView} />
            )}
        </div>
    );
};

export default BankAccountList;