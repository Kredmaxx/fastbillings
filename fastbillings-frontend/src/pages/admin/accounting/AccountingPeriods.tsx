import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "sonner";
import { CirclePlusIcon, Edit, Trash2Icon, Lock, Unlock } from "lucide-react";

import type { RootState } from "@store/index";
import Constants from "@constants/api";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import NoRecords from "@components/admin/NoRecords";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import useDateFormatter from "@hooks/useDateFormatter";

interface AccountingPeriod {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    isLocked: boolean;
    isClosed?: boolean;
    lockedAt: string | null;
    lockedBy: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

interface FormState {
    name: string;
    startDate: string;
    endDate: string;
    notes: string;
}

const emptyForm: FormState = { name: "", startDate: "", endDate: "", notes: "" };

const AccountingPeriods: React.FC = () => {
    const { formatDate } = useDateFormatter();
    const { token } = useSelector((state: RootState) => state.auth);
    const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [deleteItem, setDeleteItem] = useState<AccountingPeriod | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchPeriods = async () => {
        try {
            setIsLoading(true);
            const resp = await axios.get(Constants.GET_ACCOUNTING_PERIODS_URL, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setPeriods(resp.data?.data?.accountingPeriods ?? []);
        } catch (err) {
            console.error("Failed to fetch periods:", err);
            toast.error("Failed to fetch accounting periods");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchPeriods();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openCreate = () => {
        setForm(emptyForm);
        setEditingId(null);
        setShowModal(true);
    };

    const openEdit = (row: AccountingPeriod) => {
        setForm({
            name: row.name,
            startDate: row.startDate ? row.startDate.slice(0, 10) : "",
            endDate: row.endDate ? row.endDate.slice(0, 10) : "",
            notes: row.notes ?? "",
        });
        setEditingId(row.id);
        setShowModal(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name || !form.startDate || !form.endDate) {
            toast.error("Name, start date, and end date are required");
            return;
        }
        try {
            setSubmitting(true);
            const payload = {
                name: form.name,
                startDate: form.startDate,
                endDate: form.endDate,
                notes: form.notes || null,
            };
            if (editingId) {
                await axios.put(
                    `${Constants.UPDATE_ACCOUNTING_PERIOD_URL}/${editingId}`,
                    payload,
                    { headers: { Authorization: `Bearer ${token}` } },
                );
                toast.success("Period updated");
            } else {
                await axios.post(Constants.CREATE_ACCOUNTING_PERIOD_URL, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success("Period created");
            }
            setShowModal(false);
            await fetchPeriods();
        } catch (err) {
            const msg = axios.isAxiosError(err)
                ? (err.response?.data as { message?: string } | undefined)?.message
                : null;
            console.error("Save failed:", err);
            toast.error(msg ?? "Failed to save period");
        } finally {
            setSubmitting(false);
        }
    };

    const handleLock = async (row: AccountingPeriod) => {
        try {
            await axios.post(
                `${Constants.LOCK_ACCOUNTING_PERIOD_URL}/${row.id}/lock`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success("Period locked");
            await fetchPeriods();
        } catch (err) {
            const msg = axios.isAxiosError(err)
                ? (err.response?.data as { message?: string } | undefined)?.message
                : null;
            console.error("Lock failed:", err);
            toast.error(msg ?? "Failed to lock period");
        }
    };

    const handleUnlock = async (row: AccountingPeriod) => {
        try {
            await axios.post(
                `${Constants.UNLOCK_ACCOUNTING_PERIOD_URL}/${row.id}/unlock`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success("Period unlocked");
            await fetchPeriods();
        } catch (err) {
            const msg = axios.isAxiosError(err)
                ? (err.response?.data as { message?: string } | undefined)?.message
                : null;
            console.error("Unlock failed:", err);
            toast.error(msg ?? "Failed to unlock period");
        }
    };

    const handleCloseYear = async (row: AccountingPeriod) => {
        if (
            !window.confirm(
                `Close "${row.name}" to retained earnings? This posts a closing journal and locks the period.`,
            )
        ) {
            return;
        }
        try {
            await axios.post(
                `${Constants.CLOSE_YEAR_ACCOUNTING_PERIOD_URL}/${row.id}/close-year`,
                {},
                { headers: { Authorization: `Bearer ${token}` } },
            );
            toast.success("Period closed to retained earnings");
            await fetchPeriods();
        } catch (err) {
            const msg = axios.isAxiosError(err)
                ? (err.response?.data as { message?: string } | undefined)?.message
                : null;
            console.error("Close year failed:", err);
            toast.error(msg ?? "Failed to close period");
        }
    };

    const handleDelete = async () => {
        if (!deleteItem) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_ACCOUNTING_PERIOD_URL}/${deleteItem.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success("Period deleted");
            setDeleteItem(null);
            await fetchPeriods();
        } catch (err) {
            const msg = axios.isAxiosError(err)
                ? (err.response?.data as { message?: string } | undefined)?.message
                : null;
            console.error("Delete failed:", err);
            toast.error(msg ?? "Failed to delete period");
        } finally {
            setIsDeleting(false);
        }
    };

    const buildActions = (row: AccountingPeriod) => {
        const actions = [];
        if (!row.isLocked) {
            actions.push({
                label: "Edit",
                icon: <Edit size={14} />,
                onClick: (r: AccountingPeriod) => openEdit(r),
            });
        }
        if (row.isLocked) {
            if (!row.isClosed) {
                actions.push({
                    label: "Unlock",
                    icon: <Unlock size={14} />,
                    onClick: (r: AccountingPeriod) => handleUnlock(r),
                });
            }
        } else {
            actions.push({
                label: "Lock",
                icon: <Lock size={14} />,
                onClick: (r: AccountingPeriod) => handleLock(r),
            });
            actions.push({
                label: "Close year",
                icon: <Lock size={14} />,
                onClick: (r: AccountingPeriod) => handleCloseYear(r),
            });
        }
        if (!row.isLocked && !row.isClosed) {
            actions.push({
                label: "Delete",
                icon: <Trash2Icon size={14} />,
                onClick: (r: AccountingPeriod) => setDeleteItem(r),
            });
        }
        return actions;
    };

    const headers = ["#", "Name", "Start", "End", "Status", "Locked At", "Actions"];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Accounting Periods</h1>
                <button
                    type="button"
                    onClick={openCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
                >
                    <CirclePlusIcon size={16} /> Add Period
                </button>
            </div>

            <Table headers={headers}>
                {!isLoading && periods.map((row, idx) => (
                    <TableRow
                        key={row.id}
                        index={idx + 1}
                        row={row}
                        columns={[
                            <span className="font-medium">{row.name}</span>,
                            formatDate(row.startDate),
                            formatDate(row.endDate),
                            row.isClosed ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium bg-slate-200 text-slate-800">
                                    <Lock size={12} /> Closed
                                </span>
                            ) : row.isLocked ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium bg-red-100 text-red-700">
                                    <Lock size={12} /> Locked
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium bg-green-100 text-green-700">
                                    Active
                                </span>
                            ),
                            row.lockedAt ? formatDate(row.lockedAt) : "—",
                        ]}
                        actions={buildActions(row)}
                        onRowClick={(item) => openEdit(item)}
                    />
                ))}
                {!isLoading && periods.length === 0 && (
                    <NoRecords colSpan={7} message="No accounting periods. Click 'Add Period' to create one." />
                )}
                {isLoading && (
                    <tr>
                        <td className="text-center py-2" colSpan={7}><LoaderSpinner /></td>
                    </tr>
                )}
            </Table>

            {showModal && (
                <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={() => setShowModal(false)}>
                    <div className="bg-white rounded-md p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold mb-4">{editingId ? "Edit Period" : "Add Period"}</h3>
                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Name *</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                    placeholder="e.g. April 2026"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm text-gray-700 mb-1">Start Date *</label>
                                    <input
                                        type="date"
                                        value={form.startDate}
                                        onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-700 mb-1">End Date *</label>
                                    <input
                                        type="date"
                                        value={form.endDate}
                                        onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-700 mb-1">Notes</label>
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                title="Delete Accounting Period"
                message={`Are you sure you want to delete period "${deleteItem?.name}"?`}
            />
        </div>
    );
};

export default AccountingPeriods;
