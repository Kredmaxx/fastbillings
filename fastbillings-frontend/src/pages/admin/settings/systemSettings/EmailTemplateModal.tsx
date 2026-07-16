import Modal from "@components/admin/Modal";
import SearchableDropdown from "@components/admin/SearchableDropdown";
import SubmitButton from "@components/admin/SubmitButton";
import { TiptapEditor } from "@components/admin/TiptapEditor";
import Constants from "@constants/api";
import type { EmailTemplateFormData, NotificationTags, NotificationTypes } from "@models/email-template";
import type { RootState } from "@store/index";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
interface TemplateProps {
    isOpen: boolean,
    onClose: () => void,
    onSuccess: () => void,
    editItem?: any
}
const initialFormData: EmailTemplateFormData = {
    title: '',
    notification_type: '',
    description: '',
    subject: '',
    sms_content: '',
    notification_content: '',
    status: 'active',
}

interface NotificationTypeOption {
    id: string;
    name: string;
    tags: NotificationTags[];
}
const EmailTemplateModal: React.FC<TemplateProps> = ({ isOpen, onClose, onSuccess, editItem }) => {
    const { token } = useSelector((state: RootState) => state.auth);
    const [notificationTypeOptions, setNotificationTypeOptions] = useState<NotificationTypeOption[]>([]);
    const [selectedNotificationType, setSelectedNotificationType] = useState<NotificationTypeOption | null>(null);
    const [editor, setEditor] = useState<any>(null);
    const [tags, setTags] = useState<NotificationTags[]>([]);
    const [formData, setFormData] = useState<EmailTemplateFormData>(initialFormData);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [isSaving, setIsSaving] = useState<boolean>(false);
    useEffect(() => {
        fetchNotificationTypes();
    }, [token]);

    useEffect(() => {
        if (editItem && notificationTypeOptions.length > 0) {
            setFormData({
                title: editItem.title,
                // notification_type must be the id string for create/update; the
                // API row carries it as an object on `notification_type`.
                notification_type: editItem.notification_type?.id ?? '',
                description: editItem.description,
                subject: editItem.subject,
                sms_content: editItem.sms_content,
                notification_content: editItem.notification_content,
                status: editItem.status,
            });

            if (editor && editItem.description) {
                editor.commands.setContent(editItem.description);
            }
            let _selectedNotifyType = notificationTypeOptions.find((option) => option.id === editItem.notification_type?.id);
            if (_selectedNotifyType) {
                setSelectedNotificationType(_selectedNotifyType);
                if (_selectedNotifyType.tags) {
                    setTags(_selectedNotifyType.tags);
                }
            }
        }
    }, [editItem, notificationTypeOptions]);

    const fetchNotificationTypes = async () => {
        try {
            const response = await axios.get(Constants.GET_ALL_NOTIFICATION_TYPES_URL, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data.success && response.data.data) {
                let notificationTypeOptions = response.data.data.map((notificationType: NotificationTypes) => ({
                    id: notificationType.id,
                    name: notificationType.title,
                    tags: notificationType.tags
                }));
                setNotificationTypeOptions(notificationTypeOptions);
            }
        } catch (error) {
            console.error('Error fetching notification types:', error);
        }
    }

    const validateForm = () => {
        const errors: { [key: string]: string } = {};
        if (!formData.title) errors.title = 'Title is required';
        if (!formData.notification_type) errors.notification_type = 'Notification Type is required';
        if (!formData.description) errors.description = 'Description is required';
        if (!formData.subject) errors.subject = 'Subject is required';
        if (!formData.sms_content) errors.sms_content = 'SMS Content is required';
        if (!formData.notification_content) errors.notification_content = 'Notification Content is required';
        if (!formData.status) errors.status = 'Status is required';
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    }
    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;
        try {
            setIsSaving(true);
            if (editItem) {
                await axios.put(`${Constants.UPDATE_EMAIL_TEMPLATE_URL}/${editItem.id}`, formData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Email template updated successfully.');
            } else {
                await axios.post(Constants.CREATE_EMAIL_TEMPLATE_URL, formData, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Email template created successfully.');
            }
            onSuccess();
        } catch (error) {
            toast.error('Failed to create email template.' + error);
        } finally {
            setIsSaving(false);
        }
    }

    const handleFormChange = (field: keyof EmailTemplateFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }

    const handleNotificationTypeChange = (selectedOption: NotificationTypeOption | null) => {
        setSelectedNotificationType(selectedOption);
        if (selectedOption) {
            handleFormChange('notification_type', selectedOption.id);
            if (selectedOption.tags) {
                let newTags = selectedOption.tags.map((tag: NotificationTags) => {
                    return {
                        id: tag.id,
                        title: tag.title,
                        status: tag.status
                    }
                });
                setTags(newTags);
            }
        }
    }

    const handleTagsChange = (title: string) => {
        //append to subject text editor
        if (editor) {
            let newTitle = '{' + title + '}';
            editor.chain().focus().insertContent(' ' + newTitle).run();
        }
    }

    const handleEditorChange = (value: string) => {
        setFormData(prev => ({ ...prev, description: value }));
    }
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Email Template"
            size="4xl"
        >
            <form onSubmit={handleFormSubmit}>
                <div className="flex mb-4">
                    <div className="w-full mr-4">
                        <label className="block text-gray-600 font-semibold mb-2">Template Name <em className="text-red-500 text-sm">*</em></label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => handleFormChange('title', e.target.value)}
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                        />
                        {formErrors.title && <span className="text-red-500 text-xs">{formErrors.title}</span>}
                    </div>
                </div>
                <div className="flex mb-4">
                    <div className="w-full mr-4">
                        <label className="block text-gray-600 font-semibold mb-2">Notification Type <em className="text-red-500 text-sm">*</em></label>
                        <SearchableDropdown
                            placeholder="Select Notification Type"
                            options={notificationTypeOptions}
                            value={selectedNotificationType || null}
                            onChange={(_, value) => handleNotificationTypeChange(value as NotificationTypeOption || null)}
                        />
                        {formErrors.notification_type && <span className="text-red-500 text-xs">{formErrors.notification_type}</span>}
                    </div>
                </div>
                <div className="flex mb-4">
                    <div className="w-full mr-4">
                        <label className="block text-gray-600 font-semibold mb-2">Subject <em className="text-red-500 text-sm">*</em></label>
                        <input
                            type="text"
                            value={formData.subject}
                            onChange={(e) => handleFormChange('subject', e.target.value)}
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                        />
                        {formErrors.subject && <span className="text-red-500 text-xs">{formErrors.subject}</span>}
                    </div>
                </div>
                <div className="flex mb-4">
                    <div className="w-full mr-4">
                        <span className="block text-gray-600 font-semibold mb-2">Tags</span>
                        {tags && tags.map((tag: NotificationTags) => (
                            <button
                                type="button"
                                key={tag.id}
                                onClick={() => handleTagsChange(tag.title)}
                                className="border border-gray-300 rounded-md px-2 py-1 mr-2 cursor-pointer bg-gray-200 hover:bg-gray-300 text-gray-950 ">
                                {tag.title}
                            </button>
                        ))}

                    </div>
                </div>
                <div className="flex mb-4">
                    <div className="w-full mr-4">
                        <span className="block text-gray-600 font-semibold mb-2">Description <em className="text-red-500 text-sm">*</em></span>
                        <TiptapEditor value={formData.description} onChange={handleEditorChange} onEditorReady={setEditor} />
                        {formErrors.description && <span className="text-red-500 text-xs">{formErrors.description}</span>}
                    </div>
                </div>
                {/* sms content */}
                <div className="flex mb-4">
                    <div className="w-full mr-4">
                        <label htmlFor="sms-content" className="block text-gray-600 font-semibold mb-2">SMS Content <em className="text-red-500 text-sm">*</em></label>
                        <textarea
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                            id="sms-content"
                            value={formData.sms_content}
                            onChange={(e) => handleFormChange('sms_content', e.target.value)}
                        ></textarea>
                        {formErrors.sms_content && <span className="text-red-500 text-xs">{formErrors.sms_content}</span>}
                    </div>
                </div>
                {/* Notification Content */}
                <div className="flex mb-4">
                    <div className="w-full mr-4">
                        <label htmlFor="notification-content" className="block text-gray-600 font-semibold mb-2">Notification Content <em className="text-red-500 text-sm">*</em></label>
                        <textarea
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                            id="notification-content"
                            value={formData.notification_content}
                            onChange={(e) => handleFormChange('notification_content', e.target.value)}
                        ></textarea>
                        {formErrors.notification_content && <span className="text-red-500 text-xs">{formErrors.notification_content}</span>}
                    </div>
                </div>
                <div className="flex justify-end">
                    <button type="button" className="mr-2 px-4 py-2 text-gray-600 rounded-md bg-gray-200 hover:bg-gray-100  "
                        onClick={onClose}>Cancel</button>
                    <SubmitButton
                        isDisabled={isSaving}
                        isLoading={isSaving}
                        mode={editItem ? "edit" : "create"}
                    />
                </div>
            </form>
        </Modal>
    );
}

export default EmailTemplateModal;