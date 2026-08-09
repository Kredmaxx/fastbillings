export interface ProductFormData {
    item_type: 'Product' | 'Service';
    name: string;
    code: string;
    category: string;
    brand: string;
    unit: string;
    selling_price: string | number;
    purchase_price: string | number;
    discount_type: 'Fixed' | 'Percentage';
    discount_value: number;
    tax: string;
    barcode: string;
    alert_quantity: string | number;
    description: string;
    enable_inventory: boolean;
    stock: number;
    currencyCode?: string;
}

export interface Product {
    id: string;
    item_type: string;
    name: string;
    code: string;
    unit: { id: string; name: string; } | null;
    prices: { selling: number; purchase: number; };
    discount: { type: 'Fixed' | 'Percentage'; value: number; } | null;
    tax: { group_id: string; group_name: string; total_rate: number; } | null;
    quantity: number;
    rate: number;
    amount: number;
}

export interface ProductItem {
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
    hsnSac?: string | null;
    gstSupplyType?: 'TAXABLE' | 'NIL_RATED' | 'EXEMPT' | 'NON_GST';
    taxes?: unknown[];
    totalTax?: number;
    appliedTaxRateIds?: string[];
}