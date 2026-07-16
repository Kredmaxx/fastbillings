import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { MdInventory, MdReceiptLong, MdSecurity } from 'react-icons/md';
import { BiReceipt } from "react-icons/bi";
import { IoReceiptOutline } from "react-icons/io5";

import {
    Home,
    ChevronDown,
    Box,
    Settings,
    ShoppingBag,
    Users,
    CircleDollarSignIcon,
    Settings2,
    Cpu,
    GlobeIcon,
    BarChart2,
    ChartCandlestick,
    ChartArea
} from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import type { NavCollapsibleItem, NavItemType } from '@models/sidebar';
import type { PermissionSet } from '@models/permissions';
import BottomBar from './layouts/BottomBar';

// --- Navigation Data Structure ---
const navItems: NavItemType[] = [
    { type: 'header', title: 'Main', slug: 'main' },
    { type: 'link', to: '/admin', icon: <Home size={20} />, title: 'Dashboard', slug: 'dashboard' },
    { type: 'header', title: 'Inventory & Sales', slug: 'inventory-sales' },
    {
        type: 'collapsible',
        id: 'products',
        icon: <Box size={20} />,
        title: 'Product / Services',
        slug: 'product-services',
        children: [
            { type: 'link', to: '/admin/products', title: 'Products', slug: 'product-services' },
            { type: 'link', to: '/admin/categories', title: 'Categories', slug: 'product-services' },
            { type: 'link', to: '/admin/brands', title: 'Brands', slug: 'product-services' },
            { type: 'link', to: '/admin/units', title: 'Units', slug: 'product-services' },
        ],
    },
    {
        type: 'link', to: '/admin/inventory', icon: <MdInventory size={20} />, title: 'Inventory', slug: 'inventory',
    },
    {
        type: 'collapsible',
        id: 'invoices',
        icon: <IoReceiptOutline size={20} />,
        title: 'Invoices',
        slug: 'invoices',
        children: [
            { type: 'link', to: '/admin/invoices', title: 'Invoices', slug: 'invoices' },
            { type: 'link', to: '/admin/invoice-templates', title: 'Invoice Templates', slug: 'invoices' },
        ]
    },
    {
        type: 'link', to: '/admin/customers', icon: <Users size={20} />, title: 'Customers', slug: 'customers',
    },
    {
        type: 'link', to: '/admin/credit-notes', icon: <MdReceiptLong size={20} />, title: 'Credit Notes', slug: 'credit-notes',
    },
    {
        type: 'link', to: '/admin/quotations', icon: <BiReceipt size={20} />, title: 'Quotations', slug: 'quotations',
    },
    {
        type: 'link', to: '/admin/delivery-challans', icon: <BiReceipt size={20} />, title: 'Delivery Challans', slug: 'delivery-challans',
    },
    { type: 'header', title: 'Purchase', slug: 'purchases' },
    {
        type: 'collapsible',
        id: 'purchases',
        icon: <ShoppingBag size={20} />,
        title: 'Purchases',
        slug: 'purchases',
        children: [
            { type: 'link', to: '/admin/purchases', title: 'Purchases', slug: 'purchase-list' },
            { type: 'link', to: '/admin/purchase-orders', title: 'Purchase Orders', slug: 'purchase-orders' },
            { type: 'link', to: '/admin/debit-notes', title: 'Debit Notes', slug: 'debit-notes' },
            { type: 'link', to: '/admin/suppliers', title: 'Suppliers', slug: 'suppliers' },
            { type: 'link', to: '/admin/supplier-payments', title: 'Supplier Payments', slug: 'supplier-payments' },
        ],
    },
    { type: 'header', title: 'Finance & Accounts', slug: 'purchases' },
    {
        type: 'link', to: '/admin/expenses', icon: <CircleDollarSignIcon size={20} />, title: 'Expenses', slug: 'expenses',
    },
    { type: 'header', title: 'Roles & Permissions', slug: 'manage-users' },
    {
        type: 'collapsible',
        id: 'roles-permissions',
        icon: <MdSecurity size={20} />,
        title: 'Roles & Permissions',
        slug: 'manage-users',
        children: [
            { type: 'link', to: '/admin/users', title: 'Users', slug: 'manage-users' },
            { type: 'link', to: '/admin/roles', title: 'Roles & Permissions', slug: 'manage-users' },
        ],
    },
    { type: 'header', title: 'Reports', slug: 'reports' },
    {
        type: 'collapsible',
        id: 'transaction-reports',
        icon: <BarChart2 size={20} />,
        title: 'Transaction Reports',
        slug: 'transaction-reports',
        children: [
            { type: 'link', to: '/admin/reports/sales', title: 'Sales', slug: 'transaction-reports' },
            { type: 'link', to: '/admin/reports/sales-return', title: 'Sales Return', slug: 'transaction-reports' },
            { type: 'link', to: '/admin/reports/purchase', title: 'Purchase', slug: 'transaction-reports' },
            { type: 'link', to: '/admin/reports/purchase-order', title: 'Purchase Order', slug: 'transaction-reports' },
            { type: 'link', to: '/admin/reports/purchase-return', title: 'Purchase Return', slug: 'transaction-reports' },
            { type: 'link', to: '/admin/reports/quotation', title: 'Quotation', slug: 'transaction-reports' },
        ],
    },
    {
        type: 'collapsible',
        id: 'accounting-reports',
        icon: <ChartCandlestick size={20} />,
        title: 'Accounting Reports',
        slug: 'accounting-reports',
        children: [
            { type: 'link', to: '/admin/reports/income', title: 'Income', slug: 'accounting-reports' },
            { type: 'link', to: '/admin/reports/expense', title: 'Expense', slug: 'accounting-reports' },
        ],
    },
    {
        type: 'collapsible',
        id: 'item-reports',
        icon: <ChartArea size={20} />,
        title: 'Inventory Reports',
        slug: 'item-reports',
        children: [
            { type: 'link', to: '/admin/reports/inventory', title: 'Inventory', slug: 'item-reports' },
            { type: 'link', to: '/admin/reports/low-stock', title: 'Low Stock', slug: 'item-reports' },
            { type: 'link', to: '/admin/reports/out-of-stock', title: 'Out of Stock', slug: 'item-reports' },
        ],
    },
    { type: 'header', title: 'Settings & Configurations', slug: 'settings' },
    {
        type: 'collapsible',
        id: 'settings',
        icon: <Settings size={20} />,
        title: 'Settings',
        slug: 'settings',
        children: [
            {
                type: 'collapsible',
                id: 'general-settings',
                title: 'General Settings',
                slug: 'general-settings',
                icon: <Settings2 size={16} />,
                children: [
                    { type: 'link', to: '/admin/settings/profile', title: 'Account', slug: 'general-settings' },
                ],
            },
            {
                type: 'collapsible',
                id: 'website-settings',
                title: 'Website Settings',
                slug: 'website-settings',
                icon: <GlobeIcon size={16} />,
                children: [
                    { type: 'link', to: '/admin/settings/company-settings', title: 'Company Settings', slug: 'website-settings' },
                    { type: 'link', to: '/admin/settings/localization', title: 'Localization Settings', slug: 'website-settings' },
                ],
            },
            {
                type: 'collapsible',
                id: 'system-settings',
                title: 'System Settings',
                slug: 'system-settings',
                icon: <Cpu size={16} />,
                children: [
                    { type: 'link', to: '/admin/settings/email-settings', title: 'Email Settings', slug: 'system-settings' },
                    { type: 'link', to: '/admin/settings/email-templates', title: 'Email Templates', slug: 'system-settings' },
                    { type: 'link', to: '/admin/settings/signatures', title: 'Signatures', slug: 'system-settings' },
                ],
            },
            {
                type: 'collapsible',
                id: 'finance-settings',
                title: 'Finance Settings',
                slug: 'finance-settings',
                icon: <CircleDollarSignIcon size={16} />,
                children: [
                    { type: 'link', to: '/admin/settings/bank-accounts', title: 'Bank Accounts', slug: 'finance-settings' },
                    { type: 'link', to: '/admin/settings/tax-rates', title: 'Tax Rates', slug: 'finance-settings' },
                    { type: 'link', to: '/admin/settings/tax-groups', title: 'Tax Groups', slug: 'finance-settings' },
                    { type: 'link', to: '/admin/settings/currencies', title: 'Currencies', slug: 'finance-settings' },
                ],
            },
        ],
    }
];


