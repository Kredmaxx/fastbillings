export interface Item {
    id?: string;
    name?: string;
    /** Prisma-persisted invoices store the product name here */
    productName?: string;
    /** Prisma-persisted invoices store the product id here */
    productId?: string;
    unit: string;
    qty: number;
    rate: number;
    discount: number;
    tax: number;
    tax_group_id: string;
    discount_type: string | 'Fixed' | 'Percentage';
    discount_value: number | null;
    amount?: number;
    /** Prisma-persisted invoices store the line total here */
    lineTotal?: number;
    /** Optional GST HSN / SAC code when available on the line */
    hsn?: string | null;
    hsnSac?: string | null;
    sac?: string | null;
    taxes?: {
        kind?: string | null;
        percent?: number;
        name?: string;
        amount?: number;
    }[];
}

export interface InvoiceData {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    referenceNo: string;
    status: string;
    invoiceType?: 'INVOICE' | 'PROFORMA';
    convertedFromId?: string | null;
    convertedAt?: string | null;
    publicViewToken?: string | null;
    publicViewEnabled?: boolean;
    payment_method: string;
    currencyCode?: string | null;
    taxableAmount: number;
    totalDiscount: number;
    vat: number;
    TotalAmount: number;
    items: Item[];
    billFrom: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        address: string | null;
        image: string | null;
    },
    billTo: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        gstin?: string | null;
        billingAddress: {
            name: string;
            addressLine1: string;
            addressLine2: string;
            city: string;
            state: string;
            country: string;
            pincode: string;
        }
        image: string | null;
    },
    bank?: {
        id: string;
        accountHoldername: string;
        bankName: string;
        branchName: string;
        accountNumber: string;
        IFSCCode: string;
    },
    notes: string;
    termsAndCondition: string;
    isRecurring: boolean;
    recurring: 'daily' | 'weekly' | 'monthly' | 'yearly' | null;
    recurringDuration: number | null;
    sign_type: 'digitalSignature' | 'eSignature';
    signature: {
        id: string;
        name: string;
        image: string | null;
    },
    createdAt: string;
    updatedAt: string;
}