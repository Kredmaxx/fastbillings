import {
  LogOut,
  User,
  UserCircle,
  FileText,
  ShoppingCart,
  UserPlus,
  Truck,
  Plus,
  Building2,
  ChevronDown,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import type { RootState } from "../../../store";
import { logout } from "../../../store/auth/authSlice";
import WorkspaceDrawer from "./WorkspaceDrawer";
import HeaderSearch from "./HeaderSearch";

interface HeaderProps {
  toggleSidebar: () => void;
  isSidebarOpen?: boolean;
}

const SidebarToggle = ({
  isOpen,
  onToggle,
}: {
  isOpen: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#E4EEF8] bg-white text-[#35516F] transition hover:border-[#C8DFFF] hover:bg-[#F2F8FF] hover:text-[#0070F8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0070F8]/35"
  >
    {isOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
  </button>
);

const AdminHeader = ({ toggleSidebar, isSidebarOpen = true }: HeaderProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const { user, tenants, activeTenantId } = useSelector((state: RootState) => state.auth);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const activeTenant = tenants.find((t) => t.tenantId === activeTenantId);
  const workspaceLabel = activeTenant?.name || "Select workspace";

  const actions = [
    { label: "New Invoice", icon: <FileText size={18} />, onClick: () => navigate("/admin/invoices/create-invoice") },
    { label: "New Purchase", icon: <ShoppingCart size={18} />, onClick: () => navigate("/admin/purchases/new") },
    { label: "New Customer", icon: <UserPlus size={18} />, onClick: () => navigate("/admin/customers/new") },
    { label: "New Supplier", icon: <Truck size={18} />, onClick: () => navigate("/admin/suppliers") },
  ];

  const handleLogout = () => {
    dispatch(logout());
  };

  return (
    <>
      <header className="relative z-40 flex items-center justify-between gap-2 border-b border-[#E8EEF5] bg-white/90 px-4 py-2.5 shadow-[0_1px_0_rgba(0,11,30,0.04)] backdrop-blur-sm">
        <div className="flex min-w-0 flex-1 items-center">
          <SidebarToggle isOpen={isSidebarOpen} onToggle={toggleSidebar} />
          <HeaderSearch />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {tenants.length > 0 && (
            <button
              type="button"
              onClick={() => setWorkspaceOpen(true)}
              className="flex max-w-[180px] items-center gap-2 rounded-full border border-[#D6E4FF] bg-[#F4F8FF] px-3 py-2 text-sm font-semibold text-[#0B1533] shadow-sm transition hover:border-[#0066FF]/40 hover:bg-white hover:shadow-[0_6px_16px_rgba(0,102,255,0.12)] lg:max-w-[220px]"
              title="Switch workspace"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#0066FF] to-[#00D2FF] text-white shadow-sm">
                <Building2 size={14} />
              </span>
              <span className="hidden truncate sm:inline">{workspaceLabel}</span>
              <ChevronDown size={14} className="shrink-0 text-[#8A97A8]" />
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="hidden h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0066FF] to-[#0052CC] text-white shadow-[0_6px_16px_rgba(0,102,255,0.28)] transition hover:shadow-[0_8px_22px_rgba(0,102,255,0.4)] active:scale-95 md:flex"
            >
              <Plus size={20} />
            </button>
            {open && (
              <div className="absolute right-0 z-[60] mt-2 w-44 overflow-hidden rounded-xl border border-[#E8EEF5] bg-white shadow-lg">
                {actions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => {
                      action.onClick();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold text-[#3D4F63] transition hover:bg-[#F4F8FF] hover:text-[#0066FF]"
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex cursor-pointer items-center space-x-2 rounded-full p-1 focus:outline-none"
              aria-expanded={isDropdownOpen}
              aria-haspopup="true"
            >
              <div
                className={
                  user?.profileImageUrl
                    ? "flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#0066FF] text-lg font-semibold text-white"
                    : "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#00D2FF] to-[#0066FF] text-lg font-semibold text-white shadow-[0_4px_12px_rgba(0,102,255,0.25)]"
                }
              >
                {user?.profileImageUrl ? (
                  <img
                    src={user.profileImageUrl}
                    alt="User"
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <UserCircle className="h-6 w-6" />
                )}
              </div>
            </button>

            {isDropdownOpen && (
              <div
                className="absolute right-0 z-[60] mt-2 w-56 origin-top-right divide-y divide-gray-100 rounded-xl bg-white shadow-lg ring-1 ring-black/5"
                onMouseLeave={() => setIsDropdownOpen(false)}
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="user-menu-button"
              >
                <div className="px-4 py-3" role="none">
                  <p className="truncate text-sm font-medium text-gray-950" role="none">
                    {user?.firstName + " " + user?.lastName || "Guest User"}
                  </p>
                  <p className="truncate text-sm text-gray-500" role="none">
                    {user?.email || "guest@example.com"}
                  </p>
                </div>
                <div className="py-1" role="none">
                  <Link
                    to="/admin/settings/profile"
                    className="mx-2 flex items-center rounded-md px-4 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-700"
                    role="menuitem"
                  >
                    <User className="mr-3 h-4 w-4 text-gray-400" />
                    Profile
                  </Link>
                  <a
                    href="#"
                    onClick={handleLogout}
                    className="mx-2 flex cursor-pointer items-center rounded-md px-4 py-2 text-sm text-gray-700 transition-colors duration-200 hover:bg-blue-50 hover:text-blue-700"
                    role="menuitem"
                  >
                    <LogOut className="mr-3 h-4 w-4 text-gray-400" />
                    Logout
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <WorkspaceDrawer open={workspaceOpen} onClose={() => setWorkspaceOpen(false)} />
    </>
  );
};

export default AdminHeader;
