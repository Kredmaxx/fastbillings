import { useEffect, useState, type FC } from 'react';
import Modal from '@components/admin/Modal';
import { CirclePlusIcon, Edit, Image, Trash2Icon } from 'lucide-react';
import RowRadioButtonsGroup from '@components/admin/RowRadioButtonsGroup';
import Constants from '@constants/api';
import axios, { AxiosError } from 'axios';
import { toast } from "sonner";
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import Table from '@components/admin/Table';
import TableRow from '@components/admin/TableRow';
import { useSearchParams } from 'react-router-dom';
import PaginationWrapper from '@components/admin/PaginationWrapper';
import DeleteConfirmationModal from '@components/admin/DeleteConfirmationModal';
import type { PermissionAction } from '@models/permissions';
import { hasPermission } from '@utils/hasPermission';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import useDateFormatter from '@hooks/useDateFormatter';
import ProfileCard from '@components/admin/ProfileImage';
import SubmitButton from '@components/admin/SubmitButton';
import CurrencySelect from '@components/admin/CurrencySelect';
import { useCurrencies } from '@hooks/useCurrencies';
import { isValidPhone, PHONE_ERROR } from '@utils/validation';

interface SupplierFormData {
    id?: string;
    supplier_name: string;
    supplier_email: string;
    supplier_phone: string;
    gstin?: string;
    pan?: string;
    isMsme?: boolean;
    isNonResident?: boolean;
    isRelatedParty?: boolean;
    msmeUdyam?: string;
    balance?: number;
    balance_type?: 'credit' | 'debit' | '';
    profileImage?: File | null;
    profile_image_preview_url?: string
    profile_image_removed?: boolean
    currencyCode?: string;
}

interface Supplier {
    id: string;
    supplier_name: string;
    supplier_email: string;
    supplier_phone: string;
    gstin?: string | null;
    pan?: string | null;
    isMsme?: boolean;
    isNonResident?: boolean;
    isRelatedParty?: boolean;
    msmeUdyam?: string | null;
    balance: number;
    balance_type: 'credit' | 'debit' | '';
    profileImage: string;
    createdAt: string;
    closing_balance: number | null;
    currencyCode?: string | null;
}

