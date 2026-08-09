import { useEffect, useState } from "react";
import Modal from "@components/admin/Modal";
import { Image, Trash2Icon } from "lucide-react";
import axios, { AxiosError } from "axios";
import Constants from "@constants/api";
import { toast } from "sonner";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import RowRadioButtonsGroup from "@components/admin/RowRadioButtonsGroup";
import SubmitButton from "@components/admin/SubmitButton";
import { isValidPhone, PHONE_ERROR } from "@utils/validation";

interface SupplierFormData {
    id?: string;
    supplier_name: string;
    supplier_email: string;
    supplier_phone: string;
    gstin?: string;
    balance?: number;
    balance_type?: 'credit' | 'debit' | '';
    profileImage?: File | null;
    profile_image_preview_url?: string
    profile_image_removed?: boolean
}
const initialFormState: SupplierFormData = {
    supplier_name: '',
    supplier_email: '',
    supplier_phone: '',
    gstin: '',
    balance: 0,
    balance_type: 'credit',
    profileImage: null,
    profile_image_preview_url: '',
    profile_image_removed: false
};

interface CreateSupplierFormProps {
    title?: string;
    buttonTitle?: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newSupplier: SupplierResponse) => void
}

interface SupplierResponse {
    id: string;
    supplier_name: string;
    supplier_email: string;
    supplier_phone: string;
    balance: number;
    balance_type: 'credit' | 'debit' | '' | null;
    profileImage: string;
}
const CreateSupplierForm: React.FC<CreateSupplierFormProps> = ({ title, isOpen, onClose, onSuccess }) => {
    const [formData, setformData] = useState<SupplierFormData>(initialFormState);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const { token } = useSelector((state: RootState) => state.auth);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setformData(initialFormState);
            setFormErrors({});
        }
    }, [isOpen]);
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
        setformData({
            ...formData,
            [name]: value
        })
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
            data.append('gstin', (formData.gstin || '').trim().toUpperCase());
            data.append('balance', String(formData.balance));
            data.append('balance_type', formData.balance_type ?? '');
            if (formData.profileImage instanceof File) {
                data.append('profileImage', formData.profileImage);
            }
            if (formData.profile_image_removed) {
                data.append('profile_image_removed', 'true');
            }

            const response = await axios.post(Constants.CREATE_SUPPLIER_URL, data, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                }
            });
            toast.success('Supplier created successfully');
            onSuccess(response.data.data);
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong');
        } finally {
            setIsSubmitting(false);
        }
    }
    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={title ?? 'Create Supplier'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <label htmlFor="profileImage" className="block font-medium text-sm text-gray-700 ">Profile Image</label>
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
                                placeholder="Enter Phone Number"
                                className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.supplier_phone && <p className="text-red-500 text-xs mt-1">{formErrors.supplier_phone}</p>}
                        </div>
                    </div>

                    <div>
                        <label className="block font-medium text-sm text-gray-700">GSTIN</label>
                        <input
                            name="gstin"
                            value={formData.gstin || ''}
                            onChange={handleChange}
                            type="text"
                            maxLength={15}
                            placeholder="e.g. 22AAAAA0000A1Z5"
                            className="border border-gray-300 rounded-md px-4 py-2 w-full uppercase text-gray-950 focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-none"
                        />
                    </div>

                    {/* Balance */}
                    <div>
                        <label className="block font-medium text-sm text-gray-700 ">Balance</label>
                        <input
                            name="balance"
                            value={formData.balance}
                            onChange={handleChange}
                            type="number"
                            placeholder="Enter Balance Amount"
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                        />
                        {formErrors.balance && <p className="text-red-500 text-xs mt-1">{formErrors.balance}</p>}
                    </div>

                    {/* Balance Type */}
                    <div>
                        <label className="block font-medium text-sm text-gray-700  mb-1">Mode</label>
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
                            onClick={onClose}
                        >
                            Cancel
                        </button>
                        <SubmitButton
                            isLoading={isSubmitting}
                            isDisabled={isSubmitting}
                            mode="create"
                        />
                    </div>
                </form>
            </Modal>
        </>
    );
}


export default CreateSupplierForm;