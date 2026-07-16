import type { FC } from 'react';
import ProductForm from "../../admin/productAndServices/ProductForm";

const AddProduct: FC = () => {
    return (
        <div className="p-4 bg-white border border-gray-200 rounded-lg ">
            <h1 className="text-2xl font-bold text-gray-950  mb-2">
                Add Product
            </h1>
            <ProductForm />
        </div>
    );
}

export default AddProduct;