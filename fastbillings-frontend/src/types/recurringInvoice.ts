export type RecurrenceFrequency = 'day' | 'week' | 'month' | 'year' | 'custom';
export type RecurrenceCustomIntervalType = 'day' | 'week' | 'month' | 'year';

export interface RecurringInvoiceSummary {
  id: string;
  invoiceNumber: string | null;
  customer: { id: string; name: string } | null;
  repeatEvery: RecurrenceFrequency | null;
  customIntervalNumber: number | null;
  customIntervalType: RecurrenceCustomIntervalType | null;
  startOn: string | null;
  endsOn: string | null;
  neverExpire: boolean;
  stopped: boolean;
  lastRecurringDate: string | null;
  nextRecurringDate: string | null;
  childrenCount: number;
  TotalAmount: string | number | null;
}

export interface ChildInvoiceSummary {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string;
  status: string;
  TotalAmount: string | number | null;
}
