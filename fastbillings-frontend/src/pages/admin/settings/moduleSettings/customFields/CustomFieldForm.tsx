import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import axios from "axios";
import Constants from "@constants/api";
import { toast } from "sonner";
import type { CustomFieldShape, CustomFieldTypeShape } from "@models/modulesettings/customField";
import Modal from "@components/admin/Modal";
import SmartDropdown from "@components/admin/SmartDropdown";
import SubmitButton from "@components/admin/SubmitButton";

interface CustomFieldFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    moduleId: string;
    customFieldTypes: CustomFieldTypeShape[];
    token: string;
    editItem?: CustomFieldShape | null;
}

interface FormErrors {
    labelName?: string;
    fieldSlug?: string;
    dataType?: string;
    options?: string;
}

const CustomFieldForm: React.FC<CustomFieldFormProps> = ({
    isOpen,
    onClose,
    onSuccess,
    moduleId,
    customFieldTypes,
    token,
    editItem
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    const getInitialState = useCallback((): CustomFieldShape => ({
        moduleId: moduleId,
        labelName: "",
        fieldSlug: "",
        dataType: "",
        helpText: "",
        isMandatory: false,
        showInTable: false,
        options: []
    }), [moduleId]);

    const [formData, setFormData] = useState<CustomFieldShape>(getInitialState());

    // Populate form data when editing
    useEffect(() => {
        if (isOpen && editItem) {
            setFormData({
                ...getInitialState(),
                ...editItem,
                options: editItem.options || []
            });
            setErrors({});
        } else if (isOpen && !editItem) {
            setFormData(getInitialState());
            setErrors({});
        }
    }, [isOpen, editItem, getInitialState]);

    const resetAndClose = useCallback(() => {
        setFormData(getInitialState());
        setErrors({});
        onClose();
    }, [getInitialState, onClose]);

    // Map API data types to SmartDropdown Item format
    const dropdownItems = useMemo(() => {
        return customFieldTypes.map(type => ({
            id: type.id,
            name: type.name,
        }));
    }, [customFieldTypes]);

    // Find the currently selected item object for the SmartDropdown
    const selectedDataTypeItem = useMemo(() => {
        return dropdownItems.find(item => item.id === formData.dataType) || null;
    }, [dropdownItems, formData.dataType]);

    // Determine if the selected data type requires 'options'
    const selectedType = customFieldTypes.find(t => t.id === formData.dataType);
    const needsOptions = ['dropdown', 'radio', 'check_box'].includes(selectedType?.slug || '');

    const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFormData(prev => ({
            ...prev,
            labelName: value,
            fieldSlug: editItem ? prev.fieldSlug : value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
        }));
        if (errors.labelName) setErrors(prev => ({ ...prev, labelName: undefined }));
        if (errors.fieldSlug) setErrors(prev => ({ ...prev, fieldSlug: undefined }));
    };

    const handleInputChange = (field: keyof CustomFieldShape, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field as keyof FormErrors]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    const handleOptionChange = (index: number, key: 'label' | 'value', value: string) => {
        const newOptions = [...(formData.options || [])];
        newOptions[index][key] = value;
        setFormData(prev => ({ ...prev, options: newOptions }));
        if (errors.options) setErrors(prev => ({ ...prev, options: undefined }));
    };

    const addOption = () => {
        setFormData(prev => ({ ...prev, options: [...(prev.options || []), { label: "", value: "" }] }));
    };

    const removeOption = (index: number) => {
        const newOptions = [...(formData.options || [])];
        newOptions.splice(index, 1);
        setFormData(prev => ({ ...prev, options: newOptions }));
    };

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};
        let isValid = true;

        if (!formData.labelName.trim()) {
            newErrors.labelName = "Label name is required";
            isValid = false;
        }
        if (!formData.fieldSlug.trim()) {
            newErrors.fieldSlug = "Field slug is required";
            isValid = false;
        }
        if (!formData.dataType) {
            newErrors.dataType = "Data type is required";
            isValid = false;
        }

        if (needsOptions) {
            if (!formData.options || formData.options.length === 0) {
                newErrors.options = "At least one option is required for this data type.";
                isValid = false;
            } else {
                const hasEmptyOptions = formData.options.some(opt => !opt.label.trim() || !opt.value.trim());
                if (hasEmptyOptions) {
                    newErrors.options = "All options must have both a label and a value.";
                    isValid = false;
                }
            }
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        const payload = { ...formData };
        if (!needsOptions) delete payload.options;

        try {
            setIsLoading(true);
            const isEditing = !!editItem?.id;

            const url = isEditing
                ? `${Constants.BASE_URL}/api/admin/custom-fields/${editItem.id}`
                : `${Constants.BASE_URL}/api/admin/custom-fields`;

            const requestConfig = {
                headers: { 'Authorization': `Bearer ${token}` }
            };

            const response = await (isEditing
                ? axios.put(url, payload, requestConfig)
                : axios.post(url, payload, requestConfig)
            );

            if (response.data?.success) {
                toast.success(response.data.message || `Custom field ${isEditing ? 'updated' : 'created'} successfully`);
                setFormData(getInitialState());
                setErrors({});
                onSuccess();
            } else {
                toast.error(response.data?.message || "Something went wrong.");
            }
        } catch (error: any) {
            const backendMsg = error.response?.data?.message || `Failed to ${editItem ? 'update' : 'create'} custom field`;
            toast.error(backendMsg);
        } finally {
            setIsLoading(false);
        }
    };

    const isEditing = !!editItem;

    return (
        <Modal
            isOpen={isOpen}
            onClose={resetAndClose}
            title={isEditing ? "Edit Custom Field" : "Add Custom Field"}
            size="2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Label Name <span className="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., Customer Age"
                            value={formData.labelName}
                            onChange={handleLabelChange}
                            className={`w-full border p-2 h-10 mt-1 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 transition-colors ${errors.labelName ? 'border-red-500' : 'border-gray-200'}`}
                        />
                        {errors.labelName && <p className="text-red-500 text-xs mt-1">{errors.labelName}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Field Slug <span className="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            placeholder="customer_age"
                            value={formData.fieldSlug}
                            readOnly={isEditing}
                            onChange={(e) => handleInputChange('fieldSlug', e.target.value)}
                            className={`w-full border p-2 h-10 mt-1 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 transition-colors ${errors.fieldSlug ? 'border-red-500' : 'border-gray-200'} ${isEditing ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}`}
                        />
                        {errors.fieldSlug && <p className="text-red-500 text-xs mt-1">{errors.fieldSlug}</p>}
                    </div>

                    <div className="relative">
                        <label className="block text-sm font-medium text-gray-700 mb-0">
                            Data Type <span className="text-red-600">*</span>
                        </label>
                        <SmartDropdown
                            items={dropdownItems}
                            value={formData.dataType}
                            onChange={() => { }}
                            onSelect={(item) => handleInputChange('dataType', item ? item.id.toString() : "")}
                            selectedItem={selectedDataTypeItem}
                            placeholder="Select Type..."
                            serverside={false}
                            disabled={isEditing}
                        />
                        {errors.dataType && <p className="text-red-500 text-xs mt-1">{errors.dataType}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Help Text
                        </label>
                        <input
                            type="text"
                            placeholder="Instructions for the user..."
                            value={formData.helpText}
                            onChange={(e) => handleInputChange('helpText', e.target.value)}
                            className="w-full border p-2 h-10 mt-1 rounded-md text-sm text-gray-900 bg-white border-gray-200 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 transition-colors"
                        />
                    </div>
                </div>

                {needsOptions && (
                    <div className={`border p-4 rounded-md bg-gray-50 transition-colors ${errors.options ? 'border-red-300 bg-red-50/50' : 'border-gray-200'}`}>
                        <div className="flex justify-between items-center mb-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">
                                    Field Options <span className="text-purple-600">*</span>
                                </label>
                                {errors.options && <p className="text-red-500 text-xs mt-0.5">{errors.options}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={addOption}
                                className="text-sm bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                            >
                                <Plus size={14} /> Add Option
                            </button>
                        </div>

                        {formData.options?.length === 0 && (
                            <p className="text-sm text-gray-500 italic text-center py-2">No options added yet. Click "Add Option" to begin.</p>
                        )}

                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                            {formData.options?.map((opt, idx) => (
                                <div key={idx} className="flex gap-2 items-start">
                                    <div className="flex-1">
                                        <input
                                            placeholder="Label (e.g., Retail)"
                                            value={opt.label}
                                            onChange={(e) => handleOptionChange(idx, 'label', e.target.value)}
                                            className={`w-full border p-2 h-10 mt-1 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 ${errors.options && !opt.label.trim() ? 'border-red-400' : 'border-gray-200'}`}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            placeholder="Value (e.g., retail)"
                                            value={opt.value}
                                            onChange={(e) => handleOptionChange(idx, 'value', e.target.value)}
                                            className={`w-full border p-2 h-10 mt-1 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 ${errors.options && !opt.value.trim() ? 'border-red-400' : 'border-gray-200'}`}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeOption(idx)}
                                        className="text-gray-400 hover:text-red-500 p-2 mt-2 transition-colors cursor-pointer"
                                        aria-label="Remove option"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex gap-6 py-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.isMandatory}
                            onChange={(e) => handleInputChange('isMandatory', e.target.checked)}
                            className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-600"
                        />
                        Is Mandatory?
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={formData.showInTable}
                            onChange={(e) => handleInputChange('showInTable', e.target.checked)}
                            className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-600"
                        />
                        Show In Table?
                    </label>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                    <button
                        type="button"
                        onClick={resetAndClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <SubmitButton isLoading={isLoading}>
                        {isLoading ? 'Saving...' : (isEditing ? 'Update Field' : 'Save Field')}
                    </SubmitButton>
                </div>
            </form>
        </Modal>
    );
};

export default CustomFieldForm;