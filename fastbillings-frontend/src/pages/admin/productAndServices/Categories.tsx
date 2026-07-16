import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { FC, ChangeEvent, FormEvent } from "react";
import Constants from "../../../constants/api";
import axios, { AxiosError } from "axios";
import Table from "../../../components/admin/Table";
import PaginationWrapper from "../../../components/admin/PaginationWrapper";
import { Upload, Edit, Trash2Icon, CirclePlusIcon } from "lucide-react";
import { toast } from "sonner";
import Modal from "../../../components/admin/Modal";
import { useSelector } from "react-redux";
import type { RootState } from "../../../store";
import TableRow from "@components/admin/TableRow";
import type { PermissionAction } from "@models/permissions";
import { hasPermission } from "@utils/hasPermission";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import ProfileCard from "@components/admin/ProfileImage";
import SubmitButton from "@components/admin/SubmitButton";

// Interface for the Category data object
interface Category {
    id: string;
    category_name: string;
    slug: string;
    status: boolean;
    categoryImageUrl: string;
}

// Interface for the form state, including a potential file upload
interface CategoryFormState extends Omit<Partial<Category>, 'status'> {
    status?: boolean;
    category_image?: File | null;
}

// Interface for pagination data from the API
interface CategoryPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// Define a type for the form errors state
type FormErrors = {
    [key: string]: string;
};

