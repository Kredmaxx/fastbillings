export interface ExpenseFormData {
    id?: string;
    amount: number;
    /** GST portion included in amount (ITC). */
    taxAmount?: number;
    /** When true, split taxAmount 50/50 CGST+SGST for INPUT_* posting. */
    splitGst?: boolean;
    expenseDate: Date | null;
    expenseCategoryId: string;
    sourceType: string;
    bankId: string | null;
    paymentMode: string | null;
    paymentStatus: string;
    description: string;
    attachment?: File | null;
    attachmentUrl?: string | null;
    supplierId?: string | null;
}

export interface ExpenseListShape {
    id: string;
    expenseId: string;
    referenceNo: string;
    amount: number;
    taxAmount?: number;
    expenseDate: string;
    sourceType: string;
    paymentMode: {
        id: string;
        name: string;
    } | null;
    bank: {
        id: string;
        bankName: string;
        accountNumber: string;
    } | null;
    expenseCategory: {
        id: string;
    };
    supplierId?: string | null;
    supplier?: {
        id: string;
        name: string;
    } | null;
    paymentStatus: string;
    description: string | null;
    attachment: string | null;
    createdBy: {
        id: string;
        email: string;
    }
    createdAt: string
}

export type ExpenseTaxClass =
    | 'ALLOWABLE'
    | 'DISALLOWABLE'
    | 'CAPITAL'
    | 'PERSONAL'
    | 'UNCLASSIFIED';

export type Section43BNature =
    | 'NONE'
    | 'BONUS'
    | 'PF_EMPLOYER'
    | 'ESI_EMPLOYER'
    | 'LEAVE_ENCASHMENT'
    | 'INTEREST_BANK'
    | 'TAX_DUTY_CESS'
    | 'OTHER_43B';

export interface ExpenseCategoryFormData {
    id?: string;
    title: string;
    description: string;
    status: boolean;
    taxClass: ExpenseTaxClass;
    section43BNature: Section43BNature;
}

export interface ExpenseCategoryShape {
    id: string;
    title: string;
    description: string;
    status: boolean;
    taxClass: ExpenseTaxClass;
    section43BNature?: Section43BNature;
    createdAt: string
}