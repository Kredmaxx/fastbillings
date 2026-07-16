import type { PermissionSet } from "./permissions";

export interface Company {
    id: string;
    userId: string;
    companyName: string;
    email: string;
    phone: string;
    address: string;
    pincode: string;
    siteLogo: string;
    companyLogo: string;
    favicon: string;
    /** India GST identification number (optional) */
    gstin?: string | null;
    city?: string;
    state?: string;
    country?: string;
}

export interface Currency {
    id: string;
    code: string;
    symbol: string;
    name: string;
    status: boolean;
    isDefault: boolean;
}

export interface DateFormat {
    id: string;
    title: string;
    format: string;
    isActive: boolean;
}

export interface TimeFormat {
    id: string;
    name: string;
    format: string;
    isActive: boolean;
}

export interface TimeZone {
    id: string;
    name: string;
    utc_offset: string;
}

export interface InvoiceTemplate {
    id: string;
    userId: string;
    default_invoice_template: string;
}
export interface SystemSettings {
    company: Company;
    currency: Currency;
    dateFormat: DateFormat;
    timeFormat: TimeFormat;
    timezone: TimeZone;
    permissions: PermissionSet[];
    invoiceTemplate: InvoiceTemplate;
    invoicePrefix: string;
    invoiceNumberType: 'auto' | 'manual';
}