interface SupplierPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
const SupplierList: FC = () => {
    const [showModal, setShowModal] = useState<boolean>(false);
    const { token } = useSelector((state: RootState) => state.auth);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [itemToDelete, setItemToDelete] = useState<any>({});
    const [searchParams, setSearchParams] = useSearchParams();
    const [pagination, setPagination] = useState<SupplierPagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);
    const { formatDate } = useDateFormatter();
    const { defaultCurrencyCode, resolveCurrency } = useCurrencies();
    const [formData, setformData] = useState<SupplierFormData>({
        supplier_name: '',
        supplier_email: '',
        supplier_phone: '',
        gstin: '',
        pan: '',
        isMsme: false,
        isNonResident: false,
        isRelatedParty: false,
        msmeUdyam: '',
        balance: 0,
        balance_type: 'credit',
        profileImage: null,
        profile_image_preview_url: '',
        profile_image_removed: false,
        currencyCode: '',
    });
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const tableActions = [
        {
            label: 'Edit',
            icon: <Edit size={14} />,
            onClick: (item: any) => { handleEditClick(item) }
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: (item: any) => { handleDeleteClick(item) }
        }
    ]

    const tableHeaders = ['#', 'Supplier', 'Phone', 'Created On', 'Currency', 'Closing Balance', 'Action'];
    const restrictedActions = ["edit", "delete"];
    const allowedActions = tableActions.filter((action) => {
        const actionKey = action.label.toLowerCase() as PermissionAction;

        if (!restrictedActions.includes(actionKey)) {
            return true;
        }

        return hasPermission(permissions, "suppliers", actionKey);
    })
    if (allowedActions.length === 0) {
        tableHeaders.pop();
    }
    const handleEditClick = (item: any) => {
        const editFormData = {
            ...item,
            profile_image_preview_url: item.profileImage,
            profile_image_removed: false,
            currencyCode: item.currencyCode || defaultCurrencyCode,
        };
        setformData(editFormData);
        setIsEditMode(true);
        setShowModal(true);
    }

    const handleDeleteClick = (supplier: any) => {
        setItemToDelete(supplier);
        setShowDeleteModal(true);
    }

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_SUPPLIER_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Supplier deleted successfully');
            fetchSuppliers();
            setShowDeleteModal(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Failed to delete supplier:', error);
            toast.error('Failed to delete supplier.');
        } finally {
            setIsDeleting(false);
        }
    }

    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    }

    const handlePageLengthChange = (limit: number) => {
        setSearchParams({ search, limit: String(limit), page: '1' });
    }

    const handlePageChange = (page: number) => {
        setSearchParams({
            search: search || '',
            limit: limit ? String(limit) : '10',
            page: String(page)
        });
    }

    useEffect(() => {
        fetchSuppliers(search, limit, page);
    }, [search, limit, page]);

    // For new suppliers: seed currencyCode from the company default once it loads
    useEffect(() => {
        if (!isEditMode && defaultCurrencyCode) {
            setformData(prev => ({
                ...prev,
                currencyCode: prev.currencyCode || defaultCurrencyCode,
            }));
        }
    }, [defaultCurrencyCode, isEditMode]);

    const fetchSuppliers = async (search?: string, limit?: number, page?: number) => {

        try {
            setIsLoading(true);
            const response = await axios.get(Constants.GET_SUPPLIERS_URL, {
                params: { search, limit, page },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setSuppliers(response.data.data.suppliers);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error("Error fetching suppliers:", error);
            toast.error("Failed to fetch suppliers.");
        } finally {
            setIsLoading(false);
        }
    }
    const validateSupplierForm = () => {
        const newErrors: { [key: string]: string } = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        // Name
        if (!formData.supplier_name) {
            newErrors.supplier_name = 'Supplier name is required';
        } else if (formData.supplier_name.length < 3) {
            newErrors.supplier_name = 'Supplier name must be at least 3 characters';
        } else if (formData.supplier_name.length > 50) {
            newErrors.supplier_name = 'Supplier name must be less than 50 characters';
        }

        // Email
        if (!formData.supplier_email) {
            newErrors.supplier_email = 'Supplier email is required';
        } else if (!emailRegex.test(formData.supplier_email)) {
            newErrors.supplier_email = 'Supplier email is invalid';
        }

        // Phone
        if (!formData.supplier_phone) {
            newErrors.supplier_phone = 'Supplier phone is required';
        } else if (!isValidPhone(formData.supplier_phone)) {
            newErrors.supplier_phone = PHONE_ERROR;
        }

        // Balance type
        if (formData.balance && formData.balance < 0) {
            newErrors.balance = 'Balance must be greater than 0';
        } else if (formData.balance && formData.balance > 0 && formData.balance_type === '') {
            newErrors.balance_type = 'Balance type is required';
        }

        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateSupplierForm()) return;
        try {
            setIsSubmitting(true);
            const data = new FormData();
            data.append('supplier_name', formData.supplier_name);
            data.append('supplier_email', formData.supplier_email);
            data.append('supplier_phone', formData.supplier_phone);
            data.append('gstin', formData.gstin ?? '');
            data.append('pan', formData.pan ?? '');
            data.append('isMsme', formData.isMsme ? 'true' : 'false');
            data.append('isNonResident', formData.isNonResident ? 'true' : 'false');
            data.append('isRelatedParty', formData.isRelatedParty ? 'true' : 'false');
            data.append('msmeUdyam', formData.msmeUdyam ?? '');
            data.append('balance', String(formData.balance));
            data.append('balance_type', formData.balance_type ?? 'credit');
            if (formData.currencyCode) {
                data.append('currencyCode', formData.currencyCode);
            }
            if (formData.profileImage instanceof File) {
                data.append('profileImage', formData.profileImage);
            }
            if (formData.profile_image_removed) {
                data.append('profile_image_removed', 'true');
            }
            if (isEditMode) {

                await axios.put(`${Constants.UPDATE_SUPPLIER_URL}/${formData.id}`, data, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
                toast.success('Supplier updated successfully');
            } else {
                await axios.post(Constants.CREATE_SUPPLIER_URL, data, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });
                toast.success('Supplier created successfully');
            }
            fetchSuppliers();
            setShowModal(false);
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleImageDelete = () => {
        setformData({
            ...formData,
            profileImage: null,
            profile_image_preview_url: '',
            profile_image_removed: true
        })
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setformData({
                ...formData,
                profileImage: file,
                profile_image_preview_url: URL.createObjectURL(file)
            })
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        if (name === 'balance') {
            //allow only numbers for balance amount
            const numericValue = value.replace(/[^0-9]/g, '');
            setformData({
                ...formData,
                balance: numericValue === '' ? 0 : Number(numericValue)
            });
        } else {
            setformData({
                ...formData,
                [name]: value
            })
        }
    }

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Supplier</h1>
                {hasPermission(permissions, 'suppliers', 'create') &&
                    <button
                        onClick={() => {
                            setShowModal(true);
                            setFormErrors({});
                            setformData({
                                supplier_name: '',
                                supplier_email: '',
                                supplier_phone: '',
                                gstin: '',
                                pan: '',
                                isMsme: false,
                                isNonResident: false,
                                isRelatedParty: false,
                                msmeUdyam: '',
                                balance: 0,
                                balance_type: 'credit',
                                profileImage: null,
                                profile_image_preview_url: '',
                                currencyCode: defaultCurrencyCode || '',
                            });
                            setIsEditMode(false);
                            setShowDeleteModal(false);
                        }}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                        <CirclePlusIcon size={14} /> New Supplier
                    </button>
                }
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
                {!isLoading && suppliers && suppliers.map((supplier, index) => (
                    <TableRow
                        key={supplier.id}
                        index={index + 1}
                        row={supplier}
                        columns={[
                            <ProfileCard
                                name={supplier.supplier_name}
                                imageUrl={supplier.profileImage}
                                email={supplier.supplier_email}
                            />,
                            supplier.supplier_phone,
                            formatDate(supplier.createdAt, systemSettings?.dateFormat.format || 'd-m-Y'),
                            supplier.currencyCode || defaultCurrencyCode || '—',
                            `${resolveCurrency(supplier.currencyCode).symbol}${Number(supplier.closing_balance ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                        ]}
                        actions={allowedActions.length > 0 ? allowedActions : undefined}
                        onRowClick={(item) => handleEditClick(item)}
                    />
                ))}
                {!isLoading && suppliers.length === 0 && (
                    <tr>
                        <td colSpan={7} className="text-center py-4 font-semibold">No Suppliers Found</td>
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
            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditMode ? 'Update Supplier' : 'Create Supplier'}>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex items-start gap-4 mb-4">
                        {/* Image Preview or Default */}
                        <div className="relative w-20 h-20 border border-gray-300 rounded-md flex items-center justify-center overflow-hidden bg-white">
                            {formData.profile_image_preview_url ? (
                                <img
                                    src={formData.profile_image_preview_url}
                                    alt="Preview"
                                    className="w-full h-full object-cover rounded"
                                />
                            ) : (
                                <span className="text-xl text-gray-400"><Image /></span>
                            )}

                            {/* Delete Button on Preview */}
                            {formData.profile_image_preview_url && (
                                <button
                                    type="button"
                                    className="absolute top-[0px] right-[-1px] bg-white border border-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-500 hover:border-white transition duration-200"
                                    onClick={handleImageDelete}
                                    title="Remove Image"
                                >
                                    <Trash2Icon size={14} className="text-red-500 hover:text-white cursor-pointer" />
                                </button>
                            )}
                        </div>

                        {/* Upload Button and Note */}
                        <div>
                            <label htmlFor="imageUpload">
                                <input
                                    type="file"
                                    accept="image/png, image/jpeg"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    id="imageUpload"
                                />
                                <span className="inline-flex items-center bg-purple-600 hover:bg-gray-950 text-white text-sm px-4 py-2 rounded-md transition duration-200 cursor-pointer">
                                    <Image size={16} className="mr-2" />
                                    Upload Image
                                </span>

                            </label>
                            <p className="text-xs text-gray-500 mt-1">JPG or PNG format, not exceeding 5MB.</p>
                        </div>
                    </div>


                    {/* Name */}
                    <div>
                        <label className="block font-medium text-sm text-gray-700 ">
                            Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            name="supplier_name"
                            value={formData.supplier_name}
                            onChange={handleChange}
                            type="text"
                            placeholder="Enter Name"
                            className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                        />
                        {formErrors.supplier_name && <p className="text-red-500 text-xs mt-1">{formErrors.supplier_name}</p>}
                    </div>

                    {/* Email & Phone */}
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label className="block font-medium text-sm text-gray-700 ">
                                Email <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="supplier_email"
                                value={formData.supplier_email}
                                onChange={handleChange}
                                type="email"
                                placeholder="Enter Email Address"
                                className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.supplier_email && <p className="text-red-500 text-xs mt-1">{formErrors.supplier_email}</p>}
                        </div>
                        <div className="flex-1">
                            <label className="block font-medium text-sm text-gray-700 ">
                                Phone Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                name="supplier_phone"
                                value={formData.supplier_phone}
                                onChange={handleChange}
                                type="tel"
                                maxLength={20}
                                placeholder="Enter Phone Number"
                                className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.supplier_phone && <p className="text-red-500 text-xs mt-1">{formErrors.supplier_phone}</p>}
                        </div>
                    </div>

                    {/* Currency */}
                    <div>
                        <CurrencySelect
                            value={formData.currencyCode || ''}
                            onChange={(code) => setformData(prev => ({ ...prev, currencyCode: code }))}
                            label="Currency"
                        />
                    </div>

                    <div>
                        <label className="block font-medium text-sm text-gray-700">GSTIN</label>
                        <input
                            name="gstin"
                            value={formData.gstin ?? ''}
                            onChange={handleChange}
                            type="text"
                            maxLength={15}
                            placeholder="15-digit GSTIN"
                            className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none uppercase"
                        />
                    </div>

                    <div>
                        <label className="block font-medium text-sm text-gray-700">PAN</label>
                        <input
                            name="pan"
                            value={formData.pan ?? ''}
                            onChange={handleChange}
                            type="text"
                            maxLength={10}
                            placeholder="10-character PAN"
                            className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none uppercase"
                        />
                        <p className="text-xs text-gray-400 mt-1">Used on Form 26Q / 27Q deductee rows</p>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={Boolean(formData.isNonResident)}
                                onChange={(e) => setformData((prev) => ({ ...prev, isNonResident: e.target.checked }))}
                            />
                            Non-resident deductee (Form 27Q — not Form 26Q)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={Boolean(formData.isRelatedParty)}
                                onChange={(e) => setformData((prev) => ({ ...prev, isRelatedParty: e.target.checked }))}
                            />
                            Related party / specified person (§40A(2) disclosure)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={Boolean(formData.isMsme)}
                                onChange={(e) => setformData((prev) => ({ ...prev, isMsme: e.target.checked }))}
                            />
                            MSME / Udyam registered (45-day payment tracking)
                        </label>
                        {formData.isMsme && (
                            <div>
                                <label className="block font-medium text-sm text-gray-700">Udyam number</label>
                                <input
                                    name="msmeUdyam"
                                    value={formData.msmeUdyam ?? ''}
                                    onChange={handleChange}
                                    type="text"
                                    placeholder="UDYAM-XX-00-0000000"
                                    className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none uppercase"
                                />
                            </div>
                        )}
                    </div>

                    {/* Balance */}
                    <div>
                        <label className="block font-medium text-sm text-gray-700 ">Balance</label>
                        <input
                            name="balance"
                            value={formData.balance}
                            onChange={handleChange}
                            type="text"
                            maxLength={10}
                            placeholder="Enter Balance Amount"
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                        />
                        {formErrors.balance && <p className="text-red-500 text-xs mt-1">{formErrors.balance}</p>}
                    </div>

                    {/* Balance Type */}
                    <div>
                        <label htmlFor="balance_type" className="block font-medium text-sm text-gray-700  mb-1">Mode</label>
                        <RowRadioButtonsGroup
                            name="balance_type"
                            value={formData.balance_type ? formData.balance_type : 'credit'}
                            onChange={handleChange}
                            options={[{ label: 'Credit', value: 'credit' }, { label: 'Debit', value: 'debit' }]}
                        />
                        {formErrors.balance_type && <p className="text-red-500 text-xs mt-1">{formErrors.balance_type}</p>}
                    </div>

                    {/* Buttons */}
                    <div className="flex justify-end pt-4 gap-2">
                        <button
                            type="button"
                            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 cursor-pointer"
                            onClick={() => setShowModal(false)}
                        >
                            Cancel
                        </button>
                        <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode={isEditMode ? 'edit' : 'create'} />
                    </div>
                </form>
            </Modal>

            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
                title="Confirm Deletion"
                message={`Are you sure you want to delete this supplier? ${itemToDelete?.supplier_name} will be permanently deleted.`}
            >
            </DeleteConfirmationModal>
        </div>
    );
}

export default SupplierList;