// --- Helper Functions for Link Styling ---
const getTopLevelLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center p-2 my-2 text-sm font-medium rounded-lg transition-colors duration-200 relative ${isActive ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-gray-100'
    }`;

const getSubLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `block py-2 px-2 text-sm font-medium rounded-md transition-colors duration-200 ${isActive ? 'text-white bg-purple-600' : 'text-gray-600 hover:bg-gray-100'
    }`;

// --- NavItem Component (for top-level links) ---
const NavItem = ({ to, icon, title, isSidebarOpen }: {
  to: string;
  icon: ReactNode;
  title: string;
  isSidebarOpen: boolean;
}) => {
  const { pathname } = useLocation();

  // ACTIVE = if current URL starts with this link
  const isActive = (to === '/admin' ? pathname === to : pathname.startsWith(to));

  return (
    <NavLink to={to} className={getTopLevelLinkClasses({ isActive })}>
      <div className="flex items-center">
        {icon}
        <span className={`ml-4 transition-opacity font-semibold duration-300 whitespace-nowrap ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          {title}
        </span>
      </div>
    </NavLink>
  );
};


interface CollapsibleNavItemProps {
    item: NavCollapsibleItem;
    isSidebarOpen: boolean;
    openMenus: Record<string, boolean>;
    activePath: string[];
    onToggle: (id: string) => void;
    level: number;
}

