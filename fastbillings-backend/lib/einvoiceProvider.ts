export interface EInvoiceLineItem {
  name: string;
  qty: number;
  rate: number;
  /** Line total including tax (IRP TotAmt-style). */
  amount: number;
  taxableAmount: number;
  tax?: number;
  hsn: string;
  isService: boolean;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  uqc?: string;
}

export interface EInvoicePayload {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  sellerGstin: string;
  /** Required for B2B IRN after validation. */
  buyerGstin: string;
  sellerName?: string | null;
  buyerName?: string | null;
  /** Prefer 2-digit state code from buyer GSTIN. */
  placeOfSupply: string;
  totalAmount: number;
  taxableAmount: number;
  totalTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  items: EInvoiceLineItem[];
}

export interface EInvoiceGenerateResult {
  irn: string;
  ackNo: string;
  ackDate: Date;
  signedInvoice: string;
  signedQRCode: string;
  metadata?: Record<string, unknown>;
}

export interface EInvoiceProvider {
  name: string;
  generate(payload: EInvoicePayload, config: unknown): Promise<EInvoiceGenerateResult>;
  cancel(irn: string, reason: string, config: unknown): Promise<{ cancelledAt: Date }>;
  getStatus(irn: string, config: unknown): Promise<{ status: 'GENERATED' | 'CANCELLED' | 'PENDING' | 'FAILED' }>;
}
