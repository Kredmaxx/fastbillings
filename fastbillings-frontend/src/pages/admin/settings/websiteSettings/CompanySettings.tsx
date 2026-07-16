import React, { useEffect, useMemo, useState } from 'react';
import { Info, Image as ImageIcon, MapPin, UploadCloud } from 'lucide-react';
import axios from 'axios';
import Constants from '@constants/api';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@store/index';
import SearchableDropdown from '@components/admin/SearchableDropdown';
import debounce from 'lodash/debounce';
import { toast } from "sonner";
import { fetchSystemSettings } from '@store/systemSettingsSlice';
import { useNavigate } from 'react-router-dom';
import SubmitButton from '@components/admin/SubmitButton';
import { hasPermission } from '@utils/hasPermission';
import { isValidPhone, PHONE_ERROR } from '@utils/validation';

type OptionType = {
    id: string;
    name: string;
}

interface CompanyFormData {
    companyName: string;
    email: string;
    phone: string;
    address: string;
    city: string | null;
    state: string | null;
    country: string | null;
    pincode: string;
    siteLogo: File | null;
    siteLogo_preview_url?: string | null;
    favicon: File | null;
    favicon_preview_url?: string | null;
    companyLogo: File | null;
    companyLogo_preview_url?: string | null;
    fax: string;
    gstin: string;
    publicBaseUrl: string;
    merchantUpiId: string;
    merchantName: string;
    userId: string | null;
}

