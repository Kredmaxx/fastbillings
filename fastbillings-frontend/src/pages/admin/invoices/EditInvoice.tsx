import React, { useEffect, useState, useMemo, useRef } from 'react';
import { PlusCircle, Edit } from 'lucide-react';
import DateInput from '@components/admin/DateInput';
import axios from 'axios';
import Constants from '@constants/api';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import { useDebounce } from '@hooks/useDebounce';
import Modal from '@components/admin/Modal';
import SignatureCanvas from 'react-signature-canvas';
import { toast } from "sonner";
import { useNavigate, useParams } from 'react-router-dom';
import Switch from '@components/admin/Switch';
import { numberToWords } from '@utils/converters';
import FullPageLoader from '@components/admin/FullPageLoader';
import CustomerCard from '@components/admin/CustomerCard';
import AdminCard from '@components/admin/AdminCard';
import SubmitButton from '@components/admin/SubmitButton';
import SmartDropdown from '@components/admin/SmartDropdown';
import CreateCustomerForm from '@components/admin/CreateCustomerForm';
import CreateProductForm from '@components/admin/CreateProductForm';
import InvoiceTableRow from '@components/admin/InvoiceTableRow';
import type { OptionType, SelectedAdmin } from '@models/common';
import CreateBankAccountModal from '@pages/admin/invoices/CreateBankAccountModal';
import type { BankAccountCreatedResponse } from '@models/bank-account';
import CreateSignatureModal from '@pages/admin/invoices/CreateSignatureModal';
import type { SignatureOptions } from '@models/signature';
import type { Product, ProductItem as BaseProductItem } from '@models/product';
import type { Customer } from '@models/customer';
import type { Vehicle } from '@models/vehicle';
import type { TaxRate, TaxLine } from '@models/taxRate';
import CustomCheckbox from '@components/admin/CustomCheckbox';
import DynamicCustomFields from '@components/admin/DynamicCustomFields';
import { QRCodeSVG } from 'qrcode.react';
import CurrencySelect from '@components/admin/CurrencySelect';
import { useCurrencies } from '@hooks/useCurrencies';
import useDateFormatter from '@hooks/useDateFormatter';

// Extend the base ProductItem to carry the new per-line tax breakdown.
type ProductItem = BaseProductItem & {
    taxes?: TaxLine[];
    totalTax?: number;
    appliedTaxRateIds?: string[];
};

