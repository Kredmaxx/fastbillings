import { useState, useMemo, useEffect, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate, Link } from "react-router-dom";
import {
    Home,
    ChevronDown,
    Settings,
    ShoppingBag,
    CircleDollarSignIcon,
    BarChart2,
    Plus,
    Sparkles,
    Package,
    LandmarkIcon,
    Shield,
    BookOpen,
} from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import { store } from "@store/index";
import { hasFullTenantAccess } from "@constants/userTypes";
import type {
    NavCollapsibleItem,
    NavItemType,
    NavLinkItem,
} from "@models/sidebar";
import type { PermissionSet } from "@models/permissions";
import BrandLogo from "@components/brand/BrandLogo";
import { BRAND } from "@constants/brand";

// --- Navigation Data Structure (hub pages hold nested items) ---
const navItems: NavItemType[] = [
    { type: "header", title: "Main", slug: "main" },
    {
        type: "link",
        to: "/admin",
        icon: <Home size={16} />,
        title: "Dashboards",
        slug: "dashboard",
    },
    { type: "header", title: "Operations", slug: "operations" },
    {
        type: "link",
        to: "/admin/inventory-sales",
        icon: <Package size={16} />,
        title: "Inventory & Sales",
        slug: "dashboard",
    },
    {
        type: "link",
        to: "/admin/menus/purchase",
        icon: <ShoppingBag size={16} />,
        title: "Purchase",
        slug: "purchases",
    },
    {
        type: "link",
        to: "/admin/menus/finance",
        icon: <CircleDollarSignIcon size={16} />,
        title: "Finance & Accounts",
        slug: "expenses",
    },
    {
        type: "link",
        to: "/admin/menus/accounting",
        icon: <LandmarkIcon size={16} />,
        title: "Accounting",
        slug: "accounting",
    },
    { type: "header", title: "Insights", slug: "insights" },
    {
        type: "link",
        to: "/admin/menus/reports",
        icon: <BarChart2 size={16} />,
        title: "Reports",
        slug: "transaction-reports",
    },
    {
        type: "link",
        to: "/admin/menus/ai",
        icon: <Sparkles size={16} />,
        title: "AI",
        slug: "ai",
    },
    { type: "header", title: "Admin", slug: "admin" },
    {
        type: "link",
        to: "/admin/menus/team",
        icon: <Shield size={16} />,
        title: "Roles & Permissions",
        slug: "manage-users",
    },
    {
        type: "link",
        to: "/admin/menus/settings",
        icon: <Settings size={16} />,
        title: "Settings",
        slug: "settings",
    },
];

