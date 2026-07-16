import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import InvoiceStatusBadge from "@components/admin/InvoiceStatusBadge";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import Constants from "@constants/api";
import type { RootState } from "@store/index";
import axios from "axios";
import { BadgeDollarSignIcon, CheckCircle2, CirclePlusIcon, Edit, LucideEye, MailIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import InvoicePaymentModal from "./InvoicePaymentModal";
import type { InvoicePaymentDetails } from "@models/invoice-payment";
import { hasPermission } from "@utils/hasPermission";
import type { PermissionAction } from "@models/permissions";
import useDateFormatter from "@hooks/useDateFormatter";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import { useCurrencies } from "@hooks/useCurrencies";
import ProfileCard from "@components/admin/ProfileImage";
import NoRecords from "@components/admin/NoRecords";
import { useQuery } from "@tanstack/react-query";
import { fetchModuleHierarchy, fetchCustomFieldsByModule } from "@api/customFieldTypeApi";

interface Invoice {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string | null;
    referenceNo: string;
    name: string;
    status: string;
    createdAt: string;
    paymentTerms: string;
    taxableAmount: number;
    totalDiscount: number;
    vat: number;
    TotalAmount: number;
    totalPaid: number | null;
    payment_method: string;
    billFrom: string;
    billTo: {
        id: string;
        name: string;
        email: string;
        phone: string;
        image: string | null;
        billingAddress?: {
            name: string;
            addressLine1: string;
            addressLine2: string;
            city: string;
            state: string;
            country: string;
            pincode: string;
        }
    };
    notes: string;
    sign_type: string;
    signature?: {
        id: string;
        name: string;
    };
    customFields?: Record<string, any>;
    invoiceType?: 'INVOICE' | 'PROFORMA';
    convertedAt?: string | null;
    currencyCode?: string | null;
}

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// Helper to safely extract custom field values using the fieldSlug (e.g. "age")
const extractCustomFieldValue = (invoice: Invoice, fieldSlug: string) => {
    if (!invoice.customFields) return '-';
    if (typeof invoice.customFields === 'object') {
        const value = invoice.customFields[fieldSlug];
        return value !== undefined && value !== null && value !== '' ? value : '-';
    }
    return '-';
};

const InvoiceList: React.FC = () => {
    const navigate = useNavigate();
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const { formatDate } = useDateFormatter();
    const { formatMoney } = useCurrencies();

    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [itemToDelete, setItemToDelete] = useState<Invoice | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [itemForPayment, setItemForPayment] = useState<InvoicePaymentDetails | null>(null);

    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const invoiceTypeFilterRaw = searchParams.get('invoiceType') || 'all';
    const invoiceTypeFilter: 'all' | 'INVOICE' | 'PROFORMA' =
        invoiceTypeFilterRaw === 'INVOICE' || invoiceTypeFilterRaw === 'PROFORMA'
            ? invoiceTypeFilterRaw
            : 'all';

    const [isInvoiceLoading, setIsInvoiceLoading] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);
    const [nextInvoiceNo, setNextInvoiceNo] = useState<string>("");

    // --- DYNAMIC CUSTOM FIELDS FETCHING ---
    const { data: moduleHierarchyResponse, isLoading: isModulesLoading } = useQuery({
        queryKey: ['moduleHierarchy'],
        queryFn: () => fetchModuleHierarchy(token!),
        refetchOnMount: false,
        enabled: !!token,
        staleTime: 1000 * 60 * 60
    });

    const invoicesModuleId = useMemo(() => {
        if (!moduleHierarchyResponse?.data) return null;
        for (const mod of moduleHierarchyResponse.data) {
            if (mod.moduleSlug === 'invoices') return mod.id;
            if (mod.children) {
                const child = mod.children.find((c: any) => c.moduleSlug === 'invoices');
                if (child) return child.id;
            }
        }
        return null;
    }, [moduleHierarchyResponse]);

    const { data: customFieldsResponse, isLoading: isCustomFieldsLoading } = useQuery({
        queryKey: ['customFields', invoicesModuleId],
        queryFn: () => fetchCustomFieldsByModule(token!, invoicesModuleId!),
        refetchOnMount: false,
        enabled: !!token && !!invoicesModuleId
    });

    const tableCustomFields = useMemo(() => {
        return customFieldsResponse?.data?.fields?.filter((f: any) => f.showInTable) || [];
    }, [customFieldsResponse]);

    // Construct Dynamic Table Headers
    const baseHeaders = ["#", "Invoice ID", "Type", "Customer", "Amount", "Paid", "Status", "Created On"];
    const dynamicHeaders = tableCustomFields.map((f: any) => f.labelName);
    const tableHeaders = [...baseHeaders, ...dynamicHeaders, "Actions"];

    // Unified loading state prevents UI shifting
    const isPageLoading = isInvoiceLoading || isModulesLoading || isCustomFieldsLoading;

    const handleNewInvoiceClick = () => {
        if (!nextInvoiceNo) {
            toast.warning("Something went wrong. Please refresh the page.");
            return;
        }
        sessionStorage.setItem("nextInvoiceNo", nextInvoiceNo);
        navigate("/admin/invoices/create-invoice");
    }

    const handleSearch = (value: string) => {
        setSearchParams({
            search: value,
            limit: String(limit),
            page: String(page),
            ...(invoiceTypeFilter !== 'all' ? { invoiceType: invoiceTypeFilter } : {})
        });
    }

    const handlePageLengthChange = (value: number) => {
        setSearchParams({
            search,
            limit: String(value),
            page: String(page),
            ...(invoiceTypeFilter !== 'all' ? { invoiceType: invoiceTypeFilter } : {})
        });
    }

    const handleInvoiceTypeFilterChange = (opt: 'all' | 'INVOICE' | 'PROFORMA') => {
        const next: Record<string, string> = {
            search: search || '',
            limit: String(limit),
            page: '1'
        };
        if (opt !== 'all') {
            next.invoiceType = opt;
        }
        setSearchParams(next);
    }

    const fetchInvoices = async () => {
        try {
            setIsInvoiceLoading(true);
            const response = await axios.get(Constants.GET_INVOICES_FOR_LIST_URL, {
                params: {
                    search,
                    limit,
                    page,
                    ...(invoiceTypeFilter !== 'all' ? { invoiceType: invoiceTypeFilter } : {})
                },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            let data = response.data.data;
            if (data.invoices.length > 0) {
                setInvoices(data.invoices);
            } else {
                setInvoices([]);
            }

            if (data.pagination) {
                setPagination(data.pagination);
            }
            if (data.nextInvoiceNumber) {
                setNextInvoiceNo(data.nextInvoiceNumber);
            }
        } catch (error) {
            console.error("Error fetching invoices:", error);
        } finally {
            setIsInvoiceLoading(false);
        }
    }

    useEffect(() => {
        fetchInvoices();
    }, [search, limit, page, token, invoiceTypeFilter]);

    const handlePageChange = (page: number) => {
        setSearchParams({
            search: search || '',
            limit: limit ? String(limit) : '10',
            page: String(page),
            ...(invoiceTypeFilter !== 'all' ? { invoiceType: invoiceTypeFilter } : {})
        });
    }

    const handleSendMailClick = (item: Invoice) => {
        navigate(`/admin/invoices/email/${item.id}`);
    }

    const handleMarkSentClick = async (item: Invoice) => {
        if (!window.confirm('Mark this invoice as sent? Use this when you have shared the PDF manually (no email will be sent).')) return;
        try {
            await axios.post(
                `${Constants.MARK_INVOICE_SENT_URL}/${item.id}/mark-sent`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success('Invoice marked as sent');
            await fetchInvoices();
        } catch (e: any) {
            toast.error(e?.response?.data?.message || 'Failed to mark invoice as sent');
        }
    }

    const restrictedActions = ['edit', 'delete', 'mark sent'];
    const getTableActions = (item: Invoice) => {
        const canConvert = item.invoiceType === 'PROFORMA' && !item.convertedAt;

        const actions: Array<{
            label: string;
            icon: React.ReactNode;
            onClick: () => void;
            hideWhen?: string[];
        }> = [
            {
                label: 'Payment',
                icon: <BadgeDollarSignIcon size={14} />,
                onClick: () => handlePaymentClick(item),
                hideWhen: ['PAID', 'DRAFT', 'CANCELLED']
            },
            {
                label: 'Send Email',
                icon: <MailIcon size={14} />,
                onClick: () => handleSendMailClick(item),
            },
            {
                label: 'Mark Sent',
                icon: <CheckCircle2 size={14} />,
                onClick: () => handleMarkSentClick(item),
                // Only meaningful for drafts — hide once the invoice has progressed.
                hideWhen: ['UNPAID', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED', 'PARTIALLY_PAID']
            },
            {
                label: 'View',
                icon: <LucideEye size={14} />,
                onClick: () => handleViewClick(item),
            },
            {
                label: 'Edit',
                icon: <Edit size={14} />,
                onClick: () => handleEditClick(item),
                hideWhen: ['PAID', 'PARTIALLY_PAID']
            },
            {
                label: 'Delete',
                icon: <Trash2Icon size={14} />,
                onClick: () => handleDeleteClick(item),
                hideWhen: ['PAID', 'PARTIALLY_PAID']
            }
        ];

        if (canConvert) {
            actions.push({
                label: 'Convert',
                icon: <RefreshCwIcon size={14} />,
                onClick: () => handleConvertClick(item),
            });
        }

        return actions.filter((action) => {
            const actionLabel = action.label.toLowerCase();

            if (action.hideWhen?.includes(item.status)) {
                return false;
            }

            if (restrictedActions.includes(actionLabel)) {
                const permissionAction: PermissionAction = actionLabel === 'delete' ? 'delete' : 'edit';
                return hasPermission(permissions, 'invoices', permissionAction);
            }

            return true;
        });
    };

    const handleConvertClick = async (item: Invoice) => {
        if (!window.confirm('Convert this proforma to an invoice?')) return;
        try {
            const res = await axios.post(
                `${Constants.CONVERT_PROFORMA_TO_INVOICE_URL}/${item.id}/convert-to-invoice`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const newId = res.data?.data?.invoice?.id;
            toast.success('Proforma converted to invoice');
            if (newId) {
                navigate(`/admin/invoices/edit-invoice/${newId}`);
            } else {
                await fetchInvoices();
            }
        } catch (e) {
            console.error('convert failed', e);
            toast.error('Conversion failed');
        }
    }

    const handleViewClick = (item: Invoice) => {
        navigate(`/admin/view-invoice/${item.id}`);
    }
    const handleEditClick = (item: Invoice) => {
        navigate(`/admin/invoices/edit-invoice/${item.id}`);
    }
    const handleDeleteClick = (item: Invoice) => {
        setItemToDelete(item);
        setShowDeleteModal(true);
    }

    const handlePaymentClick = async (item: Invoice) => {
        try {
            const response = await axios.get(`${Constants.FETCH_INVOICE_PAYMENT_DETAILS_URL}/${item.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.data) {
                setIsPaymentModalOpen(true);
                setItemForPayment(response.data.data);
            }
        } catch (error) {
            console.error('Failed to get invoice payment details:', error);
        }
    }

    const confirmDelete = async () => {
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_INVOICE_URL}/${itemToDelete?.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Invoice deleted successfully');
            setShowDeleteModal(false);
            await fetchInvoices();
        } catch (error) {
            console.error('Failed to delete invoice:', error);
        } finally {
            setIsDeleting(false);
        }
    }

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Invoices</h1>
                {hasPermission(permissions, 'invoices', 'create') && (
                    <button
                        onClick={handleNewInvoiceClick}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                        <CirclePlusIcon size={14} /> New Invoice
                    </button>
                )}
            </div>

            {/* Invoice Type Filter Pills */}
            <div className="flex items-center gap-2 mb-3">
                {(['all', 'INVOICE', 'PROFORMA'] as const).map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => handleInvoiceTypeFilterChange(opt)}
                        className={
                            'px-3 py-1 text-sm rounded-full border cursor-pointer ' +
                            (invoiceTypeFilter === opt
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                        }
                    >
                        {opt === 'all' ? 'All' : opt === 'INVOICE' ? 'Invoices' : 'Proformas'}
                    </button>
                ))}
            </div>

            {/* Search Input & PageLength */}
            <div className="flex justify-between items-center mb-4">
                <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64 text-gray-950 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
                <select
                    value={limit}
                    onChange={(e) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white text-gray-950 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-950 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            {/* Invoice Table */}
            <Table headers={tableHeaders}>
                {!isPageLoading && invoices && invoices.map((invoice, index) => (
                    <TableRow
                        key={invoice.id}
                        index={(page - 1) * limit + index + 1}
                        row={invoice}
                        columns={[
                            <a href={`/admin/view-invoice/${invoice.id}`} className="text-indigo-600 font-medium cursor-pointer" target="_blank" rel="noreferrer">{invoice.invoiceNumber}</a>,
                            <span className={
                                'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                                (invoice.invoiceType === 'PROFORMA'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-green-100 text-green-700')
                            }>
                                {invoice.invoiceType === 'PROFORMA' ? 'Proforma' : 'Invoice'}
                            </span>,
                            <ProfileCard
                                imageUrl={invoice.billTo?.image}
                                name={invoice.billTo?.name}
                                email={invoice.billTo?.email}
                            />,
                            <span className="font-semibold text-gray-600 ">{formatMoney(invoice.TotalAmount, invoice.currencyCode)}</span>,
                            <span className="font-semibold text-gray-600 ">{formatMoney(invoice.totalPaid as number ?? 0, invoice.currencyCode)}</span>,
                            <InvoiceStatusBadge status={invoice.status} />,
                            <span className="font-medium text-gray-600 ">{formatDate(invoice.createdAt as string, systemSettings?.dateFormat.format || 'd-m-Y')}</span>,

                            // Map over configured custom fields using fieldSlug
                            ...tableCustomFields.map((f: any) => (
                                <span key={f.id} className="text-gray-600 font-medium">
                                    {extractCustomFieldValue(invoice, f.fieldSlug)}
                                </span>
                            ))
                        ]}
                        actions={getTableActions(invoice)}
                    />
                ))}

                {!isPageLoading && invoices.length === 0 && (
                    <NoRecords message="No records found" colSpan={tableHeaders.length} />
                )}

                {isPageLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-4 text-gray-950 font-semibold" colSpan={tableHeaders.length}>
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>

            {/* Pagination Component */}
            {!isPageLoading && pagination.totalPages > 1 && (
                <PaginationWrapper
                    count={pagination.totalPages}
                    page={page}
                    from={from}
                    to={to}
                    total={pagination.total}
                    onChange={(_, newPage) => handlePageChange(newPage)}
                    paginationVariant="outlined"
                    paginationShape="rounded"
                />
            )}

            {/* Delete Invoice */}
            <DeleteConfirmationModal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                onConfirm={confirmDelete}
                isDeleting={isDeleting}
                title="Confirm Deletion"
                message="Are you sure you want to delete this invoice? This action cannot be undone."
            />

            {/* Payment Modal Component */}
            {itemForPayment && (
                <InvoicePaymentModal
                    isOpen={isPaymentModalOpen}
                    onClose={() => setIsPaymentModalOpen(false)}
                    invoiceItem={itemForPayment as InvoicePaymentDetails}
                    onSuccess={() => fetchInvoices()}
                />
            )}
        </div>
    );
};

export default InvoiceList;