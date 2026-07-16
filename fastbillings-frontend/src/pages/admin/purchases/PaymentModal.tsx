import type React from "react";
import { useState, useEffect } from "react";
import Modal from "@components/admin/Modal";
import { UploadCloud } from "lucide-react";
import SearchableDropdown from "@components/admin/SearchableDropdown";
import DateInput from "@components/admin/DateInput";

// Props for the modal component
interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (data: any) => void;
    totalAmount: number;
    paymentModes: IPaymentMode[]
}

interface IPaymentMode {
    id: string;
    name: string;
    slug: string;
}

// Data structure for the payment form
interface PaymentModalData {
    purchaseOrderId?: string;
    userId: string;
    billFrom: string;
    billTo: string;
    referenceNo: string;
    purchaseDate: Date | null;
    status: string;
    items: productItem[];
    notes: string;
    termsAndCondition: string;
    paymentMode: string;
    paymentModeSlug: string;
    checkNumber?: string;
    bank?: string | null;
    sign_type: 'none' | 'digitalSignature' | 'eSignature';
    signatureId: string | null;
    signatureName: string;
    esignDataUrl: string | null;
    subTotal: number | null;
    totalTax: number | null;
    totalDiscount: number | null;
    grandTotal: number | null;
    sp_referenceNumber?: string;
    sp_paymentDate?: Date | null;
    sp_paymentMode?: string;
    sp_amount?: number;
    sp_paid_amount?: number;
    sp_due_amount?: number;
    sp_notes?: string | null;
    sp_attachment?: File | null;
}

