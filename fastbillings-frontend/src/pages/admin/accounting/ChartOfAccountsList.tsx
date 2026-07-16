import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "sonner";
import { CirclePlusIcon, Edit, Trash2Icon } from "lucide-react";

import type { RootState } from "@store/index";
import Constants from "@constants/api";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import NoRecords from "@components/admin/NoRecords";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import type { Account, AccountType } from "@models/accounting";

const ACCOUNT_TYPES: AccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

const typeBadgeClass = (t: AccountType): string => {
    switch (t) {
        case "ASSET": return "bg-blue-100 text-blue-700";
        case "LIABILITY": return "bg-red-100 text-red-700";
        case "EQUITY": return "bg-purple-100 text-purple-700";
        case "INCOME": return "bg-green-100 text-green-700";
        case "EXPENSE": return "bg-yellow-100 text-yellow-700";
        default: return "bg-gray-100 text-gray-700";
    }
};

interface FormState {
    code: string;
    name: string;
    accountType: AccountType;
    parentId: string;
    description: string;
}

const emptyForm: FormState = { code: "", name: "", accountType: "ASSET", parentId: "", description: "" };

const ChartOfAccountsList: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [deleteItem, setDeleteItem] = useState<Account | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [filterType, setFilterType] = useState<string>("");

    const fetchAccounts = async () => {
        try {
            setIsLoading(true);
            const params: Record<string, string> = {};
            if (filterType) params.accountType = filterType;
            const resp = await axios.get(Constants.GET_ACCOUNTS_URL, {
                params,
                headers: { Authorization: `Bearer ${token}` },
            });
            setAccounts(resp.data?.data?.accounts ?? []);
        } catch (err) {
            console.error("Failed to fetch accounts:", err);
            toast.error("Failed to fetch accounts");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterType]);

    const handleSeed = async () => {
        if (isSeeding) return;
        try {
            setIsSeeding(true);
            const resp = await axios.post(
                Constants.SEED_DEFAULT_ACCOUNTS_URL,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success(resp.data?.message ?? "Seeded default chart");
            await fetchAccounts();
        } catch (err) {
            console.error("Seed failed:", err);
            toast.error("Failed to seed default chart");
        } finally {
            setIsSeeding(false);
        }
    };

    const openCreate = () => {
        setForm(emptyForm);
        setEditingId(null);
        setShowModal(true);
    };

    const openEdit = (row: Account) => {
        setForm({
            code: row.code,
            name: row.name,
            accountType: row.accountType,
            parentId: row.parentId ?? "",
            description: row.description ?? "",
        });
        setEditingId(row.id);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.code || !form.name || !form.accountType) {
            toast.error("Code, name, and type are required");
            return;
        }
        try {
            setSubmitting(true);
            const payload = {
                code: form.code,
                name: form.name,
                accountType: form.accountType,
                parentId: form.parentId || null,
                description: form.description || null,
            };
            if (editingId) {
                await axios.put(
                    `${Constants.UPDATE_ACCOUNT_URL}/${editingId}`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                toast.success("Account updated");
            } else {
                await axios.post(Constants.CREATE_ACCOUNT_URL, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success("Account created");
            }
            setShowModal(false);
            await fetchAccounts();
        } catch (err) {
            const msg = axios.isAxiosError(err)
                ? (err.response?.data as { message?: string } | undefined)?.message
                : null;
            console.error("Save failed:", err);
            toast.error(msg ?? "Failed to save account");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_ACCOUNT_URL}/${deleteItem.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success("Account deleted");
            setDeleteItem(null);
            await fetchAccounts();
        } catch (err) {
            console.error("Delete failed:", err);
            toast.error("Failed to delete account");
        } finally {
            setIsDeleting(false);
        }
    };

    const tableActions = [
        { label: "Edit", icon: <Edit size={14} />, onClick: (row: Account) => openEdit(row) },
        { label: "Delete", icon: <Trash2Icon size={14} />, onClick: (row: Account) => setDeleteItem(row) },
    ];

    const headers = ["#", "Code", "Name", "Type", "Parent", "Actions"];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Chart of Accounts</h1>
                <div className="flex gap-2">
                    {accounts.length === 0 && !isLoading && (
                        <button
                            type="button"
                            onClick={handleSeed}
                            disabled={isSeeding}
                            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                        >
                            {isSeeding ? "Seeding…" : "Seed Defaults"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
                    >
                        <CirclePlusIcon size={16} /> Add Account
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <label className="text-sm text-gray-700">Filter:</label>
                <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white text-gray-800 text-sm"
                >
                    <option value="">All types</option>
                    {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
            </div>

            <Table headers={headers}>
                {!isLoading && accounts.map((row, idx) => (
                    <TableRow
                        key={row.id}
                        index={idx + 1}
                        row={row}
                        columns={[
                            <span className="font-mono">{row.code}</span>,
                            row.name,
                            <span className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ${typeBadgeClass(row.accountType)}`}>
                                {row.accountType}
                            </span>,
                            row.parent ? `${row.parent.code} – ${row.parent.name}` : "—",
                        ]}
                        actions={tableActions}
                        onRowClick={(item) => openEdit(item)}
                    />
                ))}
                {!isLoading && accounts.length === 0 && (
                    <NoRecords colSpan={6} message="No accounts found. Click 'Seed Defaults' to install the standard chart." />
                )}
                {isLoading && (
                    <tr>
                        <td className="text-center py-2" colSpan={6}><LoaderSpinner /></td>
                    </tr>
                )}
            </Table>

            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={() => setShowModal(false)}>
                    <div className="bg-white rounded-md p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4">{editingId ? "Edit Account" : "Add Account"}</h3>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Code *</label>
                                <input
                                    type="text"
                                    value={form.code}
                                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    required
                                    disabled={!!editingId}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Type *</label>
                                <select
                                    value={form.accountType}
                                    onChange={(e) => setForm({ ...form, accountType: e.target.value as AccountType })}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    required
                                >
                                    {ACCOUNT_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Parent</label>
                                <select
                                    value={form.parentId}
                                    onChange={(e) => setForm({ ...form, parentId: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                >
                                    <option value="">— None —</option>
                                    {accounts
                                        .filter((a) => a.accountType === form.accountType && a.id !== editingId)
                                        .map((a) => (
                                            <option key={a.id} value={a.id}>{a.code} – {a.name}</option>
                                        ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Description</label>
                                <textarea
                                    value={form.description}
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    rows={2}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm border rounded-md">
                                    Cancel
                                </button>
                                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-60">
                                    {submitting ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <DeleteConfirmationModal
                isOpen={!!deleteItem}
                onClose={() => setDeleteItem(null)}
                onConfirm={handleDelete}
                isDeleting={isDeleting}
                title="Delete Account"
                message={`Are you sure you want to delete account ${deleteItem?.code} – ${deleteItem?.name}?`}
            />
        </div>
    );
};

export default ChartOfAccountsList;