const InitialCompanyFormData: CompanyFormData = {
    companyName: '',
    email: '',
    phone: '',
    address: '',
    city: null,
    state: null,
    country: null,
    pincode: '',
    siteLogo: null,
    siteLogo_preview_url: null,
    favicon: null,
    favicon_preview_url: null,
    companyLogo: null,
    companyLogo_preview_url: null,
    fax: '',
    gstin: '',
    publicBaseUrl: '',
    merchantUpiId: '',
    merchantName: '',
    userId: null
};
const CompanySettings: React.FC = () => {
    const [companyFormData, setCompanyFormData] = useState<CompanyFormData>(InitialCompanyFormData);
    //state for dropdown options
    const [countries, setCountries] = useState<OptionType[]>([]);
    const [states, setStates] = useState<OptionType[]>([]);
    const [cities, setCities] = useState<OptionType[]>([]);

    //state for dropdown search
    const [countryInput, setCountryInput] = useState<string>('');
    const [stateInput, setStateInput] = useState<string>('');
    const [cityInput, setCityInput] = useState<string>('');

    //state for loading indicators
    const [loadingCountries, setLoadingCountries] = useState(false);
    const [loadingStates, setLoadingStates] = useState(false);
    const [loadingCities, setLoadingCities] = useState(false);

    //state for selected options
    const [selectedCountry, setSelectedCountry] = useState<OptionType | null>(null);
    const [selectedState, setSelectedState] = useState<OptionType | null>(null);
    const [selectedCity, setSelectedCity] = useState<OptionType | null>(null);

    const logoInputRef = useMemo(() => React.createRef<HTMLInputElement>(), []);
    const faviconInputRef = useMemo(() => React.createRef<HTMLInputElement>(), []);
    const companyIconInputRef = useMemo(() => React.createRef<HTMLInputElement>(), []);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const { token, user } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const dispatch: AppDispatch = useDispatch();
    const navigate = useNavigate();
    //update userid on mount
    useEffect(() => {
        setCompanyFormData(prev => ({ ...prev, userId: user.id }));
    }, [user]);

    useEffect(() => {
        fetchCompanySettings();
    }, []);

    const fetchCompanySettings = async () => {
        try {
            const response = await axios.get(`${Constants.FETCH_COMPANY_SETTINGS_URL}/${user.id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            setCompanyFormData(prev => ({
                ...prev,
                ...response.data.data,
                country: response.data.data.country ? response.data.data.country.id : null,
                state: response.data.data.state ? response.data.data.state.id : null,
                city: response.data.data.city ? response.data.data.city.id : null,
                publicBaseUrl: response.data.data.publicBaseUrl ?? '',
                merchantUpiId: response.data.data.merchantUpiId ?? '',
                merchantName: response.data.data.merchantName ?? '',
                siteLogo: null,
                siteLogo_preview_url: response.data.data.siteLogo,
                favicon: null,
                favicon_preview_url: response.data.data.favicon,
                companyLogo: null,
                companyLogo_preview_url: response.data.data.companyLogo
            }));
            //if country available then set it
            if (response.data.data.country) {
                const countryRes = await axios.get(`${Constants.FETCH_COUNTRY_URL}/${response.data.data.country.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const countryData = countryRes.data;
                const countryObject = { id: countryData.id, name: countryData.name };

                setSelectedCountry(countryObject);
            }
            //if state available then set it
            if (response.data.data.state) {
                const stateRes = await axios.get(`${Constants.FETCH_STATE_URL}/${response.data.data.state.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const stateData = stateRes.data;
                const stateObject = { id: stateData.id, name: stateData.name };
                setSelectedState(stateObject);
            }
            //if city available then set it
            if (response.data.data.city) {
                const cityRes = await axios.get(`${Constants.FETCH_CITY_URL}/${response.data.data.city.id}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                const cityData = cityRes.data;
                const cityObject = { id: cityData.id, name: cityData.name };
                setSelectedCity(cityObject);
            }
        } catch (error) {
            console.error('Error fetching company settings:', error);
        }
    }
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCompanyFormData(prev => ({ ...prev, [name]: value }));
    }

    const handleLogoUploadClick = () => {
        logoInputRef.current?.click();
    }

    const handleFaviconUploadClick = () => {
        faviconInputRef.current?.click();
    }
    const handleCompanyIconUploadClick = () => {
        companyIconInputRef.current?.click();
    }
    const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            setFormErrors(prev => ({ ...prev, siteLogo: 'Only JPG, JPEG, PNG, or WEBP files are allowed' }));
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setFormErrors(prev => ({ ...prev, siteLogo: 'File size must be less than 2MB' }));
            return;
        }
        const img = new Image();
        img.onload = () => {
            // If all validations pass → set state
            const reader = new FileReader();
            reader.onloadend = () => {
                setCompanyFormData((prev) => ({
                    ...prev,
                    siteLogo_preview_url: reader.result as string,
                    siteLogo: file,
                }));
            };
            reader.readAsDataURL(file);
        };

        img.src = URL.createObjectURL(file);
    };

    const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            setFormErrors(prev => ({ ...prev, favicon: 'Only JPG, JPEG, PNG, or WEBP files are allowed' }));
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setFormErrors(prev => ({ ...prev, favicon: 'File size must be less than 2MB' }));
            return;
        }
        const img = new Image();
        img.onload = () => {
            // If all validations pass → set state
            const reader = new FileReader();
            reader.onloadend = () => {
                setCompanyFormData((prev) => ({
                    ...prev,
                    favicon_preview_url: reader.result as string,
                    favicon: file,
                }));
            };
            reader.readAsDataURL(file);
        };

        img.src = URL.createObjectURL(file);
    };

    const handleCompanyIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            setFormErrors(prev => ({ ...prev, companyLogo: 'Only JPG, JPEG, PNG, or WEBP files are allowed' }));
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            setFormErrors(prev => ({ ...prev, companyLogo: 'File size must be less than 2MB' }));
            return;
        }
        const img = new Image();
        img.onload = () => {
            // If all validations pass → set state
            const reader = new FileReader();
            reader.onloadend = () => {
                setCompanyFormData((prev) => ({
                    ...prev,
                    companyLogo_preview_url: reader.result as string,
                    companyLogo: file,
                }));
            };
            reader.readAsDataURL(file);
        };

        img.src = URL.createObjectURL(file);
    };

    const handleDropdownChange = (fieldName: 'country' | 'state' | 'city', value: OptionType | null) => {
        setCompanyFormData(prev => ({ ...prev, [fieldName]: value ? value.id : null }));

        if (fieldName === 'country') {
            setSelectedCountry(value);
            // Reset children when parent changes
            setSelectedState(null);
            setSelectedCity(null);
            setCompanyFormData(prev => ({ ...prev, state: null, city: null }));
            setStates([]);
            setCities([]);
        }
        if (fieldName === 'state') {
            setSelectedState(value);
            // Reset child when parent changes
            setSelectedCity(null);
            setCompanyFormData(prev => ({ ...prev, city: null }));
            setCities([]);
        }
        if (fieldName === 'city') {
            setSelectedCity(value);
        }
    };

    const fetchCountries = async (searchTerm?: string) => {
        try {
            setLoadingCountries(true);
            const response = await axios.get(Constants.FETCH_COUNTRIES_URL, {
                params: { search: searchTerm },
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const transformedCountries = response.data.map((country: any) => ({
                id: String(country.id),
                name: country.name
            }));

            setCountries(transformedCountries);
        } catch (error) {
            console.error('Error fetching countries:', error);
        } finally {
            setLoadingCountries(false);
        }
    }

    const debouncedFetchCountries = useMemo(() => debounce(fetchCountries, 500), [token]);

    const fetchStates = async (countryId: string, searchTerm?: string) => {

        try {
            setLoadingStates(true);
            const response = await axios.get(`${Constants.FETCH_STATES_URL}/${countryId}`, {
                params: { search: searchTerm },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const transformedStates = response.data.map((state: any) => ({
                id: String(state.id),
                name: state.name
            }));
            setStates(transformedStates);
        } catch (error) {
            console.error('Error fetching states:', error);
        } finally {
            setLoadingStates(false);
        }
    }

    const fetchCities = async (stateId: string, searchTerm?: string) => {
        try {
            setLoadingCities(true);
            const response = await axios.get(`${Constants.FETCH_CITIES_URL}/${stateId}`, {
                params: { search: searchTerm },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const transformedCities = response.data.map((city: any) => ({
                id: String(city.id),
                name: city.name
            }));
            setCities(transformedCities);
        } catch (error) {
            console.error('Error fetching cities:', error);
        } finally {
            setLoadingCities(false);
        }
    };

    const debouncedFetchStates = useMemo(() => debounce(fetchStates, 500), [token]);
    const debouncedFetchCities = useMemo(() => debounce(fetchCities, 500), [token]);

    useEffect(() => {
        debouncedFetchCountries(countryInput);
        return () => debouncedFetchCountries.cancel();
    }, [countryInput, debouncedFetchCountries]);

    useEffect(() => {
        if (companyFormData.country) {
            debouncedFetchStates(String(companyFormData.country), stateInput);
        }
        return () => debouncedFetchStates.cancel();
    }, [companyFormData.country, stateInput, debouncedFetchStates]);

    useEffect(() => {
        if (companyFormData.state) {
            debouncedFetchCities(String(companyFormData.state), cityInput);
        }
        return () => debouncedFetchCities.cancel();
    }, [companyFormData.state, cityInput, debouncedFetchCities]);

    const validateCompanyForm = () => {
        const errors: { [key: string]: string } = {};

        if (!companyFormData.companyName) {
            errors.companyName = 'Company name is required';
        } else if (companyFormData.companyName.length < 3) {
            errors.companyName = 'Company name must be at least 3 characters';
        } else if (companyFormData.companyName.length > 50) {
            errors.companyName = 'Company name must be less than 50 characters';
        }

        // email
        if (!companyFormData.email) {
            errors.email = 'Email is required';
        } else if (!emailRegex.test(companyFormData.email)) {
            errors.email = 'Email is invalid';
        }

        // phone
        if (!companyFormData.phone) {
            errors.phone = 'Phone is required';
        } else if (!isValidPhone(companyFormData.phone)) {
            errors.phone = PHONE_ERROR;
        }

        // address
        if (!companyFormData.address) {
            errors.address = 'Address is required';
        }

        //pincode
        if (!companyFormData.pincode) {
            errors.pincode = 'Pincode is required';
        }

        //country
        if (!companyFormData.country) {
            errors.country = 'Country is required';
        }

        //state
        if (!companyFormData.state) {
            errors.state = 'State is required';
        }

        //city
        if (!companyFormData.city) {
            errors.city = 'City is required';
        }
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return false;
        }
        setFormErrors({});
        return true;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateCompanyForm()) return;

        try {
            setIsSaving(true);
            const formData = new FormData();
            Object.entries(companyFormData).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    // For files
                    if (key === "siteLogo" && value instanceof File) {
                        formData.append(key, value);
                    } else {
                        formData.append(key, value as string);
                    }
                }
            });

            await axios.put(
                `${Constants.UPDATE_COMPANY_SETTINGS_URL}/${companyFormData.userId}`,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                }
            );

            if (token) dispatch(fetchSystemSettings(token));

            toast.success("Company settings updated successfully");
        } catch (error) {
            console.error("Error updating company settings:", error);
            toast.error("Failed to update company settings");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-950 ">Company Settings</h1>
            </div>

            <form className="space-y-8" onSubmit={handleSubmit}>
                {/* General Information Section */}
                <div className="bg-white  p-6 rounded-lg shadow-sm border border-gray-200 ">
                    <h2 className="text-lg font-semibold text-gray-950  flex items-center gap-3 mb-6">
                        <div className="bg-purple-100  p-2 rounded-md">
                            <Info size={20} className="text-purple-600 " />
                        </div>
                        General Information
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 ">
                                Company Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="companyName"
                                name="companyName"
                                value={companyFormData.companyName}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.companyName && <span className="text-red-500 text-xs">{formErrors.companyName}</span>}
                        </div>
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 ">
                                Email Address <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={companyFormData.email}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.email && <span className="text-red-500 text-xs">{formErrors.email}</span>}
                        </div>
                        <div>
                            <label htmlFor="mobile" className="block text-sm font-medium text-gray-700 ">
                                Mobile Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="phone"
                                name="phone"
                                value={companyFormData.phone}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.phone && <span className="text-red-500 text-xs">{formErrors.phone}</span>}
                        </div>
                        <div>
                            <label htmlFor="fax" className="block text-sm font-medium text-gray-700 ">
                                Fax
                            </label>
                            <input
                                type="text"
                                id="fax"
                                name="fax"
                                value={companyFormData.fax}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.fax && <span className="text-red-500 text-xs">{formErrors.fax}</span>}
                        </div>
                        <div>
                            <label htmlFor="gstin" className="block text-sm font-medium text-gray-700 ">
                                GSTIN
                            </label>
                            <input
                                type="text"
                                id="gstin"
                                name="gstin"
                                value={companyFormData.gstin}
                                onChange={handleInputChange}
                                placeholder="e.g. 22AAAAA0000A1Z5"
                                maxLength={15}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full uppercase text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            <p className="text-xs text-gray-400 mt-1">Shown on GST tax invoice templates</p>
                        </div>
                        <div className="col-span-1 md:col-span-2">
                            <label htmlFor="publicBaseUrl" className="block text-sm font-medium text-gray-700 ">
                                Public base URL
                            </label>
                            <input
                                type="text"
                                id="publicBaseUrl"
                                name="publicBaseUrl"
                                placeholder="https://fastbillings.example.com"
                                value={companyFormData.publicBaseUrl ?? ''}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Defaults to current domain if blank. Used in QR codes on invoices.</p>
                        </div>
                        <div>
                            <label htmlFor="merchantUpiId" className="block text-sm font-medium text-gray-700 ">
                                Merchant UPI ID (optional)
                            </label>
                            <input
                                type="text"
                                id="merchantUpiId"
                                name="merchantUpiId"
                                placeholder="merchant@upi"
                                value={companyFormData.merchantUpiId ?? ''}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Used to render a UPI payment QR on invoice templates. Leave blank to hide.</p>
                        </div>
                        <div>
                            <label htmlFor="merchantName" className="block text-sm font-medium text-gray-700 ">
                                Merchant display name (optional)
                            </label>
                            <input
                                type="text"
                                id="merchantName"
                                name="merchantName"
                                placeholder="Defaults to company name"
                                value={companyFormData.merchantName ?? ''}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            <p className="text-xs text-gray-500 mt-1">Displayed in the UPI app when scanned. Defaults to company name.</p>
                        </div>
                    </div>
                </div>

                {/* Company Images Section */}
                <div className="bg-white  p-6 rounded-lg shadow-sm border border-gray-200 ">
                    <h2 className="text-lg font-semibold text-gray-950  flex items-center gap-3 mb-6">
                        <div className="bg-blue-100  p-2 rounded-md">
                            <ImageIcon size={20} className="text-[#0066FF] " />
                        </div>
                        Company Images
                    </h2>
                    <p className="mb-4 -mt-2 text-sm text-gray-500">
                        These logos appear on invoices, quotations, and other documents you send to customers.
                        They do not replace the FastBillings logo in the app sidebar, header, or browser tab.
                    </p>
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-gray-200 ">
                            <div>
                                <h3 className="font-semibold text-gray-950 ">Document Logo</h3>
                                <p className="text-sm text-gray-500  font-semibold">Shown on invoices and printables</p>
                                {formErrors.siteLogo && <span className="text-red-500 text-xs">{formErrors.siteLogo}</span>}
                            </div>
                            {companyFormData.siteLogo_preview_url ? (
                                <img src={companyFormData.siteLogo_preview_url} alt="Logo Preview" className="w-32 h-auto rounded-md" />
                            ) : (
                                <div className="w-32 h-32 bg-gray-200 rounded-md flex items-center justify-center">
                                    <span className="text-gray-500  font-semibold ">No Preview</span>
                                </div>
                            )
                            }
                            <div className="text-right">
                                <button
                                    onClick={handleLogoUploadClick}
                                    type="button" className="inline-flex items-center justify-center px-4 py-2 bg-purple-600 text-white font-semibold text-sm rounded-md shadow-sm hover:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600">
                                    <UploadCloud size={16} className="mr-2" />
                                    Change Photo
                                </button>
                                <p className="text-xs text-gray-500  mt-1 font-semibold">Recommended size is 250 px * 100 px</p>
                            </div>
                            <input type="file" ref={logoInputRef} className="hidden" name='logo' onChange={handleLogoChange} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b border-gray-200 ">
                            <div>
                                <h3 className="font-semibold text-gray-950 ">Document Favicon / Stamp</h3>
                                <p className="text-sm text-gray-500  font-semibold">Optional small mark for documents (not the app browser icon)</p>
                                {formErrors.favicon && <span className="text-red-500 text-xs">{formErrors.favicon}</span>}
                            </div>
                            {companyFormData.favicon_preview_url ? (
                                <img src={companyFormData.favicon_preview_url} alt="Favicon Preview" className="w-[32px] h-[32px] rounded-md" />
                            ) : (
                                <div className="w-32 h-32 bg-gray-200 rounded-md flex items-center justify-center">
                                    <span className="text-gray-500  font-semibold ">No Preview</span>
                                </div>
                            )}
                            <div className="text-right">
                                <button
                                    onClick={handleFaviconUploadClick}
                                    type="button" className="inline-flex items-center justify-center px-4 py-2 bg-purple-600 text-white font-semibold text-sm rounded-md shadow-sm hover:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600">
                                    <UploadCloud size={16} className="mr-2" />
                                    Change Photo
                                </button>
                                <p className="text-xs text-gray-500  mt-1 font-semibold">Recommended size is 32 px * 32 px</p>
                            </div>
                            <input type="file" ref={faviconInputRef} className="hidden" name='favicon' onChange={handleFaviconChange} />
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-4 py-4 border-b-0">
                            <div>
                                <h3 className="font-semibold text-gray-950 ">Company Icon</h3>
                                <p className="text-sm text-gray-500  font-semibold">Square icon for documents and workspace identity</p>
                                {formErrors.companyLogo && <span className="text-red-500 text-xs">{formErrors.companyLogo}</span>}
                            </div>
                            {companyFormData.companyLogo_preview_url ? (
                                <img src={companyFormData.companyLogo_preview_url} alt="Company Icon Preview" className="w-32 h-auto rounded-md" />
                            ) : (
                                <div className="w-32 h-32 bg-gray-200 rounded-md flex items-center justify-center">
                                    <span className="text-gray-500  font-semibold ">No Preview</span>
                                </div>
                            )}
                            <div className="text-right">
                                <button
                                    onClick={handleCompanyIconUploadClick}
                                    type="button" className="inline-flex items-center justify-center px-4 py-2 bg-purple-600 text-white font-semibold text-sm rounded-md shadow-sm hover:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600">
                                    <UploadCloud size={16} className="mr-2" />
                                    Change Photo
                                </button>
                                <p className="text-xs text-gray-500  mt-1 font-semibold">Recommended size is 100 px * 100 px</p>
                            </div>
                            <input type="file" ref={companyIconInputRef} className="hidden" name='companyIcon' onChange={handleCompanyIconChange} />
                        </div>
                    </div>
                </div>

                {/* Address Information Section */}
                <div className="bg-white  p-6 rounded-lg shadow-sm border border-gray-200 ">
                    <h2 className="text-lg font-semibold text-gray-950  flex items-center gap-3 mb-6">
                        <div className="bg-purple-100  p-2 rounded-md">
                            <MapPin size={20} className="text-purple-600 " />
                        </div>
                        Address Information
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-1 md:col-span-2">
                            <label htmlFor="address" className="block text-sm font-medium text-gray-700 ">
                                Address <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="address"
                                name="address"
                                value={companyFormData.address}
                                onChange={handleInputChange}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.address && <span className="text-red-500 text-xs">{formErrors.address}</span>}
                        </div>
                        <div>
                            <SearchableDropdown
                                label='Country'
                                required
                                options={countries}
                                value={selectedCountry}
                                onInputChange={(_, value) => setCountryInput(value)}
                                onChange={(_, value) => handleDropdownChange('country', value)}
                                loading={loadingCountries}
                            />
                            {formErrors.country && <span className="text-red-500 text-xs">{formErrors.country}</span>}
                        </div>
                        <div>
                            <SearchableDropdown
                                label='State'
                                required
                                options={states}
                                value={selectedState}
                                onInputChange={(_, value) => setStateInput(value)}
                                onChange={(_, value) => handleDropdownChange('state', value)}
                                disabled={!companyFormData.country}
                                loading={loadingStates}
                            />
                            {formErrors.state && <span className="text-red-500 text-xs">{formErrors.state}</span>}
                        </div>
                        <div>
                            <SearchableDropdown
                                label='City'
                                required
                                options={cities}
                                value={selectedCity}
                                onInputChange={(_, value) => setCityInput(value)}
                                onChange={(_, value) => handleDropdownChange('city', value)}
                                disabled={!companyFormData.state}
                                loading={loadingCities}
                            />
                            {formErrors.city && <span className="text-red-500 text-xs">{formErrors.city}</span>}
                        </div>
                        <div className='mt-1'>
                            <label htmlFor="postalCode" className="block text-sm font-medium text-gray-700 ">
                                Postal Code <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                id="postalCode"
                                name="pincode"
                                value={companyFormData.pincode}
                                onChange={(e) => handleInputChange(e)}
                                className="border border-gray-300 rounded-md px-4 py-2 w-full   text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-none"
                            />
                            {formErrors.pincode && <span className="text-red-500 text-xs">{formErrors.pincode}</span>}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-4 pt-4">
                    <button type="button"
                        onClick={() => navigate("/admin/dashboard")} className="px-4 py-2 bg-gray-100  text-gray-950  font-semibold rounded-md shadow-sm hover:bg-gray-200  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 cursor-pointer">
                        Cancel
                    </button>
                    {hasPermission(permissions, 'website-settings', 'edit') &&
                        <SubmitButton
                            isDisabled={isSaving}
                            isLoading={isSaving}
                            mode="edit"
                        />
                    }
                </div>
            </form>
        </div>
    );
}

export default CompanySettings;