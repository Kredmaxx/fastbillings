import Modal from "@components/admin/Modal";
import QuillEditor, { type QuillEditorRef } from "@components/admin/QuillEditor";
import SubmitButton from "@components/admin/SubmitButton";
import Constants from "@constants/api";
import type { RootState } from "@store/index";
import axios from "axios";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    editingReminder?: any;
    onSuccess: () => void;
}
interface QuotationFormData {
    name: string;
    days: string;
    timing: string;
    reference: string;
    enableReminder: boolean;
    remindTo: string;
    cc: string[];
    bcc: string[];
    subject: string;
    body: string;
}
interface Placeholder {
    key: string;
    label: string;
    description: string;
    category: string;
}
const QuotationReminderModal: React.FC<Props> = ({ isOpen, onClose, editingReminder, onSuccess }) => {

    const prepareInitialFormData = () => ({
        name: "",
        days: "",
        timing: "before",
        reference: "expiryDate",
        enableReminder: false,
        remindTo: "",
        cc: [],
        bcc: [],
        subject: "Your quotation %QuotationNumber% is about to expire",
        body: "<p>Dear %CustomerName%,</p><p>This is a friendly reminder that your quotation <strong>%QuotationNumber%</strong> is approaching its expiry date.</p><p>----------------------------------------------------------------------------------------</p><p><strong>Quotation Date:</strong> %QuotationDate%</p><p><strong>Expiry Date:</strong> %ExpiryDate%</p><p><strong>Total Amount:</strong> %Total%</p><p>----------------------------------------------------------------------------------------</p><p>Please review the quotation and confirm before it expires.</p><p>If you have any questions or need assistance, feel free to contact us.</p><p>Best regards,</p><p>%CompanyName%</p>"
    });

    const { token } = useSelector((state: RootState) => state.auth);
    const [quotationFormData, setQuotationFormData] = useState<QuotationFormData>(prepareInitialFormData());
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
    const [selectedPlaceholder, setSelectedPlaceholder] = useState("");
    const purchaseQuillEditorRef = useRef<QuillEditorRef>(null);
    const [ccInput, setCcInput] = useState("");
    const [bccInput, setBccInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (editingReminder) {
            setQuotationFormData({
                name: editingReminder.name || "",
                days: String(editingReminder.remindDays || ""),
                timing: editingReminder.remindTiming || "before",
                reference: editingReminder.remindEvent || "expiryDate",
                enableReminder: editingReminder.isEnabled || false,
                remindTo: editingReminder.emailConfig?.remindTo || "",
                cc: editingReminder.emailConfig?.cc || [],
                bcc: editingReminder.emailConfig?.bcc || [],
                subject: editingReminder.emailConfig?.subject || "",
                body: editingReminder.emailConfig?.body || "",
            });
            setFormErrors({});
        } else {
            setQuotationFormData(prepareInitialFormData());
            setFormErrors({});
        }
    }, [editingReminder, isOpen]);


    useEffect(() => {
        const fetchPlaceholders = async () => {
            try {
                const response = await axios.get(Constants.FETCH_QUOTATION_PLACEHOLDERS_URL, {
                    headers: { Authorization: `Bearer ${token}` },
                });

                if (response.data.success && response.data.data && response.data.data.placeholders) {
                    const placeholderData = Array.isArray(response.data.data.placeholders)
                        ? response.data.data.placeholders
                        : [];
                    setPlaceholders(placeholderData);
                }
            } catch (error: any) {
                console.error("Error fetching placeholders:", error);
            }
        };

        fetchPlaceholders();
    }, []);
    const handlePurchaseInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setQuotationFormData((prev) => ({ ...prev, [name]: value }));
    }

    const handleManualPlaceholderSelect = (placeholderKey: string, target: "subject" | "body") => {
        const formattedPlaceholder = `%${placeholderKey}%`;

        if (target === "subject") {
            setQuotationFormData((prev) => ({
                ...prev,
                subject: prev.subject + formattedPlaceholder,
            }));
        } else {
            // Insert at cursor position in Quill editor
            if (purchaseQuillEditorRef.current) {
                purchaseQuillEditorRef.current.insertText(formattedPlaceholder);
            } else {
                // Fallback: append to end if ref not available
                setQuotationFormData((prev) => ({
                    ...prev,
                    body: prev.body + formattedPlaceholder,
                }));
            }
        }
        setSelectedPlaceholder("");
    };

    const addCCEmail = () => {
        if (isValidEmail(ccInput)) {
            if (quotationFormData.cc.includes(ccInput)) {
                setFormErrors(prev => ({ ...prev, cc: "This email is already added" }));
                return;
            }
            if (quotationFormData.cc.length >= 3) {
                setFormErrors(prev => ({ ...prev, cc: "You can add up to 3 emails" }));
                return;
            }
            setFormErrors(prev => ({ ...prev, cc: "" }));
            setCcInput("");
            setQuotationFormData(prev => ({ ...prev, cc: [...prev.cc, ccInput] }));
        } else {
            setFormErrors(prev => ({ ...prev, cc: "Please enter a valid email address" }));
        }
    }
    const addBCCEmail = () => {
        if (isValidEmail(bccInput)) {
            if (quotationFormData.bcc.includes(bccInput)) {
                setFormErrors(prev => ({ ...prev, bcc: "This email is already added" }));
                return;
            }
            if (quotationFormData.bcc.length >= 3) {
                setFormErrors(prev => ({ ...prev, bcc: "You can add up to 3 emails" }));
                return;
            }
            setFormErrors(prev => ({ ...prev, bcc: "" }));
            setBccInput("");
            setQuotationFormData(prev => ({ ...prev, bcc: [...prev.bcc, bccInput] }));
        } else {
            setFormErrors(prev => ({ ...prev, bcc: "Please enter a valid email address" }));
        }
    }
    const handleRemoveCc = (email: string) => {
        setQuotationFormData(prev => ({
            ...prev,
            cc: prev.cc.filter(e => e !== email),
        }));
    }
    const handleRemoveBcc = (email: string) => {
        setQuotationFormData(prev => ({
            ...prev,
            bcc: prev.bcc.filter(e => e !== email),
        }));
    }
    const isValidEmail = (email: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }
    const handleQuotationBodyChange = (body: string) => {
        setQuotationFormData(prev => ({ ...prev, body }));
    }
    const validated = () => {
        const newErrors: { [key: string]: string } = {};
        if (!quotationFormData.name) {
            newErrors.name = "Name is required";
        } else if (quotationFormData.name.length < 3 || quotationFormData.name.length > 50) {
            newErrors.name = "Name must be between 3 and 50 characters";
        }
        if (!quotationFormData.days) {
            newErrors.days = "Days is required";
        }
        if (!quotationFormData.remindTo) {
            newErrors.remindTo = "Remind To is required";
        }
        if (!quotationFormData.subject) {
            newErrors.subject = "Subject is required";
        } else if (quotationFormData.subject.length < 3 || quotationFormData.subject.length > 100) {
            newErrors.subject = "Subject must be between 3 and 100 characters";
        }
        if (!quotationFormData.body) {
            newErrors.body = "Body is required";
        }
        setFormErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }
    const handlePurchaseReminderSave = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validated()) return false;
        const payload = {
            name: quotationFormData.name,
            remindDays: Number(quotationFormData.days),
            remindTiming: quotationFormData.timing,
            remindEvent: 'expiry_date',
            isEnabled: quotationFormData.enableReminder,
            emailConfig: {
                remindTo: quotationFormData.remindTo,
                cc: quotationFormData.cc,
                bcc: quotationFormData.bcc,
                subject: quotationFormData.subject,
                body: quotationFormData.body
            },
            type: 'automatic_quotation'
        }
        try {
            setIsSubmitting(true);
            if (editingReminder) {
                await axios.put(`${Constants.UPDATE_QUOTATION_REMINDER_URL}/${editingReminder.id}`, payload, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Quotation reminder updated successfully.');
            } else {
                await axios.post(Constants.CREATE_NEW_QUOTATION_REMINDER_URL, payload, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success('Quotation reminder created successfully.');
            }
            onClose();
            onSuccess();
        } catch (error) {
            toast.error('Failed to create quotation reminder.');
        } finally {
            setIsSubmitting(false);
        }
    }
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={editingReminder ? 'Edit Quotation Reminder' : 'Create Quotation Reminder'} size="4xl">
            <div className="bg-white">
                <form onSubmit={handlePurchaseReminderSave} className="space-y-6">
                    {/* Name and Enable Reminder on same row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Name</label>
                            <input
                                type="text"
                                name="name"
                                value={quotationFormData.name}
                                onChange={handlePurchaseInputChange}
                                placeholder="Reminder Name"
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600 transition-all"
                            />
                            {formErrors.name && (
                                <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>
                            )}
                        </div>

                        <div className="flex items-center mt-6 space-x-2">
                            <input
                                type="checkbox"
                                id="enableReminder"
                                name="enableReminder"
                                checked={quotationFormData.enableReminder}
                                onChange={(e) =>
                                    setQuotationFormData((prev) => ({
                                        ...prev,
                                        enableReminder: e.target.checked,
                                    }))
                                }
                                className="h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                            />
                            <label htmlFor="enableReminder" className="text-sm text-gray-700">
                                Enable this reminder
                            </label>
                            {formErrors.enableReminder && (
                                <p className="text-red-500 text-xs mt-1">
                                    {formErrors.enableReminder}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Reminder Days + Type */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                Remind
                            </label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    name="days"
                                    value={quotationFormData.days}
                                    onChange={handlePurchaseInputChange}
                                    placeholder="0"
                                    className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                                <span className="text-sm text-gray-600">day(s)</span>
                                <p className="text-sm text-gray-500">before expiry date</p>
                            </div>
                            {formErrors.days && (<p className="text-red-500 text-xs mt-1">{formErrors.days}</p>)}
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Remind To</label>
                            <select
                                name="remindTo"
                                value={quotationFormData.remindTo}
                                onChange={(e) =>
                                    setQuotationFormData((prev) => ({
                                        ...prev,
                                        remindTo: e.target.value,
                                    }))
                                }
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            >
                                <option value="">Select recipient</option>
                                <option value="customer">Customer</option>
                                <option value="customer-and-copy-me">Customer and copy me</option>
                            </select>
                            {formErrors.remindTo && (
                                <p className="text-red-500 text-xs mt-1">{formErrors.remindTo}</p>
                            )}
                        </div>
                    </div>

                    {/* From, Cc, Bcc — grid layout */}
                    <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Cc</label>
                            <div className="flex gap-2">
                                <input
                                    type="email"
                                    value={ccInput}
                                    onChange={(e) => setCcInput(e.target.value)}
                                    placeholder="Enter email"
                                    className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                                <button
                                    type="button"
                                    onClick={addCCEmail}
                                    className="px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition"
                                >
                                    Add
                                </button>
                            </div>
                            {formErrors.cc && <p className="text-red-500 text-xs mt-1">{formErrors.cc}</p>}
                            {/* show cc emails */}
                            {quotationFormData.cc.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {quotationFormData.cc.map((email, index) => (
                                        <span
                                            key={index}
                                            className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                                        >
                                            {email}
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveCc(email)}
                                                className="hover:text-blue-900"
                                            >
                                                <X size={14} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bcc */}
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Bcc</label>
                        <div className="flex gap-2">
                            <input
                                type="email"
                                value={bccInput}
                                onChange={(e) => setBccInput(e.target.value)}
                                placeholder="Enter email"
                                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                            />
                            <button
                                type="button"
                                onClick={addBCCEmail}
                                className="px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition"
                            >
                                Add
                            </button>
                        </div>
                        {formErrors.bcc && <p className="text-red-500 text-xs mt-1">{formErrors.bcc}</p>}
                        {quotationFormData.bcc.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {quotationFormData.bcc.map((email, index) => (
                                    <span
                                        key={index}
                                        className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                                    >
                                        {email}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveBcc(email)}
                                            className="hover:text-blue-900"
                                        >
                                            <X size={14} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Subject + Placeholder */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-semibold text-gray-700">Subject</label>
                            <select
                                value={selectedPlaceholder}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        const formattedPlaceholder = `%${e.target.value}%`;
                                        setQuotationFormData((prev) => ({
                                            ...prev,
                                            subject: prev.subject + formattedPlaceholder,
                                        }));
                                        setSelectedPlaceholder("");
                                    }
                                }}
                                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-gray-50 focus:ring-2 focus:ring-purple-200"
                            >
                                <option value="">Insert Placeholder</option>
                                {Array.isArray(placeholders) &&
                                    placeholders.map((placeholder, index) => (
                                        <option key={index} value={placeholder.key}>
                                            {placeholder.label}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <input
                            type="text"
                            name="subject"
                            value={quotationFormData.subject}
                            onChange={handlePurchaseInputChange}
                            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                        />
                        {formErrors.subject && (
                            <p className="text-red-500 text-xs mt-1">{formErrors.subject}</p>
                        )}
                    </div>

                    {/* Body */}
                    <div>
                        <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-semibold text-gray-700">Body</label>
                            <select
                                value={selectedPlaceholder}
                                onChange={(e) => {
                                    if (e.target.value) handleManualPlaceholderSelect(e.target.value, "body");
                                }}
                                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-gray-50 focus:ring-2 focus:ring-purple-200"
                            >
                                <option value="">Insert Placeholder</option>
                                {Array.isArray(placeholders) &&
                                    placeholders.map((placeholder, index) => (
                                        <option key={index} value={placeholder.key}>
                                            {placeholder.label}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div className="border border-gray-200 rounded-lg">
                            <QuillEditor
                                ref={purchaseQuillEditorRef}
                                value={quotationFormData.body}
                                onChange={handleQuotationBodyChange}
                                height="300px"
                            />
                        </div>
                        {formErrors.body && <p className="text-red-500 text-xs mt-1">{formErrors.body}</p>}
                    </div>

                    {/* Buttons */}
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                            }}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition"
                        >
                            Cancel
                        </button>
                        <SubmitButton isLoading={isSubmitting} mode={editingReminder ? "edit" : "create"}>
                        </SubmitButton>
                    </div>
                </form>

            </div>
        </Modal>
    );
}
export default QuotationReminderModal;