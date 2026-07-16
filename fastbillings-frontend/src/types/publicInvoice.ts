import type { TaxLine } from './taxRate';

export interface PublicInvoiceItem {
  productId?: string;
  name?: string;
  qty?: number;
  rate?: number;
  discount?: number;
  taxes?: TaxLine[];
  totalTax?: number;
}

export interface PublicInvoicePayload {
  invoiceNumber: string | null;
  invoiceType: 'INVOICE' | 'PROFORMA';
  invoiceDate: string;
  dueDate: string;
  status: string;
  currency: string | null;
  items: PublicInvoiceItem[] | unknown;
  taxableAmount: string | number | null;
  totalDiscount: string | number | null;
  vat: string | number | null;
  TotalAmount: string | number | null;
  customer: {
    name: string;
    email: string;
    phone: string | null;
    billingAddress: unknown;
  } | null;
  billFrom: { firstName: string; lastName: string } | null;
  company: {
    companyName: string;
    email: string;
    phone: string | null;
    address: string;
    publicBaseUrl: string | null;
    merchantUpiId: string | null;
    merchantName: string | null;
  } | null;
}
