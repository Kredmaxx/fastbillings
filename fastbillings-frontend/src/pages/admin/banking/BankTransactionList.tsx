import { CirclePlusIcon, LinkIcon, Trash2Icon, Unlink2Icon, Upload, X } from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import NoRecords from "@components/admin/NoRecords";
import useDateFormatter from "@hooks/useDateFormatter";
import type {
    BankTransactionRow,
    BankTransactionPreviewRow,
    BankTransactionType,
} from "@/types/bankTransaction";

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface BankAccountOption {
    id: string;
    bankName: string;
    accountNumber: string;
    accountHoldername?: string;
}

type TypeFilter = "all" | BankTransactionType;
type ReconciledFilter = "all" | "true" | "false";

const TYPE_PILLS: TypeFilter[] = ["all", "DEPOSIT", "WITHDRAWAL", "TRANSFER_IN", "TRANSFER_OUT"];

const typeLabel: Record<string, string> = {
    DEPOSIT: "Deposit",
    WITHDRAWAL: "Withdrawal",
    TRANSFER_IN: "Transfer In",
    TRANSFER_OUT: "Transfer Out",
    PAYMENT: "Payment",
    RECEIPT: "Receipt",
};

const typeBadgeClass = (t: string): string => {
    if (t === "DEPOSIT" || t === "TRANSFER_IN" || t === "RECEIPT") {
        return "bg-green-100 text-green-700";
    }
    if (t === "WITHDRAWAL" || t === "TRANSFER_OUT" || t === "PAYMENT") {
        return "bg-red-100 text-red-700";
    }
    return "bg-gray-100 text-gray-700";
};

