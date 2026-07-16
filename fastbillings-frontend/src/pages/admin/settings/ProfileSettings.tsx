import DateInput from "@components/admin/DateInput";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import SearchableDropdown from "@components/admin/SearchableDropdown";
import SubmitButton from "@components/admin/SubmitButton";
import Constants from "@constants/api";
import { useDebounce } from "@hooks/useDebounce";
import type { RootState } from "@store/index";
import axios from "axios";
import { forEach } from "lodash";
import { MapPin, User2Icon } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { isValidPhone, isValidPostalCode, PHONE_ERROR, POSTAL_CODE_ERROR } from "@utils/validation";

// --- Interfaces and Initial State ---

interface ApiProfile {
    profileImage?: string;
    profileImageUrl?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    gender: string;
    dateOfBirth: Date | null;
    address: string;
    country: string | null;
    state: string | null;
    city: string | null;
    postalCode: string;
    profileImageFile?: File | null;
}

interface OptionType {
    id: string;
    name: string;
}

const initialProfile: ApiProfile = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    gender: '',
    dateOfBirth: null,
    address: '',
    country: null,
    state: null,
    city: null,
    postalCode: '',
};

const genderOptions: OptionType[] = [
    { id: 'male', name: 'Male' },
    { id: 'female', name: 'Female' },
    { id: 'other', name: 'Other' },
];

// --- Component ---