// --- Helper Functions for Link Styling ---
const NavIconWrap = ({
    active,
    children,
    collapsed,
}: {
    active?: boolean;
    children: ReactNode;
    collapsed?: boolean;
}) => {
    if (collapsed) {
        return (
            <span
                className={`fb-nav-icon relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-all duration-300 ${
                    active
                        ? "bg-gradient-to-br from-[#00D2FF] via-[#0066FF] to-[#0052CC] text-white shadow-[0_0_0_1px_rgba(0,210,255,0.55),0_8px_22px_rgba(0,102,255,0.55),0_0_28px_rgba(0,210,255,0.35)] scale-[1.04]"
                        : "bg-gradient-to-br from-white/[0.1] to-white/[0.03] text-[#9BB0CC] ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] group-hover:text-white group-hover:ring-[#00D2FF]/45 group-hover:shadow-[0_0_0_1px_rgba(0,210,255,0.25),0_8px_20px_rgba(0,102,255,0.25)] group-hover:scale-105 group-hover:from-[#0066FF]/35 group-hover:to-[#00D2FF]/20"
                }`}
            >
                {active && (
                    <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-[14px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.35),transparent_55%)]"
                    />
                )}
                <span className="relative z-10 [&_svg]:h-[18px] [&_svg]:w-[18px]">{children}</span>
                {active && (
                    <span
                        aria-hidden
                        className="fb-nav-icon__pulse pointer-events-none absolute -inset-1 rounded-[16px] bg-[#00D2FF]/25 blur-md"
                    />
                )}
            </span>
        );
    }

    return (
        <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200 ${
                active
                    ? "bg-white/20 text-white shadow-[0_0_14px_rgba(0,210,255,0.35)] ring-1 ring-white/20"
                    : "bg-white/[0.06] text-[#8BA3C7] group-hover:bg-white/10 group-hover:text-[#00D2FF]"
            }`}
        >
            {children}
        </span>
    );
};

const getLinkClasses = ({ isActive, collapsed }: { isActive: boolean; collapsed?: boolean }) => {
    if (collapsed) {
        return `group relative mx-auto my-1.5 flex h-12 w-12 items-center justify-center rounded-[16px] transition-all duration-300 ${
            isActive
                ? "bg-transparent"
                : "hover:bg-white/[0.04]"
        }`;
    }

    return `group flex items-center gap-2.5 px-2.5 py-2 my-0.5 text-[13px] font-semibold rounded-xl transition-all duration-200 relative ${
        isActive
            ? "bg-gradient-to-r from-[#0066FF] to-[#0052CC] text-white shadow-[0_8px_24px_rgba(0,102,255,0.45)] ring-1 ring-[#00D2FF]/30"
            : "text-[#A8BDD9] hover:bg-white/[0.07] hover:text-white"
    }`;
};

const getSubLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `block py-2 pl-3 pr-2 text-[12px] font-medium rounded-lg transition-all duration-200 relative ${isActive
        ? "bg-[#0066FF]/20 text-[#7EC8FF] font-semibold before:absolute before:left-0 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-[#00D2FF] before:shadow-[0_0_8px_rgba(0,210,255,0.8)]"
        : "text-[#7A92B0] hover:bg-white/[0.06] hover:text-[#C5D9F2] before:absolute before:left-0 before:top-1/2 before:h-0 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-transparent"
    }`;

function getActiveMembershipRole(): "OWNER" | "ADMIN" | "MEMBER" | null {
    const { activeTenantId, tenants } = store.getState().auth;
    return tenants.find((tenant) => tenant.tenantId === activeTenantId)?.role ?? null;
}

// --- Permission Check Helpers ---
const canView = (
    slug: string,
    permissions: PermissionSet[],
    user: any,
): boolean => {
    if (hasFullTenantAccess(user?.user_type, getActiveMembershipRole())) return true;
    const perm = permissions.find((p) => p.moduleSlug === slug);
    if (!perm) return false;
    return perm.allowAll || perm.view;
};

const canCreate = (
    slug: string,
    permissions: PermissionSet[],
    user: any,
): boolean => {
    if (hasFullTenantAccess(user?.user_type, getActiveMembershipRole())) return true;
    const perm = permissions.find((p) => p.moduleSlug === slug);
    if (!perm) return false;
    return perm.allowAll || perm.create;
};

// --- NavItem Component (for top-level links) ---
const NavItem = ({
    item,
    isSidebarOpen,
    permissions,
    user,
}: {
    item: NavLinkItem;
    isSidebarOpen: boolean;
    permissions: PermissionSet[];
    user: any;
}) => {
    const { pathname } = useLocation();
    const { to, icon, title, slug, addPath } = item;
    const isDashboardHome = to === "/admin";
    const isActive = isDashboardHome
        ? pathname === "/admin" ||
          pathname === "/admin/" ||
          pathname.startsWith("/admin/dashboard")
        : pathname.startsWith(to);

    return (
        <div className="relative group">
            <NavLink
                to={to}
                title={!isSidebarOpen ? title : undefined}
                className={({ isActive: _ia }) =>
                    getLinkClasses({ isActive, collapsed: !isSidebarOpen })
                }
            >
                <NavIconWrap active={isActive} collapsed={!isSidebarOpen}>
                    {icon}
                </NavIconWrap>
                {isSidebarOpen && (
                    <span className="truncate font-semibold">{title}</span>
                )}
                {isActive && isSidebarOpen && (
                    <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-[#00D2FF] shadow-[0_0_8px_rgba(0,210,255,0.9)]" />
                )}
            </NavLink>
            {isSidebarOpen && addPath && canCreate(slug, permissions, user) && (
                <Link
                    to={addPath}
                    className="absolute right-1.5 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-gradient-to-br from-[#00D2FF] to-[#0066FF] text-white opacity-0 shadow-[0_4px_14px_rgba(0,210,255,0.45)] transition-all group-hover:opacity-100 hover:scale-105"
                >
                    <Plus size={15} />
                </Link>
            )}
        </div>
    );
};

const SubNavLinkItem = ({
    item,
    permissions,
    user,
}: {
    item: NavLinkItem;
    permissions: PermissionSet[];
    user: any;
}) => {
    const { to, title, slug, addPath } = item;

    return (
        <div className="relative group/subitem">
            <NavLink to={to} end={to === "/admin"} className={getSubLinkClasses}>
                <span>{title}</span>
            </NavLink>

            {addPath && canCreate(slug, permissions, user) && (
                <Link
                    to={addPath}
                    className="absolute right-1 top-1/2 z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-gradient-to-br from-[#00D2FF] to-[#0066FF] text-white opacity-0 shadow-md transition-all group-hover/subitem:opacity-100 hover:scale-105"
                >
                    <Plus size={13} />
                </Link>
            )}
        </div>
    );
};

// --- CollapsibleNavItem Component ---
interface CollapsibleNavItemProps {
    item: NavCollapsibleItem;
    isSidebarOpen: boolean;
    openMenus: Record<string, boolean>;
    activePath: string[];
    onToggle: (id: string) => void;
    level: number;
    permissions: PermissionSet[];
    user: any;
}

// This is the updated CollapsibleNavItem component
const CollapsibleNavItem = ({
    item,
    isSidebarOpen,
    openMenus,
    activePath,
    onToggle,
    level,
    permissions,
    user,
}: CollapsibleNavItemProps) => {
    const { id, icon, title, children, slug, addPath } = item;
    const isOpen = openMenus[id] || false;
    const isChildActive = activePath.includes(id);

    const paddingClass = "px-2.5 py-2 my-0.5";
    const activeClass = !isSidebarOpen
        ? "justify-center px-0"
        : isChildActive
            ? "bg-white/[0.08] text-white ring-1 ring-white/10"
            : "text-[#A8BDD9] hover:bg-white/[0.07] hover:text-white";

    return (
        <div className="relative group">
            <button
                type="button"
                title={!isSidebarOpen ? title : undefined}
                onClick={() => onToggle(id)}
                className={`flex w-full items-center justify-between rounded-xl text-left text-[13px] font-semibold transition-all duration-200 ${
                    !isSidebarOpen
                        ? "mx-auto my-1.5 h-12 w-12 justify-center rounded-[16px] hover:bg-white/[0.04]"
                        : `${paddingClass} ${activeClass}`
                }`}
            >
                <div className={`flex items-center gap-2.5 ${!isSidebarOpen ? "justify-center" : ""}`}>
                    <NavIconWrap active={isChildActive} collapsed={!isSidebarOpen}>
                        {icon}
                    </NavIconWrap>
                    {isSidebarOpen && <span className="truncate">{title}</span>}
                </div>
                {isSidebarOpen && (
                    <ChevronDown
                        size={15}
                        className={`shrink-0 text-[#6B85A8] transition-transform duration-300 ${isOpen ? "rotate-180 text-[#00D2FF]" : ""
                            }`}
                    />
                )}
            </button>

            {isSidebarOpen && addPath && canCreate(slug, permissions, user) && (
                <Link
                    to={addPath}
                    className="absolute right-1.5 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#00D2FF] to-[#0066FF] text-white opacity-0 shadow-[0_4px_14px_rgba(0,210,255,0.45)] transition-all group-hover:opacity-100 hover:scale-105"
                >
                    <Plus size={15} />
                </Link>
            )}

            <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen && isSidebarOpen ? "max-h-screen" : "max-h-0"
                    }`}
            >
                <div className="ml-4 space-y-0.5 border-l border-[#00D2FF]/25 pl-2 py-0.5">
                    {children.map((subItem) => {
                        switch (subItem.type) {
                            case "link":
                                return (
                                    <SubNavLinkItem
                                        key={subItem.to}
                                        item={subItem}
                                        permissions={permissions}
                                        user={user}
                                    />
                                );
                            case "collapsible":
                                return (
                                    <CollapsibleNavItem
                                        key={subItem.id}
                                        item={subItem}
                                        isSidebarOpen={isSidebarOpen}
                                        openMenus={openMenus}
                                        activePath={activePath}
                                        onToggle={onToggle}
                                        level={level + 1}
                                        permissions={permissions}
                                        user={user}
                                    />
                                );
                            default:
                                return null;
                        }
                    })}
                </div>
            </div>
        </div>
    );
};

