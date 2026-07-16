import { useEffect, useState } from "react";
import type { FC, ChangeEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Constants from "@constants/api";
import axios from "axios";
import Table from "@components/admin/Table";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import { CirclePlusIcon, Edit, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useSelector } from "react-redux";
import TableRow from "@components/admin/TableRow";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import type { PermissionAction } from "@models/permissions";
import { hasPermission } from "@utils/hasPermission";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import { useCurrencyFormatter } from "@hooks/useCurrencyFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import type { RootState } from "@store/index";
import Switch from "@components/admin/Switch";
import ProfileCard from "@components/admin/ProfileImage";

// Define interfaces for nested and main objects
interface Brand {
    id: string;
    brand_name: string;
}

interface Category {
    id: string;
    category_name: string;
}

interface Product {
    id: string;
    name: string;
    code: string;
    product_image: string;
    selling_price: number;
    status: boolean;
    brand: Brand | null;
    category: Category | null;
    item_type: 'Product' | 'Service';
    currencyCode?: string | null;
}

// Interface for pagination data from the API
interface ProductPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

const ProductList: FC = () => {
    // Hooks
    const navigate = useNavigate();
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [searchParams, setSearchParams] = useSearchParams();

    // State
    const [products, setProducts] = useState<Product[]>([]);
    const [pagination, setPagination] = useState<ProductPagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [itemToDelete, setItemToDelete] = useState<Product | null>(null);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
    const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'Product' | 'Service'>('all');

    // Get params from URL
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);
    const { locale } = useCurrencyFormatter();
    const { resolveCurrency } = useCurrencies();
    // Show each product's price in ITS OWN currency (not the global default).
    const formatProductPrice = (amount: number, code?: string | null) =>
        `${resolveCurrency(code).symbol}${Number(amount).toLocaleString(locale, { maximumFractionDigits: 2 })}`;
    // Fetch products based on URL params
    const fetchProducts = async (search?: string, limit?: number, page?: number) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.FETCH_PRODUCTS_URL, {
                params: {
                    search,
                    limit,
                    page,
                    ...(itemTypeFilter !== 'all' ? { item_type: itemTypeFilter } : {}),
                },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setProducts(response.data.data.products || []);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error("Error fetching products:", error);
            toast.error("Failed to fetch products.");
        } finally {
            setIsLoading(false);
        }
    };

    // Effect to fetch data when URL params change
    useEffect(() => {
        fetchProducts(search, limit, page);
    }, [search, limit, page, itemTypeFilter]);

    // Handlers for search and pagination controls
    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    const handleItemTypeFilterChange = (opt: 'all' | 'Product' | 'Service') => {
        setItemTypeFilter(opt);
        setSearchParams({ search, limit: String(limit), page: '1' });
    };

    // Action handlers
    const handleEditClick = (product: Product) => {
        navigate(`/admin/products/edit/${product.id}`);
    };

    const handleDeleteClick = (product: Product) => {
        setItemToDelete(product);
        setDeleteModalOpen(true);
    };

    const tableActions = [
        {
            label: 'Edit',
            icon: <Edit size={14} />,
            onClick: (item: Product) => { handleEditClick(item) }
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: (item: Product) => { handleDeleteClick(item) }
        }
    ]
    const tableHeaders = ["#", "Product", "Type", "Brand", "Category", "Price", "Status", "Actions"];
    const restrictedActions = ['edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        const actionKey = action.label.toLowerCase() as PermissionAction;

        if (!restrictedActions.includes(actionKey)) {
            return true;
        }

        return hasPermission(permissions, 'product-services', actionKey);
    });
    if (allowedActions.length === 0) {
        tableHeaders.pop();
    }

    const handleStausChange = async (id: string, status: boolean) => {
        const productToUpdate = products.find((product) => product.id === id);
        if (productToUpdate) {
            setProducts((prevProducts) => {
                return prevProducts.map((product) => {
                    if (product.id === id) {
                        return { ...product, status };
                    }
                    return product;
                });
            });
            try {
                setIsLoading(true);
                const productPayload = { ...productToUpdate, status };
                await axios.put(`${Constants.UPDATE_PRODUCT_URL}/${id}`, productPayload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                toast.success('Product status updated successfully');
            } catch (error) {
                console.error('Failed to update product status:', error);
                toast.error('Failed to update product status.');
            } finally {
                setIsLoading(false);
            }
        }
    }
    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_PRODUCT_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Product deleted successfully');
            fetchProducts(search, limit, page); // Refetch current page
            setDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Failed to delete product:', error);
            toast.error('Failed to delete product.');
        } finally {
            setIsDeleting(false);
        }
    };

    // Calculate display range for pagination text
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Products</h1>
                {hasPermission(permissions, 'product-services', 'create') &&
                    <button
                        onClick={() => navigate('/admin/products/new')}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                    >
                        <CirclePlusIcon size={14} /> New Product
                    </button>
                }
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-4">
                <input
                    type="text"
                    placeholder="Search by name, code, brand, category..."
                    value={search}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-1/3    focus:outline-none focus:ring-2 focus:ring-purple-600 text-gray-950"
                />
                <select
                    value={limit}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-950   focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                    {[10, 25, 50].map((num) => <option key={num} value={num}>{num} / page</option>)}
                </select>
            </div>
            <div className="flex items-center gap-2">
                {(['all', 'Product', 'Service'] as const).map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => handleItemTypeFilterChange(opt)}
                        className={
                            'px-3 py-1 text-sm rounded-full border cursor-pointer ' +
                            (itemTypeFilter === opt
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                        }
                    >
                        {opt === 'all' ? 'All' : opt + 's'}
                    </button>
                ))}
            </div>
            <Table headers={tableHeaders}>
                {!isLoading && products && products.map((product, index) => (
                    <TableRow
                        key={product.id}
                        index={index + 1}
                        row={product}
                        columns={[
                            <ProfileCard
                                imageUrl={product.product_image}
                                name={product.name ?? ""}
                                email={product.code ?? ""}
                            />,
                            <span className={
                                'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                                (product.item_type === 'Service'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-green-100 text-green-700')
                            }>
                                {product.item_type}
                            </span>,
                            <p className="capitalize">{product.brand?.brand_name || 'N/A'}</p>,
                            <p className="capitalize">{product.category?.category_name || 'N/A'}</p>,
                            formatProductPrice(product.selling_price, product.currencyCode),
                            <span onClick={(e) => e.stopPropagation()}><Switch name={`status-${product.id}`} checked={product.status} onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleStausChange(product.id, e.target.checked)} disabled={!hasPermission(permissions, 'product-services', 'edit')} /></span>,
                        ]}
                        actions={allowedActions.length > 0 ? allowedActions : undefined}
                        onRowClick={(item) => navigate(`/admin/products/edit/${item.id}`)}
                    />
                ))
                }
                {!isLoading && products.length === 0 && <tr><td colSpan={8} className="text-center py-4">No products found.</td></tr>}

                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-2 text-gray-950  font-semibold" colSpan={8}>
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>
            <PaginationWrapper
                count={pagination.totalPages}
                page={page}
                from={from}
                to={to}
                total={pagination.total}
                onChange={(_, newPage) => handlePageChange(newPage)}
                paginationVariant="outlined"
                paginationShape="rounded"
            />
            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Confirm Deletion"
                message="Are you sure you want to delete this product?"
                isDeleting={isDeleting}
            >
            </DeleteConfirmationModal>
        </div>
    );
};

export default ProductList;