const CollapsibleNavItem = ({ item, isSidebarOpen, openMenus, activePath, onToggle, level }: CollapsibleNavItemProps) => {
    const { id, icon, title, children } = item;
    const isOpen = openMenus[id] || false;

    // UPDATED: An item is active if its ID is in the active path.
    const isActive = activePath.includes(id);

    const paddingClass = level === 1 ? 'p-2 my-2' : 'py-2 px-2';
    const activeClass = isActive && isSidebarOpen
        ? (level === 1 ? 'bg-gray-100 text-gray-600' : ' bg-gray-100 text-gray-600')
        : 'text-gray-600 hover:bg-gray-100';

    return (
        <div>
            <button
                onClick={() => onToggle(id)}
                className={`flex items-center justify-between w-full text-sm font-medium rounded-lg transition-colors duration-300 ${paddingClass} ${activeClass}`}
            >
                <div className="flex items-center">
                    {icon}
                    <span
                        className={`ml-4 transition-opacity duration-300 whitespace-nowrap ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                        {title}
                    </span>
                </div>
                {isSidebarOpen && <ChevronDown size={16}
                    className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />}
            </button>

            <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen && isSidebarOpen ? 'max-h-screen' : 'max-h-0'}`}>
                <div className="pt-1 space-y-1" style={{ paddingLeft: `${level * 1}rem` }}>
                    {children.map(subItem => {
                        switch (subItem.type) {
                            case 'link':
                                return (
                                    <NavLink key={subItem.to} to={subItem.to} className={getSubLinkClasses}>
                                        {subItem.title}
                                    </NavLink>
                                );
                            case 'collapsible':
                                return (
                                    <CollapsibleNavItem
                                        key={subItem.id}
                                        item={subItem}
                                        isSidebarOpen={isSidebarOpen}
                                        openMenus={openMenus}
                                        activePath={activePath} // Pass the path down
                                        onToggle={onToggle}
                                        level={level + 1}
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

// --- NEW: Helper to find the full path of the active menu based on URL ---
const findActiveMenuPath = (items: NavItemType[], pathname: string): string[] => {
    for (const item of items) {
        if (item.type === 'collapsible') {
            // Check if a direct child link is an ancestor of the current path.
            if (item.children.some(child => child.type === 'link' && pathname.startsWith(child.to))) {
                return [item.id];
            }

            // Recurse into nested collapsible children.
            const pathInChild = findActiveMenuPath(item.children, pathname);

            // If a path was found in a child, prepend the current item's ID.
            if (pathInChild.length > 0) {
                return [item.id, ...pathInChild];
            }
        }
    }
    // Return an empty array if no path is found.
    return [];
};


// --- Main Sidebar Component ---
const Sidebar = ({ isOpen }: { isOpen: boolean; }) => {
    const { pathname } = useLocation();

    const activePath = useMemo(() => findActiveMenuPath(navItems, pathname), [pathname]);

    const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
    const { token, user } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const navigate = useNavigate();
    useEffect(() => {
        const newOpenState: Record<string, boolean> = {};
        activePath.forEach((id) => {
            newOpenState[id] = true;
        });
        setOpenMenus(newOpenState);
    }, [token, activePath]);

    const handleToggle = (id: string) => {
        setOpenMenus(prev => ({ ...prev, [id]: !prev[id] }));
    };

    function canView(slug: string, permissions: PermissionSet[]): boolean {
        if (user && user.user_type === 1) return true;
        const perm = permissions.find((p) => p.moduleSlug === slug);
        if (!perm) return false;
        return perm.allowAll || perm.view;
    }

    function filterNavItems(items: NavItemType[], permissions: PermissionSet[]): NavItemType[] {
        return items
            .map((item) => {
                if (item.type === "link") {
                    return canView(item.slug, permissions) ? item : null;
                }

                if (item.type === "collapsible") {
                    const filteredChildren = filterNavItems(item.children, permissions);
                    if (canView(item.slug, permissions) || filteredChildren.length > 0) {
                        return { ...item, children: filteredChildren };
                    }
                    return null;
                }

                if (item.type === "header") {
                    return canView(item.slug, permissions) ? item : null;
                }

                return null;
            })
            .filter(Boolean) as NavItemType[];
    }

    const filteredNavItems = filterNavItems(navItems, permissions);
    return (
        <aside
            className={`bg-gray-50 text-gray-950 flex flex-col transition-all duration-300 ease-in-out  z-0 border-r border-gray-200 ${isOpen ? 'w-64' : 'w-20'}`}>
            <div className="p-4 flex items-center h-16">
                {systemSettings?.company?.favicon && <img src={systemSettings?.company?.favicon} alt="Logo" className={`h-6 w-6 ${isOpen ? 'hidden' : ''}`} />}
                <span
                    onClick={() => navigate("/admin/dashboard")}
                    className={`text-xl font-bold ml-2 text-gray-950 transition-opacity duration-200 whitespace-nowrap cursor-pointer ${isOpen ? 'opacity-100' : 'opacity-0'}`}>
                    {systemSettings?.company?.siteLogo && <img src={systemSettings?.company?.siteLogo} alt="Logo" className="w-32" />}
                </span>
            </div>
            <nav className="flex-1 px-3 py-2 overflow-y-auto">
                {filteredNavItems.map((item, index) => {
                    switch (item.type) {
                        case 'header':
                            return <p key={index}
                                className={`${index > 0 ? 'mt-4 pt-2' : ''} mb-1 text-xs font-semibold text-gray-400 uppercase ${index > 0 ? 'border-t border-gray-200': ''} tracking-wider transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'hidden'}`}>{item.title}</p>;
                        case 'link':
                            return <NavItem key={item.to} to={item.to} icon={item.icon} title={item.title}
                                isSidebarOpen={isOpen} />;
                        case 'collapsible':
                            return <CollapsibleNavItem key={item.id} item={item} isSidebarOpen={isOpen}
                                openMenus={openMenus} activePath={activePath}
                                onToggle={handleToggle} level={1} />;
                        default:
                            return null;
                    }
                })}
            </nav>
            <BottomBar/>
        </aside>
    );
};

export default Sidebar;
