export type BankTransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'PAYMENT'
  | 'RECEIPT';

export type BankTransactionRelatedType =
  | 'INVOICE_PAYMENT'
  | 'SUPPLIER_PAYMENT'
  | 'PETTYCASH'
  | 'EXPENSE'
  | 'MANUAL';

export interface BankTransactionRow {
  id: string;
  bankAccountId: string;
  bankAccount: {
    id: string;
    bankName: string;
    accountNumber: string;
    accountHoldername?: string;
  } | null;
  transactionDate: string;
  type: BankTransactionType;
  amount: string | number;
  balanceBefore: string | number;
  balanceAfter: string | number;
  paymentMode: { id: string; name: string; slug?: string } | null;
  referenceNo: string;
  remarks: string;
  relatedType: BankTransactionRelatedType | null;
  relatedId: string | null;
  isReconciled: boolean;
  reconciledBy: string | null;
  reconciliationDate: string | null;
}

export interface BankTransactionPreviewRow {
  date: string;
  description: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  error?: string;
}
