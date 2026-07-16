import { useState, useEffect } from 'react';
import Modal from '@components/admin/Modal';
import CustomCheckbox from '@components/admin/CustomCheckbox';
import axios from 'axios';
import Constants from '@constants/api';
import { toast } from "sonner";
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@store/index';
import { Info } from 'lucide-react';
import { fetchSystemSettings } from '@store/systemSettingsSlice';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface FormData {
    invoiceNumberType: 'auto' | 'manual';
    prefix: string;
    nextNumber?: string;
}

const InvoiceNumberConfigModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const [showTooltip, setShowTooltip] = useState(false);
    const dispatch: AppDispatch = useDispatch();
    //split next invoice number from session storage for initial value not prefix
    let nextInvoiceNo = sessionStorage.getItem('defaultNextInvNo') || 'INV-000001';
    let prefix = systemSettings?.invoicePrefix || 'INV-';
    let number = nextInvoiceNo.replace(prefix, '');
    const prepareInitialFormData = (): FormData => ({
        invoiceNumberType: systemSettings?.invoiceNumberType ?? 'auto',
        prefix: prefix,
        nextNumber: number
    });

    const [formData, setFormData] = useState<FormData>(prepareInitialFormData());
    const [manualNumber, setManualNumber] = useState('');

    useEffect(() => {
        if (isOpen) {
            setFormData(prepareInitialFormData());
            setManualNumber('');
        }
    }, [isOpen]);

    const handleAutoGenerateChange = (checked: boolean) => {
        setFormData(prev => ({
            ...prev,
            invoiceNumberType: checked ? 'auto' : 'manual'
        }));
    };

    const handlePrefixChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({
            ...prev,
            prefix: e.target.value
        }));
    };

    const handleNextNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        //allow only numbers
        const numericValue = e.target.value.replace(/[^0-9]/g, '');
        setFormData(prev => ({
            ...prev,
            nextNumber: numericValue
        }));
    };

    const handleManualNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setManualNumber(e.target.value);
    };

    const handleSave = async () => {
        if (formData.invoiceNumberType === 'manual' && !manualNumber.trim()) {
            alert('Please enter an invoice number for manual mode');
            return;
        }
        let payloadData = {
            settings: [
                {
                    key: 'invoicePrefix',
                    value: formData.prefix,
                    groupSlug: 'invoice'
                },
                {
                    key: 'nextInvoiceNo',
                    value: formData.invoiceNumberType === 'manual' ? manualNumber : formData.nextNumber,
                    groupSlug: 'invoice'
                },
                {
                    key: 'invoiceNumberType',
                    value: formData.invoiceNumberType,
                    groupSlug: 'invoice'
                }
            ]
        }
        try {
            await axios.post(Constants.CONFIGURE_INVOICE_NUMBER_URL, payloadData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (formData.invoiceNumberType === 'manual') {
                sessionStorage.setItem('nextInvoiceNo', manualNumber);
            } else {
                let formattedNewNumber = formData.prefix + formData.nextNumber;
                sessionStorage.setItem('nextInvoiceNo', formattedNewNumber);
            }
            if (token) dispatch(fetchSystemSettings(token));
            toast.success('Configuration updated successfully.');
            onSuccess();
        } catch (error) {
            toast.error('Failed to update configuration.');
        } finally {
            onClose();
        }
    };

    const handleCancel = () => {
        setFormData(prepareInitialFormData());
        setManualNumber('');
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Invoice Number Configuration">
            <div>
                <h4 className="text-md font-medium text-gray-900 mb-2">Configure Invoice Number Preferences</h4>
                {formData.invoiceNumberType === 'auto' &&
                    <p className="text-gray-600 text-sm mb-6">
                        Your invoice numbers are set on auto-generate mode to save your time. Are you sure about changing this setting?
                    </p>
                }
                {formData.invoiceNumberType === 'manual' &&
                    <p className="text-gray-600 text-sm mb-6">
                        You have selected manual invoice numbering. Do you want us to auto-generate it for you?
                    </p>
                }


                {/* Auto-generate option */}
                <div className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-3 mb-2">
                        <CustomCheckbox
                            checked={formData.invoiceNumberType === 'auto'}
                            onChange={handleAutoGenerateChange}
                        />
                        <div className="flex items-center gap-2 relative">
                            <span className="text-sm font-medium text-gray-900">
                                Continue auto-generating invoice numbers
                            </span>
                            <div
                                className="relative"
                                onMouseEnter={() => setShowTooltip(true)}
                                onMouseLeave={() => setShowTooltip(false)}
                            >
                                <Info size={16} className="text-gray-400 cursor-help" />
                                {/* Tooltip */}
                                {showTooltip && (
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 w-48">
                                        <div className="bg-gray-900 text-white text-xs rounded py-2 px-3 text-center leading-relaxed">
                                            The edited prefix and next number will be updated in the transaction number series associated with your invoice.
                                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    {formData.invoiceNumberType === 'auto' && (
                        <div className="flex gap-4 mt-3 pl-8">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-600">Prefix</label>
                                <input
                                    type="text"
                                    value={formData.prefix}
                                    onChange={handlePrefixChange}
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-transparent"
                                    placeholder="e.g., INV-"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium text-gray-600">Next Number</label>
                                <input
                                    type="text"
                                    value={formData.nextNumber}
                                    onChange={handleNextNumberChange}
                                    className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-transparent"
                                    placeholder="e.g., 000004"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Manual option */}
                <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-3 mb-2">
                        <CustomCheckbox
                            checked={formData.invoiceNumberType === 'manual'}
                            onChange={(checked) => handleAutoGenerateChange(!checked)}
                        />
                        <span className="text-sm font-medium text-gray-900">Enter invoice numbers manually</span>
                    </div>

                    {formData.invoiceNumberType === 'manual' && (
                        <div className="mt-3 pl-8">
                            <input
                                type="text"
                                value={manualNumber}
                                onChange={handleManualNumberChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter invoice number"
                            />
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-md hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:ring-offset-2 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:ring-offset-2 transition-colors"
                    >
                        Save
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default InvoiceNumberConfigModal;