import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Building2,
  Eye,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  UserX,
  Ban,
  CheckCircle,
} from "lucide-react";
import { API_URLS } from "@constants/config";
import type { PlatformTenant, TenantStatus } from "@/types/tenant";
import TenantFormModal, { type TenantFormValues } from "@components/tenants/TenantFormModal";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    trialing: "bg-blue-100 text-blue-800",
    suspended: "bg-amber-100 text-amber-800",
    cancelled: "bg-gray-100 text-gray-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-700";
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<PlatformTenant | null>(null);
  const [detail, setDetail] = useState<PlatformTenant | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.get(API_URLS.TENANTS);
      setTenants(res.data?.data ?? []);
    } catch {
      toast.error("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setSelected(null);
    setModalMode("create");
  };

  const openEdit = (tenant: PlatformTenant) => {
    setSelected(tenant);
    setModalMode("edit");
    setOpenMenu(null);
  };

  const openDetail = async (tenant: PlatformTenant) => {
    setOpenMenu(null);
    try {
      const res = await axios.get(`${API_URLS.TENANTS}/${tenant.tenantId}`);
      setDetail(res.data?.data ?? tenant);
    } catch {
      toast.error("Failed to load tenant details");
    }
  };

  const handleSubmit = async (values: TenantFormValues) => {
    try {
      setSaving(true);
      if (modalMode === "create") {
        const body: Record<string, string> = {
          name: values.name,
          status: values.status,
        };
        if (values.slug.trim()) body.slug = values.slug.trim();
        if (values.ownerEmail.trim()) body.ownerEmail = values.ownerEmail.trim();
        await axios.post(API_URLS.TENANTS, body);
        toast.success("Workspace created");
      } else if (selected) {
        await axios.put(`${API_URLS.TENANTS}/${selected.tenantId}`, {
          name: values.name,
          slug: values.slug,
          status: values.status,
          ownerEmail: values.ownerEmail.trim() || null,
        });
        toast.success("Workspace updated");
      }
      setModalMode(null);
      load();
    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? String(err.response.data.message)
          : "Failed to save workspace";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (tenant: PlatformTenant, status: TenantStatus) => {
    setOpenMenu(null);
    try {
      await axios.patch(`${API_URLS.TENANTS}/${tenant.tenantId}/status`, { status });
      toast.success(`Status updated to ${status}`);
      load();
    } catch {
      toast.error("Failed to update status");
    }
  };

  const deleteTenant = async (tenant: PlatformTenant) => {
    setOpenMenu(null);
    if (!confirm(`Permanently delete workspace "${tenant.name}"? This removes all tenant data.`)) return;
    try {
      await axios.delete(`${API_URLS.TENANTS}/${tenant.tenantId}`);
      toast.success("Workspace deleted");
      load();
    } catch {
      toast.error("Failed to delete workspace");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-purple-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tenants</h1>
          <p className="text-sm text-gray-500 mt-1">Manage all workspaces on the platform.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium shrink-0"
        >
          <Plus size={16} /> New workspace
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenants.map((t) => (
                <tr key={t.tenantId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-gray-400 shrink-0" />
                      <div>
                        <p className="font-medium text-gray-900">{t.name}</p>
                        <p className="text-xs text-gray-500">{t.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.owner?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{t.subscription?.planName ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{t.memberCount}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(t.status)}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu(openMenu === t.tenantId ? null : t.tenantId)}
                      className="inline-flex p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                    {openMenu === t.tenantId && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                        <div className="absolute right-4 top-full mt-1 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-left">
                          <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50" onClick={() => openDetail(t)}>
                            <Eye size={14} /> View details
                          </button>
                          <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50" onClick={() => openEdit(t)}>
                            <Pencil size={14} /> Edit
                          </button>
                          {t.status !== "active" && (
                            <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setStatus(t, "active")}>
                              <CheckCircle size={14} /> Activate
                            </button>
                          )}
                          {t.status !== "suspended" && (
                            <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setStatus(t, "suspended")}>
                              <Ban size={14} /> Suspend
                            </button>
                          )}
                          {t.status !== "cancelled" && (
                            <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setStatus(t, "cancelled")}>
                              <UserX size={14} /> Cancel
                            </button>
                          )}
                          <hr className="my-1 border-gray-100" />
                          <button type="button" className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={() => deleteTenant(t)}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tenants.length === 0 && (
          <p className="text-center py-12 text-gray-500">No tenants registered yet.</p>
        )}
      </div>

      <TenantFormModal
        open={modalMode !== null}
        mode={modalMode ?? "create"}
        tenant={selected}
        saving={saving}
        onClose={() => setModalMode(null)}
        onSubmit={handleSubmit}
      />

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{detail.name}</h2>
              <button type="button" onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600">
                ×
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-gray-500">Slug</span><p className="font-medium">{detail.slug}</p></div>
                <div><span className="text-gray-500">Status</span><p className="font-medium capitalize">{detail.status}</p></div>
                <div><span className="text-gray-500">Owner</span><p className="font-medium">{detail.owner?.email ?? "—"}</p></div>
                <div><span className="text-gray-500">Plan</span><p className="font-medium">{detail.subscription?.planName ?? "—"}</p></div>
                <div><span className="text-gray-500">Members</span><p className="font-medium">{detail.memberCount}</p></div>
                <div><span className="text-gray-500">Created</span><p className="font-medium">{new Date(detail.createdAt).toLocaleString()}</p></div>
              </div>
              {detail.memberships && detail.memberships.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Members</h3>
                  <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                    {detail.memberships.map((m) => (
                      <li key={m.id} className="px-3 py-2 flex justify-between gap-2">
                        <span>{m.user.email}</span>
                        <span className="text-xs text-gray-500 uppercase">{m.role}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setDetail(null); openEdit(detail); }} className="text-sm text-purple-600 font-medium hover:underline">
                  Edit workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
