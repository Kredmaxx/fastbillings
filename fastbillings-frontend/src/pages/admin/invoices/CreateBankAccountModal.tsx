import { useEffect, useState } from "react";
import Modal from "@components/admin/Modal";
import axios, { AxiosError } from "axios";
import Constants from "@constants/api";
import type { RootState } from "@store/index";
import { useSelector } from "react-redux";
import SubmitButton from "@components/admin/SubmitButton";
import { toast } from "sonner";
import Switch from "@components/admin/Switch";
import type { BankAccountCreatedResponse } from "@models/bank-account";
import SmartDropdown from "@components/admin/SmartDropdown";
import type { OptionType } from "@models/common";
import { BANK_CODE_TYPES, getBankCodeType } from "@constants/bankCodeTypes";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newBankAccount: BankAccountCreatedResponse) => void;
}

interface BankAccountFormData {
    id?: string;
    userId?: string;
    accountHoldername: string;
    bankName: string;
    branchName: string;
    accountNumber: string;
    bankCodeType?: string;
    IFSCCode: string;
    accountType: string;
    openingBalance: number;
    status?: boolean;
}

const bankAccountTypes: OptionType[] = [
    { id: "savings", name: "Savings" },
    { id: "current", name: "Current" },
];
const CreateBankAccountModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const { token, user } = useSelector((state: RootState) => state.auth);

    const setInitialFormData = (): BankAccountFormData => ({
        userId: user.id,
        accountHoldername: "",
        bankName: "",
        branchName: "",
        accountNumber: "",
        bankCodeType: "IFSC",
        IFSCCode: "",
        accountType: "",
        openingBalance: 0,
        status: true,
    });
    const [formData, setFormData] = useState<BankAccountFormData>(setInitialFormData());
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [accountTypeSearchInput, setAccountTypeSearchInput] = useState<string>("");

    // Reset form whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setFormData(setInitialFormData());
            setFormErrors({});
        }
    }, [isOpen]);

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

    const handleBankCodeTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, bankCodeType: e.target.value }));
    }

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.accountHoldername.trim()) newErrors.accountHoldername = 'Account holder name is required.';
        if (!formData.bankName.trim()) newErrors.bankName = 'Bank name is required.';
        if (!formData.accountNumber.trim()) newErrors.accountNumber = 'Account number is required.';
        if (!formData.IFSCCode.trim()) newErrors.IFSCCode = `${getBankCodeType(formData.bankCodeType).label} is required.`;
        if (!formData.accountType) newErrors.accountType = 'Account type is required.';
        if (formData.openingBalance < 0) {
            newErrors.openingBalance = 'Opening balance is required.';
        } else if (formData.openingBalance < 0) {
            newErrors.openingBalance = 'Opening balance cannot be negative.';
        } else if (formData.openingBalance > 9999999999) {
            newErrors.openingBalance = 'Opening balance cannot exceed 9,999,999,999.';
        }
        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;

        const payload = {
            ...formData,
            IFSCCode: formData.IFSCCode.toUpperCase()
        };

        try {
            setIsSubmitting(true);
            const response = await axios.post(Constants.CREATE_BANK_ACCOUNT_URL, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Bank account created successfully');
            onSuccess(response.data.data || {});
        } catch (error: any | AxiosError) {
            setFormErrors(error?.response?.data?.errors || {});
            toast.error('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create Bank Account">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    {/* Account Holder Name */}
                    <div>
                        <label className="block font-medium text-sm text-red-500 ">Account Holder Name <span className="text-red-500">*</span></label>
                        <input name="accountHoldername" value={formData.accountHoldername} onChange={handleChange} type="text" placeholder="Enter Account Holder Name" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {formErrors.accountHoldername && <p className="text-red-500 text-xs mt-1">{formErrors.accountHoldername}</p>}
                    </div>
                    {/* Bank Name */}
                    <div>
                        <label className="block font-medium text-sm text-red-500 ">Bank Name <span className="text-red-500">*</span></label>
                        <input name="bankName" value={formData.bankName} onChange={handleChange} type="text" placeholder="Enter Bank Name" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {formErrors.bankName && <p className="text-red-500 text-xs mt-1">{formErrors.bankName}</p>}
                    </div>
                    {/* Branch Name */}
                    <div>
                        <label className="block font-medium text-sm text-red-500 ">Branch Name <span className="text-red-500">*</span> </label>
                        <input name="branchName" value={formData.branchName} onChange={handleChange} type="text" placeholder="Enter Branch Name" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {formErrors.branchName && <p className="text-red-500 text-xs mt-1">{formErrors.branchName}</p>}
                    </div>
                    {/* accountType */}
                    <div>
                        <label className="block font-medium text-sm text-red-500 ">Account Type <span className="text-red-500">*</span></label>
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
                    {/* Account Number */}
                    <div>
                        <label className="block font-medium text-sm text-red-500 ">Account Number <span className="text-red-500">*</span></label>
                        <input name="accountNumber" value={formData.accountNumber} onChange={handleChange} type="text" placeholder="Enter Account Number" className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {formErrors.accountNumber && <p className="text-red-500 text-xs mt-1">{formErrors.accountNumber}</p>}
                    </div>

                    {/* Bank Code Type */}
                    <div>
                        <label className="block font-medium text-sm text-red-500 ">Bank Code Type</label>
                        <select name="bankCodeType" value={formData.bankCodeType || "IFSC"} onChange={handleBankCodeTypeChange} className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full bg-white text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600">
                            {BANK_CODE_TYPES.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Bank Code (label + placeholder adapt to selected type) */}
                    <div>
                        <label className="block font-medium text-sm text-red-500 ">{getBankCodeType(formData.bankCodeType).label} <span className="text-red-500">*</span></label>
                        <input name="IFSCCode" value={formData.IFSCCode} onChange={handleChange} type="text" placeholder={getBankCodeType(formData.bankCodeType).placeholder} className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {formErrors.IFSCCode && <p className="text-red-500 text-xs mt-1">{formErrors.IFSCCode}</p>}
                    </div>
                    {/* Opening Balance */}
                    <div >
                        <label className="block font-medium text-sm text-gray-700 ">Opening Balance <span className="text-red-500">*</span></label>
                        <input
                            placeholder="Enter Opening Balance"
                            disabled={false}
                            type="number" name="openingBalance" value={formData.openingBalance ? Number(formData.openingBalance) : 0} onChange={handleChange}
                            className={`mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600`}
                        />
                        {formErrors.openingBalance && <p className="text-red-500 text-xs mt-1">{formErrors.openingBalance}</p>}
                    </div>
                </div>
                {/* Status Switch */}
                <div className="flex items-center gap-3 pt-2">
                    <label htmlFor="status" className="font-medium text-sm text-red-500 ">Status</label>
                    <Switch name="status" checked={formData.status ?? false} onChange={handleChange} />
                </div>

                {/* Buttons */}
                <div className="flex justify-end pt-4 space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 cursor-pointer">Cancel</button>
                    <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode={"create"} />
                </div>
            </form>
        </Modal>
    );
}

export default CreateBankAccountModal;
