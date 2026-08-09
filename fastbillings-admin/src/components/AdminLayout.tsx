import { NavLink, Outlet, useNavigate } from "react-router-dom";
import PageBackButton from "@/components/PageBackButton";
import {
  LayoutDashboard,
  CreditCard,
  Users,
  Building2,
  Globe,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { BRAND, TENANT_APP_URL } from "@constants/config";
import { getUser, platformLogout } from "@/lib/auth";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/plans", label: "Pricing Plans", icon: CreditCard },
  { to: "/subscribers", label: "Subscribers", icon: Users },
  { to: "/tenants", label: "Tenants", icon: Building2 },
  { to: "/landing", label: "Landing Page", icon: Globe },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    platformLogout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-[var(--brand-light)]">
      <aside className="w-60 bg-white border-r border-[#E4EEF8] text-[var(--brand-navy)] flex flex-col shrink-0 shadow-[4px_0_24px_rgba(0,16,48,0.05)]">
        <div className="p-5 border-b border-[#E4EEF8]">
          <img src="/brand/fastbillings-logo-sidebar.png?v=11" alt={BRAND.name} className="h-10 w-auto max-w-full object-contain object-left" />
          <p className="text-xs text-slate-500 mt-2 uppercase tracking-wider">Platform Administration</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? "bg-[#EAF3FF] text-[var(--brand-navy)] ring-1 ring-[#C8DFFF]"
                    : "text-slate-600 hover:bg-[#F2F8FF] hover:text-[var(--brand-navy)]"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-[#E4EEF8] space-y-2">
          <a
            href={TENANT_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-slate-500 hover:text-[var(--brand-primary)]"
          >
            <ExternalLink size={14} /> Tenant App
          </a>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-[var(--brand-primary)]"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <PageBackButton />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
