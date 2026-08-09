export interface EWayBillPayload {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: Date;
  sellerGstin: string;
  buyerGstin: string | null;
  totalAmount: number;
  taxableAmount: number;
  transporterGstin?: string | null;
  transporterName?: string | null;
  distanceKm?: number | null;
  vehicleNo?: string | null;
  fromPincode?: string | null;
  toPincode?: string | null;
}

export interface EWayBillGenerateResult {
  ewayBillNo: string;
  ewayBillDate: Date;
  validUpto: Date;
  metadata?: Record<string, unknown>;
}

export interface EWayBillProvider {
  name: string;
  generate(payload: EWayBillPayload, config: unknown): Promise<EWayBillGenerateResult>;
  cancel(ewayBillNo: string, reason: string, config: unknown): Promise<{ cancelledAt: Date }>;
}
