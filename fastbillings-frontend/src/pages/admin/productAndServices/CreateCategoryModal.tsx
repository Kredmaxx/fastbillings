import { useEffect, useState } from "react";
import Modal from "@components/admin/Modal";
import axios, { AxiosError } from "axios";
import Constants from "@constants/api";
import type { RootState } from "@store/index";
import { useSelector } from "react-redux";
import SubmitButton from "@components/admin/SubmitButton";
import { toast } from "sonner";
import { Upload } from "lucide-react";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

type IncomeTaxClass = 'BUSINESS' | 'EXEMPT' | 'CAPITAL' | 'OTHER' | 'UNCLASSIFIED';

const INCOME_TAX_CLASS_OPTIONS: { value: IncomeTaxClass; label: string }[] = [
    { value: 'BUSINESS', label: 'Business' },
    { value: 'EXEMPT', label: 'Exempt' },
    { value: 'CAPITAL', label: 'Capital' },
    { value: 'OTHER', label: 'Other' },
    { value: 'UNCLASSIFIED', label: 'Unclassified' },
];

interface CategoryFormData {
    id: string;
    category_name: string;
    slug: string;
    status: boolean;
    taxClass: IncomeTaxClass;
    category_image: File | null;
    categoryImageUrl: string;
}

const CreateCategoryModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const setInitialFormData = (): CategoryFormData => ({
        id: '',
        category_name: '',
        slug: '',
        status: true,
        taxClass: 'UNCLASSIFIED',
        category_image: null,
        categoryImageUrl: ''
    });
    const { token } = useSelector((state: RootState) => state.auth);
    const [formData, setFormData] = useState<CategoryFormData>(setInitialFormData());
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Reset form whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData(setInitialFormData());
            setFormErrors({});
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;

        setFormData(prev => {
            const updated = {
                ...prev,
                [name]: value,
            };

            if (name === "category_name") {
                updated.slug = value.trim().replace(/\s+/g, "-").toLowerCase();
            }

            return updated;
        });
    };


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFormData(prev => ({
                ...prev,
                category_image: file,
                categoryImageUrl: URL.createObjectURL(file)
            }));
        }
    };

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.category_name.trim()) {
            newErrors.category_name = 'Category name is required.';
        } else if (formData.category_name.length < 3) {
            newErrors.category_name = 'Name must be at least 3 characters.';
        }
        if (!formData.slug.trim()) {
            newErrors.slug = 'Slug is required.';
        }
        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;

        const data = new FormData();
        data.append('category_name', formData.category_name);
        data.append('slug', formData.slug);
        data.append('status', String(formData.status || false));
        data.append('taxClass', formData.taxClass || 'UNCLASSIFIED');

        if (formData.category_image instanceof File) {
            data.append('category_image', formData.category_image);
        }

        try {
            setIsSubmitting(true);
            await axios.post(Constants.CREATE_CATEGORY_URL, data, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Category created successfully');
            onSuccess();
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Category">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Image Upload Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700  mb-1">Image</label>
                    <div className="flex items-center space-x-4">
                        <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center bg-gray-50 ">
                            {formData.categoryImageUrl ? (
                                <img src={formData.categoryImageUrl} alt="Preview" className="w-full h-full object-cover rounded" />
                            ) : (
                                <Upload className="text-purple-600 w-6 h-6" />
                            )}
                        </div>
                        <div>
                            <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-gray-950">
                                <Upload className="w-4 h-4 mr-2" />
                                Upload Image
                                <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleFileChange} />
                            </label>
                            <p className="text-xs text-gray-500  mt-1">JPG, PNG. Max 5MB.</p>
                        </div>
                    </div>
                    {formErrors.category_image && <p className="text-red-500 text-xs mt-1">{formErrors.category_image}</p>}
                </div>
                {/* Name Input */}
                <div>
                    <label htmlFor="category_name" className="block text-sm font-medium text-gray-700  mb-1">Name <span className="text-red-500">*</span></label>
                    <input id="category_name" name="category_name" type="text" value={formData.category_name || ""} onChange={handleChange} placeholder="Enter Category Name" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600 focus:border-purple-600" />
                    {formErrors.category_name && <p className="text-red-500 text-xs mt-1">{formErrors.category_name}</p>}
                </div>
                {/* Slug Input */}
                <div>
                    <label htmlFor="slug" className="block text-sm font-medium text-gray-700  mb-1">Slug <span className="text-red-500">*</span></label>
                    <input id="slug" type="text" name="slug" value={formData.slug || ""} onChange={handleChange} placeholder="Enter Category Slug" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600 focus:border-purple-600" />
                    {formErrors.slug && <p className="text-red-500 text-xs mt-1">{formErrors.slug}</p>}
                </div>
                <div>
                    <label htmlFor="taxClass" className="block text-sm font-medium text-gray-700 mb-1">
                        Income tax class (books / tax audit)
                    </label>
                    <select
                        id="taxClass"
                        name="taxClass"
                        value={formData.taxClass}
                        onChange={handleChange}
                        className="w-full bg-white text-gray-950 px-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-purple-600 focus:border-purple-600"
                    >
                        {INCOME_TAX_CLASS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </div>
                {/* Form Buttons */}
                <div className="flex justify-end pt-2 space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 text-gray-700   cursor-pointer">Cancel</button>
                    <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode={"create"} />
                </div>
            </form>
        </Modal>
    );
}

export default CreateCategoryModal;
