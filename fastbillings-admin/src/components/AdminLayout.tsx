import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
      <aside className="w-60 bg-[var(--brand-navy)] text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10">
          <img src="/brand/fastbillings-logo-dark.svg" alt={BRAND.name} className="h-10 w-auto max-w-full object-contain" />
          <p className="text-xs text-white/60 mt-2 uppercase tracking-wider">Platform Administration</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 space-y-2">
          <a
            href={TENANT_APP_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-white/60 hover:text-white"
          >
            <ExternalLink size={14} /> Tenant App
          </a>
          <p className="text-xs text-white/50 truncate">{user?.email}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
