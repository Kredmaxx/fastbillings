import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { Edit, PlusCircle, Trash2 } from "lucide-react";
import { useDebounce } from "@hooks/useDebounce";
import type { RootState } from "@store/index";
import Constants from "@constants/api";

interface ProductItem {
    id: string;
    name: string;
    unit: string;
    qty: number;
    rate: number;
    discount: number;
    tax: number;
    amount: number;
    tax_group_id?: string;
    discount_type?: 'Fixed' | 'Percentage';
    discount_value?: number;
}
interface Product {
    id: string;
    item_type: string;
    name: string;
    code: string;
    unit: { id: string; name: string } | null;
    prices: { selling: number; purchase: number };
    discount: { type: "Fixed" | "Percentage"; value: number } | null;
    tax: { group_id: string; group_name: string; total_rate: number } | null;
}

interface InvoiceTableRowProps {
    item: ProductItem;
    currencySymbol: string;
    currencyCode?: string;
    onEditItem: (item: ProductItem) => void;
    onDeleteItem: (item: ProductItem) => void;
    availableItems: ProductItem[];
    onInLineItemChange: (updatedItem: ProductItem) => void;
    addNewProduct: () => void;
}

const InvoiceTableRow: React.FC<InvoiceTableRowProps> = ({
    item,
    currencySymbol,
    currencyCode,
    onEditItem,
    onDeleteItem,
    availableItems,
    onInLineItemChange,
    addNewProduct,
}) => {
    const { token } = useSelector((state: RootState) => state.auth);
    const [searchInput, setSearchInput] = useState<string>(item.name || "");
    const debouncedSearchTerm = useDebounce(searchInput, 700);
    const [products, setProducts] = useState<Product[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const searchRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLUListElement>(null);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);

    // Hide dropdown when clicked outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        setSearchInput(item.name);
    }, [item.name]);

    // Fetch products by search
    useEffect(() => {
        const fetchProducts = async () => {
            // if (!debouncedSearchTerm) return;

            try {
                setIsLoadingProducts(true);
                const currencyParam = currencyCode
                    ? `&currencyCode=${encodeURIComponent(currencyCode)}`
                    : '';
                const response = await axios.get(
                    `${Constants.FETCH_PRODUCTS_WITH_SEARCH_URL}?search=${debouncedSearchTerm}${currencyParam}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const availableProducts = response.data.data.filter(
                    (p: Product) => availableItems.every((i: ProductItem) => i.id !== p.id)
                );
                setProducts(availableProducts);
            } catch (error) {
                console.error("Error fetching products:", error);
                setProducts([]);
            } finally {
                setIsLoadingProducts(false);
            }
        };
        fetchProducts();
    }, [debouncedSearchTerm, token, availableItems, currencyCode]);

    // Auto scroll active item
    useEffect(() => {
        if (activeIndex > -1 && dropdownRef.current) {
            const activeItem = dropdownRef.current.children[activeIndex] as HTMLLIElement;
            if (activeItem) {
                activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }
        }
    }, [activeIndex]);

    // Select product
    const handleProductSelect = (product: Product) => {
        setSearchInput(product.name);
        setShowDropdown(false);
        setActiveIndex(-1);

        const rate = product.prices?.selling ?? 0;
        const discount = product.discount?.value ?? 0;
        const tax = (rate * (product.tax?.total_rate ?? 0)) / 100;
        const amount = rate + tax - discount;

        onInLineItemChange({
            ...item,
            id: product.id,
            name: product.name,
            unit: product.unit?.name ?? "",
            qty: 1,
            rate,
            amount,
            discount,
            tax,
            tax_group_id: product.tax?.group_id,
            discount_type: product.discount?.type || "Fixed",
            discount_value: product.discount?.value,
        });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showDropdown || products.length === 0) return;
        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setActiveIndex((prev) => (prev < products.length - 1 ? prev + 1 : prev));
                break;
            case "ArrowUp":
                e.preventDefault();
                setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0));
                break;
            case "Enter":
                e.preventDefault();
                if (activeIndex > -1) handleProductSelect(products[activeIndex]);
                break;
            case "Escape":
                setShowDropdown(false);
                break;
        }
    };

    const handleManualChange = (key: keyof ProductItem, value: any) => {
        const updated = {
            ...item,
            [key]: value,
        };

        // Auto recalc total if qty or rate changed
        if (key === "qty" || key === "rate") {
            updated.amount = updated.qty * updated.rate;
        }

        onInLineItemChange(updated);
    };

    return (
        <tr className="bg-white text-gray-950 border-b border-gray-200">
            {/* Product Name Search/Manual */}
            <td className="p-3 font-medium">
                <div className="relative w-full" ref={searchRef}>
                    <input
                        type="text"
                        className="p-2 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-purple-200"
                        placeholder="Search or type product..."
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)} // only local state
                        onBlur={() => handleManualChange("name", searchInput)} // update parent on blur
                        onFocus={() => setShowDropdown(true)}
                        onKeyDown={handleKeyDown}
                    />

                    {showDropdown && (
                        <ul
                            ref={dropdownRef}
                            className="absolute top-full left-0 w-full bg-white border border-gray-200 z-10 max-h-48 overflow-auto rounded-md shadow-lg"
                        >
                            {isLoadingProducts ? (
                                <li className="p-3 text-center text-sm text-gray-500">Loading...</li>
                            ) : products.length > 0 ? (
                                products.map((p, index) => (
                                    <li
                                        key={p.id}
                                        className={`p-3 cursor-pointer hover:bg-purple-50 ${index === activeIndex ? "bg-purple-50" : ""
                                            }`}
                                        onMouseDown={() => handleProductSelect(p)}
                                    >
                                        <div className="font-medium text-gray-800">{p.name}</div>
                                        <div className="text-xs text-gray-500">
                                            Rate: {currencySymbol}
                                            {p.prices.selling.toFixed(2)}
                                        </div>
                                    </li>
                                ))
                            ) : (
                                <li className="p-3 text-center text-sm text-gray-500">
                                    No results for "{searchInput}"
                                </li>
                            )}

                            <li
                                className="p-3 border-t border-gray-200 cursor-pointer hover:bg-purple-50 text-purple-600 font-semibold flex items-center"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    addNewProduct();
                                }}
                            >
                                <PlusCircle size={16} className="mr-2" />
                                Add New Item
                            </li>
                        </ul>
                    )}
                </div>
            </td>

            {/* Unit */}
            <td className="p-3">
                <input
                    type="text"
                    className="w-20 p-2 border border-gray-200 rounded text-sm text-gray-700 focus:outline-none"
                    value={item.unit}
                    onChange={(e) => handleManualChange("unit", e.target.value)}
                />
            </td>

            {/* Quantity */}
            <td className="p-3">
                <input
                    type="number"
                    className="w-20 p-2 border border-gray-200 rounded text-sm text-gray-700 focus:outline-none"
                    min="1"
                    value={item.qty}
                    onChange={(e) => handleManualChange("qty", Number(e.target.value))}
                />
            </td>

            {/* Rate */}
            <td className="p-3">
                <input
                    type="number"
                    className="w-24 p-2 border border-gray-200 rounded text-sm text-gray-700 focus:outline-none"
                    value={item.rate}
                    onChange={(e) => handleManualChange("rate", Number(e.target.value))}
                />
            </td>

            <td className="text-md text-gray-700 text-center">
                {item.discount > 0 ? (
                    <span>{item.discount} </span>
                ) : (
                    <span>0</span>
                )}
            </td>

            <td className="text-md text-gray-700 text-center">
                {item.tax > 0 ? (
                    <span>{item.tax}</span>
                ) : (
                    <span>0</span>
                )}
            </td>


            {/* Amount */}
            <td className="p-3 font-semibold text-gray-800">
                {currencySymbol}
                {Number(item.amount ?? 0).toFixed(2)}
            </td>

            {/* Actions */}
            <td className="p-6 flex items-center gap-2">
                <button type="button" onClick={() => onEditItem(item)} aria-label="Edit item">
                    <Edit size={16} className="text-gray-600 hover:text-purple-600" />
                </button>
                <button
                    type="button"
                    onClick={() => onDeleteItem(item)}
                    aria-label="Remove item"
                >
                    <Trash2 size={16} className="text-red-500 hover:text-red-600" />
                </button>
            </td>
        </tr>
    );
};

export default InvoiceTableRow;
