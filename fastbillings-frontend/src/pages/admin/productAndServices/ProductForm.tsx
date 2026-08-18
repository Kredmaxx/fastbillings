import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Constants from '../../../constants/api';
import { toast } from "sonner";
import { Upload, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../store';
import SubmitButton from '@components/admin/SubmitButton';
import { useDebounce } from '@hooks/useDebounce';
import SmartDropdown from '@components/admin/SmartDropdown';
import CreateCategoryModal from './CreateCategoryModal';
import CreateBrandModal from './CreateBrandModal';
import CreateUnitModal from './CreateUnitModal';
import CreateTaxGroupModal from './CreateTaxGroupModal';
import CurrencySelect from '@components/admin/CurrencySelect';
import { useCurrencies } from '@hooks/useCurrencies';

interface OptionType {
    id: string;
    name: string;
}
// For the main product data object (used in props)
interface IProduct {
    id: string;
    item_type: 'Product' | 'Service';
    name: string;
    code: string;
    category?: { id: string };
    brand?: { id: string };
    unit?: { id: string; unit_name?: string; short_name?: string };
    secondaryUnit?: { id: string; unit_name?: string; short_name?: string } | null;
    secondaryUnitId?: string | null;
    secondaryToPrimaryQty?: number | string | null;
    billingUnit?: 'PRIMARY' | 'SECONDARY' | string;
    selling_price: number;
    purchase_price: number;
    discount_type: 'Fixed' | 'Percentage';
    discount_value: number;
    taxGroup?: { id: string };
    barcode: string;
    alert_quantity: number;
    description: string;
    product_image?: string;
    gallery_images?: string[];
    valuationMethod?: 'WAC' | 'FIFO';
    trackingMode?: 'NONE' | 'BATCH' | 'SERIAL';
    currencyCode?: string;
}

// For the component's props
interface ProductFormProps {
    productData?: IProduct;
}

// For the form's state
interface IFormData {
    item_type: 'Product' | 'Service';
    name: string;
    code: string;
    category: string;
    brand: string;
    unit: string;
    secondaryUnit: string;
    secondaryToPrimaryQty: string | number;
    billingUnit: 'PRIMARY' | 'SECONDARY';
    selling_price: string | number;
    purchase_price: string | number;
    discount_type: 'Fixed' | 'Percentage';
    discount_value: number;
    tax: string;
    barcode: string;
    alert_quantity: string | number;
    description: string;
    hsnSac: string;
    gstSupplyType: 'TAXABLE' | 'NIL_RATED' | 'EXEMPT' | 'NON_GST';
    images_to_remove?: string[];
    productImageUrl?: string;
    valuationMethod: 'WAC' | 'FIFO';
    trackingMode: 'NONE' | 'BATCH' | 'SERIAL';
    currencyCode: string;
}

// For form validation errors
type FormErrors = Partial<Record<keyof IFormData | 'product_image', string>>;


// --- Component ---

export default function ProductForm({ productData }: ProductFormProps) {
    const navigate = useNavigate();
    const { token } = useSelector((state: RootState) => state.auth);
    const isEditMode = Boolean(productData);
    const { defaultCurrencyCode } = useCurrencies();

    const [formData, setFormData] = useState<IFormData>({
        item_type: 'Product',
        name: '',
        code: '',
        category: '',
        brand: '',
        unit: '',
        secondaryUnit: '',
        secondaryToPrimaryQty: '',
        billingUnit: 'PRIMARY',
        selling_price: '',
        purchase_price: '',
        discount_type: 'Fixed',
        discount_value: 0,
        tax: '',
        barcode: '',
        alert_quantity: 0,
        description: '',
        hsnSac: '',
        gstSupplyType: 'TAXABLE',
        valuationMethod: 'WAC',
        trackingMode: 'NONE',
        currencyCode: defaultCurrencyCode,
    });

    const [productImage, setProductImage] = useState<File | null>(null);
    const [productImagePreview, setProductImagePreview] = useState<string>('');
    const [galleryImages, setGalleryImages] = useState<File[]>([]);
    const [galleryImagePreviews, setGalleryImagePreviews] = useState<string[]>([]);
    const [formErrors, setFormErrors] = useState<FormErrors>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Dynamic data states
    const [categories, setCategories] = useState<OptionType[]>([]);
    const [brands, setBrands] = useState<OptionType[]>([]);
    const [units, setUnits] = useState<OptionType[]>([]);
    const [taxes, setTaxes] = useState<OptionType[]>([]);
    const [categorySearchInput, setCategorySearchInput] = useState<string>('');
    const debouncedCategorySearch = useDebounce(categorySearchInput, 500);
    const [brandSearchInput, setBrandSearchInput] = useState<string>('');
    const debouncedBrandSearch = useDebounce(brandSearchInput, 500);
    const [unitSearchInput, setUnitSearchInput] = useState<string>('');
    const debouncedUnitSearch = useDebounce(unitSearchInput, 500);
    const [secondaryUnitSearchInput, setSecondaryUnitSearchInput] = useState<string>('');
    const [taxSearchInput, setTaxSearchInput] = useState<string>('');
    const debouncedTaxSearch = useDebounce(taxSearchInput, 500);
    const [isCategoryCreateModalOpen, setIsCategoryCreateModalOpen] = useState(false);
    const [isCreateBrandModalOpen, setIsCreateBrandModalOpen] = useState(false);
    const [isCreateUnitModalOpen, setIsCreateUnitModalOpen] = useState(false);
    const [isCreateTaxModalOpen, setIsCreateTaxModalOpen] = useState(false);
    useEffect(() => {
        const fetchCategoriesByQuery = async () => {
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
    }, [debouncedCategorySearch]);

    useEffect(() => {
        const fetchBrandsByQuery = async () => {
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
    }, [debouncedBrandSearch]);

    useEffect(() => {
        const fetchUnitsByQuery = async () => {
            const headers = { 'Authorization': `Bearer ${token}` };
            try {
                const response = await axios.get(`${Constants.FETCH_PRODUCT_UNITS_URL}?search=${debouncedUnitSearch}`, { headers });
                const formattedUnits = response.data.data.map((unit: any) => ({
                    id: unit.id,
                    name: unit.unitName
                }));
                setUnits(formattedUnits);
            } catch (error) {
                console.error("Failed to fetch units:", error);
                toast.error("Failed to load required data for the form.");
            }
        }
        fetchUnitsByQuery();
    }, [debouncedUnitSearch]);

    useEffect(() => {
        const fetchTaxesByQuery = async () => {
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
    }, [debouncedTaxSearch]);

    // Sync defaultCurrencyCode into the form once it resolves (create mode only)
    useEffect(() => {
        if (!isEditMode && defaultCurrencyCode) {
            setFormData(prev => ({
                ...prev,
                currencyCode: prev.currencyCode || defaultCurrencyCode,
            }));
        }
    }, [defaultCurrencyCode, isEditMode]);

    // Populate form if in edit mode
    useEffect(() => {
        if (isEditMode && productData) {
            setFormData({
                item_type: productData.item_type || 'Product',
                name: productData.name || '',
                code: productData.code || '',
                category: productData.category?.id || '',
                brand: productData.brand?.id || '',
                unit: productData.unit?.id || '',
                secondaryUnit: productData.secondaryUnit?.id || productData.secondaryUnitId || '',
                secondaryToPrimaryQty: productData.secondaryToPrimaryQty ?? '',
                billingUnit: productData.billingUnit === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY',
                selling_price: productData.selling_price || '',
                purchase_price: productData.purchase_price || '',
                discount_type: productData.discount_type || 'Fixed',
                discount_value: productData.discount_value || 0,
                tax: productData.taxGroup?.id || '',
                barcode: productData.barcode || '',
                alert_quantity: productData.alert_quantity || 0,
                description: productData.description || '',
                hsnSac: (productData as { hsnSac?: string | null }).hsnSac || '',
                gstSupplyType:
                    ((productData as { gstSupplyType?: string }).gstSupplyType as IFormData['gstSupplyType']) ||
                    'TAXABLE',
                images_to_remove: [],
                valuationMethod: productData.valuationMethod || 'WAC',
                trackingMode: productData.trackingMode || 'NONE',
                currencyCode: productData.currencyCode || defaultCurrencyCode,
            });
            if (productData.product_image) {
                let _baseUrl = Constants.BASE_URL;
                if (_baseUrl.endsWith('/')) {
                    _baseUrl = _baseUrl.slice(0, -1);
                }
                setProductImagePreview(_baseUrl + productData.product_image);
            }
            if (productData.gallery_images) {
                // Avoid mutating the prop directly. Create a new array.
                let _baseUrl = Constants.BASE_URL;
                //remove last slash if present
                if (_baseUrl.endsWith('/')) {
                    _baseUrl = _baseUrl.slice(0, -1);
                }
                const fullImageUrls = productData.gallery_images.map(image => _baseUrl + image);
                setGalleryImagePreviews(fullImageUrls);
            }
            setUnits((prev) => {
                const extra: OptionType[] = [];
                if (productData.unit?.id) {
                    extra.push({
                        id: productData.unit.id,
                        name: productData.unit.unit_name || productData.unit.short_name || '',
                    });
                }
                if (productData.secondaryUnit?.id) {
                    extra.push({
                        id: productData.secondaryUnit.id,
                        name: productData.secondaryUnit.unit_name || productData.secondaryUnit.short_name || '',
                    });
                }
                const map = new Map(prev.map((u) => [u.id, u]));
                extra.forEach((u) => {
                    if (u.id && !map.has(u.id)) map.set(u.id, u);
                });
                return [...map.values()];
            });
        }
    }, [isEditMode, productData]);


    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            // When switching to Service, zero out inventory-related fields so they
            // don't accidentally get submitted with stale numbers.
            if (name === 'item_type' && value === 'Service') {
                next.alert_quantity = '0';
                next.secondaryUnit = '';
                next.secondaryToPrimaryQty = '';
                next.billingUnit = 'PRIMARY';
            }
            return next;
        });
    };

    const handleProductImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setProductImage(file);
            setProductImagePreview(URL.createObjectURL(file));
        }
    };

    const handleGalleryImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            setGalleryImages(prev => [...prev, ...files]);
            const newPreviews = files.map(file => URL.createObjectURL(file));
            setGalleryImagePreviews(prev => [...prev, ...newPreviews]);
        }
    };

    const removeGalleryImage = (indexToRemove: number) => {
        const imagePathToRemove = galleryImagePreviews[indexToRemove];
        setGalleryImages(prev => prev.filter((_, i) => i !== indexToRemove));
        setGalleryImagePreviews(prev => prev.filter((_, i) => i !== indexToRemove));
        setFormData(prev => ({
            ...prev,
            images_to_remove: [...(prev.images_to_remove || []), imagePathToRemove]
        }));
    };

    const generateProductCode = () => {
        let code = generateRandomCode();
        setFormData(prev => ({ ...prev, code: code }));
    }
    const generateBarcode = () => {
        let barcode = generateRandomBarcode();
        setFormData(prev => ({ ...prev, barcode: barcode }));
    }
    const generateRandomCode = (): string => {
        return `PROD-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
    };

    const generateRandomBarcode = (): string => {
        return Math.random().toString().slice(2, 15);
    };


    const prefillAutoGeneratedFields = () => {
        let updated = { ...formData };

        if (!updated.code) {
            updated.code = generateRandomCode();
        }
        if (!updated.barcode) {
            updated.barcode = generateRandomBarcode();
        }
        if (!updated.alert_quantity) {
            updated.alert_quantity = 0;
        }
        if (!updated.discount_value) {
            updated.discount_value = 0;
        }

        setFormData(updated);
        return updated;
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormErrors({});

        const filledData = prefillAutoGeneratedFields();

        const submissionData = new FormData();
        Object.keys(filledData).forEach(key => {
            const formKey = key as keyof IFormData;
            const value = filledData[formKey];
            if (value !== undefined && value !== null) {
                submissionData.append(formKey, Array.isArray(value) ? JSON.stringify(value) : String(value));
            }
        });

        if (productImage) {
            submissionData.append('product_image', productImage);
        }

        galleryImages.forEach(file => {
            submissionData.append('gallery_images', file);
        });

        submissionData.set('description', filledData.name);
        try {
            setIsSubmitting(true);
            const config = { headers: { 'Authorization': `Bearer ${token}` } };
            if (isEditMode) {
                await axios.put(`${Constants.UPDATE_PRODUCT_URL}/${productData?.id}`, submissionData, config);
                toast.success("Product updated successfully!");
            } else {
                await axios.post(Constants.CREATE_PRODUCT_URL, submissionData, config);
                toast.success("Product created successfully!");
            }
            navigate('/admin/products');
        } catch (error: any) {
            if (error.response && error.response.status === 422) {
                setFormErrors(error.response.data.errors);
            } else {
                console.error("Submission failed:", error);
                toast.error(error.response?.data?.message || "An unexpected error occurred.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-4 bg-white">
                {/* --- Product Image --- */}
                <div>
                    <label className="block text-sm font-medium text-red-500 mb-2">Product Image *</label>
                    <div className="mt-1 flex items-center space-x-6">
                        <div className="w-24 h-24 border-2 border-dashed border-gray-200 rounded-md flex items-center justify-center bg-gray-50">
                            {productImagePreview ? (
                                <img src={productImagePreview} alt="Preview" className="w-full h-full object-cover rounded-md" />
                            ) : (
                                <Upload className="text-gray-400 w-8 h-8" />
                            )}
                        </div>
                        <div>
                            <label className="cursor-pointer bg-purple-600 text-white px-4 py-2 text-sm rounded-md hover:bg-gray-950">
                                <span>Upload Image</span>
                                <input type="file" className="hidden" onChange={handleProductImageChange} accept="image/png, image/jpeg, image/webp" />
                            </label>
                            <p className="text-xs text-gray-500 mt-2">JPG, PNG or WEBP format, not exceeding 5MB.</p>
                        </div>
                    </div>
                    {formErrors.product_image && <p className="text-red-500 text-xs mt-1">{formErrors.product_image}</p>}
                </div>

                {/* --- Item Type --- */}
                <div>
                    <label className="block text-sm font-medium text-red-500">Item Type *</label>
                    <div className="mt-2 flex items-center space-x-4">
                        <label className="flex items-center cursor-pointer">
                            <input type="radio" name="item_type" value="Product" checked={formData.item_type === 'Product'} onChange={handleInputChange} className="h-4 w-4 text-purple-600 border-gray-200 focus:ring-purple-600" />
                            <span className="ml-2 text-sm text-gray-700">Product</span>
                        </label>
                        <label className="flex items-center cursor-pointer">
                            <input type="radio" name="item_type" value="Service" checked={formData.item_type === 'Service'} onChange={handleInputChange} className="h-4 w-4 text-purple-600 border-gray-200 focus:ring-purple-600" />
                            <span className="ml-2 text-sm text-gray-700">Service</span>
                        </label>
                    </div>
                    {formErrors.item_type && <p className="text-red-500 text-xs mt-1">{formErrors.item_type}</p>}
                </div>


                {/* --- Form Grid --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 ">
                    {/* Name */}
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium text-red-500">Name *</label>
                        <input type="text" name="name" id="name" value={formData.name} onChange={handleInputChange} className="mt-1 block text-gray-700 p-2 w-full border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600" />
                        {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                    </div>

                    {/* Code */}
                    <div>
                        <label htmlFor="code" className="block text-sm font-medium text-gray-600">Code </label>
                        <div className="mt-1 flex">
                            <input type="text" name="code" id="code" value={formData.code} onChange={handleInputChange} className="flex-grow block text-gray-700 p-2 w-full border border-gray-200 rounded-l-md focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600" />
                            <button type="button" onClick={generateProductCode} className="px-3 py-2 bg-gray-200 text-gray-700 border border-l-0 border-gray-200 rounded-r-md hover:bg-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600">Generate</button>
                        </div>
                        {formErrors.code && <p className="text-red-500 text-xs mt-1">{formErrors.code}</p>}
                    </div>

                    {/* Category */}
                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-red-500">Category *</label>
                        <SmartDropdown
                            items={categories}
                            value={categorySearchInput}
                            onChange={(value) => setCategorySearchInput(value)}
                            onSelect={(selected) => setFormData(prev => ({ ...prev, category: (selected?.id || '') as string }))}
                            placeholder="Type to search category..."
                            selectedItem={categories.find(cat => cat.id === formData.category) || null}
                            onAddNew={() => { setIsCategoryCreateModalOpen(true) }}
                            addNewLabel='New Category'
                        />
                        {formErrors.category && <p className="text-red-500 text-xs mt-1">{formErrors.category}</p>}
                    </div>

                    {/* Brand */}
                    <div>
                        <label htmlFor="brand" className="block text-sm font-medium text-red-500">Brand *</label>
                        <SmartDropdown
                            items={brands}
                            value={brandSearchInput}
                            onChange={(value) => setBrandSearchInput(value)}
                            onSelect={(selected) => setFormData(prev => ({ ...prev, brand: (selected?.id || '') as string }))}
                            placeholder="Type to search brand..."
                            selectedItem={brands.find(brand => brand.id === formData.brand) || null}
                            onAddNew={() => { setIsCreateBrandModalOpen(true) }}
                            addNewLabel='New Brand'
                        />
                        {formErrors.brand && <p className="text-red-500 text-xs mt-1">{formErrors.brand}</p>}
                    </div>

                    {/* Selling Price */}
                    <div>
                        <label htmlFor="selling_price" className="block text-sm font-medium text-red-500">
                            Selling Price{formData.billingUnit === 'SECONDARY' && formData.secondaryUnit ? ` (per ${units.find((u) => u.id === formData.secondaryUnit)?.name || 'secondary unit'})` : ''} *
                        </label>
                        <input type="number" name="selling_price" id="selling_price" value={formData.selling_price} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 border border-gray-200 rounded-md " />
                        {formErrors.selling_price && <p className="text-red-500 text-xs mt-1">{formErrors.selling_price}</p>}
                    </div>

                    {/* Purchase Price */}
                    <div>
                        <label htmlFor="purchase_price" className="block text-sm font-medium text-red-500">Purchase Price *</label>
                        <input type="number" name="purchase_price" id="purchase_price" value={formData.purchase_price} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 border border-gray-200 rounded-md " />
                        {formErrors.purchase_price && <p className="text-red-500 text-xs mt-1">{formErrors.purchase_price}</p>}
                    </div>

                    {/* Units */}
                    <div>
                        <label htmlFor="unit" className="block text-sm font-medium text-red-500">Units *</label>
                        <SmartDropdown
                            items={units}
                            value={unitSearchInput}
                            onChange={(value) => setUnitSearchInput(value)}
                            onSelect={(selected) => setFormData(prev => ({ ...prev, unit: (selected?.id || '') as string }))}
                            placeholder="Type to search unit..."
                            selectedItem={units.find(unit => unit.id === formData.unit) || null}
                            onAddNew={() => { setIsCreateUnitModalOpen(true) }}
                            addNewLabel='New Unit'
                        />
                        {formErrors.unit && <p className="text-red-500 text-xs mt-1">{formErrors.unit}</p>}
                    </div>

                    {formData.item_type !== 'Service' && (
                        <>
                            <div>
                                <label htmlFor="secondaryUnit" className="block text-sm font-medium text-gray-600">Secondary unit</label>
                                <SmartDropdown
                                    items={units.filter((u) => u.id !== formData.unit)}
                                    value={secondaryUnitSearchInput}
                                    onChange={(value) => setSecondaryUnitSearchInput(value)}
                                    onSelect={(selected) => setFormData((prev) => ({
                                        ...prev,
                                        secondaryUnit: (selected?.id || '') as string,
                                        billingUnit: selected?.id ? prev.billingUnit : 'PRIMARY',
                                    }))}
                                    placeholder="Optional — e.g. BOX, KG"
                                    selectedItem={units.find((unit) => unit.id === formData.secondaryUnit) || null}
                                    onAddNew={() => { setIsCreateUnitModalOpen(true) }}
                                    addNewLabel='New Unit'
                                />
                                <p className="text-xs text-gray-400 mt-1">Stock stays in the primary unit. Use this to bill in a bigger pack.</p>
                            </div>

                            {formData.secondaryUnit ? (
                                <>
                                    <div>
                                        <label htmlFor="secondaryToPrimaryQty" className="block text-sm font-medium text-red-500">
                                            1 {units.find((u) => u.id === formData.secondaryUnit)?.name || 'secondary'} = how many {units.find((u) => u.id === formData.unit)?.name || 'stock units'}? *
                                        </label>
                                        <input
                                            type="number"
                                            name="secondaryToPrimaryQty"
                                            id="secondaryToPrimaryQty"
                                            min="0"
                                            step="any"
                                            value={formData.secondaryToPrimaryQty}
                                            onChange={handleInputChange}
                                            className="mt-1 text-gray-700 p-2 block w-full focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 border border-gray-200 rounded-md "
                                        />
                                        {formErrors.secondaryToPrimaryQty && <p className="text-red-500 text-xs mt-1">{formErrors.secondaryToPrimaryQty}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="billingUnit" className="block text-sm font-medium text-gray-600">Default billing unit</label>
                                        <select
                                            name="billingUnit"
                                            id="billingUnit"
                                            value={formData.billingUnit}
                                            onChange={handleInputChange}
                                            className="mt-1 text-gray-700 p-2 block w-full border border-gray-200 rounded-md "
                                        >
                                            <option value="PRIMARY">{units.find((u) => u.id === formData.unit)?.name || 'Primary (stock)'}</option>
                                            <option value="SECONDARY">{units.find((u) => u.id === formData.secondaryUnit)?.name || 'Secondary'}</option>
                                        </select>
                                        <p className="text-xs text-gray-400 mt-1">Selling price is per this unit.</p>
                                    </div>
                                </>
                            ) : null}
                        </>
                    )}

                    {/* Discount Type */}
                    <div>
                        <label htmlFor="discount_type" className="block text-sm font-medium text-gray-600">Discount Type</label>
                        <select name="discount_type" id="discount_type" value={formData.discount_type} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block w-full border border-gray-200 rounded-md ">
                            <option value="Fixed">Fixed</option>
                            <option value="Percentage">Percentage</option>
                        </select>
                        {formErrors.discount_type && <p className="text-red-500 text-xs mt-1">{formErrors.discount_type}</p>}
                    </div>

                    {/* Discount Value */}
                    <div>
                        <label htmlFor="discount_value" className="block text-sm font-medium text-gray-500">Discount Value </label>
                        <input type="number" name="discount_value" id="discount_value" value={formData.discount_value} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 block w-full border border-gray-200 rounded-md " />
                        {formErrors.discount_value && <p className="text-red-500 text-xs mt-1">{formErrors.discount_value}</p>}
                    </div>

                    {/* Barcode */}
                    <div>
                        <label htmlFor="barcode" className="block text-sm font-medium text-gray-600">Barcode </label>
                        <div className="mt-1 flex">
                            <input type="text" name="barcode" id="barcode" value={formData.barcode} onChange={handleInputChange} className="flex-grow block text-gray-700 p-2 w-full focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 border border-gray-200 rounded-l-md " />
                            <button type="button" onClick={generateBarcode} className="px-3 py-2 bg-gray-200 text-gray-700 border border-l-0 border-gray-200 rounded-r-md hover:bg-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600">Generate</button>
                        </div>
                        {formErrors.barcode && <p className="text-red-500 text-xs mt-1">{formErrors.barcode}</p>}
                    </div>

                    {/* Alert Quantity — products only (Services are consumable, no inventory) */}
                    {formData.item_type === 'Product' && (
                        <div>
                            <label htmlFor="alert_quantity" className="block text-sm font-medium text-gray-600">Alert Quantity </label>
                            <input type="number" name="alert_quantity" id="alert_quantity" value={formData.alert_quantity} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 w-full border border-gray-200 rounded-md " />
                            {formErrors.alert_quantity && <p className="text-red-500 text-xs mt-1">{formErrors.alert_quantity}</p>}
                        </div>
                    )}

                    <div>
                        <label htmlFor="hsnSac" className="block text-sm font-medium text-gray-600">HSN / SAC</label>
                        <input
                            type="text"
                            name="hsnSac"
                            id="hsnSac"
                            value={formData.hsnSac}
                            onChange={handleInputChange}
                            className="mt-1 text-gray-700 p-2 block w-full border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600"
                            placeholder="e.g. 8471"
                        />
                    </div>

                    <div>
                        <label htmlFor="gstSupplyType" className="block text-sm font-medium text-gray-600">
                            GST supply type
                        </label>
                        <select
                            name="gstSupplyType"
                            id="gstSupplyType"
                            value={formData.gstSupplyType}
                            onChange={handleInputChange}
                            className="mt-1 text-gray-700 p-2 block w-full border border-gray-200 rounded-md"
                        >
                            <option value="TAXABLE">Taxable</option>
                            <option value="NIL_RATED">Nil-rated</option>
                            <option value="EXEMPT">Exempt</option>
                            <option value="NON_GST">Non-GST</option>
                        </select>
                        {formData.gstSupplyType !== 'TAXABLE' && (
                            <p className="text-xs text-amber-700 mt-1">
                                No output GST on this product — invoice lines clear tax automatically.
                            </p>
                        )}
                    </div>

                    {/* Tax */}
                    <div>
                        <label htmlFor="tax" className="block text-sm font-medium text-red-500">Tax *</label>
                        <SmartDropdown
                            items={taxes}
                            value={taxSearchInput}
                            onChange={(value) => setTaxSearchInput(value)}
                            onSelect={(selected) => setFormData(prev => ({ ...prev, tax: (selected?.id || '') as string }))}
                            placeholder="Type to search tax..."
                            selectedItem={taxes.find(tax => tax.id === formData.tax) || null}
                            onAddNew={() => { setIsCreateTaxModalOpen(true) }}
                            addNewLabel='New Tax Group'
                        />
                        {formErrors.tax && <p className="text-red-500 text-xs mt-1">{formErrors.tax}</p>}
                    </div>

                    {/* Valuation Method */}
                    <div>
                        <label htmlFor="valuationMethod" className="block text-sm font-medium text-gray-600">Valuation Method</label>
                        <select
                            name="valuationMethod"
                            id="valuationMethod"
                            value={formData.valuationMethod}
                            onChange={handleInputChange}
                            className="mt-1 text-gray-700 p-2 block w-full border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                        >
                            <option value="WAC">WAC (Weighted Average Cost)</option>
                            <option value="FIFO">FIFO (First In, First Out)</option>
                        </select>
                    </div>

                    {/* Batch / serial tracking */}
                    <div>
                        <label htmlFor="trackingMode" className="block text-sm font-medium text-gray-600">Stock tracking</label>
                        <select
                            name="trackingMode"
                            id="trackingMode"
                            value={formData.trackingMode}
                            onChange={handleInputChange}
                            className="mt-1 text-gray-700 p-2 block w-full border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                        >
                            <option value="NONE">None (quantity only)</option>
                            <option value="BATCH">Batch / lot</option>
                            <option value="SERIAL">Serial number</option>
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                            Batch auto-lots on purchase and FEFO on invoice; serials auto-pick oldest available unless provided on the line.
                        </p>
                    </div>

                    {/* Currency */}
                    <div>
                        <CurrencySelect
                            label="Currency"
                            value={formData.currencyCode}
                            onChange={(code) => setFormData(prev => ({ ...prev, currencyCode: code }))}
                        />
                    </div>

                </div>

                {/* --- Description --- */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-gray-700">Product Description </label>
                    <textarea name="description" id="description" rows={2} value={formData.description} onChange={handleInputChange} className="mt-1 text-gray-700 p-2 block focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600 w-full border border-gray-200 rounded-md "></textarea>
                </div>

                {/* --- Gallery Images --- */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Gallery Images</label>
                    <div className="mt-1 flex items-center space-x-4">
                        <label className="cursor-pointer bg-gray-50 text-gray-500 flex flex-col items-center justify-center w-full h-20 border-2 border-dashed border-gray-200 rounded-md hover:bg-gray-100">
                            <Upload />
                            <span>Browse Images</span>
                            <p className="text-xs text-gray-400 mt-1">Supported formats: PNG, JPEG, WEBP</p>
                            <input type="file" className="hidden" onChange={handleGalleryImagesChange} accept="image/png, image/jpeg, image/webp" multiple />
                        </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-4">
                        {galleryImagePreviews.map((preview, index) => (
                            <div key={index} className="relative w-24 h-24">
                                <img src={preview} alt="Gallery preview" className="w-full h-full object-cover rounded-md" />
                                <button type="button" onClick={() => removeGalleryImage(index)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 leading-none">
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>

                {/* --- Action Buttons --- */}
                <div className="flex justify-end space-x-4 pt-6 ">
                    <button type="button" onClick={() => navigate('/products')} className="px-6 py-2 border rounded-md text-gray-700 hover:bg-gray-50">Cancel</button>
                    <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode={isEditMode ? 'edit' : 'create'} />
                </div>
            </form>

            {/* Category Create Modal */}
            <CreateCategoryModal
                isOpen={isCategoryCreateModalOpen}
                onClose={() => setIsCategoryCreateModalOpen(false)}
                onSuccess={() => setIsCategoryCreateModalOpen(false)}
            />

            {/* Create Brand Modal */}
            <CreateBrandModal
                isOpen={isCreateBrandModalOpen}
                onClose={() => setIsCreateBrandModalOpen(false)}
                onSuccess={() => setIsCreateBrandModalOpen(false)}
            />

            {/* Create Unit Modal */}
            <CreateUnitModal
                isOpen={isCreateUnitModalOpen}
                onClose={() => setIsCreateUnitModalOpen(false)}
                onSuccess={() => setIsCreateUnitModalOpen(false)}
            />

            {/* Create Tax Group Modal */}
            <CreateTaxGroupModal
                isOpen={isCreateTaxModalOpen}
                onClose={() => setIsCreateTaxModalOpen(false)}
                onSuccess={() => setIsCreateTaxModalOpen(false)}
            />
        </>
    );
}