interface productItem {
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

const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, onConfirm, totalAmount, paymentModes }) => {
    // Initial state for the form, updated to include all fields
    const [data, setData] = useState<PaymentModalData>({
        sp_referenceNumber: '',
        sp_paymentDate: new Date(),
        sp_paymentMode: '',
        sp_amount: totalAmount || 0,
        sp_paid_amount: 0,
        sp_due_amount: 0,
        sp_notes: '',
        sp_attachment: null,
    } as PaymentModalData);

    const [paymentFormErrors, setPaymentFormErrors] = useState<{ [key: string]: string }>({});
    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === 'sp_paid_amount') {
            setData(prevData => ({
                ...prevData,
                sp_paid_amount: Number(value),
                sp_due_amount: (prevData.sp_amount ?? 0) - Number(value),
            }));
        } else {
            setData(prevData => ({
                ...prevData,
                [name]: value,
            }));
        }

    };

    // A specific handler for the file input
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setData(prevData => ({
                ...prevData,
                sp_attachment: file,
            }));
        }
    };

    const validatePaymentForm = () => {
        const errors: { [key: string]: string } = {};

        if (!data.sp_paymentDate) {
            errors.sp_paymentDate = 'Payment Date is required.';
        }
        if (!data.sp_paymentMode) {
            errors.sp_paymentMode = 'Payment Mode is required.';
        }
        if (!data.sp_amount) {
            errors.sp_amount = 'Amount is required.';
        }
        if (!data.sp_paid_amount) {
            errors.sp_paid_amount = 'Paid Amount is required.';
        }
        if ((data.sp_paid_amount ?? 0) > (data.sp_amount ?? 0)) {
            errors.sp_paid_amount = 'Paid Amount cannot be greater than Total Amount.';
        } else if ((data.sp_paid_amount ?? 0) < 1) {
            errors.sp_paid_amount = 'Paid Amount cannot be less than 1.';
        }
        //allow max file size of 5MB
        if (data.sp_attachment && data.sp_attachment.size > 5 * 1024 * 1024) {
            errors.sp_attachment = 'File size must be less than 5MB.';
        }
        setPaymentFormErrors(errors);
        return Object.keys(errors).length === 0;
    }
    // Handler for form submission
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validatePaymentForm()) return;
        onConfirm(data);
    };

    // Reset form when the modal is closed
    useEffect(() => {
        if (!isOpen) {
            setData({
                sp_referenceNumber: '',
                sp_paymentDate: null,
                sp_paymentMode: '',
                sp_amount: totalAmount || 0,
                sp_paid_amount: 0,
                sp_due_amount: 0,
                sp_notes: '',
                sp_attachment: null
            } as PaymentModalData);
            setPaymentFormErrors({});
        }
    }, [isOpen, totalAmount]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add New Payment">
            <form onSubmit={handleSubmit} className="p-1">

                {/* --- Main Form Fields Grid --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Reference Number */}
                    <div>
                        <label htmlFor="sp_referenceNumber" className="block text-sm font-medium text-gray-700  pb-1">Reference Number</label>
                        <input type="text" id="sp_referenceNumber" name="sp_referenceNumber" value={data.sp_referenceNumber} onChange={handleChange}
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {paymentFormErrors.sp_referenceNumber && <span className="text-red-500 text-sm">{paymentFormErrors.sp_referenceNumber}</span>}
                    </div>

                    {/* Payment Date */}
                    <div>
                        <DateInput
                            label="Order Date"
                            value={data.sp_paymentDate || null}
                            onChange={(newDate) => setData(prevData => ({ ...prevData, sp_paymentDate: newDate || null }))}
                            isRequired
                        />
                        {paymentFormErrors.sp_paymentDate && <span className="text-red-500 text-sm">{paymentFormErrors.sp_paymentDate}</span>}
                    </div>

                    {/* Payment Mode */}
                    <div>
                        <SearchableDropdown
                            label="Payment Mode"
                            options={paymentModes}
                            value={paymentModes.find(option => option.id === data.sp_paymentMode) || null}
                            onChange={(_, selectedOption) =>
                                setData(prevData => ({
                                    ...prevData,
                                    sp_paymentMode: selectedOption?.id || ''
                                }))
                            }
                            placeholder="Select Payment Mode"
                            required
                        />

                        {paymentFormErrors.sp_paymentMode && <span className="text-red-500 text-sm">{paymentFormErrors.sp_paymentMode}</span>}
                    </div>

                    {/* Amount */}
                    <div>
                        <label htmlFor="sp_amount" className="block text-sm font-medium text-gray-700  pb-1">Amount <span className="text-red-500">*</span></label>
                        <input type="number" id="sp_amount" name="sp_amount" value={data.sp_amount} onChange={handleChange} readOnly
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600" />
                        {paymentFormErrors.sp_amount && <span className="text-red-500 text-sm">{paymentFormErrors.sp_amount}</span>}
                    </div>

                    {/* Paid Amount */}
                    <div>
                        <label htmlFor="sp_paid_amount" className="block text-sm font-medium text-gray-700  pb-1">Paid Amount <span className="text-red-500">*</span></label>
                        <input type="number" id="sp_paid_amount" name="sp_paid_amount" value={data.sp_paid_amount} onChange={handleChange}
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                        />
                        {paymentFormErrors.sp_paid_amount && <span className="text-red-500 text-sm">{paymentFormErrors.sp_paid_amount}</span>}
                    </div>

                    {/* Due Amount */}
                    <div>
                        <label htmlFor="sp_due_amount" className="block text-sm font-medium text-gray-700  pb-1">Due Amount <span className="text-red-500">*</span></label>
                        <input type="number" id="sp_due_amount" name="sp_due_amount" value={data.sp_due_amount}
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"
                            readOnly />
                        {paymentFormErrors.sp_due_amount && <span className="text-red-500 text-sm">{paymentFormErrors.sp_due_amount}</span>}
                    </div>

                    {/* Notes */}
                    <div className="md:col-span-3">
                        <label htmlFor="sp_notes" className="block text-sm font-medium text-gray-700 ">Notes</label>
                        <textarea id="sp_notes" name="sp_notes" value={data.sp_notes || ''} onChange={handleChange} rows={2}
                            className="border border-gray-300 rounded-md px-4 py-2 w-full  text-gray-950  focus:outline-none focus:ring-1 focus:ring-purple-600"></textarea>
                    </div>

                    {/* Attachment */}
                    <div className="md:col-span-3">
                        <label className="block text-sm font-medium text-gray-700 ">Attachment</label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300  border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                <UploadCloud className="mx-auto h-12 w-12 text-gray-400" />
                                <div className="flex text-sm text-gray-600 ">
                                    <label htmlFor="sp_attachment" className="relative cursor-pointer bg-white  rounded-md font-medium text-purple-600 hover:text-purple-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-purple-600">
                                        <span className="font-bold">Browse your files</span>
                                        <input id="sp_attachment" name="sp_attachment" type="file" className="sr-only" onChange={handleFileChange} />
                                    </label>
                                </div>
                                <p className="text-xs text-gray-500 ">Maximum size : 5 MB</p>
                            </div>
                        </div>
                        {data.sp_attachment && <p className="mt-2 text-sm text-gray-500 ">Selected file: {data.sp_attachment.name}</p>}
                        {paymentFormErrors.sp_attachment && <span className="text-red-500 text-sm">{paymentFormErrors.sp_attachment}</span>}
                    </div>
                </div>

                {/* --- Form Actions --- */}
                <div className="flex justify-between items-center px-6 pb-6 pt-4">
                    <button type="button" onClick={() => { onClose(), setPaymentFormErrors({}) }}
                        className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700  hover:bg-gray-50  focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 cursor-pointer">
                        Cancel
                    </button>
                    <button type="submit"
                        className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-gray-950 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-600 cursor-pointer">
                        Create
                    </button>
                </div>

            </form>
        </Modal>
    );
};

export default PaymentModal;