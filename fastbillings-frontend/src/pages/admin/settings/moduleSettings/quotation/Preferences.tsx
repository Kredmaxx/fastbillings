import LoaderSpinner from "@components/admin/LoaderSpinner";
import SmartDropdown from "@components/admin/SmartDropdown";
import SubmitButton from "@components/admin/SubmitButton";
import Constants from "@constants/api";
import { useDebounce } from "@hooks/useDebounce";
import type { OptionType } from "@models/common";
import type { RootState } from "@store/index";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface FormData {
    quoteSalesPersonRole: string;
    quoteTermsConditions: string;
    quoteCustomerNotes: string;
}
const Preferences: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const navigate = useNavigate();
    const [formData, setFormData] = useState<FormData>({
        quoteSalesPersonRole: '',
        quoteTermsConditions: '',
        quoteCustomerNotes: ''
    });
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [roleSearchKeyword, setRoleSearchKeyword] = useState('');
    const debouncedRoleSearch = useDebounce(roleSearchKeyword, 700);
    const [roles, setRoles] = useState<OptionType[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchComponentData = async () => {
            try {
                setIsLoading(true);
                await fetchRoles();
                await fetchGeneralSettings();
            } catch (error) {
                console.error('Error fetching component data:', error);
            } finally {
                setIsLoading(false);
            }
        }
        fetchComponentData();
    }, []);

    const fetchGeneralSettings = async () => {
        try {
            const response = await axios.get(Constants.GET_GENERAL_SETTINGS_URL, {
                params: { groupSlug: 'quotation' },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            let data = response.data.data;
            let settings: { [key: string]: string } = {};
            if (data) {
                data.forEach((setting: any) => {
                    settings[setting.key] = setting.value;
                });
                setFormData({
                    quoteSalesPersonRole: settings.quoteSalesPersonRole || '',
                    quoteTermsConditions: settings.quoteTermsConditions || '',
                    quoteCustomerNotes: settings.quoteCustomerNotes || ''
                });
            }
        } catch (error) {
            console.error('Error fetching general settings:', error);
        }
    }
    const fetchRoles = async () => {
        try {
            const response = await axios.get(Constants.FETCH_ALL_ROLES_URL, {
                params: { search: debouncedRoleSearch },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            let data = response.data.data;
            if (data) {
                const options = data.map((role: any) => ({
                    id: role.id,
                    name: role.roleName
                }));
                setRoles(options);
            } else {
                setRoles([]);
            }
        } catch (error) {
            console.error('Error fetching roles:', error);
        }
    }

    const handleChange = (field: keyof FormData, value: any) => {
        setFormData(prevState => ({
            ...prevState,
            [field]: value
        }));
    }
    const handleRoleSelect = (role: OptionType) => {
        if (role) {
            setFormData(prevState => ({
                ...prevState,
                quoteSalesPersonRole: role.id
            }));
        } else {
            setFormData(prevState => ({
                ...prevState,
                quoteSalesPersonRole: ''
            }));
        }
    }

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.quoteSalesPersonRole) newErrors.quoteSalesPersonRole = 'Role is required.';
        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;
        const payload = {
            settings: [
                {
                    key: 'quoteSalesPersonRole',
                    value: formData.quoteSalesPersonRole,
                    groupSlug: 'quotation'
                },
                {
                    key: 'quoteTermsConditions',
                    value: formData.quoteTermsConditions,
                    groupSlug: 'quotation'
                },
                {
                    key: 'quoteCustomerNotes',
                    value: formData.quoteCustomerNotes,
                    groupSlug: 'quotation'
                }
            ]
        }
        try {
            setIsSubmitting(true);
            await axios.post(Constants.UPDATE_GENERAL_SETTINGS_URL, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Settings updated successfully.');
        } catch (error) {
            toast.error('Failed to update settings.');
        } finally {
            setIsSubmitting(false);
        }

    }
    if (isLoading) {
        return (
            <div className="p-4 md:p-6 bg-gray-50 min-h-full font-sans flex items-center justify-center">
                <LoaderSpinner />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleSubmit}>
                {/* Sales Person Preferences */}
                <div className="mb-2">
                    <div>
                        <p className="text-md font-semibold">Sales Person Preferences</p>
                        <small className="text-gray-500 text-xs">Choose roles that can be assigned to staff members. These roles will appear as "Sales Person" in the quotation module.</small>
                    </div>
                </div>
                <div className="md:w-1/4 lg:w-1/4">
                    <SmartDropdown
                        items={roles}
                        value={roleSearchKeyword}
                        onChange={(keyword) => setRoleSearchKeyword(keyword)}
                        onSelect={(role) => handleRoleSelect(role as OptionType)}
                        placeholder="Search and select role"
                        selectedItem={roles.find(role => role.id === formData.quoteSalesPersonRole) || null}
                    />
                    {formErrors.quoteSalesPersonRole && <p className="text-red-500 text-xs mt-1">{formErrors.quoteSalesPersonRole}</p>}
                </div>
                <hr className="text-gray-300 my-4" />
                {/* Terms and Conditions */}
                <div className="mb-2 mt-4">
                    <div>
                        <p className="text-md font-semibold">Terms and Conditions</p>
                    </div>
                </div>
                <div className="md:w-2/4 lg:w-2/4">
                    <textarea
                        onChange={(e) => handleChange('quoteTermsConditions', e.target.value)}
                        value={formData.quoteTermsConditions}
                        className="border border-gray-300 rounded-md px-4 py-2 w-full text-sm text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                        rows={5}
                    />
                </div>
                {/* Customer Notes */}
                <div className="mb-2">
                    <div>
                        <p className="text-md font-semibold">Customer Notes</p>
                    </div>
                </div>
                <div className="md:w-2/4 lg:w-2/4">
                    <textarea
                        onChange={(e) => handleChange('quoteCustomerNotes', e.target.value)}
                        value={formData.quoteCustomerNotes}
                        className="border border-gray-300 rounded-md px-4 py-2 w-full text-sm text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                        rows={5}
                    />
                </div>
                <div className="flex justify-end">
                    <button type="button" className="bg-white py-2 px-4 border border-gray-300 rounded-md mr-2" onClick={(_) => navigate('/admin')}>Cancel </button>
                    <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode="edit" />
                </div>
            </form>
        </div>
    );
}

export default Preferences;
