import { LogOut, Plus, Settings, FileText, ShoppingCart, UserPlus, Truck } from "lucide-react";
import type React from "react";
import { logout } from "@store/auth/authSlice";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { useState, useRef, useEffect } from "react";

interface SidebarProps {
    isOpen: boolean;
}

const SecondarySidebar: React.FC<SidebarProps> = ({ isOpen }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const activePath = window.location.pathname;
    const lastSlug = activePath.split("/").pop();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    const actions = [
        { label: "New Invoice", icon: <FileText size={18} />, onClick: () => navigate("/admin/invoices/create-invoice") },
        { label: "New Purchase", icon: <ShoppingCart size={18} />, onClick: () => navigate("/admin/purchases/new") },
        { label: "New Customer", icon: <UserPlus size={18} />, onClick: () => navigate("/admin/customers/new") },
        { label: "New Supplier", icon: <Truck size={18} />, onClick: () => navigate("/admin/suppliers") },
    ];

    // close dropdown if clicked outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
        <div
            className={`relative flex flex-col items-center border-r border-gray-200 bg-gray-50 ${isOpen ? "w-16" : "hidden"
                }`}
        >
            {/* Top plus button */}
            <div className="relative mt-4" ref={dropdownRef}>
                <button
                    onClick={() => setDropdownOpen((prev) => !prev)}
                    className="flex items-center justify-center rounded-full bg-purple-600 w-10 h-10 hover:bg-purple-600 transition"
                >
                    <Plus className="text-white w-5 h-5" />
                </button>

                {dropdownOpen && (
                    <div className="absolute left-5 top-12 bg-white shadow-lg rounded-lg w-48 z-50">
                        {actions.map((action, idx) => (
                            <button
                                key={idx}
                                onClick={() => {
                                    action.onClick();
                                    setDropdownOpen(false);
                                }}
                                className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium text-gray-500 hover:bg-purple-50 hover:text-purple-600 transition"
                            >
                                {action.icon}
                                {action.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Spacer to push bottom content down */}
            <div className="flex-1" />

            {/* Bottom settings & logout */}
            <div className="flex flex-col items-center gap-6 mb-4">
                <Settings
                    onClick={() => navigate("/admin/settings/profile")}
                    className={`${lastSlug === "profile" ? "text-purple-600" : "text-gray-600"
                        } hover:text-purple-600 cursor-pointer w-6 h-6`}
                />
                <LogOut
                    onClick={() => dispatch(logout())}
                    className="text-gray-600 hover:text-purple-600 cursor-pointer w-6 h-6"
                />
            </div>
        </div>
    );
};

export default SecondarySidebar;
