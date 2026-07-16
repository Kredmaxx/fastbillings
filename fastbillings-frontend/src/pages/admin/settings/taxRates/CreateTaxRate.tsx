import React, { useState, useEffect } from 'react';
import InputField from '@components/admin/InputField';
import Switch from '@components/admin/Switch';
import SubmitButton from '@components/admin/SubmitButton';
import axios, { AxiosError } from 'axios';
import Constants from '@constants/api';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { TaxRegime, TaxKind } from '@models/taxRate';

interface TaxRateFormProps {
    taxRateData?: TaxRateFormData | null;
}

export interface TaxRateFormData {
    id?: string;
    name: string;
    rate: string; // kept as string in form state, parsed on submit
    regime: TaxRegime | '';
    taxKind: TaxKind | '';
    countryId: string;
    stateId: string;
    isActive: boolean;
}

interface ValidationError {
    path?: string;
    param?: string;
    msg?: string;
    message?: string;
}

type ErrorResponse = {
    success?: boolean;
    message?: string;
    errors?: ValidationError[] | Record<string, string>;
};

interface CountryOption {
    id: string;
    name: string;
}

interface StateOption {
    id: string;
    name: string;
}

const REGIME_OPTIONS: { value: TaxRegime; label: string }[] = [
    { value: 'GST_INDIA', label: 'GST (India)' },
    { value: 'VAT_GENERIC', label: 'VAT (Generic)' },
    { value: 'US_SALES_TAX', label: 'US Sales Tax' },
    { value: 'NONE', label: 'None' },
];

const TAX_KIND_OPTIONS: { value: TaxKind; label: string }[] = [
    { value: 'CGST', label: 'CGST' },
    { value: 'SGST', label: 'SGST' },
    { value: 'IGST', label: 'IGST' },
    { value: 'UTGST', label: 'UTGST' },
    { value: 'CESS', label: 'CESS' },
    { value: 'VAT', label: 'VAT' },
    { value: 'SALES_TAX', label: 'Sales Tax' },
];

const initialFormData: TaxRateFormData = {
    name: '',
    rate: '',
    regime: '',
    taxKind: '',
    countryId: '',
    stateId: '',
    isActive: true,
};

const regimeRequiresTaxKind = (regime: TaxRegime | ''): boolean =>
    regime === 'GST_INDIA' || regime === 'US_SALES_TAX';

