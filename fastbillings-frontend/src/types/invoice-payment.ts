export interface InvoicePaymentDetails {
    id: string,
    invoiceNumber: string,
    invoiceDate: string,
    customer: string,
    totalAmount: number,
    referenceNo: string,
    status: string,
    payment: {
        isFullyPaid: boolean,
        isPartiallyPaid: boolean,
        paymentCount: number,
        remaining: number,
        totalPaid: number
    },
    paymentMethods: PaymentMethod[],
}

export interface PaymentMethod {
    id: string;
    name: string;
    slug: string;
    status: boolean;
}

export interface InvoicePaymentFormData {
    invoiceId: string,
    received_on: Date | null,
    amount: number,
    payment_method: string | null,
    bankId: string | null,
    notes: string | null
}