import DateInput from "@components/admin/DateInput";
import Modal from "@components/admin/Modal";
import SmartDropdown from "@components/admin/SmartDropdown";
import SubmitButton from "@components/admin/SubmitButton";
import Constants from "@constants/api";
import { useDebounce } from "@hooks/useDebounce";
import type { OptionType } from "@models/common";
import type { InvoicePaymentDetails, InvoicePaymentFormData } from "@models/invoice-payment";
import type { RootState } from "@store/index";
import axios, { AxiosError } from "axios";
import type React from "react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoiceItem: InvoicePaymentDetails,
    onSuccess: () => void
}

const initialFormData: InvoicePaymentFormData = {
    invoiceId: '',
    received_on: new Date(),
    amount: 0,
    payment_method: null,
    bankId: null,
    notes: ''
}
const InvoicePaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, invoiceItem, onSuccess }) => {
    let paymentMethodOptions: OptionType[] = [];

    useEffect(() => {
        if (isOpen && invoiceItem) {
            setPaymentFormData({
                ...initialFormData,
                invoiceId: invoiceItem.id,
            });
            setFormErrors({});
        }
    }, [isOpen, invoiceItem]);

    if (invoiceItem.paymentMethods) {
        paymentMethodOptions = invoiceItem.paymentMethods.map((method) => ({
            id: method.id,
            name: method.name
        }));
    }
    const [paymentFormData, setPaymentFormData] = useState<InvoicePaymentFormData>({} as InvoicePaymentFormData);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({})
    const { token } = useSelector((state: RootState) => state.auth);
    const [isSaving, setIsSaving] = useState(false);
    const [bankAccountOptions, setBankAccountOptions] = useState<OptionType[]>([]);
    const [bankSearchKeyword, setBankSearchKeyword] = useState('');
    const debouncedSearchTermBankAccount = useDebounce(bankSearchKeyword, 500);
    const [paymentModeSearchKeyword, setPaymentModeSearchKeyword] = useState('');

    useEffect(() => {
        const fetchBankAccounts = async () => {
            try {
                const response = await axios.get(Constants.FETCH_BANK_ACCOUNTS_WITH_SEARCH_URL, {
                    params: { search: debouncedSearchTermBankAccount },
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.data.data.length > 0) {
                    const formattedBankAccounts = response.data.data.map((item: any) => {
                        let accountNumber = item.accountNumber ?? "";
                        let name = item.accountHoldername ?? "";
                        let bankName = item.bankName ?? "";
                        let formattedBankName = `[${accountNumber}] ${name} - ${bankName}`;
                        return {
                            id: item.id,
                            name: formattedBankName
                        }
                    });
                    setBankAccountOptions(formattedBankAccounts);
                } else {
                    setBankAccountOptions([]);
                }
            } catch (error) {
                console.error("Error fetching bank accounts:", error);
            }
        }
        fetchBankAccounts();
    }, [debouncedSearchTermBankAccount]);

    const handleBankAccountSelect = (item: OptionType) => {
        if (item) {
            handleFormChange('bankId', item.id);
        } else {
            handleFormChange('bankId', null);
        }
    }

    const handlePaymentModeSelect = (item: OptionType) => {
        if (item) {
            handleFormChange('payment_method', item.id);
        } else {
            handleFormChange('payment_method', null);
        }
    }
    const handleOnClose = () => {
        onClose();
    }

    const handleFormChange = (field: keyof InvoicePaymentFormData, value: any) => {
        setPaymentFormData(prev => ({ ...prev, [field]: value }));
    }

    const validateForm = (): boolean => {
        const newErrors: { [key: string]: string } = {};

        if (!paymentFormData.received_on) {
            newErrors.received_on = 'Please select a date.';
        }

        if (!paymentFormData.amount) {
            newErrors.amount = 'Please enter an amount.';
        } else {
            if (paymentFormData.amount < 0) {
                newErrors.amount = 'Amount cannot be negative.';
            }
            if (paymentFormData.amount > invoiceItem.payment.remaining) {
                newErrors.amount = 'Amount cannot exceed remaining amount.';
            }
        }

        if (!paymentFormData.payment_method) {
            newErrors.payment_method = 'Please select a payment method.';
        }

        if (!paymentFormData.bankId) {
            newErrors.bankId = 'Please select a bank account.';
        }
        if (Object.keys(newErrors).length > 0) {
            setFormErrors(newErrors);
            return false;
        }

        setFormErrors({});
        return true;
    };
    const handleSubmit = async () => {
        if (!validateForm()) {
            return;
        }
        paymentFormData.invoiceId = invoiceItem.id;
        try {
            setIsSaving(true);
            const response = await axios.post(Constants.CREATE_INVOICE_PAYMENT_URL, paymentFormData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data.data) {
                toast.success('Invoice payment created successfully.');
                handleOnClose();
                onSuccess();
            }
        } catch (error) {
            const axiosError = error as AxiosError as any;
            if (axiosError.response?.data?.error) {
                console.log('error', axiosError.response.data.errors);
                toast.error(axiosError.response.data.error);
            }
        } finally {
            setIsSaving(false);
        }
    }
    return (
        <Modal isOpen={isOpen} onClose={() => handleOnClose()} title="Invoice Payment">
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
                {/* Invoice Number & Amount */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="form-control">
                        <label htmlFor="invoiceNumber" className="block text-sm font-medium text-gray-700 ">
                            Invoice Number
                        </label>
                        <input type="text"
                            id="invoiceNumber"
                            className="border border-gray-300 bg-gray-100 cursor-not-allowed mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                            value={invoiceItem.invoiceNumber} readOnly />
                    </div>
                    <div className="form-control">
                        <label htmlFor="invoiceAmount" className="block text-sm font-medium text-gray-700 ">
                            Invoice Amount
                        </label>
                        <input type="text"
                            id="invoiceAmount"
                            className="border border-gray-300 mt-1 bg-gray-100 cursor-not-allowed rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                            value={invoiceItem.totalAmount} readOnly />
                    </div>
                </div>

                {/* Balance amount & Received Date */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="form-control">
                        <label
                            htmlFor="balanceAmount"
                            className="block text-sm font-medium text-gray-700 ">
                            Balance Amount
                        </label>
                        <input type="text"
                            id="balanceAmount"
                            className="border border-gray-300 mt-1 bg-gray-100 cursor-not-allowed rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                            value={invoiceItem.payment.remaining || 0} readOnly />
                    </div>
                    <div className="form-control">
                        <DateInput
                            label="Received Date"
                            onChange={(newDate) => handleFormChange('received_on', newDate)}
                            value={paymentFormData.received_on || null}
                            minDate={invoiceItem.invoiceDate ? new Date(invoiceItem.invoiceDate) : undefined}
                            isRequired
                        />
                        {formErrors.received_on && <p className="text-red-500 text-xs mt-1">{formErrors.received_on}</p>}
                    </div>
                    {/* Payment Amount */}
                    <div>
                        <label
                            htmlFor="paymentAmount"
                            className="block text-sm font-medium text-gray-700 ">
                            Payment Amount <em className="text-red-500">*</em>
                        </label>
                        <input type="number"
                            id="paymentAmount"
                            onChange={(e) => handleFormChange('amount', Number(e.target.value))}
                            className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {formErrors.amount && <p className="text-red-500 text-xs mt-1">{formErrors.amount}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 ">
                            Payment Method <em className="text-red-500">*</em>
                        </label>
                        <SmartDropdown
                            items={paymentMethodOptions}
                            value={paymentModeSearchKeyword}
                            onChange={setPaymentModeSearchKeyword}
                            onSelect={(item) => handlePaymentModeSelect(item as OptionType)}
                            selectedItem={paymentMethodOptions.find(mode => mode.id === paymentFormData.payment_method) || null}
                            placeholder="Search or Select Payment Method"
                            serverside={false}
                        />

                        {formErrors.payment_method && <p className="text-red-500 text-xs mt-1">{formErrors.payment_method}</p>}
                    </div>
                </div>
                {/* Payment Method Dropdown */}

                <div className='mt-4'>
                    <label htmlFor="bankId" className="block text-sm font-medium text-gray-700">Deposit To <em className="text-red-500">*</em></label>
                    <SmartDropdown
                        items={bankAccountOptions}
                        value={bankSearchKeyword}
                        placeholder="Search or Select Bank Account"
                        onChange={(keyword) => setBankSearchKeyword(keyword)}
                        onSelect={(item) => handleBankAccountSelect(item as OptionType)}
                        selectedItem={bankAccountOptions.find(bank => bank.id === paymentFormData.bankId) || null}
                    />
                    {formErrors.bankId && <p className="text-red-500 text-sm">{formErrors.bankId}</p>}
                </div>

                {/* Payment Note */}
                <div className="form-control mt-4">
                    <label
                        htmlFor="paymentNote"
                        className="block text-sm font-medium text-gray-700 ">
                        Payment Note (optional)
                    </label>
                    <textarea
                        id="paymentNote"
                        onChange={(e) => handleFormChange('notes', e.target.value)}
                        className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"></textarea>
                </div>
                {/* Cancel & Save */}
                <div className="flex justify-end mt-4">
                    <button
                        onClick={() => handleOnClose()}
                        className="bg-gray-200 hover:bg-gray-300 text-gray-950  font-bold py-2 px-4 rounded mr-2 cursor-pointer">
                        Cancel
                    </button>
                    <SubmitButton isDisabled={isSaving} isLoading={isSaving} mode="create" />
                </div>
            </form>
        </Modal>
    );
};

export default InvoicePaymentModal;