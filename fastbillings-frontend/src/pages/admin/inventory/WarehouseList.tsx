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

interface Warehouse {
  id: string;
  name: string;
  code: string | null;
  isDefault: boolean;
}

interface FormState {
  name: string;
  code: string;
  isDefault: boolean;
}

const emptyForm: FormState = { name: "", code: "", isDefault: false };

const WarehouseList: React.FC = () => {
  const { token } = useSelector((state: RootState) => state.auth);
  const [rows, setRows] = useState<Warehouse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Warehouse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRows = async () => {
    try {
      setIsLoading(true);
      const resp = await axios.get(Constants.FETCH_WAREHOUSES_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRows(resp.data?.data?.warehouses ?? []);
    } catch (err) {
      console.error("Failed to fetch warehouses:", err);
      toast.error("Failed to fetch warehouses");
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

  const openEdit = (row: Warehouse) => {
    setForm({
      name: row.name,
      code: row.code ?? "",
      isDefault: row.isDefault,
    });
    setEditingId(row.id);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      setSubmitting(true);
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        isDefault: form.isDefault,
      };
      if (editingId) {
        await axios.put(`${Constants.FETCH_WAREHOUSES_URL}/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Warehouse updated");
      } else {
        await axios.post(Constants.FETCH_WAREHOUSES_URL, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Warehouse created");
      }
      setShowModal(false);
      fetchRows();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
      toast.error(msg || "Failed to save warehouse");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      setIsDeleting(true);
      await axios.delete(`${Constants.FETCH_WAREHOUSES_URL}/${deleteItem.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Warehouse deleted");
      setDeleteItem(null);
      fetchRows();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.message : null;
      toast.error(msg || "Failed to delete warehouse");
    } finally {
      setIsDeleting(false);
    }
  };

  const headers = ["#", "Name", "Code", "Default", "Actions"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Warehouses</h1>
          <p className="text-sm text-gray-500">Locations for stock on hand and transfers.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
        >
          <CirclePlusIcon size={16} /> Add warehouse
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
                <span className="font-medium">{row.name}</span>,
                row.code || "—",
                row.isDefault ? "Yes" : "—",
              ]}
              actions={[
                {
                  label: "Edit",
                  icon: <Edit size={14} />,
                  onClick: (r: Warehouse) => openEdit(r),
                },
                ...(row.isDefault
                  ? []
                  : [
                      {
                        label: "Delete",
                        icon: <Trash2Icon size={14} />,
                        onClick: (r: Warehouse) => setDeleteItem(r),
                      },
                    ]),
              ]}
            />
          ))}
        {!isLoading && rows.length === 0 && (
          <NoRecords colSpan={5} message="No warehouses yet. Click Add warehouse to create one." />
        )}
        {isLoading && (
          <tr>
            <td className="py-2 text-center" colSpan={5}>
              <LoaderSpinner />
            </td>
          </tr>
        )}
      </Table>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleSubmit} className="w-full max-w-md p-5 bg-white rounded shadow">
            <h2 className="mb-3 text-lg font-semibold">{editingId ? "Edit warehouse" : "Add warehouse"}</h2>
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
              Code
              <input
                className="w-full p-2 mt-1 border rounded"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </label>
            <label className="flex items-center gap-2 mb-4 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
              />
              Default warehouse
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
          title="Delete warehouse"
          message={`Delete “${deleteItem.name}”? Stock must be transferred out first.`}
        />
      )}
    </div>
  );
};

export default WarehouseList;
