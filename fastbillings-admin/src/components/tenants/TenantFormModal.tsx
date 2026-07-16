import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { PlatformTenant, TenantStatus } from "@/types/tenant";
import { TENANT_STATUSES } from "@/types/tenant";

export interface TenantFormValues {
  name: string;
  slug: string;
  status: TenantStatus;
  ownerEmail: string;
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  tenant?: PlatformTenant | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: TenantFormValues) => void;
}

const empty: TenantFormValues = {
  name: "",
  slug: "",
  status: "trialing",
  ownerEmail: "",
};

export default function TenantFormModal({ open, mode, tenant, saving, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<TenantFormValues>(empty);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && tenant) {
      setForm({
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        ownerEmail: tenant.owner?.email ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [open, mode, tenant]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === "create" ? "Create workspace" : "Edit workspace"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Workspace name *</label>
            <input
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.slug}
              placeholder={mode === "create" ? "auto-generated if empty" : ""}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as TenantStatus }))}
            >
              {TENANT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Owner email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={form.ownerEmail}
              placeholder="user@company.com"
              onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">Must match an existing user account.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {mode === "create" ? "Create" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
