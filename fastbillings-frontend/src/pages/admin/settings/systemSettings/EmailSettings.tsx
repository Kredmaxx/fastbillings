import Switch from '@components/admin/Switch';
import { Settings, Send } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import nodemail from '@assets/icons/nodeMailer.svg';
import smtpImage from '@assets/icons/smtp.svg';
import Modal from '@components/admin/Modal';
import type { EmailSettingsFormData } from '@models/email-settings';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import axios from 'axios';
import Constants from '@constants/api';
import { toast } from "sonner";
import { hasPermission } from '@utils/hasPermission';
import SubmitButton from '@components/admin/SubmitButton';

const initialFormData: EmailSettingsFormData = {
    provider_type: '',
    userId: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    host: '',
    port: '',
    username: '',
    password: '',
    apiKey: '',
    smtp_status: false,
    node_status: false,
    resend_status: false
};

const EmailSettings: React.FC = () => {
    const { token, user } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [formData, setFormData] = useState<EmailSettingsFormData>(initialFormData);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [configurationType, setConfigurationType] = useState<string>('');
    const [isConfigurationModalOpen, setIsConfigurationModalOpen] = useState<boolean>(false);
    const [configurations, setConfigurations] = useState<any>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [testEmail, setTestEmail] = useState<string>(user?.email || '');
    const [isTesting, setIsTesting] = useState<boolean>(false);
    useEffect(() => {
        fetchConfigurations();
    }, []);

    const handleSendTestEmail = async () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!testEmail || !emailRegex.test(testEmail)) {
            toast.error('Enter a valid recipient email to test.');
            return;
        }
        try {
            setIsTesting(true);
            const res = await axios.post(
                Constants.SEND_TEST_EMAIL_URL,
                { to: testEmail },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success(res.data?.message || 'Test email sent.');
        } catch (error: any) {
            // Surface the real provider error (bad API key, unverified domain, etc.)
            const detail = error?.response?.data?.error || error?.response?.data?.message;
            toast.error(detail ? `Test failed: ${detail}` : 'Failed to send test email.');
        } finally {
            setIsTesting(false);
        }
    };

    const fetchConfigurations = async () => {
        const response = await axios.get(`${Constants.GET_EMAIL_SETTINGS_URL}`, {
            params: { userId: user?.id },
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = response.data.data;
        setConfigurations(data);
    }
    const openConfigurationModal = async (type: 'NodeMail' | 'SMTP' | 'Resend') => {
        setFormData(initialFormData);
        setFormErrors({});
        setConfigurationType(type);
        const data = configurations;
        if (data) {
            const providerType = type === 'NodeMail' ? 'NODE' : type === 'Resend' ? 'RESEND' : 'SMTP';
            setFormData({
                ...initialFormData,
                provider_type: providerType,
                userId: data.userId,
                fromName: type === 'NodeMail' ? data.nodeFromName : type === 'Resend' ? data.resendFromName : data.smtpFromName,
                fromEmail: type === 'NodeMail' ? data.nodeFromEmail : type === 'Resend' ? data.resendFromEmail : data.smtpFromEmail,
                replyTo: (type === 'NodeMail' ? data.nodeReplyTo : type === 'Resend' ? data.resendReplyTo : data.smtpReplyTo) || '',
                host: type === 'NodeMail' ? data.nodeHost : data.smtpHost,
                port: type === 'NodeMail' ? data.nodePort : data.smtpPort,
                username: type === 'NodeMail' ? data.nodeUsername : data.smtpUsername,
                password: type === 'NodeMail' ? data.nodePassword : data.smtpPassword,
                apiKey: type === 'Resend' ? (data.resendApiKey || '') : '',
                smtp_status: data.smtp_status,
                node_status: data.node_status,
                resend_status: data.resend_status
            })
        }
        setIsConfigurationModalOpen(true);
    };

    const handleNodeMailConfigClick = () => {
        openConfigurationModal('NodeMail');
    };
    const handleSmtpConfigClick = () => openConfigurationModal('SMTP');
    const handleResendConfigClick = () => openConfigurationModal('Resend');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value
        }));
    };

    const validateField = (name: string, value: any): string => {
        switch (name) {
            case 'fromName':
                if (!value) return "From name is required.";
                if (value.length > 100) return "From name cannot exceed 100 characters.";
                break;
            case 'fromEmail':
                if (!value) return "From email is required.";
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) return "Invalid email address.";
                if (value.length > 150) return "Email cannot exceed 150 characters.";
                break;
            case 'host':
                if (!value) return "Host is required.";
                if (value.length > 200) return "Host cannot exceed 200 characters.";
                break;
            case 'port':
                if (value === '' || value === null) return "Port is required.";
                const port = Number(value);
                if (isNaN(port)) return "Port must be a number.";
                if (port < 1 || port > 65535) return "Port must be between 1 and 65535.";
                break;
            case 'username':
                if (!value) return "Username is required.";
                if (value.length > 100) return "Username cannot exceed 100 characters.";
                break;
            case 'password':
                if (!value) return "Password is required.";
                if (value.length < 6) return "Password must be at least 6 characters long.";
                if (value.length > 100) return "Password cannot exceed 100 characters.";
                break;
            case 'apiKey':
                if (!value) return "API key is required.";
                if (value.length > 200) return "API key cannot exceed 200 characters.";
                break;
            case 'replyTo':
                // Optional — only validate format when a value is provided.
                if (value) {
                    const replyRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!replyRegex.test(value)) return "Invalid reply-to email address.";
                    if (value.length > 150) return "Email cannot exceed 150 characters.";
                }
                break;
            default:
                break;
        }
        return '';
    };

    const validateForm = (): boolean => {
        const newErrors: { [key: string]: string } = {};
        let isValid = true;

        // Resend only needs From Name/Email + API key; SMTP/Node need host/port/credentials.
        const fieldsToValidate: (keyof EmailSettingsFormData)[] =
            configurationType === 'Resend'
                ? ['fromName', 'fromEmail', 'replyTo', 'apiKey']
                : ['fromName', 'fromEmail', 'replyTo', 'host', 'port', 'username', 'password'];

        fieldsToValidate.forEach(fieldName => {
            const error = validateField(fieldName, formData[fieldName]);
            if (error) {
                newErrors[fieldName] = error;
                isValid = false;
            }
        });

        setFormErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) {
            return;
        }
        let payload;
        if (configurationType === 'NodeMail') {
            payload = {
                userId: user?.id,
                smtp_status: false,
                node_status: true,
                resend_status: false,
                provider_type: 'NODE',
                nodeFromName: formData.fromName,
                nodeFromEmail: formData.fromEmail,
                nodeReplyTo: formData.replyTo,
                nodeHost: formData.host,
                nodePort: formData.port,
                nodeUsername: formData.username,
                nodePassword: formData.password
            }
        } else if (configurationType === 'Resend') {
            payload = {
                userId: user?.id,
                smtp_status: false,
                node_status: false,
                resend_status: true,
                provider_type: 'RESEND',
                resendFromName: formData.fromName,
                resendFromEmail: formData.fromEmail,
                resendReplyTo: formData.replyTo,
                resendApiKey: formData.apiKey
            }
        } else {
            payload = {
                userId: user?.id,
                smtp_status: true,
                node_status: false,
                resend_status: false,
                provider_type: 'SMTP',
                smtpFromName: formData.fromName,
                smtpFromEmail: formData.fromEmail,
                smtpReplyTo: formData.replyTo,
                smtpHost: formData.host,
                smtpPort: formData.port,
                smtpUsername: formData.username,
                smtpPassword: formData.password
            }
        }

        try {
            setIsSaving(true);
            await axios.post(Constants.UPDATE_EMAIL_SETTINGS_URL, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Email settings updated successfully');
            fetchConfigurations();
            setIsConfigurationModalOpen(false);
        } catch (error) {
            toast.error('Failed to update email settings');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStatusChange = async (type: string) => {
        const payload = {
            userId: user?.id,
            smtp_status: type === 'SMTP',
            node_status: type === 'NodeMail',
            resend_status: type === 'Resend',
            provider_type: type === 'NodeMail' ? 'NODE' : type === 'Resend' ? 'RESEND' : 'SMTP'
        };

        try {
            await axios.post(Constants.UPDATE_EMAIL_SETTINGS_URL, payload, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Email settings updated successfully');
            fetchConfigurations();
        } catch (error) {
            toast.error('Failed to update email settings');
        }
    }
    return (
        <div className="bg-white p-6 rounded-lg">
            <h3 className="text-xl font-bold text-gray-950 mb-6">Email Settings</h3>

            {/* Send test email — validates the currently active provider */}
            {hasPermission(permissions, 'system-settings', 'edit') && (
                <div className="mb-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <label className="block text-sm font-semibold text-gray-700 mb-1" htmlFor="testEmail">
                        Send a test email
                    </label>
                    <p className="text-xs text-gray-500 mb-3">
                        Sends a test message using your currently active provider. Save & activate a provider first.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <input
                            id="testEmail"
                            type="email"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                            placeholder="recipient@example.com"
                            className="border border-gray-300 rounded-md px-4 py-2 w-full sm:max-w-xs text-gray-950 focus:outline-none focus:ring-2 focus:ring-purple-600"
                        />
                        <button
                            type="button"
                            onClick={handleSendTestEmail}
                            disabled={isTesting}
                            className="inline-flex items-center justify-center gap-2 bg-gray-950 text-white py-2 px-4 rounded-md hover:bg-gray-800 focus:outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <Send size={16} />
                            {isTesting ? 'Sending…' : 'Send Test Email'}
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Node Mail Card */}
                <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden">
                    <div className="p-6 flex-grow">
                        <div className="flex items-center gap-3">
                            <div className="bg-gray-100 p-2 rounded-md flex items-center justify-center">
                                <img src={nodemail} alt="Node Mail" className="w-6 h-6 object-contain" />
                            </div>
                            <h2 className="font-semibold text-base text-gray-700">Node Mail</h2>
                        </div>
                        <p className="text-sm text-gray-600 mt-4">
                            Used to send emails safely and easily via PHP code from a web server.
                        </p>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-gray-50 border-t border-gray-200">
                        {hasPermission(permissions, 'system-settings', 'edit') &&
                            (<>
                                <button
                                    onClick={handleNodeMailConfigClick}
                                    className="bg-gray-950 text-white p-2 rounded-md hover:bg-gray-950 focus:outline-none cursor-pointer"
                                    aria-label="Node Mail Settings"
                                >
                                    <Settings size={20} />
                                </button>
                                <Switch
                                    name="NodeMailStatus"
                                    checked={configurations?.node_status || false}
                                    onChange={() => { handleStatusChange('NodeMail') }}
                                    disabled={configurations?.node_status || false}
                                />
                            </>)
                        }
                    </div>
                </div>

                {/* SMTP Card */}
                <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden">
                    <div className="p-6 flex-grow">
                        <div className="flex items-center gap-3">
                            <div className="bg-gray-100 p-2 rounded-md flex items-center justify-center">
                                <img src={smtpImage} alt="SMTP" className="w-6 h-6 object-contain" />
                            </div>
                            <h2 className="font-semibold text-base text-gray-700">SMTP</h2>
                        </div>
                        <p className="text-sm text-gray-600 mt-4">
                            SMTP is used to send, relay or forward messages from a mail client.
                        </p>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-gray-50 border-t border-gray-200">
                        {hasPermission(permissions, 'system-settings', 'edit') &&
                            (<>
                                <button
                                    onClick={handleSmtpConfigClick}
                                    className="bg-gray-950 text-white p-2 rounded-md hover:bg-gray-950 focus:outline-none cursor-pointer"
                                    aria-label="SMTP Settings"
                                >
                                    <Settings size={20} />
                                </button>
                                <Switch
                                    name="SMTPStatus"
                                    checked={configurations?.smtp_status || false}
                                    onChange={() => { handleStatusChange('SMTP'); }}
                                    disabled={configurations?.smtp_status || false}
                                />
                            </>)
                        }
                    </div>
                </div>

                {/* Resend Card */}
                <div className="flex flex-col border border-gray-200 rounded-lg overflow-hidden">
                    <div className="p-6 flex-grow">
                        <div className="flex items-center gap-3">
                            <div className="bg-gray-100 p-2 rounded-md flex items-center justify-center">
                                <Send size={20} className="text-gray-700" />
                            </div>
                            <h2 className="font-semibold text-base text-gray-700">Resend</h2>
                        </div>
                        <p className="text-sm text-gray-600 mt-4">
                            Modern email API with high deliverability. Add your Resend API key and a verified sender domain.
                        </p>
                    </div>
                    <div className="flex justify-between items-center p-4 bg-gray-50 border-t border-gray-200">
                        {hasPermission(permissions, 'system-settings', 'edit') &&
                            (<>
                                <button
                                    onClick={handleResendConfigClick}
                                    className="bg-gray-950 text-white p-2 rounded-md hover:bg-gray-950 focus:outline-none cursor-pointer"
                                    aria-label="Resend Settings"
                                >
                                    <Settings size={20} />
                                </button>
                                <Switch
                                    name="ResendStatus"
                                    checked={configurations?.resend_status || false}
                                    onChange={() => { handleStatusChange('Resend'); }}
                                    disabled={configurations?.resend_status || false}
                                />
                            </>)
                        }
                    </div>
                </div>

            </div>

            {/* Configuration Modal */}
            <Modal
                isOpen={isConfigurationModalOpen}
                onClose={() => setIsConfigurationModalOpen(false)}
                title={configurationType === 'NodeMail' ? 'Node Mail Configuration' : configurationType === 'Resend' ? 'Resend Configuration' : 'SMTP Configuration'}>
                <form onSubmit={handleSubmit} noValidate>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        {/* From Name */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 " htmlFor="fromName">
                                From Name <em className="text-red-500">*</em>
                            </label>
                            <input
                                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                id="fromName"
                                type="text"
                                name="fromName"
                                value={formData.fromName}
                                onChange={handleInputChange}
                                placeholder="e.g., Example Company"
                                required
                            />
                            {formErrors.fromName && <p className="text-red-500 text-xs mt-1">{formErrors.fromName}</p>}
                        </div>

                        {/* From Email */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 " htmlFor="fromEmail">
                                From Email <em className="text-red-500">*</em>
                            </label>
                            <input
                                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                id="fromEmail"
                                type="email"
                                name="fromEmail"
                                value={formData.fromEmail}
                                onChange={handleInputChange}
                                placeholder="e.g., no-reply@example.com"
                                required
                            />
                            {formErrors.fromEmail && <p className="text-red-500 text-xs mt-1">{formErrors.fromEmail}</p>}
                        </div>

                        {/* Reply-To Email (optional) */}
                        <div className="md:col-span-2">
                            <label className="block text-sm font-semibold text-gray-700 " htmlFor="replyTo">
                                Reply-To Email <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <input
                                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                id="replyTo"
                                type="email"
                                name="replyTo"
                                value={formData.replyTo}
                                onChange={handleInputChange}
                                placeholder="e.g., finance@example.com"
                            />
                            {formErrors.replyTo && <p className="text-red-500 text-xs mt-1">{formErrors.replyTo}</p>}
                            <p className="text-xs text-gray-500 mt-1">
                                Replies go here. Use your real inbox while the From Email stays on the verified sending domain.
                            </p>
                        </div>

                        {configurationType !== 'Resend' && (<>
                        {/* Host */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 " htmlFor="host">
                                Host <em className="text-red-500">*</em>
                            </label>
                            <input
                                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                id="host"
                                type="text"
                                name="host"
                                value={formData.host}
                                onChange={handleInputChange}
                                placeholder="e.g., smtp.example.com"
                                required
                            />
                            {formErrors.host && <p className="text-red-500 text-xs mt-1">{formErrors.host}</p>}
                        </div>

                        {/* Port */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 " htmlFor="port">
                                Port <em className="text-red-500">*</em>
                            </label>
                            <input
                                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                id="port"
                                type="number"
                                name="port"
                                value={formData.port}
                                onChange={handleInputChange}
                                placeholder="e.g., 587"
                                required
                            />
                            {formErrors.port && <p className="text-red-500 text-xs mt-1">{formErrors.port}</p>}
                        </div>

                        {/* Username */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 " htmlFor="username">
                                Username <em className="text-red-500">*</em>
                            </label>
                            <input
                                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                id="username"
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleInputChange}
                                placeholder="Your username"
                                required
                            />
                            {formErrors.username && <p className="text-red-500 text-xs mt-1">{formErrors.username}</p>}
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 " htmlFor="password">
                                Password <em className="text-red-500">*</em>
                            </label>
                            <input
                                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                id="password"
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                placeholder="••••••••"
                                required
                            />
                            {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
                        </div>
                        </>)}

                        {/* API Key (Resend) */}
                        {configurationType === 'Resend' && (
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 " htmlFor="apiKey">
                                    Resend API Key <em className="text-red-500">*</em>
                                </label>
                                <input
                                    className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                                    id="apiKey"
                                    type="password"
                                    name="apiKey"
                                    value={formData.apiKey}
                                    onChange={handleInputChange}
                                    placeholder="re_xxxxxxxxxxxxxxxx"
                                    required
                                />
                                {formErrors.apiKey && <p className="text-red-500 text-xs mt-1">{formErrors.apiKey}</p>}
                                <p className="text-xs text-gray-500 mt-1">
                                    Create a key at resend.com → API Keys. The From Email's domain must be verified in Resend.
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end mt-6 pt-4 ">
                        <button type="button"
                            onClick={() => setIsConfigurationModalOpen(false)}
                            className="mr-3 bg-gray-200 hover:bg-gray-300 text-gray-950 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <SubmitButton
                            isDisabled={isSaving}
                            isLoading={isSaving}
                            mode='edit'
                        />
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default EmailSettings;
