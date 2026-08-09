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

interface TcsRate {
  id: string;
  section: string;
  name: string;
  rate: number;
  threshold: number | null;
  onTaxInclusive: boolean;
  isActive: boolean;
}

interface FormState {
  section: string;
  name: string;
  rate: string;
  threshold: string;
  onTaxInclusive: boolean;
  isActive: boolean;
}

const emptyForm: FormState = {
  section: "206C(1H)",
  name: "TCS on sale of goods",
  rate: "0.1",
  threshold: "",
  onTaxInclusive: true,
  isActive: true,
};

const TcsRateList: React.FC = () => {
  const { token } = useSelector((state: RootState) => state.auth);
  const [rows, setRows] = useState<TcsRate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteItem, setDeleteItem] = useState<TcsRate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRows = async () => {
    try {
      setIsLoading(true);
      const resp = await axios.get(Constants.FETCH_TCS_RATES_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(resp.data?.data?.tcsRates ?? []);
    } catch {
      toast.error("Failed to fetch TCS rates");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (row: TcsRate) => {
    setForm({
      section: row.section,
      name: row.name,
      rate: String(row.rate),
      threshold: row.threshold != null ? String(row.threshold) : "",
      onTaxInclusive: row.onTaxInclusive,
      isActive: row.isActive,
    });
    setEditingId(row.id);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.section.trim() || !form.name.trim() || !Number.isFinite(Number(form.rate))) {
      toast.error("Section, name, and rate are required");
      return;
    }
    const payload = {
      section: form.section.trim(),
      name: form.name.trim(),
      rate: Number(form.rate),
      threshold: form.threshold === "" ? null : Number(form.threshold),
      onTaxInclusive: form.onTaxInclusive,
      isActive: form.isActive,
    };
    try {
      setSubmitting(true);
      if (editingId) {
        await axios.put(`${Constants.UPDATE_TCS_RATE_URL}/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("TCS rate updated");
      } else {
        await axios.post(Constants.CREATE_TCS_RATE_URL, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("TCS rate created");
      }
      setShowModal(false);
      fetchRows();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
      toast.error(msg || "Failed to save TCS rate");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      setIsDeleting(true);
      await axios.delete(`${Constants.DELETE_TCS_RATE_URL}/${deleteItem.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("TCS rate deleted");
      setDeleteItem(null);
      fetchRows();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
      toast.error(msg || "Failed to delete TCS rate");
    } finally {
      setIsDeleting(false);
    }
  };

  const headers = ["#", "Section", "Name", "Rate %", "Base", "Active", "Actions"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">TCS rates</h1>
          <p className="text-sm text-gray-500">India Tax Collected at Source sections for sales invoices.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
        >
          <CirclePlusIcon size={16} /> Add TCS rate
        </button>
      </div>

      <Table headers={headers}>
        {!isLoading &&
          rows.map((row, idx) => (
            <TableRow
              key={row.id}
              index={idx + 1}
              row={row}
              columns={[
                <span className="font-medium">{row.section}</span>,
                row.name,
                Number(row.rate).toFixed(4),
                row.onTaxInclusive ? "Tax-inclusive" : "Taxable only",
                row.isActive ? "Yes" : "No",
              ]}
              actions={[
                {
                  label: "Edit",
                  icon: <Edit size={14} />,
                  onClick: (r: TcsRate) => openEdit(r),
                },
                {
                  label: "Delete",
                  icon: <Trash2Icon size={14} />,
                  onClick: (r: TcsRate) => setDeleteItem(r),
                },
              ]}
            />
          ))}
        {!isLoading && rows.length === 0 && (
          <NoRecords colSpan={7} message="No TCS rates yet. Add 206C(1H) at 0.1% to get started." />
        )}
        {isLoading && (
          <tr>
            <td className="py-2 text-center" colSpan={7}>
              <LoaderSpinner />
            </td>
          </tr>
        )}
      </Table>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleSubmit} className="w-full max-w-md p-5 bg-white rounded shadow">
            <h2 className="mb-3 text-lg font-semibold">{editingId ? "Edit TCS rate" : "Add TCS rate"}</h2>
            <label className="block mb-2 text-sm">
              Section
              <input
                className="w-full p-2 mt-1 border rounded"
                value={form.section}
                onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                required
              />
            </label>
            <label className="block mb-2 text-sm">
              Name
              <input
                className="w-full p-2 mt-1 border rounded"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="block mb-2 text-sm">
              Rate %
              <input
                type="number"
                step="any"
                min="0"
                className="w-full p-2 mt-1 border rounded"
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                required
              />
            </label>
            <label className="block mb-2 text-sm">
              Threshold (optional)
              <input
                type="number"
                step="any"
                min="0"
                className="w-full p-2 mt-1 border rounded"
                value={form.threshold}
                onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 mb-2 text-sm">
              <input
                type="checkbox"
                checked={form.onTaxInclusive}
                onChange={(e) => setForm((f) => ({ ...f, onTaxInclusive: e.target.checked }))}
              />
              Compute on taxable + GST
            </label>
            <label className="flex items-center gap-2 mb-4 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Active
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-2 text-sm border rounded">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-2 text-sm text-white bg-purple-600 rounded disabled:opacity-50"
              >
                {submitting ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteItem && (
        <DeleteConfirmationModal
          isOpen
          onClose={() => setDeleteItem(null)}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
          title="Delete TCS rate"
          message={`Delete section ${deleteItem.section}?`}
        />
      )}
    </div>
  );
};

export default TcsRateList;