// --- Helper to find the full path of the active menu ---
const findActiveMenuPath = (
    items: NavItemType[],
    pathname: string
): string[] => {
    for (const item of items) {
        if (item.type === "collapsible") {
            if (
                item.children.some(
                    (child) =>
                        child.type === "link" &&
                        // "/admin" is the prefix of every admin route — match it
                        // exactly so the Dashboards group doesn't activate everywhere.
                        (child.to === "/admin"
                            ? pathname === "/admin"
                            : pathname.startsWith(child.to))
                )
            ) {
                return [item.id];
            }
            const pathInChild = findActiveMenuPath(item.children, pathname);
            if (pathInChild.length > 0) {
                return [item.id, ...pathInChild];
            }
        }
    }
    return [];
};

const findPathToId = (items: NavItemType[], targetId: string): string[] => {
    for (const item of items) {
        if (item.type === "collapsible") {
            // Check if the current item is the one we're looking for
            if (item.id === targetId) {
                return [item.id];
            }
            // If not, search in its children
            const pathInChild = findPathToId(item.children, targetId);
            // If found in a child, prepend the current item's ID to the path
            if (pathInChild.length > 0) {
                return [item.id, ...pathInChild];
            }
        }
    }
    // Return an empty array if not found
    return [];
};

// --- Main Sidebar Component ---
const Sidebar = ({ isOpen }: { isOpen: boolean }) => {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    const { user, tenants, activeTenantId } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector(
        (state: RootState) => state.systemSettings
    );
    const permissions = systemSettings?.permissions || [];

    const allNavItems = useMemo(() => navItems, []);

    const activePath = useMemo(
        () => findActiveMenuPath(allNavItems, pathname),
        [pathname, allNavItems]
    );
    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

    useEffect(() => {
        const newOpenState: Record<string, boolean> = {};
        activePath.forEach((id) => {
            newOpenState[id] = true;
        });
        setOpenMenus(newOpenState);
    }, [activePath]);

    const handleToggle = (id: string) => {
        setOpenMenus((prev) => {
            const isCurrentlyOpen = !!prev[id];

            if (isCurrentlyOpen) {
                const path = findPathToId(navItems, id);
                const parentPath = path.slice(0, -1);
                const newOpenState: Record<string, boolean> = {};
                parentPath.forEach((pathId) => {
                    newOpenState[pathId] = true;
                });
                return newOpenState;
            } else {
                const pathToOpen = findPathToId(navItems, id);
                const newOpenState: Record<string, boolean> = {};
                pathToOpen.forEach((pathId) => {
                    newOpenState[pathId] = true;
                });
                return newOpenState;
            }
        });
    };

    const filterNavItems = useMemo(() => {
        function filter(items: NavItemType[]): NavItemType[] {
            return items
                .map((item) => {
                    if (item.type === "header") {
                        return item;
                    }

                    if (!canView(item.slug, permissions, user)) {
                        return null;
                    }

                    if (item.type === "collapsible") {
                        const visibleChildren = filter(item.children);
                        if (visibleChildren.length > 0) {
                            return { ...item, children: visibleChildren };
                        }
                        return null;
                    }
                    return item;
                })
                .filter(Boolean) as NavItemType[];
        }
        return filter(allNavItems);
    }, [permissions, user, activeTenantId, tenants, allNavItems]);

    return (
        <aside
            className={`fb-sidebar relative flex flex-col z-0 overflow-hidden transition-all duration-300 ease-in-out shadow-[4px_0_40px_rgba(0,11,30,0.18)] ${isOpen ? "w-[17.5rem]" : "w-[4.75rem]"
                }`}
        >
            {/* Rich dark atmosphere */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#000B1E] via-[#0B1533] to-[#060F24]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_60%_at_0%_0%,rgba(0,102,255,0.22),transparent_55%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(0,210,255,0.12),transparent_50%)]" />
            <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,210,255,0.2),transparent_70%)] blur-2xl" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-[#00D2FF]/40 via-[#0066FF]/20 to-transparent" />

            {/* Logo header */}
            <div className="relative flex min-h-[5.25rem] items-center border-b border-white/[0.08] bg-white/[0.03] px-3 py-4 backdrop-blur-md">
                {!isOpen && (
                    <button
                        type="button"
                        onClick={() => navigate("/admin")}
                        className="mx-auto flex items-center justify-center"
                        title={BRAND.name}
                    >
                        <img
                            src={`${BRAND.logos.mark}?v=5`}
                            alt={BRAND.name}
                            className="h-12 w-12 object-contain drop-shadow-[0_4px_12px_rgba(0,210,255,0.35)]"
                        />
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => navigate("/admin")}
                    className={`cursor-pointer whitespace-nowrap transition-opacity duration-200 ${isOpen ? "ml-0.5 opacity-100" : "w-0 overflow-hidden opacity-0 pointer-events-none"
                        }`}
                >
                    <BrandLogo
                        variant="sidebar"
                        className="h-14 w-auto max-w-[15.5rem] object-contain drop-shadow-[0_4px_16px_rgba(0,102,255,0.35)]"
                    />
                </button>
            </div>

            <nav className={`fb-sidebar__nav fb-sidebar__nav--dark relative flex-1 overflow-y-auto py-2.5 ${isOpen ? "px-2" : "px-1.5"}`}>
                {filterNavItems.map((item, index) => {
                    switch (item.type) {
                        case "header":
                            return (
                                <p
                                    key={index}
                                    className={`${index > 0 ? "mt-4 pt-3" : "mt-0.5"
                                        } mb-1.5 flex items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#5B7A9D] ${index > 0 ? "border-t border-white/[0.06]" : ""
                                        } ${isOpen ? "opacity-100" : "hidden"}`}
                                >
                                    <span className="h-px flex-1 bg-gradient-to-r from-[#00D2FF]/40 to-transparent" />
                                    {item.title}
                                </p>
                            );
                        case "link":
                            return (
                                <NavItem
                                    key={item.to}
                                    item={item}
                                    isSidebarOpen={isOpen}
                                    permissions={permissions}
                                    user={user}
                                />
                            );
                        case "collapsible":
                            return (
                                <CollapsibleNavItem
                                    key={item.id}
                                    item={item}
                                    isSidebarOpen={isOpen}
                                    openMenus={openMenus}
                                    activePath={activePath}
                                    onToggle={handleToggle}
                                    level={1}
                                    permissions={permissions}
                                    user={user}
                                />
                            );
                        default:
                            return null;
                    }
                })}

                <NavLink
                    to="/admin/api-docs"
                    title={!isOpen ? "API Docs" : undefined}
                    className={({ isActive }) =>
                        `group mt-3 flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-2 text-[13px] font-semibold text-[#A8BDD9] transition hover:border-[#00D2FF]/30 hover:bg-white/[0.08] hover:text-white ${
                            isActive ? "border-[#00D2FF]/40 bg-white/[0.1] text-white" : ""
                        } ${
                            !isOpen
                                ? "mx-auto h-12 w-12 justify-center border-0 bg-transparent px-0 py-0"
                                : ""
                        }`
                    }
                >
                    <NavIconWrap collapsed={!isOpen}>
                        <BookOpen size={14} />
                    </NavIconWrap>
                    {isOpen && (
                        <>
                            <span>API Docs</span>
                        </>
                    )}
                </NavLink>
            </nav>
        </aside>
    );
};

export default Sidebar;
