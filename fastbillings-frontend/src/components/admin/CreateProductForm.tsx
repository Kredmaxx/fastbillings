import Modal from "@components/admin/Modal";
import Constants from "@constants/api";
import type { Product, ProductFormData } from "@models/product";
import type { RootState } from "@store/index";
import axios from "axios";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";
import SubmitButton from "./SubmitButton";
import placeHolderImage from '@assets/images/default-placeholder-image.png';
import { useDebounce } from "@hooks/useDebounce";
import SmartDropdown from "./SmartDropdown";
import type { OptionType } from "@models/common";
import Switch from "./Switch";
import CurrencySelect from "./CurrencySelect";
import { useCurrencies } from "@hooks/useCurrencies";

interface Props { //return new product data onSuccess
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newProduct: Product) => void;
}

const initialFormData: ProductFormData = {
    item_type: 'Product',
    name: '',
    code: '',
    category: '',
    brand: '',
    unit: '',
    selling_price: '',
    purchase_price: '',
    discount_type: 'Fixed',
    discount_value: 0,
    tax: '',
    barcode: '',
    alert_quantity: 0,
    description: '',
    enable_inventory: false,
    stock: 0
}
const CreateProductForm: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const { defaultCurrencyCode } = useCurrencies();
    const setInitialFormData = () => {
        const newFormData = { ...initialFormData, currencyCode: defaultCurrencyCode };
        newFormData.code = generateProductCode();
        newFormData.barcode = generateRandomBarcode();
        setFormData(newFormData);
    }
    const { token } = useSelector((state: RootState) => state.auth);
    const [formData, setFormData] = useState<ProductFormData>(initialFormData);
    const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});
    const [categories, setCategories] = useState<OptionType[]>([]);
    const [brands, setBrands] = useState<OptionType[]>([]);
    const [units, setUnits] = useState<OptionType[]>([]);
    const [taxes, setTaxes] = useState<OptionType[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [categorySearchInput, setCategorySearchInput] = useState<string>('');
    const debouncedCategorySearch = useDebounce(categorySearchInput, 500);
    const [brandSearchInput, setBrandSearchInput] = useState<string>('');
    const debouncedBrandSearch = useDebounce(brandSearchInput, 500);
    const [unitSearchInput, setUnitSearchInput] = useState<string>('');
    const debouncedUnitSearch = useDebounce(unitSearchInput, 500);
    const [taxSearchInput, setTaxSearchInput] = useState<string>('');
    const debouncedTaxSearch = useDebounce(taxSearchInput, 500);

    useEffect(() => {
        if (isOpen) {
            setInitialFormData();
        }
    }, [isOpen]);
    const generateProductCode = () => {
        const newCode = `PROD-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
        return newCode;
    }

    const generateRandomBarcode = () => {
        const newBarcode = Math.random().toString().slice(2, 15);
        return newBarcode;
    }

    useEffect(() => {
        const fetchCategoriesByQuery = async () => {
            if (!isOpen) return;
            const headers = { 'Authorization': `Bearer ${token}` };
            try {
                const response = await axios.get(`${Constants.FETCH_PRODUCT_CATEGORIES_URL}?search=${debouncedCategorySearch}`, { headers });
                const formattedCategories = response.data.data.map((category: any) => ({
                    id: category.id,
                    name: category.categoryName
                }));
                setCategories(formattedCategories);
            } catch (error) {
                console.error("Failed to fetch categories:", error);
                toast.error("Failed to load required data for the form.");
            }
        }
        fetchCategoriesByQuery();
    }, [debouncedCategorySearch, isOpen]);

    useEffect(() => {
        const fetchBrandsByQuery = async () => {
            if (!isOpen) return;
            const headers = { 'Authorization': `Bearer ${token}` };
            try {
                const response = await axios.get(`${Constants.FETCH_PRODUCT_BRANDS_URL}?search=${debouncedBrandSearch}`, { headers });
                const formattedBrands = response.data.data.map((brand: any) => ({
                    id: brand.id,
                    name: brand.brandName
                }));
                setBrands(formattedBrands);
            } catch (error) {
                console.error("Failed to fetch brands:", error);
                toast.error("Failed to load required data for the form.");
            }
        }
        fetchBrandsByQuery();
    }, [debouncedBrandSearch, isOpen]);

    useEffect(() => {
        const fetchUnitsByQuery = async () => {
            if (!isOpen) return;
            const headers = { 'Authorization': `Bearer ${token}` };
            try {
                const response = await axios.get(`${Constants.FETCH_PRODUCT_UNITS_URL}?search=${debouncedUnitSearch}`, { headers });
                const formattedUnits = response.data.data.map((unit: any) => ({
                    id: unit.id,
                    name: unit.shortName
                }));
                setUnits(formattedUnits);
            } catch (error) {
                console.error("Failed to fetch units:", error);
                toast.error("Failed to load required data for the form.");
            }
        }
        fetchUnitsByQuery();
    }, [debouncedUnitSearch, isOpen]);

    useEffect(() => {
        const fetchTaxesByQuery = async () => {
            if (!isOpen) return;
            const headers = { 'Authorization': `Bearer ${token}` };
            try {
                const response = await axios.get(`${Constants.FETCH_PRODUCT_TAXES_URL}?search=${debouncedTaxSearch}`, { headers });
                const formattedTaxes = response.data.data.map((tax: any) => ({
                    id: tax.id,
                    name: tax.taxGroupName
                }));
                setTaxes(formattedTaxes);
            } catch (error) {
                console.error("Failed to fetch taxes:", error);
                toast.error("Failed to load required data for the form.");
            }
        }
        fetchTaxesByQuery();
    }, [debouncedTaxSearch, isOpen]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, type, value } = e.target;
        const finalValue = type === 'number' ? (value === '' ? '' : Number(value)) : value;
        setFormData(prev => ({ ...prev, [name]: finalValue }));
        setFormErrors(prev => ({ ...prev, [name]: '' }));
    };

    const validateForm = () => {
        const newErrors: { [key: string]: string } = {};
        if (!formData.name) {
            newErrors.name = 'Name is required';
        } else if (formData.name.length < 3 || formData.name.length > 50) {
            newErrors.name = 'Name must be between 3 and 50 characters';
        }
        if (!formData.category) newErrors.category = 'Category is required';
        if (!formData.brand) newErrors.brand = 'Brand is required';
        if (!formData.unit) newErrors.unit = 'Unit is required';
        if (!formData.selling_price) newErrors.selling_price = 'Selling price is required';
        if (!formData.purchase_price) newErrors.purchase_price = 'Purchase price is required';
        //selling price must be greater than purchase price
        if (formData.selling_price <= formData.purchase_price) newErrors.selling_price = 'Selling price must be greater than purchase price';
        if (!formData.tax) newErrors.tax = 'Tax is required';
        if (formData.enable_inventory && formData.stock <= 0) newErrors.stock = 'Stock must be greater than 0';
        setFormErrors(newErrors);
        return newErrors && Object.keys(newErrors).length === 0;
    }
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!validateForm()) return;
        try {
            setIsSubmitting(true);
            const payloadFormData = new FormData();
            Object.entries(formData).forEach(([key, value]) => {
                if (key === 'description') return;
                payloadFormData.append(key, value);
            });
            // fetch placeholder image as blob
            const imgResponse = await axios.get(placeHolderImage, { responseType: 'blob' });
            payloadFormData.append('product_image', imgResponse.data, 'placeholder.png');
            //override description
            payloadFormData.append('description', formData.name);
            const response = await axios.post(Constants.CREATE_PRODUCT_URL, payloadFormData, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            toast.success("Product created successfully!");
            onSuccess(response.data.data || {});
        } catch (error: any) {
            if (error.response && error.response.status === 422) {
                setFormErrors(error.response.data.errors);
            } else {
                toast.error(error.response?.data?.message || "An unexpected error occurred.");
            }
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title="Create Product" size="3xl">
                <form onSubmit={handleSubmit}>
                    <div>
                        <label className="block text-sm font-medium text-red-500">Item Type <em className="text-red-500">*</em></label>
                        <div className="mt-2 flex items-center space-x-6">
                            <label htmlFor="product" className="flex items-center cursor-pointer">
                                <input type="radio" id="product" name="item_type" value="Product" checked={formData.item_type === 'Product'} onChange={handleInputChange} className="h-4 w-4 text-purple-600 border-gray-300 focus:ring-purple-600" />
                                <span className="ml-2 text-sm text-gray-700">Product</span>
                            </label>
                            <label htmlFor="service" className="flex items-center cursor-pointer">
                                <input type="radio" id="service" name="item_type" value="Service" checked={formData.item_type === 'Service'} onChange={handleInputChange} className="h-4 w-4 text-purple-600 border-gray-300 focus:ring-purple-600" />
                                <span className="ml-2 text-sm text-gray-700">Service</span>
                            </label>
                        </div>
                        {formErrors.item_type && <p className="text-red-500 text-xs mt-1">{formErrors.item_type}</p>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                        {/* Name */}
                        <div>
                            <label htmlFor="name" className="block text-sm font-medium text-red-500">Name *</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} className="mt-1 block text-gray-700 p-2 w-full border border-gray-300 rounded-md " />
                            {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                        </div>

                        <div>
                            <label htmlFor="category" className="block text-sm font-medium text-red-500">Category *</label>
                            <SmartDropdown
                                items={categories}
                                value={categorySearchInput}
                                onChange={setCategorySearchInput}
                                onSelect={(selected) => setFormData(prev => ({ ...prev, category: (selected?.id || '') as string }))}
                                placeholder="Type to search category..."
                                selectedItem={categories.find(cat => cat.id === formData.category) || null}
                            />
                            {formErrors.category && <p className="text-red-500 text-xs mt-1">{formErrors.category}</p>}
                        </div>

                        <div>
                            <label htmlFor="brand" className="block text-sm font-medium text-red-500">Brand *</label>
                            <SmartDropdown
                                items={brands}
                                value={brandSearchInput}
                                onChange={(value) => setBrandSearchInput(value)}
                                onSelect={(selected) => setFormData(prev => ({ ...prev, brand: (selected?.id || '') as string }))}
                                placeholder="Type to search brand..."
                                selectedItem={brands.find(brand => brand.id === formData.brand) || null}
                            />
                            {formErrors.brand && <p className="text-red-500 text-xs mt-1">{formErrors.brand}</p>}
                        </div>

                        <div>
                            <label htmlFor="selling_price" className="block text-sm font-medium text-red-500">Selling Price *</label>
                            <input type="number" name="selling_price" id="selling_price" value={formData.selling_price} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full border border-gray-300 rounded-md " />
                            {formErrors.selling_price && <p className="text-red-500 text-xs mt-1">{formErrors.selling_price}</p>}
                        </div>

                        <div>
                            <label htmlFor="purchase_price" className="block text-sm font-medium text-red-500">Purchase Price *</label>
                            <input type="number" name="purchase_price" id="purchase_price" value={formData.purchase_price} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full border border-gray-300 rounded-md " />
                            {formErrors.purchase_price && <p className="text-red-500 text-xs mt-1">{formErrors.purchase_price}</p>}
                        </div>

                        <div>
                            <label htmlFor="unit" className="block text-sm font-medium text-red-500">Unit *</label>
                            <SmartDropdown
                                items={units}
                                value={unitSearchInput}
                                onChange={(value) => setUnitSearchInput(value)}
                                onSelect={(selected) => setFormData(prev => ({ ...prev, unit: (selected?.id || '') as string }))}
                                placeholder="Type to search unit..."
                                selectedItem={units.find(unit => unit.id === formData.unit) || null}
                            />
                            {formErrors.unit && <p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>}
                        </div>

                        <div>
                            <label htmlFor="discount_type" className="block text-sm font-medium text-gray-700">Discount Type</label>
                            <select name="discount_type" id="discount_type" value={formData.discount_type} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full border border-gray-300 rounded-md ">
                                <option value="Fixed">Fixed</option>
                                <option value="Percentage">Percentage</option>
                            </select>
                            {formErrors.discount_type && <p className="text-red-500 text-xs mt-1">{formErrors.discount_type}</p>}
                        </div>

                        <div>
                            <label htmlFor="discount_value" className="block text-sm font-medium text-gray-700">Discount Value</label>
                            <input type="number" name="discount_value" id="discount_value" value={formData.discount_value} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full border border-gray-300 rounded-md " />
                            {formErrors.discount_value && <p className="text-red-500 text-xs mt-1">{formErrors.discount_value}</p>}
                        </div>

                        <div>
                            <label htmlFor="tax" className="block text-sm font-medium text-red-500">Tax *</label>
                            <SmartDropdown
                                items={taxes}
                                value={taxSearchInput}
                                onChange={(value) => setTaxSearchInput(value)}
                                onSelect={(selected) => setFormData(prev => ({ ...prev, tax: (selected?.id || '') as string }))}
                                placeholder="Type to search tax..."
                                selectedItem={taxes.find(tax => tax.id === formData.tax) || null}
                            />
                            {formErrors.tax && <p className="text-red-500 text-xs mt-1">{formErrors.tax}</p>}
                        </div>
                        <div className="flex items-center">
                            <Switch name="enable_inventory" checked={formData.enable_inventory} onChange={(e) => setFormData(prev => ({ ...prev, enable_inventory: e.target.checked }))} />
                            <label htmlFor="enable_inventory" className="ml-2 text-sm font-medium text-gray-700 cursor-pointer">Add Stocks</label>
                        </div>
                        <div>
                            <label htmlFor="stock" className="block text-sm font-medium text-gray-700">Stock Qty</label>
                            <input type="number" name="stock" id="stock" value={formData.stock} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full border border-gray-300 rounded-md " />
                            {formErrors.stock && <p className="text-red-500 text-xs mt-1">{formErrors.stock}</p>}
                        </div>

                        <div>
                            <CurrencySelect
                                label="Currency"
                                value={formData.currencyCode || defaultCurrencyCode}
                                onChange={(code) => setFormData(prev => ({ ...prev, currencyCode: code }))}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end space-x-4 pt-6">
                        <button type="button" onClick={onClose} className="px-6 py-2 border rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                        <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode='create' />
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default CreateProductForm;