// --- Inline TaxPicker (kept local to keep changes scoped) ---
function TaxPicker({
    taxRates,
    selectedIds,
    onChange,
}: {
    taxRates: TaxRate[];
    selectedIds: string[];
    onChange: (ids: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="text-xs text-purple-700 underline"
            >
                Edit
            </button>
            {open && (
                <div className="absolute z-10 mt-1 bg-white border rounded-md shadow-lg p-2 max-h-60 overflow-y-auto w-64">
                    {taxRates.length === 0 && (
                        <div className="text-xs text-gray-500">No tax rates configured.</div>
                    )}
                    {taxRates.map((r) => (
                        <label
                            key={r.id}
                            className="flex items-center gap-2 text-sm py-1 hover:bg-gray-50 px-2 cursor-pointer"
                        >
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(r.id)}
                                onChange={(e) => {
                                    const next = e.target.checked
                                        ? [...selectedIds, r.id]
                                        : selectedIds.filter((x) => x !== r.id);
                                    onChange(next);
                                }}
                            />
                            <span>{r.name}</span>
                            <span className="ml-auto text-xs text-gray-500">
                                {Number(r.rate).toFixed(2)}%
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}

interface InvoiceFormData {
    invoiceNumber: string;
    invoiceDate: Date | null;
    dueDate: Date | null;
    status: string;
    isRecurring: boolean;
    repeatEvery: 'day' | 'week' | 'month' | 'year' | 'custom' | null;
    customIntervalNumber: number | null;
    customIntervalType: 'day' | 'week' | 'month' | 'year' | null;
    startOn: Date | null;
    endsOn: Date | null;
    neverExpire: boolean;
    stopped: boolean;
    billFrom: string;
    billTo: string;
    items: ProductItem[];
    notes: string;
    termsAndCondition: string;
    bank: string | null;
    sign_type: 'none' | 'digitalSignature' | 'eSignature';
    signatureId: string | null;
    signatureName: string;
    esignDataUrl: string | null;
    subTotal: number | null;
    totalTax: number | null;
    totalDiscount: number | null;
    grandTotal: number | null;
    customFields: Record<string, any>;
    vehicleId: string | null;
    invoiceType: 'INVOICE' | 'PROFORMA';
    currencyCode: string;
}

interface taxGroup {
    id: string;
    tax_name: string;
    total_tax_rate: number;
    tax_rates: {
        id: string;
        tax_name: string;
        tax_rate: number;
    }[];
}

const EditInvoice: React.FC = () => {
    const navigate = useNavigate();
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const { invoiceId } = useParams<{ invoiceId: string }>();
    const { defaultCurrencyCode, resolveCurrency } = useCurrencies();
    const { formatDate, formatDateTime } = useDateFormatter();

    // Core States
    const [adminUsers, setAdminUsers] = useState<OptionType[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerSearchInput, setCustomerSearchInput] = useState<string>('');
    const debouncedSearchTermCustomer = useDebounce(customerSearchInput, 500);

    const [selectedAdmin, setSelectedAdmin] = useState<OptionType | null>(null);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [companyDetails, setCompanyDetails] = useState<SelectedAdmin | null>(null);
    const [customerDetails, setCustomerDetails] = useState<Customer | null>(null);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
    const [bankAccountSearchInput, setBankAccountSearchInput] = useState<string>('');
    const debouncedSearchTermBankAccount = useDebounce(bankAccountSearchInput, 500);
    const [isCreateBankAccountModalOpen, setIsCreateBankAccountModalOpen] = useState(false);
    const [repeatEverySearchKeyword, setRepeatEverySearchKeyword] = useState<string>('');
    const [customIntervalTypeSearchKeyword, setCustomIntervalTypeSearchKeyword] = useState<string>('');
    const [activeCustomFields, setActiveCustomFields] = useState<any[]>([]);

    const [invoiceFormData, setInvoiceFormData] = useState<InvoiceFormData>({
        invoiceNumber: '',
        invoiceDate: null,
        dueDate: null,
        status: 'DRAFT',
        isRecurring: false,
        repeatEvery: null,
        customIntervalNumber: null,
        customIntervalType: null,
        startOn: new Date(),
        endsOn: null,
        neverExpire: true,
        stopped: false,
        billFrom: '',
        billTo: '',
        items: [],
        notes: '',
        termsAndCondition: '',
        bank: null,
        sign_type: 'none',
        signatureId: null,
        signatureName: '',
        esignDataUrl: null,
        subTotal: null,
        totalTax: null,
        totalDiscount: null,
        grandTotal: null,
        customFields: {},
        vehicleId: null,
        invoiceType: 'INVOICE',
        currencyCode: '',
    });

    // Holds the raw loaded invoice record (used for converted banner + edit lock)
    const [invoiceData, setInvoiceData] = useState<any>(null);

    const [vehiclesForCustomer, setVehiclesForCustomer] = useState<Vehicle[]>([]);

    // Edit Modal State
    const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<ProductItem | null>(null);
    const [taxes, setTaxes] = useState<taxGroup[]>([]);
    const [taxRateLibrary, setTaxRateLibrary] = useState<TaxRate[]>([]);

    // Extra Information State
    const [activeInfoTab, setActiveInfoTab] = useState<'notes' | 'termsAndCondition' | 'bank'>('notes');
    const [bankAccounts, setBankAccounts] = useState<OptionType[]>([]);
    const [manualSignatures, setManualSignatures] = useState<SignatureOptions[]>([]);
    const [isSignatureModalOpen, setSignatureModalOpen] = useState(false);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const sigPadRef = useRef<SignatureCanvas>(null);
    const [isFetching, setIsFetching] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [adminSearchInput, setAdminSearchInput] = useState<string>('');
    const [signatureSearchInput, setSignatureSearchInput] = useState<string>('');
    const debouncedSearchTermSignature = useDebounce(signatureSearchInput, 500);
    const [isCreateSignModalOpen, setIsCreateSignModalOpen] = useState(false);

    // --- FORM HANDLERS (Defined first so fetchers can use them) ---
    const handleFormChange = (field: keyof InvoiceFormData, value: any) => {
        setInvoiceFormData(prev => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const handleCustomFieldChange = (fieldSlug: string, value: any) => {
        setInvoiceFormData(prev => ({
            ...prev,
            customFields: { ...prev.customFields, [fieldSlug]: value }
        }));
        if (formErrors[`customField_${fieldSlug}`]) {
            setFormErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[`customField_${fieldSlug}`];
                return newErrors;
            });
        }
    };

    const handleAdminChange = async (user: OptionType) => {
        setSelectedAdmin(user);
        try {
            setIsFetching(true);
            const response = await axios.get(`${Constants.FETCH_COMPANY_SETTINGS_URL}/${user.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setInvoiceFormData(prev => ({ ...prev, billFrom: user.id }));
            setCompanyDetails(response.data.data);
        } catch (error) {
            setCompanyDetails(null);
            setInvoiceFormData(prev => ({ ...prev, billFrom: '' }));
            setSelectedAdmin(null);
        } finally {
            setIsFetching(false);
        }
    };

    const fetchVehiclesForCustomer = async (customerId: string) => {
        if (!customerId) {
            setVehiclesForCustomer([]);
            return;
        }
        try {
            const res = await axios.get(
                `${Constants.GET_VEHICLES_FOR_CUSTOMER_URL}/${customerId}/vehicles`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setVehiclesForCustomer(res.data?.data?.vehicles ?? []);
        } catch {
            setVehiclesForCustomer([]);
        }
    };

    const handleCustomerChange = async (user: Customer) => {
        if (user) {
            setSelectedCustomer(user);
            setInvoiceFormData(prev => ({
                ...prev,
                billTo: user.id,
                vehicleId: null,
                currencyCode: user.currencyCode || prev.currencyCode,
            }));
            setCustomerDetails(user);
            fetchVehiclesForCustomer(user.id);
        } else {
            setSelectedCustomer(null);
            setInvoiceFormData(prev => ({ ...prev, billTo: '', vehicleId: null }));
            setCustomerDetails(null);
            setVehiclesForCustomer([]);
        }
    };

    // --- PUBLIC LINK HANDLERS ---
    const [publicLinkSaving, setPublicLinkSaving] = useState(false);

    function getPublicUrl(publicToken: string): string {
        // Prefer publicBaseUrl from company settings; fall back to current origin.
        const base = (invoiceData as { company?: { publicBaseUrl?: string | null } } | null)?.company?.publicBaseUrl?.replace(/\/$/, '')
            ?? window.location.origin;
        return `${base}/invoice/${publicToken}`;
    }

    async function handleTogglePublicLink(enable: boolean) {
        if (!invoiceData?.id) return;
        setPublicLinkSaving(true);
        try {
            const url = enable
                ? `${Constants.ENABLE_PUBLIC_LINK_URL}/${invoiceData.id}/enable-public-link`
                : `${Constants.DISABLE_PUBLIC_LINK_URL}/${invoiceData.id}/disable-public-link`;
            const res = await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` } });
            const updated = res.data?.data;
            if (updated) {
                setInvoiceData((p: any) => p ? { ...p, publicViewToken: updated.publicViewToken, publicViewEnabled: updated.publicViewEnabled } : p);
            }
            toast.success(enable ? 'Public link enabled' : 'Public link disabled');
        } catch (e) {
            toast.error('Failed to update public link');
        } finally {
            setPublicLinkSaving(false);
        }
    }

    async function handleRotatePublicLink() {
        if (!invoiceData?.id) return;
        if (!window.confirm('Rotate the public link? The old URL will stop working.')) return;
        setPublicLinkSaving(true);
        try {
            const res = await axios.post(
                `${Constants.ROTATE_PUBLIC_LINK_URL}/${invoiceData.id}/rotate-public-link`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const updated = res.data?.data;
            if (updated) {
                setInvoiceData((p: any) => p ? { ...p, publicViewToken: updated.publicViewToken, publicViewEnabled: updated.publicViewEnabled } : p);
            }
            toast.success('Public link rotated');
        } catch (e) {
            toast.error('Failed to rotate public link');
        } finally {
            setPublicLinkSaving(false);
        }
    }

    async function handleCopyPublicLink() {
        if (!invoiceData?.publicViewToken) return;
        try {
            await navigator.clipboard.writeText(getPublicUrl(invoiceData.publicViewToken));
            toast.success('Link copied');
        } catch {
            toast.error('Copy failed');
        }
    }

    // --- E-INVOICE (IRN) HANDLERS — slice G.1 ---
    type EInvoiceRecord = {
        id: string;
        irn: string | null;
        ackNo: string | null;
        ackDate: string | null;
        status: 'PENDING' | 'GENERATED' | 'CANCELLED' | 'FAILED';
        provider: string;
        errorMessage: string | null;
        cancelledAt: string | null;
        cancelReason: string | null;
    };
    const [eInvoice, setEInvoice] = useState<EInvoiceRecord | null>(null);
    const [eInvoiceLoading, setEInvoiceLoading] = useState(false);
    const [eInvoiceSaving, setEInvoiceSaving] = useState(false);

    async function fetchEInvoice(invId: string) {
        try {
            setEInvoiceLoading(true);
            const res = await axios.get(`${Constants.GET_E_INVOICE_BY_INVOICE_URL}/${invId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setEInvoice(res.data?.data?.eInvoice ?? null);
        } catch (e) {
            // 404 is normal — no record yet
            if (axios.isAxiosError(e) && e.response?.status === 404) {
                setEInvoice(null);
            } else {
                console.error('Failed to fetch e-invoice:', e);
            }
        } finally {
            setEInvoiceLoading(false);
        }
    }

    async function handleGenerateIrn() {
        if (!invoiceData?.id) return;
        setEInvoiceSaving(true);
        try {
            const res = await axios.post(
                `${Constants.GENERATE_E_INVOICE_URL}/${invoiceData.id}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const rec = res.data?.data?.eInvoice as EInvoiceRecord | undefined;
            if (rec) setEInvoice(rec);
            toast.success(res.data?.message ?? 'IRN generated');
        } catch (e) {
            const msg = axios.isAxiosError(e)
                ? (e.response?.data as { message?: string } | undefined)?.message
                : null;
            toast.error(msg ?? 'Failed to generate IRN');
        } finally {
            setEInvoiceSaving(false);
        }
    }

    async function handleCancelIrn() {
        if (!eInvoice?.id) return;
        const reason = window.prompt('Reason for cancellation?');
        if (reason === null) return;
        setEInvoiceSaving(true);
        try {
            const res = await axios.post(
                `${Constants.CANCEL_E_INVOICE_URL}/${eInvoice.id}/cancel`,
                { reason },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const rec = res.data?.data?.eInvoice as EInvoiceRecord | undefined;
            if (rec) setEInvoice(rec);
            toast.success('IRN cancelled');
        } catch (e) {
            const msg = axios.isAxiosError(e)
                ? (e.response?.data as { message?: string } | undefined)?.message
                : null;
            toast.error(msg ?? 'Failed to cancel IRN');
        } finally {
            setEInvoiceSaving(false);
        }
    }

    useEffect(() => {
        if (invoiceData?.id && invoiceData?.invoiceType === 'INVOICE') {
            fetchEInvoice(invoiceData.id);
        } else {
            setEInvoice(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoiceData?.id, invoiceData?.invoiceType]);

    // --- WHATSAPP SEND HANDLER — slice G.3 ---
    const [whatsappModal, setWhatsappModal] = useState<{
        waMeUrl: string;
        phone: string;
        message: string;
        publicLink: string | null;
    } | null>(null);
    const [whatsappSending, setWhatsappSending] = useState(false);

    async function handleSendWhatsapp() {
        if (!invoiceData?.id) return;
        setWhatsappSending(true);
        try {
            const res = await axios.post(
                `${Constants.SEND_INVOICE_WHATSAPP_URL}/${invoiceData.id}/send-whatsapp`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const data = res.data?.data;
            if (data?.waMeUrl) {
                setWhatsappModal({
                    waMeUrl: data.waMeUrl,
                    phone: data.phone ?? '',
                    message: data.message ?? '',
                    publicLink: data.publicLink ?? null,
                });
            } else {
                toast.error('No WhatsApp URL returned');
            }
        } catch (e) {
            const msg = axios.isAxiosError(e)
                ? (e.response?.data as { message?: string } | undefined)?.message
                : null;
            toast.error(msg ?? 'Failed to compose WhatsApp message');
        } finally {
            setWhatsappSending(false);
        }
    }

    // --- RAZORPAY HANDLER ---
    async function payWithRazorpay() {
        if (!invoiceData?.id) return;
        try {
            // Load script if needed
            if (!(window as unknown as { Razorpay?: unknown }).Razorpay) {
                await new Promise<void>((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
                    s.onload = () => resolve();
                    s.onerror = () => reject(new Error('Failed to load Razorpay'));
                    document.body.appendChild(s);
                });
            }
            const orderRes = await axios.post(
                `${Constants.API_BASE_URL}/admin/razorpay/create-order/${invoiceData.id}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const { gatewayOrderId, amount, currency, keyId } = orderRes.data.data as {
                gatewayOrderId: string; amount: number; currency: string; keyId: string;
            };
            const W = window as unknown as { Razorpay: new (opts: Record<string, unknown>) => { open: () => void } };
            const rzp = new W.Razorpay({
                key: keyId,
                order_id: gatewayOrderId,
                amount: Math.round(amount * 100),
                currency,
                name: ((invoiceData as { company?: { companyName?: string } } | null)?.company?.companyName) ?? 'Payment',
                handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                    try {
                        await axios.post(
                            `${Constants.API_BASE_URL}/admin/razorpay/verify`,
                            response,
                            { headers: { Authorization: `Bearer ${token}` } },
                        );
                        toast.success('Payment captured');
                    } catch {
                        toast.error('Payment verification failed');
                    }
                },
                modal: { ondismiss: () => toast.info('Payment cancelled') },
            });
            rzp.open();
        } catch (e) {
            toast.error(axios.isAxiosError(e) ? (e.response?.data as { message?: string })?.message ?? 'Failed to start payment' : 'Failed to start payment');
        }
    }

    // --- STRIPE HANDLER ---
    async function payWithStripe() {
        if (!invoiceData?.id) return;
        try {
            const sessionRes = await axios.post(
                `${Constants.API_BASE_URL}/admin/stripe/create-checkout-session/${invoiceData.id}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const { sessionUrl } = sessionRes.data.data as { sessionId: string; sessionUrl: string };
            if (sessionUrl) {
                window.location.href = sessionUrl;
            } else {
                toast.error('No session URL returned');
            }
        } catch (e) {
            toast.error(axios.isAxiosError(e) ? (e.response?.data as { message?: string })?.message ?? 'Failed to start payment' : 'Failed to start payment');
        }
    }

    // --- FETCHERS (Defined before useEffect) ---
    const fetchAdminUsers = async () => {
        try {
            const response = await axios.get(`${Constants.FETCH_USERS_URL}/1`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.data.data.length > 0) {
                const formattedUsers = response.data.data.map((user: any) => ({ id: user.id, name: `${user.firstName} ${user.lastName}` }));
                setAdminUsers(formattedUsers);
            } else {
                setAdminUsers([]);
            }
        } catch (error) {
            console.error('Error fetching admin users:', error);
        }
    };

    const fetchTaxes = async () => {
        if (!token) return;
        try {
            const response = await axios.get(Constants.FETCH_TAX_GROUPS_URL, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setTaxes(response.data.data);
        } catch (error) {
            setTaxes([]);
        }
    };

    const fetchInvoiceForEdit = async () => {
        try {
            const response = await axios.get(
                `${Constants.FETCH_INVOICE_FOR_EDIT_URL}/${invoiceId}`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );

            const invoiceData = response.data?.data;

            if (invoiceData) {
                setInvoiceData(invoiceData);
                setInvoiceFormData((prev) => ({
                    ...prev,
                    invoiceNumber: invoiceData.invoiceNumber || '',
                    invoiceDate: invoiceData.invoiceDate ? new Date(invoiceData.invoiceDate) : null,
                    dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
                    status: invoiceData.status,
                    isRecurring: invoiceData.isRecurring,
                    repeatEvery: invoiceData.repeatEvery,
                    customIntervalNumber: invoiceData.customIntervalNumber,
                    customIntervalType: invoiceData.customIntervalType,
                    startOn: invoiceData.startOn ? new Date(invoiceData.startOn) : null,
                    endsOn: invoiceData.endsOn ? new Date(invoiceData.endsOn) : null,
                    neverExpire: invoiceData.neverExpire ?? true,
                    stopped: invoiceData.stopped ?? false,
                    billFrom: invoiceData?.billFrom?.id || '',
                    billTo: invoiceData?.billTo?.id || '',
                    items: ((invoiceData.items || []) as any[]).map((it: any) => {
                        const taxesArr: TaxLine[] = Array.isArray(it.taxes)
                            ? it.taxes.map((t: any) => ({
                                  taxRateId: String(t.taxRateId ?? t.id ?? ''),
                                  name: String(t.name ?? ''),
                                  kind: (t.kind ?? null) as TaxLine['kind'],
                                  percent: Number(t.percent ?? t.rate ?? 0),
                                  amount: Number(t.amount ?? 0),
                              }))
                            : [];
                        // The persisted invoice item shape (productId/productName/
                        // lineTotal) differs from the form's canonical ProductItem
                        // (id/name/amount). Reverse-map so the row renderer and the
                        // resubmit contract both get the fields they expect.
                        const qtyN = Number(it.qty ?? 0);
                        const rateN = Number(it.rate ?? 0);
                        return {
                            ...it,
                            id: String(it.id ?? it.productId ?? ''),
                            name: String(it.name ?? it.productName ?? ''),
                            unit: it.unit ?? '',
                            qty: qtyN,
                            rate: rateN,
                            discount: Number(it.discount ?? 0),
                            tax: Number(it.tax ?? it.totalTax ?? 0),
                            amount: Number(it.amount ?? it.lineTotal ?? rateN * qtyN),
                            taxes: taxesArr,
                            totalTax: Number(it.totalTax ?? taxesArr.reduce((s, t) => s + (t.amount || 0), 0)),
                            appliedTaxRateIds: taxesArr.map((t) => t.taxRateId).filter(Boolean),
                        } as ProductItem;
                    }),
                    notes: invoiceData.notes || '',
                    termsAndCondition: invoiceData.termsAndCondition || '',
                    bank: invoiceData.bank?.id || null,
                    sign_type: invoiceData.sign_type ?? 'none',
                    signatureId: invoiceData.signature?.id || null,
                    signatureName: invoiceData.signature?.name || '',
                    esignDataUrl: invoiceData.signature?.image || null,
                    subTotal: invoiceData.taxableAmount,
                    totalTax: invoiceData.vat,
                    totalDiscount: invoiceData.totalDiscount,
                    grandTotal: invoiceData.TotalAmount,
                    customFields: invoiceData.customFields || {},
                    vehicleId: invoiceData.vehicleId ?? null,
                    invoiceType: invoiceData.invoiceType ?? 'INVOICE',
                    currencyCode: invoiceData.currencyCode ?? defaultCurrencyCode,
                }));

                if (invoiceData.billFrom) {
                    let _admin = { id: invoiceData.billFrom.id, name: invoiceData.billFrom.name };
                    handleAdminChange(_admin);
                }
                if (invoiceData.billTo) {
                    let _customer = {
                        id: invoiceData.billTo.id,
                        name: invoiceData.billTo.name,
                        email: invoiceData.billTo.email,
                        phone: invoiceData.billTo.phone,
                        image: invoiceData.billTo.image
                    };
                    await handleCustomerChange(_customer as any);
                    // handleCustomerChange resets vehicleId to null; restore it from the loaded invoice
                    setInvoiceFormData(prev => ({ ...prev, vehicleId: invoiceData.vehicleId ?? null }));
                }
            }
        } catch (error) {
            console.error("Error fetching invoice for edit:", error);
        }
    }

    // --- INITIALIZATION ---
    useEffect(() => {
        const fetchDropdownData = async () => {
            setIsFetching(true);
            await fetchAdminUsers();
            await fetchTaxes();
            await fetchInvoiceForEdit();
            setIsFetching(false);
        }

        fetchDropdownData();
    }, []);

    useEffect(() => {
        if (!token) return;
        axios
            .get(`${Constants.GET_TAX_RATES_FOR_LIST_URL}?limit=100&isActive=true`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then((r) => {
                const list = r.data?.data?.taxRates ?? r.data?.data ?? [];
                setTaxRateLibrary(Array.isArray(list) ? list : []);
            })
            .catch(() => setTaxRateLibrary([]));
    }, [token]);

    const recomputeLineTaxes = (line: ProductItem, appliedTaxRateIds: string[]): ProductItem => {
        const qty = Number(line.qty || 0);
        const rate = Number(line.rate || 0);
        const discount = Number(line.discount || 0);
        const taxable = +(qty * rate - discount).toFixed(2);
        const applied = appliedTaxRateIds
            .map((id) => taxRateLibrary.find((r) => r.id === id))
            .filter((r): r is TaxRate => !!r);
        const taxes: TaxLine[] = applied.map((r) => ({
            taxRateId: r.id,
            name: r.name,
            kind: r.taxKind ?? null,
            percent: Number(r.rate),
            amount: +((taxable * Number(r.rate)) / 100).toFixed(2),
        }));
        const totalTax = +taxes.reduce((s, t) => s + t.amount, 0).toFixed(2);
        const lineTotal = +(taxable + totalTax).toFixed(2);
        return {
            ...line,
            taxes,
            totalTax,
            tax: totalTax,
            amount: lineTotal,
            appliedTaxRateIds,
        };
    };

    const updateLineTaxes = (rowId: string, appliedTaxRateIds: string[]) => {
        setInvoiceFormData((prev) => ({
            ...prev,
            items: prev.items.map((item) =>
                item.id === rowId ? recomputeLineTaxes(item as ProductItem, appliedTaxRateIds) : item,
            ),
        }));
    };

    const handleSuggestTaxesForLine = async (rowId: string) => {
        if (!selectedCustomer) return;
        try {
            const res = await axios.post(
                Constants.SUGGEST_TAXES_FOR_LINE_URL,
                { customerId: selectedCustomer.id },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const suggested: TaxRate[] = res.data?.data?.taxRates ?? [];
            setTaxRateLibrary((prev) => {
                const map = new Map(prev.map((r) => [r.id, r]));
                for (const r of suggested) map.set(r.id, r);
                return Array.from(map.values());
            });
            updateLineTaxes(
                rowId,
                suggested.map((r) => r.id),
            );
        } catch (e) {
            console.error('suggest failed', e);
        }
    };

    useEffect(() => {
        const fetchBankAccounts = async () => {
            try {
                const response = await axios.get(Constants.FETCH_BANK_ACCOUNTS_WITH_SEARCH_URL, {
                    params: { search: debouncedSearchTermBankAccount },
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.data.data.length > 0) {
                    const formattedBankAccounts = response.data.data.map((item: any) => ({
                        id: item.id, name: item.bankName
                    }));
                    setBankAccounts(formattedBankAccounts);
                } else {
                    setBankAccounts([]);
                }
            } catch (error) { }
        }
        fetchBankAccounts();
    }, [debouncedSearchTermBankAccount]);

    useEffect(() => {
        const fetchManualSignatures = async () => {
            try {
                const response = await axios.get(Constants.FETCH_SIGNATURES_WITH_SEARCH_URL, {
                    params: { search: debouncedSearchTermSignature },
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.data.data.length > 0) {
                    const formattedSignatures = response.data.data.map((item: any) => ({
                        id: item.id, name: item.signatureName, imageUrl: item.signatureImage
                    }));
                    setManualSignatures(formattedSignatures);
                } else {
                    setManualSignatures([]);
                }
            } catch (error) { }
        }
        fetchManualSignatures();
    }, [debouncedSearchTermSignature]);

    useEffect(() => {
        const fetchCustomersByQuery = async () => {
            try {
                const response = await axios.get(`${Constants.GET_CUSTOMERS_WITH_SEARCH_URL}`, {
                    params: { search: debouncedSearchTermCustomer, limit: 100, page: 1 },
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.data.data.customers.length > 0) {
                    setCustomers(response.data.data.customers);
                } else {
                    setCustomers([]);
                }
            } catch (error) { }
        }
        fetchCustomersByQuery();
    }, [debouncedSearchTermCustomer, token]);


    // --- REST OF HANDLERS ---
    const repeatEveryOptions = [
        { id: 'day', name: 'Day' }, { id: 'week', name: 'Week' },
        { id: 'month', name: 'Month' }, { id: 'year', name: 'Year' },
        { id: 'custom', name: 'Custom' }
    ];

    const customIntervalTypeOptions = [
        { id: 'day', name: 'Day(s)' }, { id: 'week', name: 'Week(s)' },
        { id: 'month', name: 'Month(s)' }, { id: 'year', name: 'Year(s)' }
    ];

    const handleRepeatEverySelect = (option: OptionType) => {
        if (option) {
            setRepeatEverySearchKeyword('');
            setInvoiceFormData(prev => ({ ...prev, repeatEvery: option.id as 'day' | 'week' | 'month' | 'year' | 'custom' }));
        } else {
            setInvoiceFormData(prev => ({ ...prev, repeatEvery: null }));
        }
    }

    const handleIntervalTypeSelect = (option: OptionType) => {
        if (option) {
            setCustomIntervalTypeSearchKeyword('');
            setInvoiceFormData(prev => ({ ...prev, customIntervalType: option.id as 'day' | 'week' | 'month' | 'year' }));
        } else {
            setInvoiceFormData(prev => ({ ...prev, customIntervalType: null }));
        }
    }

    const handleRemoveItem = (itemToRemove: ProductItem) => {
        handleFormChange('items', invoiceFormData.items.filter(item => item.id !== itemToRemove.id));
    };

    const handleEditItem = (itemToEdit: ProductItem) => {
        setEditingItem({ ...itemToEdit });
        setIsEditProductModalOpen(true);
    };

    const handleEditingItemChange = (field: keyof ProductItem, value: string | number) => {
        setEditingItem(prev => {
            if (!prev) return null;

            const fieldsToNumber = ['qty', 'rate', 'discount_value'];
            const newValue = fieldsToNumber.includes(field as string)
                ? Number(value) || 0
                : value;

            const updatedItem = { ...prev, [field]: newValue } as any;

            const qty = Number(updatedItem.qty || 0);
            const rate = Number(updatedItem.rate || 0);
            let discount_value = Number(updatedItem.discount_value || 0);
            const discount_type = updatedItem.discount_type || 'Fixed';
            const tax_group_id = updatedItem.tax_group_id;

            const subtotal = qty * rate;

            const selectedTaxGroup = taxes.find(t => String(t.id) === String(tax_group_id));
            const taxRate = selectedTaxGroup?.total_tax_rate || 0;
            const totalTax = (subtotal * taxRate) / 100;
            const subtotalWithTax = subtotal + totalTax;

            if (discount_type === 'Percentage') {
                if (discount_value < 0) discount_value = 0;
                if (discount_value > 100) discount_value = 100;
            } else {
                if (discount_value < 0) discount_value = 0;
                if (discount_value > subtotalWithTax) discount_value = subtotalWithTax;
            }

            const discountAmount = discount_type === 'Percentage'
                ? (subtotalWithTax * discount_value) / 100
                : discount_value;

            const safeDiscountAmount = Math.min(discountAmount, subtotalWithTax);
            const newAmount = subtotalWithTax - safeDiscountAmount;

            return {
                ...updatedItem,
                qty, rate, discount_value,
                discount_type: discount_type ?? 'Fixed',
                discount: safeDiscountAmount,
                tax: totalTax, amount: newAmount,
            } as ProductItem;
        });
    };

    const handleUpdateItem = () => {
        if (!editingItem) return;
        const updatedItems = invoiceFormData.items.map(item =>
            item.id === editingItem.id ? editingItem : item
        );
        handleFormChange('items', updatedItems);
        setIsEditProductModalOpen(false);
        setEditingItem(null);
    };

    const clearSignature = () => sigPadRef.current?.clear();
    const saveSignature = () => {
        if (sigPadRef.current) {
            const dataUrl = sigPadRef.current.getCanvas().toDataURL('image/png');
            handleFormChange('esignDataUrl', dataUrl);
            setSignatureModalOpen(false);
        }
    };

    const { subTotal, totalTax, totalDiscount, grandTotal } = useMemo(() => {
        const totals = invoiceFormData.items.reduce((acc, item) => {
            acc.subTotal += item.rate * item.qty;
            acc.totalDiscount += item.discount;
            acc.totalTax += item.tax;
            return acc;
        }, { subTotal: 0, totalTax: 0, totalDiscount: 0 });
        let grandTotalValue = totals.subTotal - totals.totalDiscount + totals.totalTax;
        const grandTotalInteger = Math.round(grandTotalValue);

        setTimeout(() => {
            setInvoiceFormData(prev => {
                if (prev.subTotal === totals.subTotal && prev.grandTotal === grandTotalInteger) return prev;
                return { ...prev, subTotal: totals.subTotal, totalTax: totals.totalTax, totalDiscount: totals.totalDiscount, grandTotal: grandTotalInteger }
            });
        }, 0);

        return { ...totals, grandTotal: grandTotalInteger };
    }, [invoiceFormData.items]);

    const totalInWords = useMemo(() => {
        if (grandTotal <= 0) return 'Zero';
        return numberToWords(Math.round(grandTotal));
    }, [grandTotal]);

    // Derive the document-level currency symbol from the selected currencyCode
    const docCurrencySymbol = resolveCurrency(invoiceFormData.currencyCode || defaultCurrencyCode).symbol;

    // The invoice is locked when it is PAID (currency cannot be changed)
    const isCurrencyLocked = invoiceData?.status === 'PAID';

    const selectedManualSignatureImage = useMemo(() => {
        return manualSignatures.find(sig => sig.id === invoiceFormData.signatureId)?.imageUrl || null;
    }, [invoiceFormData.signatureId, manualSignatures]);

    const handleInLineItemChange = (product: ProductItem, rowId: string) => {
        const { qty, rate, discount_value, discount_type, tax_group_id } = product;
        const subtotal = qty * rate;

        const discountAmount = discount_type === 'Percentage'
            ? (subtotal * (discount_value || 0)) / 100
            : (discount_value || 0);

        const discountedSubtotal = subtotal - discountAmount;

        const selectedTaxGroup = taxes.find(t => String(t.id) === String(tax_group_id));
        const taxRate = selectedTaxGroup?.total_tax_rate || 0;
        const taxPerUnit = (rate * taxRate) / 100;

        const totalTax = taxPerUnit * qty;
        const newAmount = discountedSubtotal + totalTax;
        let updatedProduct: ProductItem = { ...(product as ProductItem), discount: discountAmount, tax: totalTax, amount: newAmount };
        const appliedIds = (product as ProductItem).appliedTaxRateIds ?? ((product as ProductItem).taxes ?? []).map((t) => t.taxRateId);
        if (appliedIds.length > 0) {
            updatedProduct = recomputeLineTaxes(updatedProduct, appliedIds);
        }
        setInvoiceFormData((prev) => ({
            ...prev,
            items: prev.items.map(item => item.id === rowId ? updatedProduct : item)
        }));
    }

    const handleNewProductCreated = (product: Product) => {
        const discount_type = product.discount?.type;
        const discount_value = product.discount?.value;
        const subtotal = product.prices?.selling ?? 0;
        const rate = product.prices?.selling ?? 0;
        const discountAmount = discount_type === 'Percentage'
            ? (subtotal * (discount_value || 0)) / 100
            : (discount_value || 0);
        const taxRate = product.tax?.total_rate ?? 0;
        const taxPerUnit = (rate * taxRate) / 100;

        const totalTax = taxPerUnit * 1;
        const discountedSubtotal = subtotal - discountAmount;
        const newAmount = discountedSubtotal + totalTax;

        let updated = false;
        setInvoiceFormData((prev) => ({
            ...prev,
            items: prev.items.map(item => {
                if (!updated && item.name === "") {
                    updated = true;
                    return {
                        ...item,
                        id: product.id,
                        name: product.name,
                        unit: product.unit?.name ?? '',
                        qty: 1,
                        rate: product.prices?.selling ?? 0,
                        amount: newAmount,
                        discount: discountAmount,
                        tax: totalTax,
                        tax_group_id: product.tax?.group_id,
                        discount_type: product.discount?.type || "Fixed",
                        discount_value: product.discount?.value,
                    }
                }
                return item;
            })
        }));
        setIsProductModalOpen(false);
    }

    const handleNewRow = () => {
        setInvoiceFormData((prev) => ({
            ...prev,
            items: [...prev.items, {
                id: crypto.randomUUID(),
                name: '', unit: '', qty: 1, rate: 0, discount: 0, tax: 0, amount: 0
            }]
        }));
    }

    const validateQuotationData = () => {
        const newErrors: { [key: string]: string } = {};

        if (!invoiceFormData.invoiceDate) newErrors.invoiceDate = 'Invoice date is required.';
        if (!invoiceFormData.status.trim()) newErrors.status = 'Status is required.';

        if (invoiceFormData.isRecurring) {
            if (!invoiceFormData.repeatEvery) { newErrors.repeatEvery = 'Repeat every is required.'; }
            if (!invoiceFormData.startOn) { newErrors.startOn = 'Start on is required.'; }
            if (invoiceFormData.repeatEvery === 'custom') {
                if (!invoiceFormData.customIntervalNumber) newErrors.customIntervalNumber = 'Custom interval number is required.';
                if (!invoiceFormData.customIntervalType) newErrors.customIntervalType = 'Custom interval type is required.';
            }
            if (!invoiceFormData.neverExpire && !invoiceFormData.endsOn) {
                newErrors.endsOn = 'Ends on is required when never expire is not checked.';
            }
        }

        if (!invoiceFormData.billFrom.trim()) newErrors.billFrom = 'Bill from is required.';
        if (!invoiceFormData.billTo.trim()) newErrors.billTo = 'Bill to is required.';

        const hasItemPopulated = invoiceFormData.items.some(item => (item.name ?? '').trim() !== '');
        if (!hasItemPopulated) newErrors.items = 'At least one item is required.';

        if (invoiceFormData.sign_type === 'digitalSignature' && !invoiceFormData.signatureId) newErrors.signatureId = 'Manual signature is required.';
        if (invoiceFormData.sign_type === 'eSignature' && !invoiceFormData.signatureName.trim()) newErrors.signatureName = 'Esignature name is required.';
        if (invoiceFormData.sign_type === 'eSignature' && !invoiceFormData.esignDataUrl) newErrors.esignDataUrl = 'Esignature is required.';

        // Custom Fields Validation
        activeCustomFields.forEach((field: any) => {
            if (field.isMandatory) {
                const val = invoiceFormData.customFields[field.fieldSlug] || invoiceFormData.customFields[field.id];

                if (val === undefined || val === null) {
                    newErrors[`customField_${field.fieldSlug || field.id}`] = `${field.labelName} is required.`;
                } else if (Array.isArray(val) && val.length === 0) {
                    newErrors[`customField_${field.fieldSlug || field.id}`] = `${field.labelName} is required.`;
                } else if (typeof val === 'string' && val.trim() === '') {
                    newErrors[`customField_${field.fieldSlug || field.id}`] = `${field.labelName} is required.`;
                }
            }
        });

        setFormErrors(newErrors);
        return newErrors;
    }

    const saveQuotation = async (e: React.FormEvent) => {
        e.preventDefault();
        const errors = validateQuotationData();
        if (Object.keys(errors).length > 0) {
            toast.error('Please check the form for errors.');
            return;
        }

        const formData = new FormData();

        for (const [key, value] of Object.entries(invoiceFormData)) {
            if (key === 'esignDataUrl' && invoiceFormData.sign_type === 'eSignature') {
                const file = await dataURLtoFile(value as string, 'signature.png');
                if (file) {
                    formData.append('signatureImage', file);
                }
            } else if (value instanceof Date) {
                const year = value.getFullYear();
                const month = String(value.getMonth() + 1).padStart(2, "0");
                const day = String(value.getDate()).padStart(2, "0");
                formData.append(key, `${year}-${month}-${day}`);
            } else if (Array.isArray(value) && key === 'items') {
                value.forEach((item, index) => {
                    Object.entries(item).forEach(([itemKey, itemValue]) => {
                        if (itemValue === undefined || itemValue === null) return;
                        if (itemKey === 'taxes' && Array.isArray(itemValue)) {
                            (itemValue as TaxLine[]).forEach((t, tIdx) => {
                                formData.append(`items[${index}][taxes][${tIdx}][taxRateId]`, String(t.taxRateId));
                                formData.append(`items[${index}][taxes][${tIdx}][name]`, String(t.name));
                                formData.append(`items[${index}][taxes][${tIdx}][kind]`, t.kind ? String(t.kind) : '');
                                formData.append(`items[${index}][taxes][${tIdx}][percent]`, String(t.percent));
                                formData.append(`items[${index}][taxes][${tIdx}][amount]`, String(t.amount));
                            });
                            return;
                        }
                        if (itemKey === 'appliedTaxRateIds' && Array.isArray(itemValue)) {
                            (itemValue as string[]).forEach((id, iIdx) => {
                                formData.append(`items[${index}][appliedTaxRateIds][${iIdx}]`, String(id));
                            });
                            return;
                        }
                        formData.append(`items[${index}][${itemKey}]`, String(itemValue));
                    });
                });
            } else if (key === 'customFields') {
                const customFieldsEntries = Object.entries(invoiceFormData.customFields)
                    .filter(([_, val]) => {
                        if (val === undefined || val === null) return false;
                        if (typeof val === 'string' && val.trim() === '') return false;
                        if (Array.isArray(val) && val.length === 0) return false;
                        return true;
                    });

                customFieldsEntries.forEach(([fieldSlugOrId, val], index) => {
                    const matchedField = activeCustomFields.find(f => f.fieldSlug === fieldSlugOrId || f.id === fieldSlugOrId);
                    const finalFieldId = matchedField ? matchedField.id : fieldSlugOrId;

                    formData.append(`customFields[${index}][fieldId]`, finalFieldId);

                    if (Array.isArray(val)) {
                        formData.append(`customFields[${index}][value]`, val.join(','));
                    } else if (val instanceof Date) {
                        const year = val.getFullYear();
                        const month = String(val.getMonth() + 1).padStart(2, "0");
                        const day = String(val.getDate()).padStart(2, "0");
                        formData.append(`customFields[${index}][value]`, `${year}-${month}-${day}`);
                    } else if (val instanceof File) {
                        formData.append(`customFields[${index}][value]`, val);
                    } else {
                        formData.append(`customFields[${index}][value]`, String(val));
                    }
                });
            } else if (typeof value !== 'object' && value !== undefined && value !== null) {
                formData.append(key, String(value));
            }
        }

        try {
            setIsSubmitting(true);
            await axios.put(`${Constants.UPDATE_INVOICE_URL}/${invoiceId}`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data',
                },
            });
            toast.success('Invoice updated successfully.');
            navigate('/admin/invoices');
        } catch (error: any) {
            if (error.response?.status !== 200 && error.response?.data?.errors) {
                setFormErrors(error.response.data.errors);
                toast.error('Please check the form for errors.')
            } else {
                toast.error('An unexpected error occurred.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const dataURLtoFile = async (input: string, filename: string): Promise<File | null> => {
        try {
            if (input.startsWith('data:')) {
                const arr = input.split(',');
                if (arr.length !== 2) return null;
                const mimeMatch = arr[0].match(/:(.*?);/);
                const mime = mimeMatch?.[1] || 'image/png';
                const bstr = atob(arr[1]);
                const u8arr = new Uint8Array(bstr.length);
                for (let i = 0; i < bstr.length; i++) {
                    u8arr[i] = bstr.charCodeAt(i);
                }
                return new File([u8arr], filename, { type: mime });
            } else if (input.startsWith('http') || input.startsWith('/')) {
                const response = await fetch(input);
                if (!response.ok) return null;
                const blob = await response.blob();
                const mime = blob.type || 'image/png';
                return new File([blob], filename, { type: mime });
            }
            return null;
        } catch {
            return null;
        }
    };

    const handleNewProductClick = () => {
        setIsProductModalOpen(true);
    }

    return (
        <div className="md:p-4 bg-white-50 min-h-screen border border-gray-200 rounded">
            <form onSubmit={saveQuotation}>
                <div className="max-w-7xl mx-auto space-y-4">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-2">
                        <h1 className="text-2xl font-bold text-gray-950 ">Edit Invoice</h1>
                        {systemSettings?.company.siteLogo ? (
                            <img src={systemSettings?.company.siteLogo} alt="Logo" className='w-32' />
                        ) : (
                            <div className="flex h-12 w-32 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                                Your Logo
                            </div>
                        )}
                    </div>

                    {/* Converted banner — shown when this proforma has been converted to a final invoice */}
                    {invoiceData?.convertedAt && (
                        <div className="rounded-md bg-green-50 border border-green-200 text-green-800 p-3 mb-4 text-sm">
                            Converted on {formatDate(invoiceData.convertedAt)}. This proforma is now locked.
                        </div>
                    )}

                    {/* Child-of-recurring-parent banner */}
                    {invoiceData?.parentInvoice && (
                        <div className="rounded-md bg-blue-50 border border-blue-200 text-blue-800 p-3 mb-4 text-sm">
                            Generated from recurring schedule.{' '}
                            <a href={`/admin/invoices/edit-invoice/${invoiceData.parentInvoice}`} className="underline">
                                View parent
                            </a>
                        </div>
                    )}

                    {/* Public link panel */}
                    {invoiceData?.id && (
                        <div className="border rounded-md p-4 mb-4">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={!!invoiceData?.publicViewEnabled}
                                        disabled={publicLinkSaving}
                                        onChange={(e) => handleTogglePublicLink(e.target.checked)}
                                    />
                                    <span className="text-sm font-medium">Public view link</span>
                                </label>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleSendWhatsapp}
                                        disabled={whatsappSending}
                                        className="text-xs px-3 py-1 bg-green-600 text-white rounded disabled:opacity-50 whitespace-nowrap"
                                    >
                                        {whatsappSending ? 'Composing…' : 'Send via WhatsApp'}
                                    </button>
                                    {invoiceData?.publicViewEnabled && invoiceData?.publicViewToken && (
                                        <button
                                            type="button"
                                            onClick={handleRotatePublicLink}
                                            disabled={publicLinkSaving}
                                            className="text-xs text-purple-700 underline disabled:opacity-50"
                                        >
                                            Rotate
                                        </button>
                                    )}
                                </div>
                            </div>

                            {invoiceData?.publicViewEnabled && invoiceData?.publicViewToken && (
                                <div className="mt-3 flex items-start gap-4">
                                    <QRCodeSVG value={getPublicUrl(invoiceData.publicViewToken)} size={120} />
                                    <div className="flex-1 text-sm">
                                        <p className="text-gray-500 mb-1">Anyone with this link can view (read-only):</p>
                                        <div className="flex items-center gap-2 mb-2">
                                            <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all flex-1">
                                                {getPublicUrl(invoiceData.publicViewToken)}
                                            </code>
                                            <button
                                                type="button"
                                                onClick={handleCopyPublicLink}
                                                className="text-xs text-purple-700 underline whitespace-nowrap"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* E-Invoice (IRN) panel — slice G.1, only for final invoices */}
                    {invoiceData?.id && invoiceData?.invoiceType === 'INVOICE' && (
                        <div className="border rounded-md p-4 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium">E-Invoice (IRN)</span>
                                {eInvoice?.status === 'GENERATED' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-green-100 text-green-800">
                                        GENERATED
                                    </span>
                                )}
                                {eInvoice?.status === 'CANCELLED' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-gray-200 text-gray-700">
                                        CANCELLED
                                    </span>
                                )}
                                {eInvoice?.status === 'FAILED' && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-red-100 text-red-700">
                                        FAILED
                                    </span>
                                )}
                            </div>

                            {eInvoiceLoading && (
                                <p className="text-xs text-gray-500">Loading…</p>
                            )}

                            {!eInvoiceLoading && !eInvoice && (
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs text-gray-500">
                                        Generate an IRN (Invoice Reference Number) for this invoice via the configured e-invoice provider.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleGenerateIrn}
                                        disabled={eInvoiceSaving}
                                        className="px-3 py-1 bg-purple-600 text-white text-sm rounded disabled:opacity-60 whitespace-nowrap"
                                    >
                                        {eInvoiceSaving ? 'Generating…' : 'Generate IRN'}
                                    </button>
                                </div>
                            )}

                            {!eInvoiceLoading && eInvoice && (
                                <div className="text-sm space-y-1">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <div className="text-xs text-gray-500">IRN</div>
                                            <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all block" title={eInvoice.irn ?? ''}>
                                                {eInvoice.irn ?? '—'}
                                            </code>
                                        </div>
                                        <div>
                                            <div className="text-xs text-gray-500">ACK No</div>
                                            <div className="text-sm">{eInvoice.ackNo ?? '—'}</div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {eInvoice.ackDate ? formatDateTime(eInvoice.ackDate) : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-2">
                                        <div className="text-xs text-gray-500">
                                            Provider: <span className="uppercase">{eInvoice.provider}</span>
                                            {eInvoice.cancelledAt && (
                                                <span className="ml-2">· cancelled {formatDate(eInvoice.cancelledAt)}</span>
                                            )}
                                        </div>
                                        {eInvoice.status === 'GENERATED' && (
                                            <button
                                                type="button"
                                                onClick={handleCancelIrn}
                                                disabled={eInvoiceSaving}
                                                className="px-3 py-1 bg-red-600 text-white text-xs rounded disabled:opacity-60"
                                            >
                                                {eInvoiceSaving ? 'Cancelling…' : 'Cancel IRN'}
                                            </button>
                                        )}
                                    </div>
                                    {eInvoice.errorMessage && (
                                        <p className="text-xs text-red-600 pt-1">{eInvoice.errorMessage}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pay with Razorpay / Stripe */}
                    {invoiceData?.id && Number(invoiceData?.TotalAmount ?? 0) > 0 && (
                        <div className="mb-4">
                            <button
                                type="button"
                                onClick={payWithRazorpay}
                                className="px-3 py-1 bg-purple-600 text-white text-sm rounded"
                            >
                                Pay with Razorpay
                            </button>
                            <button
                                type="button"
                                onClick={payWithStripe}
                                className="px-3 py-1 bg-indigo-600 text-white text-sm rounded ml-2"
                            >
                                Pay with Stripe
                            </button>
                        </div>
                    )}

                    {/* Document Type */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-600">Document Type</label>
                        <select
                            value={invoiceFormData.invoiceType}
                            onChange={(e) =>
                                setInvoiceFormData((prev) => ({ ...prev, invoiceType: e.target.value as 'INVOICE' | 'PROFORMA' }))
                            }
                            disabled={!!invoiceData?.convertedAt}
                            className="mt-1 text-gray-700 p-2 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 border border-gray-200 rounded-md disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            <option value="INVOICE">Invoice</option>
                            <option value="PROFORMA">Proforma</option>
                        </select>
                        {invoiceFormData.invoiceType === 'PROFORMA' && (
                            <p className="text-xs text-gray-500 mt-1">Proformas do not deduct inventory on save.</p>
                        )}
                    </div>

                    {/* Top Section */}
                    <div className="w-full">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
                            <div className="w-full">
                                <DateInput
                                    label="Invoice Date"
                                    value={invoiceFormData.invoiceDate}
                                    onChange={(newDate) => handleFormChange('invoiceDate', newDate)}
                                    isRequired
                                />
                                {formErrors?.invoiceDate && <span className="text-red-500 text-sm">{formErrors.invoiceDate}</span>}
                            </div>
                            <div className="w-full">
                                <DateInput
                                    label="Due Date"
                                    value={invoiceFormData.dueDate}
                                    onChange={(newDate) => handleFormChange('dueDate', newDate)}
                                    minDate={invoiceFormData.invoiceDate || new Date()}
                                    isRequired={false}
                                />
                                {formErrors?.dueDate && <span className="text-red-500 text-sm">{formErrors.dueDate}</span>}
                            </div>
                            <div className="w-full">
                                <CurrencySelect
                                    label="Currency"
                                    value={invoiceFormData.currencyCode || defaultCurrencyCode}
                                    onChange={(code) => handleFormChange('currencyCode', code)}
                                    disabled={isCurrencyLocked}
                                />
                                {isCurrencyLocked && (
                                    <p className="text-xs text-amber-600 mt-1">Currency is locked on a paid invoice.</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Recurring Section */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-start gap-4 mb-4">
                            <label className="text-sm font-medium text-gray-700">
                                Is Recurring <em className="text-red-500">*</em>
                            </label>
                            <Switch
                                checked={invoiceFormData.isRecurring ?? false}
                                onChange={(e) => handleFormChange('isRecurring', e.target.checked)}
                                name="isRecurring"
                            />
                        </div>

                        {invoiceFormData.isRecurring && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Repeat Every <em className="text-red-500">*</em>
                                    </label>
                                    <SmartDropdown
                                        items={repeatEveryOptions}
                                        value={repeatEverySearchKeyword}
                                        placeholder='Select any option'
                                        onChange={(keyword) => setRepeatEverySearchKeyword(keyword)}
                                        onSelect={(item) => handleRepeatEverySelect(item as OptionType)}
                                        selectedItem={repeatEveryOptions.find(item => item.id === invoiceFormData.repeatEvery)}
                                        serverside={false}
                                    />
                                    {formErrors?.repeatEvery && <span className="text-red-500 text-sm">{formErrors.repeatEvery}</span>}
                                </div>

                                {invoiceFormData.repeatEvery === 'custom' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Interval <em className="text-red-500">*</em>
                                            </label>
                                            <input
                                                type="number"
                                                name="customIntervalNumber"
                                                id="customIntervalNumber"
                                                value={invoiceFormData.customIntervalNumber ?? ''}
                                                onChange={(e) => handleFormChange('customIntervalNumber', e.target.value)}
                                                placeholder="Enter Number"
                                                maxLength={5}
                                                className="border border-gray-300 rounded-md px-4 py-2 w-full focus:outline-none focus:ring-1 focus:ring-purple-600"
                                            />
                                            {formErrors?.customIntervalNumber && <span className="text-red-500 text-sm">{formErrors.customIntervalNumber}</span>}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Interval Type
                                            </label>
                                            <SmartDropdown
                                                items={customIntervalTypeOptions}
                                                value={customIntervalTypeSearchKeyword}
                                                onChange={(keyword) => setCustomIntervalTypeSearchKeyword(keyword)}
                                                onSelect={(item) => handleIntervalTypeSelect(item as OptionType)}
                                                selectedItem={customIntervalTypeOptions.find(item => item.id === invoiceFormData.customIntervalType)}
                                                serverside={false}
                                            />
                                            {formErrors?.customIntervalType && <span className="text-red-500 text-sm">{formErrors.customIntervalType}</span>}
                                        </div>
                                    </>
                                )}

                                <div>
                                    <DateInput
                                        label="Start On"
                                        value={invoiceFormData.startOn || new Date()}
                                        onChange={(newDate) => handleFormChange('startOn', newDate)}
                                        minDate={new Date()}
                                    />
                                    {formErrors?.startOn && <span className="text-red-500 text-sm">{formErrors.startOn}</span>}
                                </div>

                                <div>
                                    <DateInput
                                        label="Ends On"
                                        value={invoiceFormData.endsOn || null}
                                        onChange={(newDate) => handleFormChange('endsOn', newDate)}
                                        minDate={new Date()}
                                    />
                                    {formErrors?.endsOn && <span className="text-red-500 text-sm">{formErrors.endsOn}</span>}
                                </div>

                                <div className="flex items-center gap-2 mt-4 md:mt-0">
                                    <CustomCheckbox
                                        checked={invoiceFormData.neverExpire}
                                        onChange={(checked) => handleFormChange('neverExpire', checked)}
                                        name="neverExpire"
                                    />
                                    <label className="text-sm font-medium text-gray-700" htmlFor='neverExpire'>Never Expire</label>
                                    {formErrors?.neverExpire && <span className="text-red-500 text-sm block">{formErrors.neverExpire}</span>}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Billing Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-lg border border-gray-200 ">
                            <h3 className="font-bold text-gray-950 ">Bill From <span className='text-red-500'>*</span></h3>
                            <div className="mt-4">
                                <SmartDropdown
                                    items={adminUsers}
                                    value={adminSearchInput}
                                    onChange={setAdminSearchInput}
                                    onSelect={(item) => handleAdminChange(item as OptionType)}
                                    selectedItem={selectedAdmin}
                                    placeholder="Type to search..."
                                    serverside={false}
                                />
                                {!selectedAdmin && formErrors?.billFrom && <span className="text-red-500 text-sm">{formErrors.billFrom}</span>}
                                {!selectedAdmin && <p className="mt-2 text-xs text-gray-500 p-2 font-semibold">
                                    Select admin to view company details.
                                </p>}
                                <div className="h-4"></div>
                                {selectedAdmin && companyDetails && (
                                    <AdminCard
                                        logoUrl={companyDetails.siteLogo}
                                        companyName={companyDetails.companyName}
                                        city={companyDetails.city?.name}
                                        state={companyDetails.state?.name}
                                        address={companyDetails.address}
                                    />
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-gray-200 ">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-gray-950 ">Bill To <span className='text-red-500'>*</span></h3>
                                <button
                                    type='button'
                                    onClick={() => setIsCustomerModalOpen(true)}
                                    className="flex items-center text-sm text-purple-600 font-semibold cursor-pointer">
                                    <PlusCircle className="h-4 w-4 mr-1" />
                                    Add Customer
                                </button>
                            </div>
                            <div className="mt-4">
                                <SmartDropdown
                                    items={customers}
                                    value={customerSearchInput}
                                    onChange={setCustomerSearchInput}
                                    onSelect={(selectedCustomer) => handleCustomerChange(selectedCustomer as Customer)}
                                    onAddNew={() => setIsCustomerModalOpen(true)}
                                    selectedItem={customers.find((customer) => customer.id === selectedCustomer?.id) || null}
                                    addNewLabel='New Customer'
                                    placeholder='Type to search customer'
                                />
                                {!selectedCustomer && formErrors?.billTo && <span className="text-red-500 text-sm">{formErrors.billTo}</span>}
                                {!selectedCustomer && <p className="mt-2 text-xs text-gray-500 p-2 font-semibold">
                                    Select customer to view customer details
                                </p>}
                                <div className="h-4"></div>
                                {selectedCustomer && customerDetails && (
                                    <CustomerCard
                                        image={customerDetails.image}
                                        name={customerDetails.name}
                                        email={customerDetails.email}
                                        phone={customerDetails.phone}
                                    />
                                )}
                                {selectedCustomer && (
                                    <div className="mt-3">
                                        <label className="block text-sm font-medium text-gray-600">Vehicle (optional)</label>
                                        <div className="flex items-center gap-2 mt-1">
                                            <select
                                                value={invoiceFormData.vehicleId ?? ''}
                                                onChange={(e) => setInvoiceFormData((prev) => ({ ...prev, vehicleId: e.target.value || null }))}
                                                className="text-gray-700 p-2 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 w-full border border-gray-200 rounded-md"
                                            >
                                                <option value="">— No vehicle —</option>
                                                {vehiclesForCustomer.map((v) => (
                                                    <option key={v.id} value={v.id}>
                                                        {[v.name, v.make, v.model, v.registrationNumber].filter(Boolean).join(' • ') || v.id.slice(0, 8)}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => window.open(`/admin/vehicles/new?customerId=${selectedCustomer.id}`, '_blank')}
                                                className="text-sm px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
                                            >
                                                + Add vehicle
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* DYNAMIC CUSTOM FIELDS SECTION */}
                    <DynamicCustomFields
                        moduleSlug="invoices"
                        values={invoiceFormData.customFields}
                        errors={formErrors}
                        onChange={handleCustomFieldChange}
                        onFieldsLoaded={setActiveCustomFields}
                    />

                    {/* Items & Details Section */}
                    <div className="bg-white rounded-lg border border-gray-200 ">
                        <div className="p-4">
                            {formErrors?.items && <span className="text-red-500 text-sm">{formErrors.items}</span>}
                            <table className="w-full border-separate border-spacing-0 overflow-x-auto">
                                <thead className="bg-gray-950 text-white">
                                    <tr>
                                        <th className="p-3 text-left text-sm font-semibold rounded-tl-md">Product / Service</th>
                                        <th className="p-3 text-left text-sm font-semibold">Unit</th>
                                        <th className="p-3 text-left text-sm font-semibold">Quantity</th>
                                        <th className="p-3 text-left text-sm font-semibold">Rate</th>
                                        <th className="p-3 text-left text-sm font-semibold">Discount</th>
                                        <th className="p-3 text-left text-sm font-semibold">Tax</th>
                                        <th className="p-3 text-left text-sm font-semibold">Amount</th>
                                        <th className="p-3 text-left text-sm font-semibold rounded-tr-md">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoiceFormData.items.map((item) => (
                                        <React.Fragment key={item.id || Math.random()}>
                                            <InvoiceTableRow
                                                item={item}
                                                currencySymbol={docCurrencySymbol}
                                                currencyCode={invoiceFormData.currencyCode}
                                                onInLineItemChange={(updatedItem) => handleInLineItemChange(updatedItem, item.id)}
                                                onEditItem={handleEditItem}
                                                onDeleteItem={handleRemoveItem}
                                                availableItems={invoiceFormData.items}
                                                addNewProduct={handleNewProductClick}
                                            />
                                            <tr className="bg-gray-50">
                                                <td colSpan={8} className="px-3 py-2 border-b border-gray-200">
                                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                                        <span className="text-gray-600 font-medium">Taxes:</span>
                                                        {((item as ProductItem).taxes ?? []).length === 0 && (
                                                            <span className="text-gray-400 italic">No taxes applied</span>
                                                        )}
                                                        {((item as ProductItem).taxes ?? []).map((t, idx) => (
                                                            <span
                                                                key={`${t.taxRateId}-${idx}`}
                                                                className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full"
                                                            >
                                                                {t.kind ? `${t.kind} ` : ''}{t.percent}% · {docCurrencySymbol}{t.amount.toFixed(2)}
                                                            </span>
                                                        ))}
                                                        <span className="ml-auto flex items-center gap-3">
                                                            <TaxPicker
                                                                taxRates={taxRateLibrary}
                                                                selectedIds={(item as ProductItem).appliedTaxRateIds ?? ((item as ProductItem).taxes ?? []).map((t) => t.taxRateId)}
                                                                onChange={(ids) => updateLineTaxes(item.id, ids)}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSuggestTaxesForLine(item.id)}
                                                                disabled={!selectedCustomer}
                                                                className="text-xs text-purple-700 underline disabled:opacity-50 disabled:no-underline"
                                                                title={!selectedCustomer ? 'Select a customer first' : 'Suggest taxes based on customer'}
                                                            >
                                                                Suggest
                                                            </button>
                                                        </span>
                                                    </div>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    ))}
                                    {invoiceFormData.items.length === 0 && (
                                        <tr className="bg-white text-gray-950 ">
                                            <td className="p-3 font-medium text-center" colSpan={8}>
                                                No Items Selected
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {/* Add New Product */}
                            <div className="p-4 flex">
                                <button type='button' onClick={() => handleNewRow()} className="flex items-center text-sm text-purple-600 font-semibold cursor-pointer">
                                    <PlusCircle className="h-4 w-4 mr-1" />
                                    Add New Row
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Edit Product Modal */}
                <Modal isOpen={isEditProductModalOpen} onClose={() => setIsEditProductModalOpen(false)} title={`Edit: ${editingItem?.name}`}>
                    {editingItem && (
                        <div className="p-4 space-y-4">
                            <div>
                                <label htmlFor="edit-qty" className="block text-sm font-medium text-gray-700 ">Quantity</label>
                                <input
                                    type="number"
                                    id="edit-qty"
                                    min="1"
                                    step="1"
                                    value={editingItem.qty}
                                    onChange={(e) => handleEditingItemChange('qty', e.target.value)}
                                    className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                            </div>

                            <div>
                                <label htmlFor="edit-rate" className="block text-sm font-medium text-gray-700 ">Rate ({docCurrencySymbol})</label>
                                <input
                                    type="number"
                                    id="edit-rate"
                                    min="0"
                                    value={editingItem.rate}
                                    onChange={(e) => handleEditingItemChange('rate', e.target.value)}
                                    className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                            </div>
                            {/* Discount Type */}
                            <div>
                                <label htmlFor="edit-discount-type" className="block text-sm font-medium text-gray-700 ">Discount Type</label>
                                <select
                                    id="edit-discount-type"
                                    className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"
                                    value={editingItem.discount_type}
                                    onChange={(e) => handleEditingItemChange('discount_type', e.target.value)}
                                >
                                    <option value="Percentage">Percentage</option>
                                    <option value="Fixed">Fixed</option>
                                </select>
                            </div>
                            <div>
                                <label htmlFor="edit-discount" className="block text-sm font-medium text-gray-700 ">Discount Amount ({docCurrencySymbol})</label>
                                <input
                                    type="number"
                                    id="edit-discount"
                                    min="0"
                                    value={editingItem.discount_value}
                                    onChange={(e) => handleEditingItemChange('discount_value', e.target.value)}
                                    className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"
                                />
                            </div>

                            <div>
                                <label htmlFor="edit-tax-select" className="block text-sm font-medium text-gray-700 ">Apply Tax Group</label>
                                <select
                                    id="edit-tax-select"
                                    data-tax-group={editingItem.tax_group_id}
                                    className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"
                                    value={editingItem.tax_group_id || ''}
                                    onChange={(e) => {
                                        const selectedTaxGroup = taxes.find(t => t.id === e.target.value);
                                        if (selectedTaxGroup) {
                                            const newTaxAmount = (editingItem.rate * selectedTaxGroup.total_tax_rate) / 100;
                                            handleEditingItemChange('tax', newTaxAmount);
                                            handleEditingItemChange('tax_group_id', String(selectedTaxGroup.id));
                                        } else {
                                            handleEditingItemChange('tax', 0);
                                            handleEditingItemChange('tax_group_id', '');
                                        }
                                    }}
                                >
                                    <option value="">None</option>
                                    {taxes.map(taxGroup => (
                                        <option key={taxGroup.id} value={taxGroup.id}>
                                            {taxGroup.tax_name} ({taxGroup.total_tax_rate}%)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="pt-2">
                                <p className="text-lg font-semibold text-gray-950 ">
                                    New Amount: {docCurrencySymbol}{editingItem.amount.toFixed(2)}
                                </p>
                            </div>

                            <div className="flex justify-end gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsEditProductModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleUpdateItem}
                                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md hover:bg-gray-950"
                                >
                                    Update Item
                                </button>
                            </div>
                        </div>
                    )}
                </Modal>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

                    {/* Left Side: Tabs */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-950 mb-3">Extra Information</h3>
                        <div className="flex items-center gap-2 mb-4">
                            <button type='button' onClick={() => setActiveInfoTab('notes')} className={`px-4 py-2 text-sm cursor-pointer font-medium rounded-md ${activeInfoTab === 'notes' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 '}`}>Add Notes</button>
                            <button type='button' onClick={() => setActiveInfoTab('termsAndCondition')} className={`px-4 py-2 text-sm cursor-pointer font-medium rounded-md ${activeInfoTab === 'termsAndCondition' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 '}`}>Add Terms & Conditions</button>
                            <button type='button' onClick={() => setActiveInfoTab('bank')} className={`px-4 py-2 text-sm cursor-pointer font-medium rounded-md ${activeInfoTab === 'bank' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 '}`}>Bank Details</button>
                        </div>

                        {activeInfoTab === 'notes' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 ">Additional Notes</label>
                                <textarea value={invoiceFormData.notes} onChange={(e) => handleFormChange('notes', e.target.value)} rows={4} placeholder="Enter Notes" className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"></textarea>
                            </div>
                        )}
                        {activeInfoTab === 'termsAndCondition' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 ">Terms & Conditions</label>
                                <textarea value={invoiceFormData.termsAndCondition} onChange={(e) => handleFormChange('termsAndCondition', e.target.value)} rows={4} placeholder="Enter Terms & Conditions" className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"></textarea>
                            </div>
                        )}
                        {activeInfoTab === 'bank' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 ">Account</label>
                                <SmartDropdown
                                    items={bankAccounts}
                                    value={bankAccountSearchInput}
                                    onChange={(value) => { setBankAccountSearchInput(value); handleFormChange('bank', null); }}
                                    onSelect={(item) => handleFormChange('bank', (item as OptionType)?.id || null)}
                                    onAddNew={() => setIsCreateBankAccountModalOpen(true)}
                                    selectedItem={bankAccounts.find(item => item.id === invoiceFormData.bank)}
                                    addNewLabel='New Bank Account'
                                    placeholder='Type to search Bank Account...'
                                />
                            </div>
                        )}
                    </div>

                    {/* Right Side: Totals & Signature */}
                    <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-3">
                        <div className="flex justify-between text-sm text-gray-600 "><span>Amount</span><span>{docCurrencySymbol}{subTotal?.toFixed(2) || '0.00'}</span></div>
                        {(() => {
                            const breakdown: Record<string, number> = {};
                            for (const line of invoiceFormData.items as ProductItem[]) {
                                for (const t of (line.taxes ?? [])) {
                                    const key = t.kind ? `${t.kind} ${t.percent}%` : `${t.name}`;
                                    breakdown[key] = (breakdown[key] ?? 0) + (t.amount || 0);
                                }
                            }
                            const entries = Object.entries(breakdown);
                            if (entries.length === 0) return null;
                            return (
                                <div className="pl-2 border-l-2 border-purple-200 space-y-1">
                                    {entries.map(([label, amount]) => (
                                        <div key={label} className="flex justify-between text-xs text-gray-600">
                                            <span>{label}</span>
                                            <span>{docCurrencySymbol}{amount.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                        <div className="flex justify-between text-sm text-gray-600 "><span>Tax</span><span>{docCurrencySymbol}{totalTax?.toFixed(2) || '0.00'}</span></div>
                        <div className="flex justify-between text-sm text-gray-600 "><span>Discount</span><span>- {docCurrencySymbol}{totalDiscount?.toFixed(2) || '0.00'}</span></div>
                        <hr className="border-gray-200 " />
                        <div className="flex justify-between font-bold text-gray-950 "><span>Total <small className='text-xs text-gray-500 font-medium'>(Rounded)</small></span><span>{docCurrencySymbol}{grandTotal?.toFixed(2) || '0.00'}</span></div>
                        <p className="text-sm text-gray-500 capitalize">{totalInWords}</p>

                        <div className="flex items-center gap-4 pt-4">
                            <div className="flex items-center"><input id="no-sig" type="radio" name="signature" checked={invoiceFormData.sign_type === 'none'} onChange={() => handleFormChange('sign_type', 'none')} className="h-4 w-4 text-purple-600 cursor-pointer" /><label htmlFor="no-sig" className="ml-2 block text-sm text-gray-700 cursor-pointer">No Signature</label></div>
                            <div className="flex items-center"><input id="manual-sig" type="radio" name="signature" checked={invoiceFormData.sign_type === 'digitalSignature'} onChange={() => handleFormChange('sign_type', 'digitalSignature')} className="h-4 w-4 text-purple-600 cursor-pointer" /><label htmlFor="manual-sig" className="ml-2 block text-sm text-gray-700 cursor-pointer">Manual Signature</label></div>
                            <div className="flex items-center"><input id="e-sig" type="radio" name="signature" checked={invoiceFormData.sign_type === 'eSignature'} onChange={() => handleFormChange('sign_type', 'eSignature')} className="h-4 w-4 text-purple-600 cursor-pointer" /><label htmlFor="e-sig" className="ml-2 block text-sm text-gray-700 cursor-pointer">eSignature</label></div>
                        </div>

                        {invoiceFormData.sign_type !== 'none' && (invoiceFormData.sign_type === 'digitalSignature' ? (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Select Signature Name <span className="text-red-500">*</span></label>
                                <SmartDropdown
                                    items={manualSignatures}
                                    value={signatureSearchInput}
                                    onChange={(value) => setSignatureSearchInput(value)}
                                    onSelect={(item) => handleFormChange('signatureId', item?.id || '')}
                                    selectedItem={manualSignatures.find(sig => sig.id === invoiceFormData.signatureId) || null}
                                    onAddNew={() => setIsCreateSignModalOpen(true)}
                                    addNewLabel='New Signature'
                                    placeholder='Type to search signatures...'
                                />
                                {formErrors?.signatureId && <p className="text-red-500 text-xs mt-1">{formErrors.signatureId}</p>}
                                <p className="mt-2 text-sm font-medium text-gray-700 ">Signature Image</p>
                                <div className="mt-2 h-20 w-48 bg-gray-100 rounded-md flex items-center justify-center">
                                    {selectedManualSignatureImage ? <img src={selectedManualSignatureImage} alt="Selected Signature" className="max-h-full max-w-full" /> : <span className="text-xs text-gray-400">No signature selected</span>}
                                </div>
                            </div>
                        ) : (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 ">Signature Name <span className="text-red-500">*</span></label>
                                <input name='signatureName' type="text" value={invoiceFormData.signatureName} onChange={e => handleFormChange('signatureName', e.target.value)} placeholder="Enter Signature Name" className="border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600" />
                                {formErrors?.signatureName && <p className="text-red-500 text-xs mt-1">{formErrors.signatureName}</p>}
                                <p className="mt-2 text-sm font-medium text-gray-700 ">Draw your eSignature</p>
                                <div className="mt-2 h-20 w-48 bg-gray-100 rounded-md flex items-center justify-center cursor-pointer border-2 border-dashed border-gray-400" onClick={() => setSignatureModalOpen(true)}>
                                    {invoiceFormData.esignDataUrl ? <img src={invoiceFormData.esignDataUrl} alt="Drawn Signature" className="max-h-full max-w-full" /> : <div className="text-center text-gray-500"><Edit size={20} className="mx-auto mb-1" /><span className="text-xs">Draw Signature</span></div>}
                                </div>
                                {formErrors?.esignDataUrl && <p className="text-red-500 text-xs mt-1">{formErrors.esignDataUrl}</p>}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex justify-end mt-4 gap-3">
                    <button type='button' onClick={() => navigate('/admin/invoices')} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 cursor-pointer">Cancel</button>
                    <SubmitButton isDisabled={isSubmitting || !!invoiceData?.convertedAt} isLoading={isSubmitting} mode='edit' />
                </div>

                <Modal isOpen={isSignatureModalOpen} onClose={() => setSignatureModalOpen(false)} title="Draw Signature">
                    <div className="p-4">
                        <div className="bg-white border border-gray-400">
                            <SignatureCanvas
                                ref={sigPadRef}
                                penColor='black'
                                canvasProps={{ className: 'w-full h-48' }}
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-4">
                            <button type='button' onClick={clearSignature} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 cursor-pointer">Clear</button>
                            <button type='button' onClick={() => setSignatureModalOpen(false)} className="px-4 py-2 text-sm font-medium text-white bg-gray-500 rounded-md hover:bg-gray-600 cursor-pointer">Cancel</button>
                            <button type='button' onClick={saveSignature} className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-950 cursor-pointer">Save</button>
                        </div>
                    </div>
                </Modal>
            </form>

            {/* Modals */}
            <CreateProductForm
                isOpen={isProductModalOpen}
                onClose={() => setIsProductModalOpen(false)}
                onSuccess={(newProduct: Product) => handleNewProductCreated(newProduct)}
            />

            <CreateCustomerForm
                isOpen={isCustomerModalOpen}
                onClose={() => setIsCustomerModalOpen(false)}
                onSuccess={(newCustomer: Customer) => {
                    setCustomers(prevCustomers => [newCustomer, ...prevCustomers]);
                    setIsCustomerModalOpen(false);
                }}
            />

            <CreateBankAccountModal
                isOpen={isCreateBankAccountModalOpen}
                onClose={() => setIsCreateBankAccountModalOpen(false)}
                onSuccess={(newBankAccount: BankAccountCreatedResponse) => {
                    const formattedBankAccount: OptionType = {
                        id: newBankAccount.id,
                        name: newBankAccount.bankName
                    };
                    setBankAccounts(prevBankAccounts => [formattedBankAccount, ...prevBankAccounts]);
                    setIsCreateBankAccountModalOpen(false);
                }}
            />

            <CreateSignatureModal
                isOpen={isCreateSignModalOpen}
                onClose={() => setIsCreateSignModalOpen(false)}
                onSuccess={(newSignature: any) => {
                    const formattedSignature: SignatureOptions = {
                        id: newSignature.id,
                        name: newSignature.signatureName,
                        imageUrl: newSignature.signatureImage
                    };
                    setManualSignatures(prevSignatures => [formattedSignature, ...prevSignatures]);
                    setIsCreateSignModalOpen(false);
                }}
            />
            {isFetching && <FullPageLoader />}

            {whatsappModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-md shadow-lg max-w-lg w-full p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-lg font-semibold">Send via WhatsApp</h2>
                            <button
                                type="button"
                                onClick={() => setWhatsappModal(null)}
                                className="text-gray-500 hover:text-gray-700 text-xl leading-none"
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div>
                                <div className="text-xs text-gray-500">Phone</div>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded block">{whatsappModal.phone}</code>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Message</div>
                                <pre className="text-xs bg-gray-100 px-2 py-2 rounded whitespace-pre-wrap">{whatsappModal.message}</pre>
                            </div>
                            {whatsappModal.publicLink && (
                                <div>
                                    <div className="text-xs text-gray-500">Public link</div>
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all block">{whatsappModal.publicLink}</code>
                                </div>
                            )}
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setWhatsappModal(null)}
                                    className="px-3 py-1 border text-sm rounded"
                                >
                                    Close
                                </button>
                                <a
                                    href={whatsappModal.waMeUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 bg-green-600 text-white text-sm rounded"
                                >
                                    Open in WhatsApp
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EditInvoice;