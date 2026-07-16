import { NavLink, useLocation } from "react-router-dom";
import {
  ChartCandlestick,
  CircleDollarSign,
  Home,
  Receipt,
} from "lucide-react";

const items = [
  {
    id: "overview",
    to: "/admin",
    label: "Overview",
    icon: Home,
  },
  {
    id: "sales",
    to: "/admin/dashboard/sales",
    label: "Sales & Invoices",
    icon: Receipt,
  },
  {
    id: "accounts",
    to: "/admin/dashboard/accounts",
    label: "Accounts & P&L",
    icon: ChartCandlestick,
  },
  {
    id: "expenses",
    to: "/admin/dashboard/expenses",
    label: "Expenses",
    icon: CircleDollarSign,
  },
] as const;

function isItemActive(id: string, pathname: string): boolean {
  if (id === "overview") {
    return (
      pathname === "/admin" ||
      pathname === "/admin/" ||
      pathname === "/admin/dashboard"
    );
  }
  return pathname.startsWith(
    items.find((i) => i.id === id)?.to ?? ""
  );
}

/** Horizontal menu for switching between dashboard views. */
export default function DashboardSubNav() {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Dashboard views"
      className="flex gap-1 overflow-x-auto rounded-xl border border-[#D6E4FF] bg-white/90 p-1 shadow-[0_4px_16px_rgba(0,11,30,0.03)] backdrop-blur-sm"
    >
      {items.map(({ id, to, label, icon: Icon }) => {
        const active = isItemActive(id, pathname);
        return (
          <NavLink
            key={id}
            to={to}
            end={id === "overview"}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
              active
                ? "bg-[#0066FF] text-white shadow-[0_6px_16px_rgba(0,102,255,0.28)]"
                : "text-[#5B7A9D] hover:bg-[#F4F8FF] hover:text-[#0B1533]"
            }`}
          >
            <Icon size={15} />
            {label}
          </NavLink>
        );
      })}
    </nav>
  );
}
