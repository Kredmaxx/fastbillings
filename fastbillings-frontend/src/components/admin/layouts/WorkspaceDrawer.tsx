import { useEffect } from "react";
import { Building2, Check, Plus, Store, X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { AppDispatch, RootState } from "@store/index";
import { switchTenant, type TenantSummary } from "@store/auth/authSlice";
import { resolveCompanyLogo } from "@utils/brandLogo";

type WorkspaceDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const roleLabel = (role: TenantSummary["role"]) => {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Member";
};

const WorkspaceDrawer = ({ open, onClose }: WorkspaceDrawerProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { tenants, activeTenantId, isLoading } = useSelector((state: RootState) => state.auth);
  const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
  const activeCompanyLogo =
    resolveCompanyLogo(systemSettings?.company?.companyLogo) ||
    resolveCompanyLogo(systemSettings?.company?.siteLogo);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const handleSelect = async (tenantId: string) => {
    if (tenantId === activeTenantId) {
      onClose();
      return;
    }
    await dispatch(switchTenant(tenantId));
    onClose();
    window.location.reload();
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-[80] bg-[#000B1E]/45 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-[90] flex w-full max-w-md flex-col bg-white shadow-[-12px_0_40px_rgba(0,11,30,0.18)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Workspaces"
      >
        <div className="flex items-center justify-between border-b border-[#E8EEF5] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0066FF] to-[#00D2FF] text-white shadow-[0_8px_18px_rgba(0,102,255,0.28)]">
              <Store size={18} />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-[#0B1533]">Workspaces</h2>
              <p className="text-xs text-[#8A97A8]">
                {tenants.length} workspace{tenants.length !== 1 ? "s" : ""} available
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#5A6B7D] transition hover:bg-[#F4F8FF] hover:text-[#0066FF]"
            aria-label="Close workspaces"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {tenants.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#D6E4FF] bg-[#F4F8FF] px-4 py-10 text-center">
              <Building2 className="mx-auto mb-2 h-8 w-8 text-[#C7D9F5]" />
              <p className="text-sm font-semibold text-[#0B1533]">No workspaces yet</p>
              <p className="mt-1 text-xs text-[#8A97A8]">Create or join a company workspace to continue.</p>
            </div>
          )}

          {tenants.map((tenant) => {
            const active = tenant.tenantId === activeTenantId;
            const initial = (tenant.name?.charAt(0) || "W").toUpperCase();
            const showLogo = active && !!activeCompanyLogo;
            return (
              <button
                key={tenant.tenantId}
                type="button"
                disabled={isLoading}
                onClick={() => handleSelect(tenant.tenantId)}
                className={`group w-full rounded-2xl border p-4 text-left transition-all duration-200 ${
                  active
                    ? "border-[#0066FF] bg-[#F0F7FF] shadow-[0_8px_24px_rgba(0,102,255,0.12)]"
                    : "border-[#E8EEF5] bg-white hover:border-[#BFD5FF] hover:bg-[#F8FBFF]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold ${
                      active
                        ? "bg-gradient-to-br from-[#0066FF] to-[#00D2FF] text-white shadow-[0_6px_16px_rgba(0,102,255,0.35)]"
                        : "bg-[#EEF3FB] text-[#5A6B7D] group-hover:bg-[#E8F1FF] group-hover:text-[#0066FF]"
                    }`}
                  >
                    {showLogo ? (
                      <img src={activeCompanyLogo!} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[15px] font-bold text-[#0B1533]">{tenant.name}</p>
                      {active && (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0066FF] text-white">
                          <Check size={12} strokeWidth={3} />
                        </span>
                      )}
                      {active && (
                        <span className="text-[11px] font-semibold text-[#8A97A8]">Default</span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[#8A97A8]">
                      {tenant.slug || tenant.tenantId}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#D6E4FF] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#0066FF]">
                        <Building2 size={10} />
                        {roleLabel(tenant.role)}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-[#E8EEF5] bg-[#F8FAFC] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5A6B7D]">
                        {tenant.status || "Active"}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#E8EEF5] p-4">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate("/admin/settings/company-settings");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#0066FF] bg-white px-4 py-3 text-sm font-semibold text-[#0066FF] transition hover:bg-[#F0F7FF]"
          >
            <Plus size={16} />
            New
          </button>
        </div>
      </aside>
    </>
  );
};

export default WorkspaceDrawer;
