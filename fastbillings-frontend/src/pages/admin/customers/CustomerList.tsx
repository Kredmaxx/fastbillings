import { CirclePlusIcon, Edit, FileText, Trash2Icon, Upload, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Table from "@components/admin/Table";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import TableRow from "@components/admin/TableRow";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import { hasPermission } from "@utils/hasPermission";
import type { PermissionAction } from "@models/permissions";
import useDateFormatter from "@hooks/useDateFormatter";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import ProfileCard from "@components/admin/ProfileImage";
import { useCurrencyFormatter } from "@hooks/useCurrencyFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import NoRecords from "@components/admin/NoRecords";

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

interface CustomerList {
    id: number;
    name: string;
    email: string;
    phone: string;
    totalInvoiceCount: number;
    balanceAmount: number;
    createdAt: string;
    currencyCode?: string | null;
}

interface CustomerImportPreviewRow {
    rowIndex: number;
    name: string;
    email: string;
    phone: string;
    website?: string;
    notes?: string;
    error?: string;
}

const CustomerList: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [customers, setCustomers] = useState<CustomerList[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [isDeleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
    const [deleteItem, setDeleteItem] = useState<CustomerList | null>(null);
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const navigate = useNavigate();
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const { formatDate } = useDateFormatter();
    const { locale } = useCurrencyFormatter();
    const { defaultCurrencyCode, resolveCurrency } = useCurrencies();
    // Show each customer's balance in ITS OWN currency (not the global default).
    const formatBalance = (amount: number, code?: string | null) =>
        `${resolveCurrency(code).symbol}${Number(amount).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // CSV import (slice E.4)
    const [importStep, setImportStep] = useState<"closed" | "upload" | "preview" | "done">("closed");
    const [importFile, setImportFile] = useState<File | null>(null);
    const [previewRows, setPreviewRows] = useState<CustomerImportPreviewRow[]>([]);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);
    const [importResult, setImportResult] = useState<{ createdCount: number; skippedCount: number } | null>(null);

    const handleCreateClick = () => {
        navigate('/admin/customers/new');
    };

    const resetImportState = () => {
        setImportStep("closed");
        setImportFile(null);
        setPreviewRows([]);
        setImportResult(null);
    };

    const submitImportUpload = async () => {
        if (!importFile) {
            toast.error("CSV file is required.");
            return;
        }
        try {
            setIsPreviewing(true);
            const formData = new FormData();
            formData.append("file", importFile);
            const response = await axios.post(
                Constants.IMPORT_CUSTOMERS_URL,
                formData,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "multipart/form-data",
                    },
                },
            );
            const preview = (response.data?.data?.previewRows ?? []) as CustomerImportPreviewRow[];
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
        if (validRows.length === 0) {
            toast.error("No valid rows to import.");
            return;
        }
        try {
            setIsConfirming(true);
            const response = await axios.post(
                Constants.CONFIRM_IMPORT_CUSTOMERS_URL,
                {
                    rows: validRows.map((r) => ({
                        name: r.name,
                        email: r.email,
                        phone: r.phone,
                        website: r.website,
                        notes: r.notes,
                    })),
                },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            const data = response.data?.data ?? {};
            setImportResult({
                createdCount: data.createdCount ?? 0,
                skippedCount: data.skippedCount ?? 0,
            });
            toast.success(`Imported ${data.createdCount ?? 0} customers (${data.skippedCount ?? 0} skipped).`);
            setImportStep("done");
            fetchCustomers(search, limit, page);
        } catch (err) {
            console.error("import confirm error:", err);
            toast.error("Failed to import customers.");
        } finally {
            setIsConfirming(false);
        }
    };

    const validCount = previewRows.filter((r) => !r.error).length;
    const invalidCount = previewRows.length - validCount;

    const tableActions = [
        {
            label: 'Edit',
            icon: <Edit size={14} />,
            onClick: (item: CustomerList) => { handleEditClick(item) }
        },
        {
            label: 'View Statement',
            icon: <FileText size={14} />,
            onClick: (item: CustomerList) => { navigate(`/admin/customers/${item.id}/statement`) }
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: (item: CustomerList) => { handleDeleteClick(item) }
        }
    ];

    const tableHeaders = ['#', 'Customer', 'Phone', 'Currency', 'Balance', 'Total Invoice', 'Created On', 'Status', 'Actions'];
    const restrictedActions = ['edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        const actionLabel = action.label.toLowerCase() as PermissionAction;

        if (!restrictedActions.includes(actionLabel)) {
            return true;
        }

        return hasPermission(permissions, 'customers', actionLabel);
    });

    if (allowedActions.length === 0) {
        tableHeaders.pop();
    }
    useEffect(() => {
        fetchCustomers(search, limit, page);
    }, [search, limit, page]);

    const fetchCustomers = async (search?: string, limit?: number, page?: number) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.GET_CUSTOMERS_FOR_LIST_URL, {
                params: { search, limit, page },
                headers: { 'Authorization': `Bearer ${token}` }
            });

            setCustomers(response.data.data.customers || []);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error("Error fetching customers:", error);
            toast.error("Failed to fetch customers.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditClick = (item: CustomerList) => {
        navigate(`/admin/customers/edit/${item.id}`);
    }
    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    const handleDeleteClick = async (item: CustomerList) => {
        setDeleteItem(item);
        setDeleteModalOpen(true);
    }

    const handleConfirmDelete = async () => {
        if (deleteItem) {
            try {
                setIsDeleting(true);
                await axios.delete(`${Constants.DELETE_CUSTOMER_URL}/${deleteItem.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                toast.success("Customer deleted successfully.");
                fetchCustomers(search, limit, page);
                setDeleteModalOpen(false);
            } catch (error) {
                console.error("Error deleting customer:", error);
                toast.error("Failed to delete customer.");
            } finally {
                setIsDeleting(false);
            }
        }
    }
    // Calculate pagination display text
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 ">Customer</h1>
                <div className="flex items-center gap-2">
                    {hasPermission(permissions, 'customers', 'create') &&
                        <button
                            type="button"
                            onClick={() => setImportStep("upload")}
                            className="bg-white border border-purple-600 text-purple-600 hover:bg-purple-50 px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                            <Upload size={14} /> Import CSV
                        </button>
                    }
                    {hasPermission(permissions, 'customers', 'create') &&
                        <button
                            onClick={() => { handleCreateClick(); }}
                            className="bg-purple-600 hover:bg-purple-600 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                            <CirclePlusIcon size={14} /> New Customer
                        </button>
                    }
                </div>
            </div>
            {/* Search Input & PageLength */}
            <div className="flex justify-between items-center">
                <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64  text-gray-800  focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
                <select
                    value={limit}
                    onChange={(e) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-800  focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-800 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>
            {/* Table */}
            <Table headers={tableHeaders}>
                {!isLoading && customers && customers.map((customer: any, index: number) => (
                    <TableRow
                        key={customer.id}
                        index={index + 1}
                        row={customer}
                        columns={[
                            <ProfileCard
                                imageUrl={customer.imageUrl}
                                name={customer.name}
                                email={customer.email}
                            />,
                            customer.phone,
                            customer.currencyCode || defaultCurrencyCode || '—',
                            formatBalance(customer.balanceAmount || 0, customer.currencyCode),
                            customer.totalInvoiceCount || 0,
                            formatDate(customer.createdAt, systemSettings?.dateFormat.format || 'd-m-Y'),
                            customer.status
                        ]}
                        actions={allowedActions.length > 0 ? allowedActions : undefined}
                        onRowClick={(item) => navigate(`/admin/customers/${item.id}/statement`)}
                    >

                    </TableRow>
                ))}
                {!isLoading && !customers.length &&
                    <NoRecords colSpan={9} message="No customers found" />
                }

                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-1 text-gray-950  font-semibold" colSpan={9}>
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>

            {/* Pagination Component */}
            <PaginationWrapper
                count={pagination.totalPages}
                page={page}
                from={from}
                to={to}
                total={pagination.total}
                onChange={(_, newPage) => handlePageChange(newPage)}
                paginationVariant="outlined"
                paginationShape="rounded"
            />

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                title="Delete Customer"
                message="Are you sure you want to delete this customer? This action cannot be undone."
            />

            {/* CSV Import modal (slice E.4) */}
            {importStep !== "closed" && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-md shadow-lg w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-gray-800">
                                {importStep === "upload" && "Import Customers (CSV)"}
                                {importStep === "preview" && "Review Customer Rows"}
                                {importStep === "done" && "Import Complete"}
                            </h2>
                            <button
                                type="button"
                                aria-label="close"
                                onClick={resetImportState}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {importStep === "upload" && (
                            <div className="space-y-3">
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
                                        Expected columns: name, email, phone (optional: website, notes).
                                    </p>
                                </div>
                                <div className="flex justify-end gap-2 pt-2">
                                    <button
                                        type="button"
                                        onClick={resetImportState}
                                        className="px-3 py-1 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isPreviewing || !importFile}
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
                                                <th className="px-3 py-2 text-left">Name</th>
                                                <th className="px-3 py-2 text-left">Email</th>
                                                <th className="px-3 py-2 text-left">Phone</th>
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
                                                    <td className="px-3 py-2 text-gray-700">{r.name}</td>
                                                    <td className="px-3 py-2 text-gray-700">{r.email}</td>
                                                    <td className="px-3 py-2 text-gray-700">{r.phone}</td>
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
                            <div className="space-y-3">
                                <div className="text-center py-4 text-gray-700">
                                    <p className="text-base">Import complete.</p>
                                    {importResult && (
                                        <div className="mt-3 flex justify-center gap-3 text-sm">
                                            <span className="inline-flex items-center px-2 py-1 rounded-sm bg-green-100 text-green-700">
                                                {importResult.createdCount} created
                                            </span>
                                            <span className="inline-flex items-center px-2 py-1 rounded-sm bg-gray-100 text-gray-700">
                                                {importResult.skippedCount} skipped
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={resetImportState}
                                        className="px-3 py-1 rounded-md bg-purple-600 text-white hover:bg-purple-700"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerList;