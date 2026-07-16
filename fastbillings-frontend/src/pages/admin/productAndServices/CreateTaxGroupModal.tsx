import { useEffect, useState } from "react";
import Modal from "@components/admin/Modal";
import axios, { AxiosError } from "axios";
import Constants from "@constants/api";
import type { RootState } from "@store/index";
import { useSelector } from "react-redux";
import SubmitButton from "@components/admin/SubmitButton";
import { toast } from "sonner";
import MultiSelect from "@components/admin/Multiselect";
import type { OnChangeValue } from "react-select";
interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface ITaxRate {
    id: string;
    tax_name: string;
    tax_rate: number;
}

interface ISelectOption {
    value: string;
    label: string;
}
interface TaxGroupFormData {
    tax_name: string;
    status: boolean;
    tax_rate_ids: string[];
};
const CreateTaxGroupModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const setInitialFormData = (): TaxGroupFormData => ({
        tax_name: "",
        tax_rate_ids: [],
        status: true
    });
    const { token } = useSelector((state: RootState) => state.auth);
    const [formData, setFormData] = useState<TaxGroupFormData>(setInitialFormData());
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [taxRateOptions, setTaxRateOptions] = useState<ISelectOption[]>([]);
    const [selectedTaxRates, setSelectedTaxRates] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Reset form whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData(setInitialFormData());
            setFormErrors({});
            fetchAllTaxRates();
            setSelectedTaxRates([]);
        }
    }, [isOpen]);

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

    const handleTaxRateChange = (selectedOptions: OnChangeValue<ISelectOption, true>) => {
        const ids = selectedOptions.map((option) => option.value);
        setSelectedTaxRates(ids);
        setFormData(prev => ({ ...prev, tax_rate_ids: ids }));
    };
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

        if (!formData.tax_name.trim()) {
            newErrors.tax_name = "Tax name is required.";
        } else if (formData.tax_name.length < 3 || formData.tax_name.length > 50) {
            newErrors.tax_name = "Tax name must be between 3 and 50 characters.";
        }
        if (selectedTaxRates.length === 0) {
            newErrors.tax_rate_ids = "Please select at least one tax rate.";
        }

        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };


    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;

        try {
            setIsSubmitting(true);
            await axios.post(Constants.CREATE_TAX_GROUP_URL, formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Tax group created successfully');
            onSuccess();
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Tax Group">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label htmlFor="tax_name" className="block text-sm font-medium text-red-500 mb-1">Tax Group Name *</label>
                    <input id="tax_name" type="text" name="tax_name" value={formData.tax_name || ''} onChange={handleChange} placeholder="e.g., Standard GST" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600" />
                    {formErrors.tax_name && <p className="text-red-500 text-xs mt-1">{formErrors.tax_name}</p>}
                </div>
                <div>
                    <label htmlFor="tax_rates" className="block text-sm font-medium text-red-500 mb-1">Tax Rates *</label>
                    <MultiSelect
                        options={taxRateOptions}
                        selectedOptions={taxRateOptions.filter(opt => selectedTaxRates.includes(opt.value))}
                        onChange={handleTaxRateChange}
                    />
                    {formErrors.tax_rate_ids && <p className="text-red-500 text-xs mt-1">{formErrors.tax_rate_ids}</p>}
                </div>
                <div className="flex justify-end pt-2 space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 text-gray-700  ">Cancel</button>
                    <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode={'create'} />
                </div>
            </form>
        </Modal>
    );
}

export default CreateTaxGroupModal;
