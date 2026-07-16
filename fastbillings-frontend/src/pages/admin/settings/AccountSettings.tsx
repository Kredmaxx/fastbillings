import React, { useState, useEffect, useCallback } from 'react';
import Constants from '../../../constants/api';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import { toast } from "sonner";
import type { AxiosError } from 'axios';
import axios from 'axios';
import SearchableDropdown from '@components/admin/SearchableDropdown';
import { User, MapPin } from 'lucide-react';
import SubmitButton from '@components/admin/SubmitButton';

interface LocationItem {
    id: string;
    name: string;
}

interface ApiProfile {
    profileImage?: string;
    profileImageUrl?: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other' | '';
    dateOfBirth: string;
    address: string;
    country: number | string | null;
    state: number | string | null;
    city: number | string | null;
    postalCode: string;
}

interface FormErrors {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    gender?: string;
    dateOfBirth?: string;
    address?: string;
    country?: string;
    state?: string;
    city?: string;
    postalCode?: string;
}

interface Profile extends ApiProfile {
    profileImageFile?: File | null;
}

interface Option {
    id: string;
    name: string;
}

const AccountSettings: React.FC = () => {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loadingProfile, setLoadingProfile] = useState<boolean>(true);
    const [savingProfile, setSavingProfile] = useState<boolean>(false);
    const [profileImagePreview, setProfileImagePreview] = useState<string>('');
    const [countryOptions, setCountryOptions] = useState<Option[]>([]);
    const [stateOptions, setStateOptions] = useState<Option[]>([]);
    const [cityOptions, setCityOptions] = useState<Option[]>([]);
    const [countrySearchInput, setCountrySearchInput] = useState<string>('');
    const [stateSearchInput, setStateSearchInput] = useState<string>('');
    const [citySearchInput, setCitySearchInput] = useState<string>('');
    const [loadingCountries, setLoadingCountries] = useState<boolean>(false);
    const [loadingStates, setLoadingStates] = useState<boolean>(false);
    const [loadingCities, setLoadingCities] = useState<boolean>(false);

    const { token } = useSelector((state: RootState) => state.auth);
    const [formErrors, setFormErrors] = useState<FormErrors>({});

    const fetchCountries = useCallback(async (searchQuery: string = '') => {
        setLoadingCountries(true);
        try {
            const url = searchQuery
                ? `${Constants.FETCH_COUNTRIES_URL}?search=${encodeURIComponent(searchQuery)}`
                : Constants.FETCH_COUNTRIES_URL;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json() as LocationItem[];
            setCountryOptions(data.map(item => ({ id: item.id, name: item.name })));
        } catch (error) {
            toast.error("Failed to fetch countries.");
            setCountryOptions([]);
        } finally {
            setLoadingCountries(false);
        }
    }, [token]);

    const fetchStates = useCallback(async (searchQuery: string = '') => {
        if (!profile?.country) {
            setStateOptions([]);
            return;
        }

        setLoadingStates(true);
        try {
            const baseUrl = `${Constants.FETCH_STATES_URL}/${profile.country}`;
            const url = searchQuery
                ? `${baseUrl}?search=${encodeURIComponent(searchQuery)}`
                : baseUrl;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json() as LocationItem[];
            setStateOptions(data.map(item => ({ id: item.id, name: item.name })));
        } catch (error) {
            setStateOptions([]);
        } finally {
            setLoadingStates(false);
        }
    }, [profile?.country, token]);

    const fetchCities = useCallback(async (searchQuery: string = '') => {
        if (!profile?.state) {
            setCityOptions([]);
            return;
        }

        setLoadingCities(true);
        try {
            const baseUrl = `${Constants.FETCH_CITIES_URL}/${profile.state}`;
            const url = searchQuery
                ? `${baseUrl}?search=${encodeURIComponent(searchQuery)}`
                : baseUrl;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json() as LocationItem[];
            setCityOptions(data.map(item => ({ id: item.id, name: item.name })));
        } catch (error) {
            setCityOptions([]);
        } finally {
            setLoadingCities(false);
        }
    }, [profile?.state, token]);

    useEffect(() => {
        const fetchUserProfile = async () => {
            setLoadingProfile(true);
            try {
                const response = await fetch(Constants.FETCH_USER_PROFILE_URL, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json() as ApiProfile;

                const fetchedProfile: Profile = {
                    ...data,
                    profileImage: data.profileImage || '',
                    dateOfBirth: data.dateOfBirth
                        ? (() => {
                            const d = new Date(data.dateOfBirth);
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, "0");
                            const day = String(d.getDate()).padStart(2, "0");
                            return `${year}-${month}-${day}`;
                        })()
                        : "",
                };

                setProfile(fetchedProfile);
                if (fetchedProfile.profileImageUrl) {
                    setProfileImagePreview(fetchedProfile.profileImageUrl);
                }

                fetchCountries();
            } catch (error) {
                toast.error('Failed to fetch user profile.');
                setProfile({
                    firstName: '',
                    lastName: '',
                    email: '',
                    phone: '',
                    gender: '',
                    dateOfBirth: '',
                    address: '',
                    country: '',
                    state: '',
                    city: '',
                    postalCode: '',
                    profileImageFile: null
                });
            } finally {
                setLoadingProfile(false);
            }
        };
        fetchUserProfile();
    }, [token]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchCountries(countrySearchInput);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [countrySearchInput]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchStates(stateSearchInput);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [stateSearchInput]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            fetchCities(citySearchInput);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [citySearchInput]);

    useEffect(() => {
        if (profile?.country) {
            setStateSearchInput('');
            setCitySearchInput('');
            fetchStates();
        } else {
            setStateOptions([]);
            setCityOptions([]);
        }
    }, [profile?.country]);

    useEffect(() => {
        if (profile?.state) {
            setCitySearchInput('');
            fetchCities();
        } else {
            setCityOptions([]);
        }
    }, [profile?.state]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfile(prev => prev ? { ...prev, [name]: value } : null);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setProfileImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
            setProfile(prev => prev ? { ...prev, profileImageFile: file } : null);
        }
    };

    const handleCountryChange = (value: Option | null) => {
        if (value) {
            setProfile(prev => prev ? { ...prev, country: value.id, state: '', city: '' } : null);
            setCountrySearchInput(value.name);
        } else {
            setProfile(prev => prev ? { ...prev, country: '', state: '', city: '' } : null);
            setCountrySearchInput('');
        }
        setStateSearchInput('');
        setCitySearchInput('');
    };

    const handleStateChange = (value: Option | null) => {
        if (value) {
            setProfile(prev => prev ? { ...prev, state: value.id, city: '' } : null);
            setStateSearchInput(value.name);
        } else {
            setProfile(prev => prev ? { ...prev, state: '', city: '' } : null);
            setStateSearchInput('');
        }
        setCitySearchInput('');
    };

    const handleCityChange = (value: Option | null) => {
        if (value) {
            setProfile(prev => prev ? { ...prev, city: value.id } : null);
            setCitySearchInput(value.name);
        } else {
            setProfile(prev => prev ? { ...prev, city: '' } : null);
            setCitySearchInput('');
        }
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!profile) return;

        setSavingProfile(true);

        try {
            const formData = new FormData();

            Object.keys(profile).forEach(key => {
                const formKey = key as keyof Profile;
                const value = profile[formKey];

                if (
                    formKey !== 'profileImage' &&
                    formKey !== 'profileImageFile' &&
                    formKey !== 'profileImageUrl'
                ) {
                    formData.append(formKey, value !== undefined && value !== null ? String(value) : '');
                }
            });

            if (profile.profileImageFile) {
                formData.append('profileImage', profile.profileImageFile);
            }
            await axios.put(Constants.UPDATE_PROFILE_URL, formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setSavingProfile(false);
            setFormErrors({});
            toast.success('Profile updated successfully.');
        } catch (error) {
            const AxiosError = error as AxiosError<{ errors: FormErrors }>;
            if (AxiosError?.response?.data?.errors) setFormErrors(AxiosError.response.data.errors);
            setSavingProfile(false);
        }
    };

    if (loadingProfile) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-600"></div>
                <p className="ml-4 text-gray-700 text-lg">Loading Profile...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white p-6 md:p-8 shadow-2xl rounded-xl w-full max-w-4xl">
                <h2 className="text-3xl font-extrabold text-gray-950 mb-8 text-center">Account Settings</h2>
                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="bg-white p-6 rounded-lg shadow-inner border border-gray-200">
                        <h3 className="text-xl font-semibold text-gray-950 mb-6 flex items-center">
                            <User className="w-6 h-6 mr-2 text-purple-600" />
                            General Information
                        </h3>
                        <div className="flex flex-col sm:flex-row items-center mb-8">
                            <img
                                src={profileImagePreview || "https://placehold.co/120x120/E0BBE4/FFFFFF?text=Profile"}
                                alt="Profile"
                                className="w-32 h-32 md:w-36 md:h-36 rounded-full object-cover border-4 border-purple-400 shadow-lg mb-4 sm:mb-0 sm:mr-6"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = "https://placehold.co/120x120/E0BBE4/FFFFFF?text=Profile";
                                }}
                            />
                            <div className="flex flex-col items-center sm:items-start">
                                <label htmlFor="profileImage" className="cursor-pointer bg-purple-600 hover:bg-gray-950 text-white font-bold text-sm py-2 px-4 rounded-md shadow-md transition duration-200 ease-in-out">
                                    Upload New Photo
                                    <input type="file" id="profileImage" name="profileImage" accept="image/*" className="hidden" onChange={handleImageChange} />
                                </label>
                                <p className="text-xs text-gray-500 mt-2 text-center sm:text-left">
                                    Recommended: 150×150px. JPG, PNG, or JPEG.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div>
                                <label htmlFor="firstName" className="block text-gray-700 text-sm font-bold mb-2">First Name *</label>
                                <input type="text" id="firstName" name="firstName" value={profile?.firstName || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200" required />
                                {formErrors.firstName && <p className="text-red-500 text-xs mt-2">{formErrors.firstName}</p>}
                            </div>
                            <div>
                                <label htmlFor="lastName" className="block text-gray-700 text-sm font-bold mb-2">Last Name *</label>
                                <input type="text" id="lastName" name="lastName" value={profile?.lastName || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200" />
                                {formErrors.lastName && <p className="text-red-500 text-xs mt-2">{formErrors.lastName}</p>}
                            </div>
                            <div>
                                <label htmlFor="email" className="block text-gray-700 text-sm font-bold mb-2">Email *</label>
                                <input type="email" id="email" name="email" value={profile?.email || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200" required />
                                {formErrors.email && <p className="text-red-500 text-xs mt-2">{formErrors.email}</p>}
                            </div>
                            <div>
                                <label htmlFor="phone" className="block text-gray-700 text-sm font-bold mb-2">Mobile Number *</label>
                                <input type="tel" id="phone" name="phone" value={profile?.phone || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200" required />
                                {formErrors.phone && <p className="text-red-500 text-xs mt-2">{formErrors.phone}</p>}
                            </div>
                            <div>
                                <label htmlFor="gender" className="block text-gray-700 text-sm font-bold mb-2">Gender</label>
                                <select id="gender" name="gender" value={profile?.gender || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200">
                                    <option value="">Select Gender</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">Other</option>
                                </select>
                                {formErrors.gender && <p className="text-red-500 text-xs mt-2">{formErrors.gender}</p>}
                            </div>
                            <div>
                                <label htmlFor="dateOfBirth" className="block text-gray-700 text-sm font-bold mb-2">Date of Birth</label>
                                <input type="date" id="dateOfBirth" name="dateOfBirth" value={profile?.dateOfBirth || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200" />
                                {formErrors.dateOfBirth && <p className="text-red-500 text-xs mt-2">{formErrors.dateOfBirth}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-inner border border-gray-200">
                        <h3 className="text-xl font-semibold text-gray-950 mb-6 flex items-center">
                            <MapPin className="w-6 h-6 mr-2 text-purple-600" />
                            Address Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label htmlFor="address" className="block text-gray-700 text-sm font-bold mb-2">Address *</label>
                                <input type="text" id="address" name="address" value={profile?.address || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200" required />
                                {formErrors.address && <p className="text-red-500 text-xs mt-2">{formErrors.address}</p>}
                            </div>

                            <div>
                                <label className="block text-gray-700 text-sm font-bold mb-2">Country *</label>
                                <SearchableDropdown
                                    options={countryOptions}
                                    placeholder={loadingCountries ? 'Loading...' : 'Select Country'}
                                    value={countryOptions.find(option => option.id === profile?.country) || null}
                                    inputValue={countrySearchInput}
                                    onInputChange={(_, value) => setCountrySearchInput(value)}
                                    onChange={(_, value) => handleCountryChange(value)}
                                    disabled={loadingCountries}
                                    loading={loadingCountries}
                                />
                                {formErrors.country && <p className="text-red-500 text-xs mt-2">{formErrors.country}</p>}
                            </div>

                            <div>
                                <label className="block text-gray-700 text-sm font-bold mb-2">State *</label>
                                <SearchableDropdown
                                    options={stateOptions}
                                    placeholder={loadingStates ? 'Loading...' : 'Select State'}
                                    value={stateOptions.find(option => option.id === profile?.state) || null}
                                    inputValue={stateSearchInput}
                                    onInputChange={(_, value) => setStateSearchInput(value)}
                                    onChange={(_, value) => handleStateChange(value)}
                                    disabled={!profile?.country || loadingStates}
                                    loading={loadingStates}
                                />
                                {formErrors.state && <p className="text-red-500 text-xs mt-2">{formErrors.state}</p>}
                            </div>

                            <div>
                                <label className="block text-gray-700 text-sm font-bold mb-2">City *</label>
                                <SearchableDropdown
                                    options={cityOptions}
                                    placeholder={loadingCities ? 'Loading...' : 'Select City'}
                                    value={cityOptions.find(option => option.id === profile?.city) || null}
                                    inputValue={citySearchInput}
                                    onInputChange={(_, value) => setCitySearchInput(value)}
                                    onChange={(_, value) => handleCityChange(value)}
                                    disabled={!profile?.state || loadingCities}
                                    loading={loadingCities}
                                />
                                {formErrors.city && <p className="text-red-500 text-xs mt-2">{formErrors.city}</p>}
                            </div>

                            <div>
                                <label htmlFor="postalCode" className="block text-gray-700 text-sm font-bold mb-2">Postal Code *</label>
                                <input type="text" id="postalCode" name="postalCode" value={profile?.postalCode || ''} onChange={handleChange} className="shadow-sm appearance-none border border-gray-300 rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-purple-600 transition-all duration-200" required />
                                {formErrors.postalCode && <p className="text-red-500 text-xs mt-2">{formErrors.postalCode}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-center pt-4">
                        <SubmitButton isDisabled={savingProfile} isLoading={savingProfile} mode="edit" />
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AccountSettings;