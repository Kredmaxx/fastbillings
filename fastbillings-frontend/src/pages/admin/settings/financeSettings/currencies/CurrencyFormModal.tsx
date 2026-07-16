import { useEffect, useState } from "react";
import Modal from "../../../../../components/admin/Modal";
import Switch from "../../../../../components/admin/Switch";
import axios, { AxiosError } from "axios";
import Constants from "../../../../../constants/api";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "../../../../../store";
import { toast } from "sonner";
import { fetchSystemSettings } from "@store/systemSettingsSlice";
import SubmitButton from "@components/admin/SubmitButton";

interface CurrencyFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    editData?: CurrencyFormData | null;
}

interface CurrencyFormData {
    id?: string;
    name: string;
    code: string;
    symbol: string;
    status?: boolean;
    isDefault?: boolean;
}

const initialCurrencyFormData: CurrencyFormData = {
    name: '',
    code: '',
    symbol: '',
    isDefault: false
}

const CurrencyFormModal: React.FC<CurrencyFormModalProps> = ({ isOpen, onClose, onSuccess, editData }) => {
    const [currencyFormData, setCurrencyFormData] = useState<CurrencyFormData>(initialCurrencyFormData);
    const [currencyFormErrors, setCurrencyFormErrors] = useState<{ [key: string]: string }>({});
    const { token } = useSelector((state: RootState) => state.auth);
    const [isSaving, setIsSaving] = useState(false);
    const dispatch: AppDispatch = useDispatch();
    useEffect(() => {
        if (editData) {
            setCurrencyFormData(editData);
        } else {
            setCurrencyFormData(initialCurrencyFormData);
        }
        setCurrencyFormErrors({});
    }, [editData]);

    const validateForm = () => {
        const errors: { [key: string]: string } = {};
        if (currencyFormData.name.trim() === '') {
            errors.name = 'Name is required';
        }
        if (currencyFormData.code.trim() === '') {
            errors.code = 'Code is required';
        }
        if (currencyFormData.symbol.trim() === '') {
            errors.symbol = 'Symbol is required';
        }
        setCurrencyFormErrors(errors);
        return Object.values(errors).every(error => error === '');
    }
    const handleSubmit = async (_: React.FormEvent<HTMLFormElement>) => {
        if (!validateForm()) return;
        try {
            setIsSaving(true);
            if (editData) {
                await axios.put(Constants.UPDATE_CURRENCY_URL + `/${editData.id}`, currencyFormData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Currency updated successfully');
                onSuccess();
            } else {
                await axios.post(Constants.CREATE_NEW_CURRENCY_URL, currencyFormData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Currency created successfully');
                onSuccess();
            }
            if (token) dispatch(fetchSystemSettings(token));
        } catch (error) {
            const axiosError = error as AxiosError<{ errors: any }>;
            if (axiosError.response?.data?.errors) {
                setCurrencyFormErrors(axiosError.response.data.errors);
            }
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={editData ? 'Edit Currency' : 'Create New Currency'}>
            <form className="space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }}>
                {/* name */}
                <div className="mb-4">
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700  mb-2">
                        Name <em className="text-red-500">*</em>
                    </label>
                    <input
                        type="text"
                        id="name"
                        className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                        value={currencyFormData.name}
                        onChange={(e) => setCurrencyFormData({ ...currencyFormData, name: e.target.value })}
                    />
                    {currencyFormErrors.name && <span className="text-red-500 text-sm">{currencyFormErrors.name}</span>}
                </div>

                {/* code */}
                <div className="mb-4">
                    <label htmlFor="code" className="block text-sm font-medium text-gray-700  mb-2">
                        Code <em className="text-red-500">*</em>
                    </label>
                    <input
                        type="text"
                        id="code"
                        className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                        value={currencyFormData.code}
                        onChange={(e) => setCurrencyFormData({ ...currencyFormData, code: e.target.value })}
                    />
                    {currencyFormErrors.code && <span className="text-red-500 text-sm">{currencyFormErrors.code}</span>}
                </div>

                {/* symbol */}
                <div className="mb-4">
                    <label htmlFor="symbol" className="block text-sm font-medium text-gray-700  mb-2">
                        Symbol <em className="text-red-500">*</em>
                    </label>
                    <input
                        type="text"
                        id="symbol"
                        className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                        value={currencyFormData.symbol}
                        onChange={(e) => setCurrencyFormData({ ...currencyFormData, symbol: e.target.value })}
                    />
                    {currencyFormErrors.symbol && <span className="text-red-500 text-sm">{currencyFormErrors.symbol}</span>}
                </div>

                {/* isDefault  use Switch component*/}
                <div className="mb-4 flex items-center gap-2">
                    <label htmlFor="isDefault" className="block text-sm font-medium text-gray-700 ">
                        Is Default
                    </label>
                    <Switch name="isDefault" checked={currencyFormData.isDefault || false} onChange={(e) => setCurrencyFormData({ ...currencyFormData, isDefault: e.target.checked })} disabled={currencyFormData.isDefault} />
                </div>

                <div className="flex justify-between">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-gray-100 hover:bg-gray-50 text-gray-950 px-4 py-2 rounded-md shadow cursor-pointer flex items-center gap-2 cursor-pointer"
                    >
                        Cancel
                    </button>
                    <SubmitButton isDisabled={isSaving} isLoading={isSaving} mode={editData ? 'edit' : 'create'} />
                </div>
            </form>
        </Modal>
    );
}

export default CurrencyFormModal;