const TaxRateForm: React.FC<TaxRateFormProps> = ({ taxRateData = null }) => {
    const [formData, setFormData] = useState<TaxRateFormData>(initialFormData);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const { token } = useSelector((state: RootState) => state.auth);
    const [isEditMode, setIsEditMode] = useState(!!taxRateData);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    const [countries, setCountries] = useState<CountryOption[]>([]);
    const [states, setStates] = useState<StateOption[]>([]);
    const [isLoadingCountries, setIsLoadingCountries] = useState(false);
    const [isLoadingStates, setIsLoadingStates] = useState(false);

    useEffect(() => {
        if (taxRateData) {
            setFormData({
                id: taxRateData.id,
                name: taxRateData.name || '',
                rate: taxRateData.rate || '',
                regime: taxRateData.regime || '',
                taxKind: taxRateData.taxKind || '',
                countryId: taxRateData.countryId || '',
                stateId: taxRateData.stateId || '',
                isActive: taxRateData.isActive,
            });
            setIsEditMode(true);
        }
    }, [taxRateData]);

    useEffect(() => {
        const fetchCountries = async () => {
            try {
                setIsLoadingCountries(true);
                const response = await axios.get(Constants.FETCH_COUNTRIES_URL, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const list: CountryOption[] = (response.data || []).map((c: { id: string; name: string }) => ({
                    id: String(c.id),
                    name: c.name,
                }));
                setCountries(list);
            } catch (error) {
                console.error('Failed to load countries:', error);
            } finally {
                setIsLoadingCountries(false);
            }
        };
        fetchCountries();
    }, [token]);

    useEffect(() => {
        if (!formData.countryId) {
            setStates([]);
            return;
        }
        const fetchStates = async () => {
            try {
                setIsLoadingStates(true);
                const response = await axios.get(`${Constants.FETCH_STATES_URL}/${formData.countryId}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                const list: StateOption[] = (response.data || []).map((s: { id: string; name: string }) => ({
                    id: String(s.id),
                    name: s.name,
                }));
                setStates(list);
            } catch (error) {
                console.error('Failed to load states:', error);
            } finally {
                setIsLoadingStates(false);
            }
        };
        fetchStates();
    }, [formData.countryId, token]);

    const handleFormChange = (field: keyof TaxRateFormData, value: string | boolean) => {
        setFormData((prev) => {
            const next: TaxRateFormData = { ...prev, [field]: value } as TaxRateFormData;
            // When regime changes, clear taxKind if no longer applicable
            if (field === 'regime') {
                if (!regimeRequiresTaxKind(value as TaxRegime | '')) {
                    next.taxKind = '';
                }
            }
            // When country changes, clear state
            if (field === 'countryId') {
                next.stateId = '';
            }
            return next;
        });
        if (formErrors[field]) {
            setFormErrors((prev) => ({ ...prev, [field]: '' }));
        }
    };

    const validateForm = (): boolean => {
        const errors: { [key: string]: string } = {};

        if (!formData.name.trim()) {
            errors.name = 'Name is required.';
        } else if (formData.name.length > 50) {
            errors.name = 'Name must be at most 50 characters.';
        }

        if (!formData.regime) {
            errors.regime = 'Regime is required.';
        }

        if (regimeRequiresTaxKind(formData.regime) && !formData.taxKind) {
            errors.taxKind = 'Tax kind is required for this regime.';
        }

        if (!formData.rate.trim()) {
            errors.rate = 'Rate is required.';
        } else {
            const rateNum = Number(formData.rate);
            if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
                errors.rate = 'Rate must be a number between 0 and 100.';
            }
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            toast.error('Please fix the errors in the form.');
            return false;
        }
        setFormErrors({});
        return true;
    };

    const applyServerErrors = (errors: ErrorResponse['errors']) => {
        if (!errors) return;
        const mapped: { [key: string]: string } = {};
        if (Array.isArray(errors)) {
            errors.forEach((err) => {
                const key = err.path || err.param || '';
                const msg = err.msg || err.message || 'Invalid value';
                if (key) {
                    mapped[key] = msg;
                }
            });
        } else if (typeof errors === 'object') {
            Object.entries(errors).forEach(([key, value]) => {
                mapped[key] = String(value);
            });
        }
        if (Object.keys(mapped).length > 0) {
            setFormErrors(mapped);
        }
    };

    const buildPayload = (): Record<string, unknown> => {
        const payload: Record<string, unknown> = {
            name: formData.name.trim(),
            rate: Number(formData.rate),
            regime: formData.regime,
            taxKind: regimeRequiresTaxKind(formData.regime) ? formData.taxKind : null,
            countryId: formData.countryId || null,
            stateId: formData.stateId || null,
            isActive: formData.isActive,
        };
        return payload;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        try {
            setIsSubmitting(true);
            const payload = buildPayload();

            if (isEditMode && formData.id) {
                await axios.put(`${Constants.UPDATE_TAX_RATE_URL}/${formData.id}`, payload, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                toast.success('Tax rate updated successfully');
            } else {
                await axios.post(Constants.CREATE_TAX_RATE_URL, payload, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                });
                toast.success('Tax rate created successfully');
            }
            navigate('/admin/settings/tax-rates');
        } catch (error) {
            const axiosError = error as AxiosError<ErrorResponse>;
            const data = axiosError.response?.data;
            if (data?.errors) {
                applyServerErrors(data.errors);
                toast.error('Please fix the errors in the form.');
            } else {
                toast.error(data?.message || 'Something went wrong. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const showTaxKind = regimeRequiresTaxKind(formData.regime);

    return (
        <div className="p-6 bg-white rounded-lg shadow-md border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-950 mb-6">
                {isEditMode ? 'Edit Tax Rate' : 'Add Tax Rate'}
            </h2>
            <form className="space-y-8" onSubmit={handleSubmit}>
                <section>
                    <h3 className="text-lg font-semibold leading-6 text-gray-950 border-b border-gray-200 pb-2 mb-6">
                        Tax Rate Details
                    </h3>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-6">
                        <InputField
                            id="taxRateName"
                            label="Name"
                            value={formData.name}
                            onChange={(e) => handleFormChange('name', e.target.value)}
                            placeholder="e.g. CGST 9%"
                            maxLength={50}
                            required
                            className="sm:col-span-3"
                            error={formErrors.name}
                        />

                        <div className="sm:col-span-3">
                            <label htmlFor="taxRateRegime" className="block text-sm font-medium text-gray-700">
                                Regime <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="taxRateRegime"
                                name="taxRateRegime"
                                value={formData.regime}
                                onChange={(e) => handleFormChange('regime', e.target.value)}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950"
                            >
                                <option value="">Select regime</option>
                                {REGIME_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            {formErrors.regime && <p className="mt-1 text-sm text-red-500">{formErrors.regime}</p>}
                        </div>

                        {showTaxKind && (
                            <div className="sm:col-span-3">
                                <label htmlFor="taxRateKind" className="block text-sm font-medium text-gray-700">
                                    Tax Kind <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="taxRateKind"
                                    name="taxRateKind"
                                    value={formData.taxKind}
                                    onChange={(e) => handleFormChange('taxKind', e.target.value)}
                                    className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950"
                                >
                                    <option value="">Select tax kind</option>
                                    {TAX_KIND_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                                {formErrors.taxKind && <p className="mt-1 text-sm text-red-500">{formErrors.taxKind}</p>}
                            </div>
                        )}

                        <InputField
                            id="taxRateRate"
                            label="Rate %"
                            type="number"
                            value={formData.rate}
                            onChange={(e) => handleFormChange('rate', e.target.value)}
                            placeholder="e.g. 9.5"
                            required
                            className={showTaxKind ? 'sm:col-span-3' : 'sm:col-span-3'}
                            error={formErrors.rate}
                        />

                        <div className="sm:col-span-3">
                            <label htmlFor="taxRateCountry" className="block text-sm font-medium text-gray-700">
                                Country
                            </label>
                            <select
                                id="taxRateCountry"
                                name="taxRateCountry"
                                value={formData.countryId}
                                onChange={(e) => handleFormChange('countryId', e.target.value)}
                                disabled={isLoadingCountries}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950 disabled:bg-gray-50"
                            >
                                <option value="">{isLoadingCountries ? 'Loading...' : '— Select country (optional) —'}</option>
                                {countries.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                            {formErrors.countryId && <p className="mt-1 text-sm text-red-500">{formErrors.countryId}</p>}
                        </div>

                        <div className="sm:col-span-3">
                            <label htmlFor="taxRateState" className="block text-sm font-medium text-gray-700">
                                State
                            </label>
                            <select
                                id="taxRateState"
                                name="taxRateState"
                                value={formData.stateId}
                                onChange={(e) => handleFormChange('stateId', e.target.value)}
                                disabled={!formData.countryId || isLoadingStates}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950 disabled:bg-gray-50"
                            >
                                <option value="">
                                    {!formData.countryId
                                        ? '— Select country first —'
                                        : isLoadingStates
                                            ? 'Loading...'
                                            : '— Select state (optional) —'}
                                </option>
                                {states.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            {formErrors.stateId && <p className="mt-1 text-sm text-red-500">{formErrors.stateId}</p>}
                        </div>

                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                            <div className="flex items-center gap-3">
                                <Switch
                                    name="taxRateIsActive"
                                    checked={formData.isActive}
                                    onChange={(e) => handleFormChange('isActive', e.target.checked)}
                                />
                                <span className="text-sm text-gray-700">
                                    {formData.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="flex items-center justify-end gap-x-4 pt-6 border-gray-200">
                    <button
                        type="button"
                        onClick={() => navigate('/admin/settings/tax-rates')}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode={isEditMode ? 'edit' : 'create'} />
                </div>
            </form>
        </div>
    );
};

export default TaxRateForm;