const BankTransactionList: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { formatDate } = useDateFormatter();
    const [rows, setRows] = useState<BankTransactionRow[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
    });
    const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([]);
    const [bankAccountFilter, setBankAccountFilter] = useState<string>("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [reconciledFilter, setReconciledFilter] = useState<ReconciledFilter>("all");
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState<number>(10);
    const [isLoading, setIsLoading] = useState(false);

    // Delete state
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteItem, setDeleteItem] = useState<BankTransactionRow | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Suggest-matches modal state
    interface SuggestMatchRow {
        candidateId: string;
        kind: 'INVOICE_PAYMENT' | 'SUPPLIER_PAYMENT';
        amount: number;
        date: string;
        reference: string;
        parentLabel: string;
        score: number;
        reasons: string[];
    }
    interface SuggestModalState {
        txnId: string;
        matches: SuggestMatchRow[];
    }
    const [suggestModalState, setSuggestModalState] = useState<SuggestModalState | null>(null);
    const [isLoadingMatches, setIsLoadingMatches] = useState(false);

    // Add transaction modal state
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [addForm, setAddForm] = useState<{
        bankAccountId: string;
        transactionDate: string;
        type: BankTransactionType;
        amount: string;
        remarks: string;
    }>({
        bankAccountId: "",
        transactionDate: new Date().toISOString().slice(0, 10),
        type: "DEPOSIT",
        amount: "",
        remarks: "",
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // CSV import modal state
    const [importStep, setImportStep] = useState<"closed" | "upload" | "preview" | "done">("closed");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importBankAccountId, setImportBankAccountId] = useState<string>("");
    const [previewRows, setPreviewRows] = useState<BankTransactionPreviewRow[]>([]);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    const fetchBankAccounts = async () => {
        try {
            const response = await axios.get(Constants.GET_BANK_ACCOUNTS_URL, {
                params: { limit: 100, page: 1 },
                headers: { Authorization: `Bearer ${token}` },
            });
            const list = (response.data?.data?.bankDetails ?? []) as BankAccountOption[];
            setBankAccounts(list);
        } catch (err) {
            console.error("fetchBankAccounts error:", err);
        }
    };

    const fetchRows = async () => {
        try {
            setIsLoading(true);
            const params: Record<string, string | number> = { page, limit };
            if (bankAccountFilter) params.bankAccountId = bankAccountFilter;
            if (typeFilter !== "all") params.type = typeFilter;
            if (reconciledFilter !== "all") params.isReconciled = reconciledFilter;
            const response = await axios.get(Constants.GET_BANK_TRANSACTIONS_URL, {
                params,
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = response.data?.data;
            setRows(data?.bankTransactions ?? []);
            setPagination(
                data?.pagination ?? { total: 0, page: 1, limit: 10, totalPages: 1 },
            );
        } catch (err) {
            console.error("fetchRows error:", err);
            toast.error("Failed to fetch bank transactions.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBankAccounts();
    }, [token]);

    useEffect(() => {
        fetchRows();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, limit, bankAccountFilter, typeFilter, reconciledFilter]);

    const handleSuggestMatches = async (txnId: string) => {
        try {
            setIsLoadingMatches(true);
            const res = await axios.get(
                `${Constants.SUGGEST_BANK_TX_MATCHES_URL}/${txnId}/suggest-matches`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const matches = (res.data?.data?.matches ?? []) as SuggestMatchRow[];
            setSuggestModalState({ txnId, matches });
        } catch (err) {
            console.error("suggest matches error:", err);
            const msg =
                axios.isAxiosError(err) && err.response?.data?.message
                    ? err.response.data.message
                    : "Failed to load matches";
            toast.error(msg);
        } finally {
            setIsLoadingMatches(false);
        }
    };

    const handleLink = async (
        txnId: string,
        candidate: { kind: 'INVOICE_PAYMENT' | 'SUPPLIER_PAYMENT'; candidateId: string },
    ) => {
        try {
            await axios.post(
                `${Constants.LINK_BANK_TX_URL}/${txnId}/link`,
                { relatedType: candidate.kind, relatedId: candidate.candidateId },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success("Linked + reconciled");
            setSuggestModalState(null);
            fetchRows();
        } catch (err) {
            console.error("link error:", err);
            toast.error("Failed to link");
        }
    };

    const handleUnlink = async (txnId: string) => {
        try {
            await axios.post(
                `${Constants.UNLINK_BANK_TX_URL}/${txnId}/unlink`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success("Unlinked");
            fetchRows();
        } catch (err) {
            console.error("unlink error:", err);
            toast.error("Failed to unlink");
        }
    };

    const handleConfirmDelete = async () => {
        if (!deleteItem) return;
        try {
            setIsDeleting(true);
            await axios.delete(
                `${Constants.DELETE_BANK_TRANSACTION_URL}/${deleteItem.id}`,
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success("Bank transaction deleted.");
            setDeleteModalOpen(false);
            setDeleteItem(null);
            fetchRows();
        } catch (err) {
            console.error("delete error:", err);
            toast.error("Failed to delete bank transaction.");
        } finally {
            setIsDeleting(false);
        }
    };

    const resetAddForm = () => {
        setAddForm({
            bankAccountId: "",
            transactionDate: new Date().toISOString().slice(0, 10),
            type: "DEPOSIT",
            amount: "",
            remarks: "",
        });
    };

    const submitAdd = async () => {
        if (!addForm.bankAccountId || !addForm.amount || Number(addForm.amount) <= 0) {
            toast.error("Bank account and a positive amount are required.");
            return;
        }
        try {
            setIsSubmitting(true);
            await axios.post(
                Constants.CREATE_BANK_TRANSACTION_URL,
                {
                    bankAccountId: addForm.bankAccountId,
                    transactionDate: addForm.transactionDate,
                    type: addForm.type,
                    amount: Number(addForm.amount),
                    remarks: addForm.remarks,
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success("Bank transaction created.");
            setIsAddOpen(false);
            resetAddForm();
            fetchRows();
        } catch (err) {
            console.error("create error:", err);
            toast.error("Failed to create bank transaction.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const submitImportUpload = async () => {
        if (!importBankAccountId || !importFile) {
            toast.error("Bank account and CSV file are required.");
            return;
        }
        try {
            setIsPreviewing(true);
            const formData = new FormData();
            formData.append("file", importFile);
            const response = await axios.post(
                Constants.IMPORT_BANK_TRANSACTIONS_URL,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                },
            );
            const preview = (response.data?.data?.previewRows ?? []) as BankTransactionPreviewRow[];
            setPreviewRows(preview);
            setImportStep("preview");
        } catch (err) {
            console.error("import preview error:", err);
            const msg =
                axios.isAxiosError(err) && err.response?.data?.message
                    ? err.response.data.message
                    : "Failed to parse CSV.";
            toast.error(msg);
        } finally {
            setIsPreviewing(false);
        }
    };

    const submitImportConfirm = async () => {
        const validRows = previewRows.filter((r) => !r.error);
        if (!importBankAccountId || validRows.length === 0) {
            toast.error("No valid rows to import.");
            return;
        }
        try {
            setIsConfirming(true);
            await axios.post(
                Constants.CONFIRM_IMPORT_BANK_TRANSACTIONS_URL,
                {
                    bankAccountId: importBankAccountId,
                    rows: validRows.map((r) => ({
                        date: r.date,
                        description: r.description,
                        amount: r.amount,
                        type: r.type,
                    })),
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success(`${validRows.length} bank transactions imported.`);
            setImportStep("done");
            setImportFile(null);
            setImportBankAccountId("");
            setPreviewRows([]);
            fetchRows();
            // Snap modal closed shortly after.
            setTimeout(() => setImportStep("closed"), 600);
        } catch (err) {
            console.error("import confirm error:", err);
            toast.error("Failed to import bank transactions.");
        } finally {
            setIsConfirming(false);
        }
    };

    const tableHeaders = [
        "#",
        "Date",
        "Bank",
        "Type",
        "Amount",
        "Balance After",
        "Reference",
        "Reconciled",
        "Actions",
    ];

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    const validCount = previewRows.filter((r) => !r.error).length;
    const invalidCount = previewRows.length - validCount;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Bank Transactions</h1>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setImportStep("upload")}
                        className="bg-white border border-purple-600 text-purple-600 hover:bg-purple-50 px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                    >
                        <Upload size={14} /> Import CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsAddOpen(true)}
                        className="bg-purple-600 hover:bg-purple-600 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                    >
                        <CirclePlusIcon size={14} /> Add Transaction
                    </button>
                </div>
            </div>

            {/* Bank account dropdown + page-size */}
            <div className="flex justify-between items-center flex-wrap gap-2">
                <select
                    value={bankAccountFilter}
                    onChange={(e) => {
                        setBankAccountFilter(e.target.value);
                        setPage(1);
                    }}
                    className="border border-gray-300 rounded-md px-3 py-2 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent w-full md:w-96"
                >
                    <option value="">All bank accounts</option>
                    {bankAccounts.map((b) => (
                        <option key={b.id} value={b.id}>
                            [{b.accountNumber}] {b.accountHoldername ?? ""} - {b.bankName}
                        </option>
                    ))}
                </select>
                <select
                    value={limit}
                    onChange={(e) => {
                        setLimit(Number(e.target.value));
                        setPage(1);
                    }}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    {[10, 25, 50].map((n) => (
                        <option key={n} value={n}>
                            {n} / page
                        </option>
                    ))}
                </select>
            </div>

            {/* Type filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
                {TYPE_PILLS.map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => {
                            setTypeFilter(opt);
                            setPage(1);
                        }}
                        className={
                            "px-3 py-1 text-sm rounded-full border cursor-pointer " +
                            (typeFilter === opt
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50")
                        }
                    >
                        {opt === "all" ? "All" : typeLabel[opt] ?? opt}
                    </button>
                ))}
            </div>

            {/* Reconciled filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
                {(["all", "true", "false"] as const).map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => {
                            setReconciledFilter(opt);
                            setPage(1);
                        }}
                        className={
                            "px-3 py-1 text-sm rounded-full border cursor-pointer " +
                            (reconciledFilter === opt
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50")
                        }
                    >
                        {opt === "all"
                            ? "Any status"
                            : opt === "true"
                              ? "Reconciled"
                              : "Unreconciled"}
                    </button>
                ))}
            </div>

            {/* Table */}
            <Table headers={tableHeaders}>
                {!isLoading &&
                    rows.length > 0 &&
                    rows.map((tx, index) => (
                        <TableRow
                            key={tx.id}
                            index={(page - 1) * limit + index + 1}
                            row={tx}
                            columns={[
                                formatDate(tx.transactionDate),
                                tx.bankAccount
                                    ? `${tx.bankAccount.bankName} (${tx.bankAccount.accountNumber})`
                                    : "—",
                                <span
                                    className={
                                        "inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium " +
                                        typeBadgeClass(tx.type)
                                    }
                                >
                                    {typeLabel[tx.type] ?? tx.type}
                                </span>,
                                Number(tx.amount).toFixed(2),
                                Number(tx.balanceAfter).toFixed(2),
                                tx.referenceNo || "—",
                                <span
                                    className={
                                        "inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium " +
                                        (tx.isReconciled
                                            ? "bg-green-100 text-green-700"
                                            : "bg-gray-100 text-gray-700")
                                    }
                                >
                                    {tx.isReconciled ? "Reconciled" : "Unreconciled"}
                                </span>,
                            ]}
                            actions={[
                                ...(!tx.isReconciled
                                    ? [
                                          {
                                              label: "Match",
                                              icon: <LinkIcon size={14} />,
                                              onClick: (item: BankTransactionRow) => {
                                                  handleSuggestMatches(item.id);
                                              },
                                          },
                                      ]
                                    : [
                                          {
                                              label: "Unlink",
                                              icon: <Unlink2Icon size={14} />,
                                              onClick: (item: BankTransactionRow) => {
                                                  handleUnlink(item.id);
                                              },
                                          },
                                      ]),
                                {
                                    label: "Delete",
                                    icon: <Trash2Icon size={14} />,
                                    onClick: (item: BankTransactionRow) => {
                                        setDeleteItem(item);
                                        setDeleteModalOpen(true);
                                    },
                                },
                            ]}
                        />
                    ))}
                {!isLoading && rows.length === 0 && (
                    <NoRecords colSpan={tableHeaders.length} message="No bank transactions found" />
                )}
                {isLoading && (
                    <tr key="table-loader">
                        <td
                            className="text-center py-1 text-gray-950 font-semibold"
                            colSpan={tableHeaders.length}
                        >
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>

            <PaginationWrapper
                count={pagination.totalPages}
                page={page}
                from={from}
                to={to}
                total={pagination.total}
                onChange={(_, newPage) => setPage(newPage)}
                paginationVariant="outlined"
                paginationShape="rounded"
            />

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                title="Delete Bank Transaction"
                message="Are you sure you want to delete this bank transaction? This action cannot be undone."
            />

            {/* Add Transaction modal */}
            {isAddOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-md shadow-lg w-full max-w-lg p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-gray-800">Add Bank Transaction</h2>
                            <button
                                type="button"
                                aria-label="close"
                                onClick={() => {
                                    setIsAddOpen(false);
                                    resetAddForm();
                                }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Bank account</label>
                                <select
                                    value={addForm.bankAccountId}
                                    onChange={(e) =>
                                        setAddForm({ ...addForm, bankAccountId: e.target.value })
                                    }
                                    className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-800"
                                >
                                    <option value="">Select bank account</option>
                                    {bankAccounts.map((b) => (
                                        <option key={b.id} value={b.id}>
                                            [{b.accountNumber}] {b.bankName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-gray-700 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={addForm.transactionDate}
                                        onChange={(e) =>
                                            setAddForm({ ...addForm, transactionDate: e.target.value })
                                        }
                                        className="border border-gray-300 rounded-md px-3 py-2 w-full text-gray-800"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-700 mb-1">Type</label>
                                    <select
                                        value={addForm.type}
                                        onChange={(e) =>
                                            setAddForm({
                                                ...addForm,
                                                type: e.target.value as BankTransactionType,
                                            })
                                        }
                                        className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-800"
                                    >
                                        {(Object.keys(typeLabel) as BankTransactionType[]).map((t) => (
                                            <option key={t} value={t}>
                                                {typeLabel[t]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Amount</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={addForm.amount}
                                    onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                                    className="border border-gray-300 rounded-md px-3 py-2 w-full text-gray-800"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Remarks</label>
                                <input
                                    type="text"
                                    value={addForm.remarks}
                                    onChange={(e) =>
                                        setAddForm({ ...addForm, remarks: e.target.value })
                                    }
                                    className="border border-gray-300 rounded-md px-3 py-2 w-full text-gray-800"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsAddOpen(false);
                                    resetAddForm();
                                }}
                                className="px-3 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={submitAdd}
                                className="px-3 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isSubmitting ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CSV Import modal */}
            {importStep !== "closed" && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-md shadow-lg w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-gray-800">
                                {importStep === "upload" && "Import Bank Transactions (CSV)"}
                                {importStep === "preview" && "Review Imported Rows"}
                                {importStep === "done" && "Import Complete"}
                            </h2>
                            <button
                                type="button"
                                aria-label="close"
                                onClick={() => {
                                    setImportStep("closed");
                                    setImportFile(null);
                                    setImportBankAccountId("");
                                    setPreviewRows([]);
                                }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {importStep === "upload" && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm text-gray-700 mb-1">Bank account</label>
                                    <select
                                        value={importBankAccountId}
                                        onChange={(e) => setImportBankAccountId(e.target.value)}
                                        className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-800"
                                    >
                                        <option value="">Select bank account</option>
                                        {bankAccounts.map((b) => (
                                            <option key={b.id} value={b.id}>
                                                [{b.accountNumber}] {b.bankName}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-700 mb-1">CSV file</label>
                                    <input
                                        type="file"
                                        accept=".csv,text/csv"
                                        onChange={(e) =>
                                            setImportFile(e.target.files?.[0] ?? null)
                                        }
                                        className="border border-gray-300 rounded-md px-3 py-2 w-full bg-white text-gray-800"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Expected columns: date, description, amount, type
                                        (DEPOSIT/WITHDRAWAL/DEBIT/CREDIT).
                                    </p>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setImportStep("closed")}
                                        className="px-3 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isPreviewing || !importFile || !importBankAccountId}
                                        onClick={submitImportUpload}
                                        className="px-3 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                                    >
                                        {isPreviewing ? "Parsing..." : "Preview"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {importStep === "preview" && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-sm">
                                    <span className="inline-flex items-center px-2 py-1 rounded-sm bg-green-100 text-green-700">
                                        {validCount} valid
                                    </span>
                                    <span className="inline-flex items-center px-2 py-1 rounded-sm bg-red-100 text-red-700">
                                        {invalidCount} invalid (skipped)
                                    </span>
                                </div>
                                <div className="border border-gray-200 rounded-md overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50 text-gray-700">
                                            <tr>
                                                <th className="px-3 py-2 text-left">#</th>
                                                <th className="px-3 py-2 text-left">Date</th>
                                                <th className="px-3 py-2 text-left">Description</th>
                                                <th className="px-3 py-2 text-right">Amount</th>
                                                <th className="px-3 py-2 text-left">Type</th>
                                                <th className="px-3 py-2 text-left">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewRows.map((r, i) => (
                                                <tr
                                                    key={i}
                                                    className={r.error ? "bg-red-50" : "bg-green-50"}
                                                >
                                                    <td className="px-3 py-2 text-gray-700">{i + 1}</td>
                                                    <td className="px-3 py-2 text-gray-700">{formatDate(r.date)}</td>
                                                    <td className="px-3 py-2 text-gray-700">
                                                        {r.description}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-700">
                                                        {Number(r.amount).toFixed(2)}
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-700">{r.type}</td>
                                                    <td className="px-3 py-2 text-gray-700">
                                                        {r.error ? (
                                                            <span className="text-red-700">{r.error}</span>
                                                        ) : (
                                                            <span className="text-green-700">OK</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setImportStep("upload")}
                                        className="px-3 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isConfirming || validCount === 0}
                                        onClick={submitImportConfirm}
                                        className="px-3 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                                    >
                                        {isConfirming ? "Importing..." : `Confirm Import (${validCount})`}
                                    </button>
                                </div>
                            </div>
                        )}

                        {importStep === "done" && (
                            <div className="text-center py-6 text-gray-700">
                                Import complete.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Suggest-matches modal (slice E.2) */}
            {(suggestModalState || isLoadingMatches) && (
                <div
                    className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center"
                    onClick={() => {
                        if (!isLoadingMatches) setSuggestModalState(null);
                    }}
                >
                    <div
                        className="bg-white rounded-md p-4 max-w-3xl w-full max-h-[80vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-medium text-gray-800">Suggested Matches</h3>
                            <button
                                type="button"
                                aria-label="close"
                                onClick={() => setSuggestModalState(null)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {isLoadingMatches && (
                            <div className="py-6 text-center text-gray-500">
                                <LoaderSpinner />
                            </div>
                        )}
                        {!isLoadingMatches && suggestModalState && (
                            <>
                                {suggestModalState.matches.length === 0 ? (
                                    <p className="text-sm text-gray-500 py-4">No matches found.</p>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left border-b text-gray-700">
                                                <th className="py-2">Score</th>
                                                <th>Kind</th>
                                                <th>Reference</th>
                                                <th>Amount</th>
                                                <th>Date</th>
                                                <th>Reasons</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {suggestModalState.matches.map((m) => (
                                                <tr key={m.candidateId} className="border-b">
                                                    <td className="py-2 font-medium text-gray-800">
                                                        {m.score}
                                                    </td>
                                                    <td className="text-gray-700">
                                                        {m.kind === "INVOICE_PAYMENT"
                                                            ? "Invoice"
                                                            : "Supplier"}
                                                    </td>
                                                    <td className="text-gray-700">{m.parentLabel}</td>
                                                    <td className="text-gray-700">
                                                        {Number(m.amount).toFixed(2)}
                                                    </td>
                                                    <td className="text-gray-700">
                                                        {formatDate(m.date)}
                                                    </td>
                                                    <td className="text-xs text-gray-500">
                                                        {m.reasons.join(", ")}
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleLink(suggestModalState.txnId, {
                                                                    kind: m.kind,
                                                                    candidateId: m.candidateId,
                                                                })
                                                            }
                                                            className="px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700"
                                                        >
                                                            Link
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                                <div className="text-right mt-3">
                                    <button
                                        type="button"
                                        onClick={() => setSuggestModalState(null)}
                                        className="px-3 py-1 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                                    >
                                        Close
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default BankTransactionList;