const ProfileSettings: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);

    // State Declarations (Simplified and more robust)
    const [profile, setProfile] = useState<ApiProfile>(initialProfile);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [profileImagePreview, setProfileImagePreview] = useState<string>('');

    // Location Dropdown States
    const [selectedCountry, setSelectedCountry] = useState<OptionType | null>(null);
    const [selectedState, setSelectedState] = useState<OptionType | null>(null);
    const [selectedCity, setSelectedCity] = useState<OptionType | null>(null);
    const [countryOptions, setCountryOptions] = useState<OptionType[]>([]);
    const [stateOptions, setStateOptions] = useState<OptionType[]>([]);
    const [cityOptions, setCityOptions] = useState<OptionType[]>([]);

    // Search Input and Debounced Values
    const [countrySearchInput, setCountrySearchInput] = useState<string>('');
    const [stateSearchInput, setStateSearchInput] = useState<string>('');
    const [citySearchInput, setCitySearchInput] = useState<string>('');
    const debouncedCountrySearch = useDebounce(countrySearchInput, 300);
    const debouncedStateSearch = useDebounce(stateSearchInput, 300);
    const debouncedCitySearch = useDebounce(citySearchInput, 300);
    const navigate = useNavigate();
    // Loading States
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);

    // Data Fetching Logic (wrapped in useCallback and cleaned up)
    const fetchUserProfile = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await axios(Constants.FETCH_USER_PROFILE_URL, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = response.data;
            if (data) {
                setProfile({
                    ...initialProfile,
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    gender: data.gender || '',
                    dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : null,
                    address: data.address || '',
                    country: data.country?.id || null,
                    state: data.state?.id || null,
                    city: data.city?.id || null,
                    postalCode: data.postalCode || ''
                });

                if (data.profileImageUrl) setProfileImagePreview(data.profileImageUrl);
                if (data.country) setSelectedCountry({ id: data.country.id, name: data.country.name });
                if (data.state) setSelectedState({ id: data.state.id, name: data.state.name });
                if (data.city) setSelectedCity({ id: data.city.id, name: data.city.name });
            }
        } catch (error) {
            console.error("Failed to fetch user profile", error);
            toast.error("Could not load your profile data.");
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchUserProfile();
    }, [fetchUserProfile]);

    const fetchCountries = useCallback(async () => {
        if (!token) return;
        try {
            const response = await axios(Constants.FETCH_COUNTRIES_URL, {
                params: { search: debouncedCountrySearch },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setCountryOptions(response.data.map((c: any) => ({ id: String(c.id), name: c.name })));
        } catch (error) {
            console.error('Error fetching countries:', error);
        }
    }, [token, debouncedCountrySearch]);

    useEffect(() => {
        fetchCountries();
    }, [fetchCountries]);

    const fetchStates = useCallback(async () => {
        if (!token || !selectedCountry) return;
        try {
            const response = await axios(`${Constants.FETCH_STATES_URL}/${selectedCountry.id}`, {
                params: { search: debouncedStateSearch },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setStateOptions(response.data.map((s: any) => ({ id: String(s.id), name: s.name })));
        } catch (error) {
            console.error('Error fetching states:', error);
        }
    }, [token, selectedCountry, debouncedStateSearch]);

    useEffect(() => {
        if (selectedCountry) fetchStates();
    }, [fetchStates]);

    const fetchCities = useCallback(async () => {
        if (!token || !selectedState) return;
        try {
            const response = await axios(`${Constants.FETCH_CITIES_URL}/${selectedState.id}`, {
                params: { search: debouncedCitySearch },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setCityOptions(response.data.map((c: any) => ({ id: String(c.id), name: c.name })));
        } catch (error) {
            console.error('Error fetching cities:', error);
        }
    }, [token, selectedState, debouncedCitySearch]);

    useEffect(() => {
        if (selectedState) fetchCities();
    }, [fetchCities]);

    // Form Handlers (Centralized and robust logic)
    const handleFormChange = (field: keyof ApiProfile, value: any) => {
        setProfile(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const handleCountryChange = (option: OptionType | null) => {
        setSelectedCountry(option);
        setCountrySearchInput('');
        setSelectedState(null);
        setSelectedCity(null);
        setStateOptions([]);
        setCityOptions([]);
        setStateSearchInput('');
        setCitySearchInput('');
        setProfile(prev => ({ ...prev, country: option?.id ?? null, state: null, city: null }));
    };

    const handleStateChange = (option: OptionType | null) => {
        setSelectedState(option);
        setStateSearchInput('');
        setSelectedCity(null);
        setCityOptions([]);
        setCitySearchInput('');
        setProfile(prev => ({ ...prev, state: option?.id ?? null, city: null }));
    };

    const handleCityChange = (option: OptionType | null) => {
        setSelectedCity(option);
        setCitySearchInput('');
        handleFormChange('city', option?.id ?? null);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setProfileImagePreview(reader.result as string);
            reader.readAsDataURL(file);
            handleFormChange('profileImageFile', file);
        }
    };

    // Form Validation and Submission Logic
    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!profile.firstName) newErrors.firstName = 'First name is required';
        if (!profile.lastName) newErrors.lastName = 'Last name is required';
        if (!profile.email) newErrors.email = 'Email is required';
        else if (!/^\S+@\S+\.\S+$/.test(profile.email)) newErrors.email = 'Invalid email format';
        if (!profile.phone) newErrors.phone = 'Phone number is required';
        else if (!isValidPhone(profile.phone)) newErrors.phone = PHONE_ERROR;
        if (!profile.dateOfBirth) newErrors.dateOfBirth = 'Date of birth is required';
        if (!profile.gender) newErrors.gender = 'Gender is required';
        if (!profile.address) newErrors.address = 'Address is required';
        if (!profile.country) newErrors.country = 'Country is required';
        if (!profile.state) newErrors.state = 'State is required';
        if (!profile.city) newErrors.city = 'City is required';
        if (!profile.postalCode) newErrors.postalCode = 'Postal code is required';
        else if (!isValidPostalCode(profile.postalCode)) newErrors.postalCode = POSTAL_CODE_ERROR;

        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) {
            toast.error("Please correct the errors before saving.");
            return;
        }
        setIsSubmitting(true);
        try {
            const formData = new FormData();
            const profileToSubmit = { ...profile };

            forEach(profileToSubmit, (value, key) => {
                if (!['profileImageFile', 'profileImageUrl', 'profileImage', 'dateOfBirth'].includes(key)) {
                    formData.append(key, value !== null ? String(value) : '');
                }
            });

            if (profileToSubmit.dateOfBirth) {
                formData.append('dateOfBirth', new Date(profileToSubmit.dateOfBirth).toISOString().split('T')[0]);
            }
            if (profileToSubmit.profileImageFile) {
                formData.append('profileImage', profileToSubmit.profileImageFile);
            }

            await axios.put(Constants.UPDATE_PROFILE_URL, formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Profile updated successfully');
        } catch (error) {
            toast.error('Failed to update profile.');
            console.error("Profile update error", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const selectedGenderValue = genderOptions.find(g => g.id === profile.gender) || null;

    if (isLoading) {
        return <div className="flex h-full w-full items-center justify-center p-6"><LoaderSpinner /></div>;
    }

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-bold text-gray-950 ">Account Settings</h1>
            <form onSubmit={handleSubmit} noValidate>
                {/* General Settings */}
                <div className="bg-white p-6 rounded-md border border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-950 mb-6 flex items-center">
                        <User2Icon className="text-purple-600 bg-purple-50 rounded-full p-1 mr-2" size={30} />
                        General Information
                    </h3>
                    <div className="flex items-center mb-8">
                        {profileImagePreview &&
                            <img src={profileImagePreview} alt="Profile"
                                className="w-24 h-24 rounded-full mr-4 object-fill border border-purple-600 "
                            />
                        }
                        <div className="space-y-4">
                            <label htmlFor="profileImage" className="text-md p-1 rounded-sm font-semibold text-white bg-purple-600 hover:bg-gray-950 transition cursor-pointer">Upload New Photo
                                <input type="file" id="profileImage" className="hidden" onChange={handleImageChange} accept="image/png, image/jpeg" />
                            </label>
                            <p className="text-gray-500 font-semibold text-sm mt-2">Recommended size: 256px x 256px</p>
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 mt-4 mb-4">
                        <div className="w-full">
                            <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 ">
                                First Name <em className='text-red-500'>*</em>
                            </label>
                            <input type="text" id="firstName" placeholder="Enter First Name" value={profile.firstName} onChange={(e) => handleFormChange('firstName', e.target.value)} className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.firstName && <p className="text-red-500 text-sm mt-1">{formErrors.firstName}</p>}
                        </div>
                        <div className="w-full">
                            <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 ">
                                Last Name <em className='text-red-500'>*</em>
                            </label>
                            <input type="text" id="lastName" placeholder="Enter Last Name" value={profile.lastName} onChange={(e) => handleFormChange('lastName', e.target.value)} className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.lastName && <p className="text-red-500 text-sm mt-1">{formErrors.lastName}</p>}
                        </div>
                        <div className="w-full">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 ">
                                Email <em className='text-red-500'>*</em>
                            </label>
                            <input type="email" id="email" placeholder="Enter Email" value={profile.email} onChange={(e) => handleFormChange('email', e.target.value)} className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.email && <p className="text-red-500 text-sm mt-1">{formErrors.email}</p>}
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="w-full">
                            <label htmlFor="phone" className="block text-sm font-medium text-gray-700 ">
                                Phone <em className='text-red-500'>*</em>
                            </label>
                            <input type="tel" id="phone" placeholder="Enter Phone number" value={profile.phone} onChange={(e) => handleFormChange('phone', e.target.value)} className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.phone && <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>}
                        </div>
                        <div className="w-full">
                            <label className="block text-sm font-medium text-gray-700 ">Gender <em className='text-red-500'>*</em></label>
                            <SearchableDropdown placeholder="Select Gender" options={genderOptions} value={selectedGenderValue} onChange={(_, val) => handleFormChange('gender', (val as OptionType)?.id ?? '')} />
                            {formErrors.gender && <p className="text-red-500 text-sm mt-1">{formErrors.gender}</p>}
                        </div>
                        <div className="w-full">
                            <DateInput label="Date of Birth" value={profile.dateOfBirth} onChange={(date) => handleFormChange('dateOfBirth', date)} isRequired maxDate={new Date()} />
                            {formErrors.dateOfBirth && <p className="text-red-500 text-sm mt-1">{formErrors.dateOfBirth}</p>}
                        </div>
                    </div>
                </div>

                {/* Address Information */}
                <div className="bg-white p-4 rounded-md border border-gray-200 mt-6">
                    <h3 className="text-xl font-semibold text-gray-950 mb-6 flex items-center">
                        <MapPin className="text-purple-600 bg-purple-50 rounded-full p-1 mr-2" size={30} />
                        Address Information
                    </h3>
                    <div className="w-full mb-4">
                        <label htmlFor="address" className="block text-sm font-medium text-gray-700 ">Address <em className="text-red-500">*</em></label>
                        <textarea id="address" value={profile.address} onChange={(e) => handleFormChange('address', e.target.value)} rows={3} className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {formErrors.address && <p className="text-red-500 text-sm mt-1">{formErrors.address}</p>}
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                        <div className="w-full">
                            <label className="block text-sm font-medium text-gray-700 ">Country <em className="text-red-500">*</em></label>
                            <SearchableDropdown placeholder="Search Country" options={countryOptions} value={selectedCountry} inputValue={countrySearchInput} onInputChange={(_, val) => setCountrySearchInput(val)} onChange={(_, val) => handleCountryChange(val as OptionType | null)} />
                            {formErrors.country && <p className="text-red-500 text-sm mt-1">{formErrors.country}</p>}
                        </div>
                        <div className="w-full">
                            <label className="block text-sm font-medium text-gray-700 ">State <em className="text-red-500">*</em></label>
                            <SearchableDropdown placeholder="Search State" options={stateOptions} value={selectedState} inputValue={stateSearchInput} onInputChange={(_, val) => setStateSearchInput(val)} onChange={(_, val) => handleStateChange(val as OptionType | null)} disabled={!selectedCountry} />
                            {formErrors.state && <p className="text-red-500 text-sm mt-1">{formErrors.state}</p>}
                        </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="w-full">
                            <label className="block text-sm font-medium text-gray-700 ">City <em className="text-red-500">*</em></label>
                            <SearchableDropdown placeholder="Search City" options={cityOptions} value={selectedCity} inputValue={citySearchInput} onInputChange={(_, val) => setCitySearchInput(val)} onChange={(_, val) => handleCityChange(val as OptionType | null)} disabled={!selectedState} />
                            {formErrors.city && <p className="text-red-500 text-sm mt-1">{formErrors.city}</p>}
                        </div>
                        <div className="w-full">
                            <label htmlFor="pincode" className="block text-sm font-medium text-gray-700 ">Pincode <em className="text-red-500">*</em></label>
                            <input type="text" id="pincode" value={profile.postalCode} onChange={(e) => handleFormChange('postalCode', e.target.value)} className="border border-gray-300 mt-1 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                            {formErrors.postalCode && <p className="text-red-500 text-sm mt-1">{formErrors.postalCode}</p>}
                        </div>
                    </div>
                    <div className="flex justify-end mt-4 gap-4">
                        <button type="button"
                            onClick={() => navigate("/admin/dashboard")} className="px-4 py-2 bg-gray-100  text-gray-950  font-semibold rounded-md shadow-sm hover:bg-gray-200  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 cursor-pointer">
                            Cancel
                        </button>
                        <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode="edit" />
                    </div>
                </div>
            </form>
        </div>
    );
};

export default ProfileSettings;