const CategoryList: FC = () => {
    // Hooks and State
    const { token } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [searchParams, setSearchParams] = useSearchParams();

    // Component State
    const [categories, setCategories] = useState<Category[]>([]);
    const [pagination, setPagination] = useState<CategoryPagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [category, setCategory] = useState<CategoryFormState>({});
    const [showModal, setShowModal] = useState<boolean>(false);
    const [isEditMode, setIsEditMode] = useState<boolean>(false);
    const [formErrors, setFormErrors] = useState<FormErrors>({});

    // Dropdown and Delete Modal State
    const [isDeleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
    const [itemToDelete, setItemToDelete] = useState<Category | null>(null);

    // Get params from URL
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);
    // Fetch categories based on search and pagination params
    const fetchCategories = async (search?: string, limit?: number, page?: number) => {
        try {
            setIsLoading(true);
            const response = await axios.get(Constants.FETCH_CATEGORY_LIST_URL, {
                params: { search, limit, page },
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setCategories(response.data.data.categories || []);
            setPagination(response.data.data.pagination);
        } catch (error) {
            console.error("Error fetching categories:", error);
            toast.error("Failed to fetch categories.");
        } finally {
            setIsLoading(false);
        }
    };

    // Effect to fetch data when URL params change
    useEffect(() => {
        fetchCategories(search, limit, page);
    }, [search, limit, page]);

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

    // CRUD Operations
    const updateStatus = async (categoryItem: Category) => {
        try {
            const updatedCategory = { ...categoryItem, status: !categoryItem.status };
            await axios.put(`${Constants.UPDATE_CATEGORY_URL}/${categoryItem.id}`, updatedCategory, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success('Status updated successfully');
            fetchCategories(search, limit, page); // Refetch current page
        } catch (error) {
            console.error('Failed to update status:', error);
            toast.error('Failed to update status.');
        }
    };

    const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.size <= 5 * 1024 * 1024) {
            setCategory({
                ...category,
                category_image: file,
                categoryImageUrl: URL.createObjectURL(file),
            });
        } else if (file) {
            toast.error("Please upload a JPG or PNG image under 5MB.");
        }
    };

    const handleEditClick = async (categoryItem: Category) => {
        try {
            const response = await axios.get<Category>(`${Constants.GET_CATEGORY_URL}/${categoryItem.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setCategory(response.data);
            setIsEditMode(true);
            setFormErrors({});
            setShowModal(true);
        } catch (error) {
            console.error('Failed to load category:', error);
            toast.error('Failed to load category data.');
        }
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setFormErrors({});

        const formData = new FormData();
        formData.append("category_name", category.category_name ?? "");
        formData.append("slug", category.slug ?? "");
        formData.append("status", String(category.status ?? true));
        if (category.category_image) {
            formData.append("category_image", category.category_image);
        }

        const url = isEditMode
            ? `${Constants.UPDATE_CATEGORY_URL}/${category.id}`
            : Constants.CREATE_CATEGORY_URL;
        const method = isEditMode ? 'put' : 'post';

        try {
            setIsSubmitting(true);
            await axios[method](url, formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            toast.success(`Category ${isEditMode ? 'updated' : 'added'} successfully`);
            setShowModal(false);
            fetchCategories(search, limit, page); // Refetch current page
        } catch (error) {
            const axiosError = error as AxiosError;
            const data = axiosError.response?.data as { errors?: FormErrors };
            if (data?.errors) {
                setFormErrors(data.errors);
            } else {
                console.error("Error submitting form:", error);
                toast.error(`Failed to ${isEditMode ? 'update' : 'add'} category.`);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteClick = (categoryItem: Category) => {
        setItemToDelete(categoryItem);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_CATEGORY_URL}/${itemToDelete.id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Category deleted successfully');
            fetchCategories(search, limit, page); // Refetch current page
            setDeleteModalOpen(false);
            setItemToDelete(null);
        } catch (error) {
            console.error('Failed to delete category:', error);
            toast.error('Failed to delete category.');
        } finally {
            setIsDeleting(false);
        }
    };

    // Calculate display range for pagination
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    const tableHeader = ["#", "Category Name", "Slug", "Status", "Actions"];
    const restrictedActions = ['edit', 'delete'];
    const tableActions = [
        {
            label: 'Edit',
            icon: <Edit size={14} />,
            onClick: (item: Category) => { handleEditClick(item) }
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: (item: Category) => { handleDeleteClick(item) }
        }
    ];
    const allowedActions = tableActions.filter((action) => {
        const actionKey = action.label.toLowerCase() as PermissionAction;

        if (!restrictedActions.includes(actionKey)) {
            return true;
        }

        return hasPermission(permissions, 'product-services', actionKey);
    });
    if (allowedActions.length === 0) {
        tableHeader.pop();
    }
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-950 ">Categories</h1>
                {hasPermission(permissions, 'product-services', 'create') &&
                    <button
                        onClick={() => {
                            setShowModal(true);
                            setFormErrors({});
                            setCategory({ status: true });
                            setIsEditMode(false);
                        }}
                        className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                    >
                        <CirclePlusIcon size={14} /> New Category
                    </button>
                }
            </div>

            <div className="flex flex-col md:flex-row justify-between gap-4">
                <input
                    type="text"
                    placeholder="Search by category name..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-64  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
                <select
                    value={limit}
                    onChange={(e) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white  text-gray-950  focus:outline-none focus:ring-2 focus:ring-purple-600"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-950 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            <Table headers={tableHeader}>
                {!isLoading && categories && categories.map((categoryItem, index) => (
                    <TableRow
                        key={categoryItem.id}
                        row={categoryItem}
                        index={index + 1}
                        columns={[
                            <ProfileCard
                                imageUrl={categoryItem.categoryImageUrl}
                                name={categoryItem.category_name}
                                primary
                            />,
                            categoryItem.slug,
                            <label className="inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={categoryItem.status} onChange={() => updateStatus(categoryItem)} />
                                <div className="relative w-11 h-6 bg-gray-200 peer-checked:bg-purple-600 rounded-full peer-focus:ring-2 peer-focus:ring-purple-600">
                                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${categoryItem.status ? 'translate-x-full' : ''}`}></div>
                                </div>
                            </label>
                        ]}
                        actions={allowedActions.length > 0 ? allowedActions : undefined}
                    />
                ))}

                {!isLoading && categories.length === 0 &&
                    <tr>
                        <td colSpan={tableHeader.length} className="text-center py-4 font-semibold">No brands found.</td>
                    </tr>
                }

                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-2 text-gray-950  font-semibold" colSpan={7}>
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

            <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={isEditMode ? 'Edit Category' : 'Add New Category'}>
                {/* Form fields are identical to your provided code, just ensure they are within this modal */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Image Upload Section */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700  mb-1">Image <em className="text-red-500">*</em></label>
                        <div className="flex items-center space-x-4">
                            <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-md flex items-center justify-center bg-gray-50 ">
                                {category.categoryImageUrl ? (
                                    <img src={category.categoryImageUrl} alt="Preview" className="w-full h-full object-cover rounded" />
                                ) : (
                                    <Upload className="text-purple-600 w-6 h-6" />
                                )}
                            </div>
                            <div>
                                <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-gray-950">
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Image
                                    <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleImageChange} />
                                </label>
                                <p className="text-xs text-gray-500  mt-1">JPG, PNG. Max 5MB.</p>
                            </div>
                        </div>
                        {formErrors.category_image && <p className="text-red-500 text-xs mt-1">{formErrors.category_image}</p>}
                    </div>
                    {/* Name Input */}
                    <div>
                        <label htmlFor="category_name" className="block text-sm font-medium text-gray-700  mb-1">Name <span className="text-red-500">*</span></label>
                        <input id="category_name" type="text" value={category.category_name || ""} onChange={(e) => setCategory({ ...category, category_name: e.target.value })} placeholder="Enter Category Name" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600 focus:border-purple-600" />
                        {formErrors.category_name && <p className="text-red-500 text-xs mt-1">{formErrors.category_name}</p>}
                    </div>
                    {/* Slug Input */}
                    <div>
                        <label htmlFor="slug" className="block text-sm font-medium text-gray-700  mb-1">Slug <span className="text-red-500">*</span></label>
                        <input id="slug" type="text" value={category.slug || ""} onChange={(e) => setCategory({ ...category, slug: e.target.value })} placeholder="Enter Category Slug" className="w-full bg-white  text-gray-950  px-4 py-2 border border-gray-300  rounded-md text-sm focus:ring-purple-600 focus:border-purple-600" />
                        {formErrors.slug && <p className="text-red-500 text-xs mt-1">{formErrors.slug}</p>}
                    </div>
                    {/* Form Buttons */}
                    <div className="flex justify-end pt-2 space-x-2">
                        <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 text-gray-700   cursor-pointer">Cancel</button>
                        <SubmitButton isDisabled={isSubmitting} isLoading={isSubmitting} mode={isEditMode ? "edit" : "create"} />
                    </div>
                </form>
            </Modal>

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                title="Confirm Deletion"
                message="Are you sure you want to delete this category?"
                isDeleting={isDeleting}
            >
            </DeleteConfirmationModal>
        </div>
    );
};

export default CategoryList;