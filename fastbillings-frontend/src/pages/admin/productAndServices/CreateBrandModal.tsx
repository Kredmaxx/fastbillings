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

interface BrandFormData {
    id: string;
    brand_name: string;
    status: boolean;
    brand_image: File | null;
    brandImageUrl: string;
}

const CreateBrandModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const setInitialFormData = (): BrandFormData => ({
        id: "",
        brand_name: "",
        status: true,
        brand_image: null,
        brandImageUrl: "",
    });
    const { token } = useSelector((state: RootState) => state.auth);
    const [formData, setFormData] = useState<BrandFormData>(setInitialFormData());
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Reset form whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData(setInitialFormData());
            setFormErrors({});
        }
    }, [isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        setFormData(prev => {
            const updated = {
                ...prev,
                [name]: value,
            };
            return updated;
        });
    };


    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFormData(prev => ({
                ...prev,
                brand_image: file,
                brandImageUrl: URL.createObjectURL(file)
            }));
        }
    };

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.brand_name.trim()) {
            newErrors.brand_name = 'Brand name is required.';
        } else if (formData.brand_name.length < 3 || formData.brand_name.length > 50) {
            newErrors.brand_name = 'Brand name must be between 3 and 50 characters.';
        }
        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;

        const data = new FormData();
        data.append('brand_name', formData.brand_name);
        data.append('status', String(formData.status || false));

        if (formData.brand_image instanceof File) {
            data.append('brand_image', formData.brand_image);
        }

        try {
            setIsSubmitting(true);
            await axios.post(Constants.CREATE_BRAND_URL, data, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
            });
            toast.success('Brand created successfully');
            onSuccess();
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Brand">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Image Upload Section */}
                <div>
                    <label className="block text-sm font-medium text-red-500  mb-1">Brand Image *</label>
                    <div className="flex items-center space-x-4">
                        <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center bg-gray-50 ">
                            {formData.brandImageUrl ? (
                                <img src={formData.brandImageUrl} alt="Preview" className="w-full h-full object-cover rounded" />
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
                    {formErrors.brand_image && <p className="text-red-500 text-xs mt-1">{formErrors.brand_image}</p>}
                </div>
                {/* Name Input */}
                <div>
                    <label htmlFor="brand_name" className="block text-sm font-medium text-red-500  mb-1">Name *</label>
                    <input id="brand_name" name="brand_name" type="text" value={formData.brand_name || ""} onChange={handleChange} placeholder="Enter Brand Name" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600 focus:border-purple-600" />
                    {formErrors.brand_name && <p className="text-red-500 text-xs mt-1">{formErrors.brand_name}</p>}
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

export default CreateBrandModal;
