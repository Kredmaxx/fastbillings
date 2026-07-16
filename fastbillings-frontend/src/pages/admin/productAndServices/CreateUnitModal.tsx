import { useEffect, useState } from "react";
import Modal from "@components/admin/Modal";
import axios, { AxiosError } from "axios";
import Constants from "@constants/api";
import type { RootState } from "@store/index";
import { useSelector } from "react-redux";
import SubmitButton from "@components/admin/SubmitButton";
import { toast } from "sonner";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface UnitFormData {
    unit_name: string;
    short_name: string;
    status: boolean;
}

const CreateUnitModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const setInitialFormData = (): UnitFormData => ({
        unit_name: "",
        short_name: "",
        status: true
    });
    const { token } = useSelector((state: RootState) => state.auth);
    const [formData, setFormData] = useState<UnitFormData>(setInitialFormData());
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

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};

        if (!formData.unit_name.trim()) {
            newErrors.unit_name = "Unit name is required.";
        } else if (formData.unit_name.length < 3 || formData.unit_name.length > 50) {
            newErrors.unit_name = "Unit name must be between 3 and 50 characters.";
        }

        if (!formData.short_name.trim()) {
            newErrors.short_name = "Short name is required.";
        } else if (formData.short_name.length < 1 || formData.short_name.length > 15) {
            newErrors.short_name = "Short name must be between 1 and 15 characters.";
        }

        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };


    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;

        try {
            setIsSubmitting(true);
            await axios.post(Constants.CREATE_UNIT_URL, formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Unit created successfully');
            onSuccess();
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Unit">
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Unit Name Input */}
                <div>
                    <label htmlFor="unit_name" className="block text-sm font-medium text-red-500  mb-1">Unit Name *</label>
                    <input id="unit_name" name="unit_name" type="text" value={formData.unit_name || ""} onChange={handleChange} placeholder="Enter Brand Name" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600 focus:border-purple-600" />
                    {formErrors.unit_name && <p className="text-red-500 text-xs mt-1">{formErrors.unit_name}</p>}
                </div>
                <div>
                    <label htmlFor="short_name" className="block text-sm font-medium text-red-500  mb-1">Short Name *</label>
                    <input id="short_name" name="short_name" type="text" value={formData.short_name || ""} onChange={handleChange} placeholder="Enter Brand Name" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600 focus:border-purple-600" />
                    {formErrors.short_name && <p className="text-red-500 text-xs mt-1">{formErrors.short_name}</p>}
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

export default CreateUnitModal;
