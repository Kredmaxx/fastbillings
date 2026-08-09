import { useEffect, useRef, useState } from "react";
import InvoiceTemplateA from "./InvoiceTemplateA";
import { useReactToPrint } from "react-to-print";
import { useNavigate, useParams } from "react-router-dom";
import Constants from "@constants/api";
import axios from "axios";
import type { InvoiceData } from "@models/invoice";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import InvoiceTemplateB from "./InvoiceTemplateB";
import InvoiceTemplateGstClassic from "./InvoiceTemplateGstClassic";
import InvoiceTemplateGstModern from "./InvoiceTemplateGstModern";
import InvoiceTemplateGstCompact from "./InvoiceTemplateGstCompact";
import InvoiceTemplateBordered from "./InvoiceTemplateBordered";
import InvoiceTemplateGstFormal from "./InvoiceTemplateGstFormal";
import InvoiceTemplateGstEway from "./InvoiceTemplateGstEway";
import InvoiceTemplateGstCorporate from "./InvoiceTemplateGstCorporate";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import { toast } from "sonner";

const ViewInvoice: React.FC = () => {
    const { id: invoiceId } = useParams<{ id: string }>()
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const { token } = useSelector((state: RootState) => state.auth);
    const [isFetching, setIsFetching] = useState(true);
    const [invoiceDetails, setInvoiceDetails] = useState<InvoiceData | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [isMarking, setIsMarking] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchInvoiceDetails = async () => {
            if (!invoiceId) return;
            try {
                setIsFetching(true);
                setFetchError(null);
                // Prefer authenticated invoice fetch — /invoices/details is unauthenticated
                // but still calls tenant-scoped helpers and returns 401 after SaaS hardening.
                const response = await axios.get(
                    `${Constants.FETCH_INVOICE_FOR_EDIT_URL}/${invoiceId}`,
                    token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
                );
                if (response.data?.data) {
                    setInvoiceDetails(response.data.data);
                } else {
                    setInvoiceDetails(null);
                    setFetchError('Invoice not found');
                }
            } catch (error: any) {
                console.error('Error fetching invoice details:', error);
                setInvoiceDetails(null);
                setFetchError(
                    error?.response?.data?.message ||
                        'Unable to load this invoice. It may have been removed after a demo re-seed — open it again from Invoices.',
                );
            } finally {
                setIsFetching(false);
            }
        };
        void fetchInvoiceDetails();
    }, [invoiceId, token]);

    const handleMarkSent = async () => {
        if (!invoiceId) return;
        if (!window.confirm('Mark this invoice as sent? Use this when you have shared the PDF manually (no email will be sent).')) return;
        try {
            setIsMarking(true);
            await axios.post(
                `${Constants.MARK_INVOICE_SENT_URL}/${invoiceId}/mark-sent`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success('Invoice marked as sent');
            setInvoiceDetails((prev) => (prev ? { ...prev, status: 'SENT' } as InvoiceData : prev));
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to mark invoice as sent');
        } finally {
            setIsMarking(false);
        }
    };

    let template = Number(systemSettings?.invoiceTemplate?.default_invoice_template || 1);
    if (!Number.isFinite(template) || template < 1) template = 1;
    const componentRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: "Invoice",
        pageStyle: `
        @page {
        size: auto;
        margin: 5mm 5mm 2mm 2mm;
        }
        @page:first {
          margin: 2mm;
        }

        .page-break {
        page-break-before: always;
        }
    `,
    });

    if (isFetching) {
        return (
            <div className="p-6 space-y-4 flex items-center justify-center h-screen bg-white">
                <LoaderSpinner />
            </div>
        );
    }
    const templates: Record<number, React.FC<{ invoiceData: any }>> = {
        1: InvoiceTemplateA,
        2: InvoiceTemplateB,
        3: InvoiceTemplateGstClassic,
        4: InvoiceTemplateGstModern,
        5: InvoiceTemplateGstCompact,
        6: InvoiceTemplateBordered,
        7: InvoiceTemplateGstFormal,
        8: InvoiceTemplateGstEway,
        9: InvoiceTemplateGstCorporate,
    };
    const SelectedTemplate = templates[template] || InvoiceTemplateA;
    return (
        <div className="min-h-screen bg-white">
            {/* Printable content */}
            <div ref={componentRef}>
                {invoiceDetails ? (
                    <SelectedTemplate invoiceData={invoiceDetails} />
                ) : (
                    <div className="max-w-5xl mx-auto my-16 px-8 text-center text-gray-700">
                        <p className="text-lg font-semibold text-gray-950">Invoice unavailable</p>
                        <p className="mt-2 text-sm text-gray-600">{fetchError || 'Invoice not found.'}</p>
                    </div>
                )}
            </div>

            {/* Print Button */}
            <div className="flex p-12 font-sans text-gray-950 max-w-5xl mx-auto my-8">
                <button
                    onClick={handlePrint}
                    disabled={!invoiceDetails}
                    className="mr-4 bg-purple-600 hover:bg-gray-950 text-white px-4 py-2 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Print / Save as PDF
                </button>
                {/* Mark Sent — only for drafts; lets you progress the stage after sharing the PDF manually */}
                {(invoiceDetails as any)?.status === 'DRAFT' && (
                    <button
                        onClick={handleMarkSent}
                        disabled={isMarking}
                        className="mr-4 bg-gray-950 hover:bg-gray-800 text-white px-4 py-2 rounded cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isMarking ? 'Marking…' : 'Mark Sent'}
                    </button>
                )}
                {/* Back Button */}
                <button
                    onClick={() => navigate("/admin/invoices")}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-950 px-4 py-2 rounded cursor-pointer"
                >
                    Back
                </button>
            </div>
        </div>
    );
};

export default ViewInvoice;