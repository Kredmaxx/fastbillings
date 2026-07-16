import QuillEditor from "@components/admin/QuillEditor";
import Constants from "@constants/api";
import { useCurrencyFormatter } from "@hooks/useCurrencyFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import useDateFormatter from "@hooks/useDateFormatter";
import type { InvoiceData } from "@models/invoice";
import type { RootState } from "@store/index";
import axios from "axios";
import { Loader2, Send } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
interface SMTPSettings {
    from: string;
    fromName: string;
    host: string;
    port: number;
    username: string;
}

interface EmailFormData {
    invoiceId: string;
    to: string;
    cc: string | null;
    subject: string;
    htmlContent: string;
}

const EmailInvoice: React.FC = () => {
    const { token, user } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector(
        (state: RootState) => state.systemSettings
    );
    const { invoiceId } = useParams<{ invoiceId: string }>();
    const { formatDate } = useDateFormatter();
    const { locale } = useCurrencyFormatter();
    const { resolveCurrency } = useCurrencies();
    // Show the document's amount in the document's OWN currency (fallback: company default).
    const formatDocAmount = (amount: number, code?: string | null) =>
        `${resolveCurrency(code).symbol}${Number(amount).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
    const [invoiceDetails, setInvoiceDetails] = useState<InvoiceData | null>(
        null
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editorContent, setEditorContent] = useState("");
    const [formData, setFormData] = useState<EmailFormData>({
        invoiceId: invoiceId || "",
        to: "",
        cc: null,
        subject: "",
        htmlContent: "",
    });

    const [emailSettings, setEmailSettings] = useState<SMTPSettings>({
        from: "",
        fromName: "",
        host: "",
        port: 0,
        username: "",
    });

    // fetch email settings
    useEffect(() => {
        const fetchEmailSettings = async () => {
            try {
                const response = await axios.get(Constants.GET_EMAIL_SETTINGS_URL, {
                    params: { userId: user?.id },
                    headers: { Authorization: `Bearer ${token}` },
                });

                const data = response.data.data;
                if (data) {
                    if (data.smtp_status) {
                        setEmailSettings({
                            from: data.smtpFromEmail,
                            fromName: data.smtpFromName,
                            host: data.smtpHost,
                            port: data.smtpPort,
                            username: data.smtpUsername,
                        });
                    } else if (data.node_status) {
                        setEmailSettings({
                            from: data.nodeFromEmail,
                            fromName: data.nodeFromName,
                            host: data.nodeHost,
                            port: data.nodePort,
                            username: data.nodeUsername,
                        });
                    } else if (data.resend_status) {
                        setEmailSettings({
                            from: data.resendFromEmail,
                            fromName: data.resendFromName,
                            host: "smtp.resend.com",
                            port: 465,
                            username: "resend",
                        });
                    }
                }
            } catch (error) {
                console.error("Error fetching email settings:", error);
            }
        };

        fetchEmailSettings();
    }, [token, user]);

    // fetch invoice details
    useEffect(() => {
        const fetchInvoiceDetails = async () => {
            try {
                const response = await axios.get(
                    `${Constants.FETCH_INVOICE_FOR_EDIT_URL}/${invoiceId}`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                    }
                );
                const responseData = response.data.data;
                if (responseData) {
                    setInvoiceDetails(responseData);
                }
            } catch (error) {
                console.error("Error fetching invoice details:", error);
            }
        };

        if (invoiceId && token) {
            fetchInvoiceDetails();
        }
    }, [invoiceId, token]);

    // Prefill subject + body ONCE when the invoice arrives. Prefer the active
    // "Invoice Generated" email template (merge fields resolved server-side);
    // fall back to a built-in default when no template is active. The ref guard
    // ensures we don't clobber the user's edits on subsequent renders.
    const prefilled = useRef(false);
    useEffect(() => {
        if (!invoiceDetails || prefilled.current) return;
        let cancelled = false;

        const buildFallback = () => {
            const customerName = invoiceDetails.billTo.name ?? "Customer";
            const invoiceNo = invoiceDetails.invoiceNumber ?? "";
            const invoiceDate = formatDate(invoiceDetails.invoiceDate, "MMMM DD, YYYY");
            const dueDate = invoiceDetails.dueDate ? formatDate(invoiceDetails.dueDate, "MMMM DD, YYYY") : "";
            const totalAmount = formatDocAmount(invoiceDetails.TotalAmount ?? 0, invoiceDetails.currencyCode);
            const companyName = systemSettings?.company.companyName ?? "";
            const viewInvoiceLink = `${window.location.origin}/admin/view-invoice/${invoiceDetails.id}`;
            const html = `<h2 style="font-family:Arial,sans-serif;background-color:#4191f2;font-size:24px;text-align:center;padding:8px;color:#fff;margin:0 0 12px 0">Invoice #${invoiceNo}</h2><p style="font-family:Arial,sans-serif;font-size:16px;color:#333;line-height:1.5;margin:0 0 8px 0">Dear ${customerName},</p><p style="font-family:Arial,sans-serif;font-size:16px;color:#333;line-height:1.5;margin:0 0 8px 0">Thank you for your business. Your invoice <strong>#${invoiceNo}</strong> is ready.</p><p style="font-family:Arial,sans-serif;font-size:16px;color:#333;line-height:1.5;margin:0 0 12px 0">You can view, print, and download it as a PDF from the link below.</p><p style="font-family:Arial,sans-serif;font-size:14px;text-transform:uppercase;color:#555;text-align:center;margin:0 0 4px 0">Amount Due</p><p style="font-family:Arial,sans-serif;font-size:32px;font-weight:700;color:#d61915;text-align:center;margin:0 0 12px 0">${totalAmount}</p><p style="text-align:center;margin:0 0 12px 0"><a href="${viewInvoiceLink}" style="display:inline-block;padding:10px 20px;background-color:#4191f2;color:#fff;text-decoration:none;border-radius:4px;font-family:Arial,sans-serif;font-size:16px;">View Invoice</a></p><p style="font-family:Arial,sans-serif;font-size:16px;color:#333;line-height:1.5;margin:0 0 4px 0"><strong>Invoice Date:</strong> ${invoiceDate}</p><p style="font-family:Arial,sans-serif;font-size:16px;color:#333;line-height:1.5;margin:0 0 12px 0"><strong>Due Date:</strong> ${dueDate}</p><p style="font-family:Arial,sans-serif;font-size:16px;color:#333;line-height:1.5;margin:0 0 8px 0">Regards,</p><p style="font-family:Arial,sans-serif;font-size:16px;color:#333;line-height:1.5;margin:0">The ${companyName} Team</p>`;
            return { subject: `Invoice #${invoiceNo} from ${emailSettings.fromName || systemSettings?.company.companyName || "Company"}`, html };
        };

        (async () => {
            let subject = "";
            let html = "";
            try {
                const res = await axios.get(
                    `${Constants.RESOLVE_EMAIL_TEMPLATE_URL}/invoice/${invoiceDetails.id}`,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                const d = res.data?.data;
                if (d?.hasTemplate) {
                    subject = d.subject;
                    html = d.html;
                }
            } catch {
                /* fall through to built-in default */
            }
            if (!html) {
                const fb = buildFallback();
                subject = fb.subject;
                html = fb.html;
            }
            if (cancelled) return;
            prefilled.current = true;
            setEditorContent(html);
            setFormData((prev) => ({
                ...prev,
                to: invoiceDetails.billTo.email ?? "",
                subject,
                htmlContent: html,
            }));
        })();

        return () => { cancelled = true; };
    }, [invoiceDetails, emailSettings, token, formatDocAmount, formatDate, systemSettings]);

    // keep formData.htmlContent in sync with editor
    useEffect(() => {
        setFormData((prev) => ({ ...prev, htmlContent: editorContent }));
    }, [editorContent]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const response = await axios.post(
                Constants.SEND_INVOICE_MAIL_URL,
                formData,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            toast.success(response.data.message);
        } catch (error) {
            toast.error("Something went wrong");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <div className="sticky top-0 z-10 p-2 mb-4">
                <h4 className="text-2xl text-gray-700 font-semibold">
                    Email To {invoiceDetails?.billTo?.name || "Customer"}
                </h4>
            </div>
            <div className="space-y-4">
                <form onSubmit={handleSubmit}>
                    {/* card */}
                    <div className="border border-gray-200 rounded-lg bg-white shadow-sm">
                        {/* from */}
                        <div className="p-4 flex items-center gap-4">
                            <label className="w-32 text-gray-600 font-medium">From</label>
                            <input
                                type="email"
                                value={emailSettings.from}
                                disabled
                                className="flex-1 border border-gray-200 rounded-md p-2 bg-gray-100 text-gray-700"
                            />
                        </div>

                        {/* to */}
                        <div className="p-4 flex items-center gap-4">
                            <label className="w-32 text-gray-600 font-medium">To</label>
                            <input
                                type="email"
                                value={invoiceDetails?.billTo.email || ""}
                                placeholder="customer@email.com"
                                disabled
                                className="flex-1 border border-gray-200 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                            />
                        </div>

                        {/* subject */}
                        <div className="p-4 flex items-center gap-4">
                            <label className="w-32 text-gray-600 font-medium">Subject</label>
                            <input
                                type="text"
                                value={formData.subject}
                                onChange={(e) =>
                                    setFormData({ ...formData, subject: e.target.value })
                                }
                                className="flex-1 border border-gray-200 rounded-md p-2 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                            />
                        </div>

                        {/* editor */}
                        <div className="p-4">
                            <QuillEditor value={formData.htmlContent} onChange={(html) => {
                                setEditorContent(html);
                                setFormData((prev) => ({ ...prev, htmlContent: html }));
                            }} />
                        </div>
                    </div>

                    {/* footer actions */}
                    <div className="flex justify-end gap-3 mt-4">
                        <button
                            type="button"
                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-gray-950 focus:outline-none flex items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <><Loader2 size={16} className="animate-spin" /> Sending...</>
                            ) : (
                                <><Send size={16} /> Send</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
};

export default EmailInvoice;
