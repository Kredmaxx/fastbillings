import { numberToWords } from '@utils/converters';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import { useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import Constants from '@constants/api';
import axios from 'axios';
import type { PurchaseShape } from '@models/purchase';
import useDateFormatter from '@hooks/useDateFormatter';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import { useCurrencies } from '@hooks/useCurrencies';
import { useReactToPrint } from 'react-to-print';

const OverviewPurchase: React.FC = () => {
    const { id: purchaseId } = useParams();
    const { token } = useSelector((state: RootState) => state.auth);
    const [purchaseData, setPurchaseData] = useState<PurchaseShape>();
    const { formatDate } = useDateFormatter();
    const { formatMoney } = useCurrencies();
    const [isLoading, setIsLoading] = useState(false);
    useEffect(() => {
        if (purchaseId) {
            fetchPurchase(purchaseId);
        }
    }, [purchaseId]);

    const fetchPurchase = async (purchaseId: string) => {
        try {
            setIsLoading(true);
            const response = await axios.get(`${Constants.GET_PURCHASE_DETAILS_URL}/${purchaseId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            setPurchaseData(response.data.data);
        } catch (error) {

        } finally {
            setIsLoading(false);
        }
    }
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const navigate = useNavigate();
    const componentRef = useRef<HTMLDivElement>(null);
    const handlePrint = useReactToPrint({
        contentRef: componentRef,
        documentTitle: "Invoice",
        pageStyle: `
            @page {
            size: auto;
            margin: 5mm 5mm 2mm 2mm;
            }
            @page:first {
              margin: 12mm;
            }
    
            .page-break {
            page-break-before: always;
            }
        `,
    });
    if (isLoading || !purchaseData) {
        return (
            <div className='flex items-center justify-center'>
                <div className='space-y-4'>
                    <LoaderSpinner />
                </div>
            </div>
        );
    }
    return (
        <>
            {/* Print Button */}
            <div className="flex justify-end font-sans text-gray-950 gap-2">
                <button
                    onClick={handlePrint}
                    className="bg-purple-600 hover:bg-gray-950 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                >
                    Print / Save as PDF
                </button>
                {/* Back Button */}
                <button
                    onClick={() => navigate("/admin/purchases")}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-950 px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2"
                >  Back
                </button>
            </div>
            <div className='space-y-2' ref={componentRef}>

                {/* Header Section */}
                <header className="pb-2 border-b border-gray-200">
                    {/* Row 1: Logo + Title */}
                    <div className="flex justify-between items-center">
                        <img
                            src={systemSettings?.company.siteLogo}
                            alt="Company Logo"
                            className="w-32 h-auto"
                        />
                        <h1 className="text-xl font-bold text-gray-950">PURCHASE</h1>
                    </div>

                    {/* Row 2: Original + Date/Invoice */}
                    <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
                        <p className="text-xs">Original For Recipient</p>
                        <div className="flex items-center gap-4">
                            <p>Date: {formatDate(purchaseData.createdAt, systemSettings?.dateFormat.format || 'd-m-Y')}</p>
                            <p>
                                Purchase No: {purchaseData?.purchaseId}
                            </p>
                        </div>
                    </div>
                </header>


                {/* Billing Information Section */}
                <section className="flex justify-between mt-2">
                    <div className="w-2/5">
                        <h2 className="font-bold text-violet-600 mb-2">Bill From :</h2>
                        <p className="font-semibold text-gray-950">{systemSettings?.company.companyName}</p>
                        <p className="text-sm text-gray-600">{systemSettings?.company.address}</p>
                        <p className="text-sm text-gray-600">{systemSettings?.company.phone}</p>
                        <p className="text-sm text-gray-600">{systemSettings?.company.pincode}</p>
                    </div>
                    <div className="w-2/5">
                        <h2 className="font-bold text-violet-600 mb-2">Bill To :</h2>
                        <p className="font-semibold text-gray-950">{purchaseData?.billTo.name}</p>
                        <p className="text-sm text-gray-600">{purchaseData.billTo.address}</p>
                        <p className="text-sm text-gray-600">{purchaseData?.billTo?.email}</p>
                        <p className="text-sm text-gray-600">{purchaseData?.billTo.phone}</p>
                    </div>
                    <div className="text-right">
                        <h2 className="font-bold text-violet-600 mb-2">{systemSettings?.company.companyName}</h2>
                        <p className="text-sm text-gray-600">Address: {systemSettings?.company.address}</p>
                        <p className="text-sm text-gray-600">Mobile: {systemSettings?.company.phone}</p>
                    </div>
                </section>

                {/* Items Table */}
                <section className="mt-4">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50">
                            <tr className="border-b border-gray-200">
                                <th className="p-3 text-sm font-semibold text-gray-600">#</th>
                                <th className="p-3 text-sm font-semibold text-gray-600">Item</th>
                                <th className="p-3 text-sm font-semibold text-gray-600 text-right">Qty</th>
                                <th className="p-3 text-sm font-semibold text-gray-600 text-right">Price</th>
                                <th className="p-3 text-sm font-semibold text-gray-600 text-right">Discount</th>
                                <th className="p-3 text-sm font-semibold text-gray-600 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {purchaseData && purchaseData.items.map((item, index) => (
                                <tr key={item.id} className="border-b border-gray-200 text-gray-600">
                                    <td className="p-3">{index + 1}</td>
                                    <td className="p-3 font-medium">{item.name}</td>
                                    <td className="p-3 text-right">{item.qty}</td>
                                    <td className="p-3 text-right">{formatMoney(item.rate, purchaseData?.currencyCode)}</td>
                                    <td className="p-3 text-right">{formatMoney(item.discount, purchaseData?.currencyCode)}</td>
                                    <td className="p-3 text-right font-medium">{formatMoney(item.amount, purchaseData?.currencyCode)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>

                {/* Totals Section */}
                <section className="flex justify-end mt-2">
                    <div className="w-full max-w-xs">
                        <div className="flex justify-between text-sm text-gray-600 py-2">
                            <span className='font-bold'>Sub Total</span>
                            <span className='font-semibold'>{formatMoney(purchaseData?.taxableAmount || 0, purchaseData?.currencyCode)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600 py-2">
                            <span className='font-bold'>Tax</span>
                            <span className='font-semibold'>{formatMoney(purchaseData.totalTax || 0, purchaseData?.currencyCode)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-600 py-2">
                            <span className='font-bold'>Discount</span>
                            <span className='font-semibold'>{formatMoney(purchaseData?.totalDiscount || 0, purchaseData?.currencyCode)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg py-3 text-gray-950">
                            <span className='font-bold'>Total</span>
                            <span className='font-semibold'>{formatMoney(purchaseData.totalAmount || 0, purchaseData?.currencyCode)}</span>
                        </div>
                    </div>
                </section>

                {/* Amount in words and Summary */}
                <section className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-sm text-gray-600">Total Items / Qty : {purchaseData?.items.length} / {purchaseData?.items.reduce((sum, item) => sum + item.qty, 0)}</p>
                    <p className="text-sm mt-2 text-gray-600">
                        <span className="font-semibold">Total amount ( in words) : </span>
                        {numberToWords(purchaseData?.totalAmount || 0)}
                    </p>
                </section>

                {/* Footer: Bank Details & Signature */}
                <footer className="mt-2 pt-2 flex justify-between border-t border-gray-200">
                    <div>
                        <h3 className="font-semibold mb-2 text-gray-950">Bank Details</h3>
                        <p className="text-sm text-gray-600">Bank : {purchaseData?.bank?.name}</p>
                        <p className="text-sm text-gray-600">Account # : {purchaseData?.bank?.accountNumber}</p>
                        <p className="text-sm text-gray-600">IFSC : {purchaseData?.bank?.ifscCode}</p>
                        <p className="text-sm text-gray-600">BRANCH : {purchaseData?.bank?.branchName}</p>
                    </div>
                    {purchaseData?.signature?.image && (
                        <div className="text-center text-gray-950 font-semibold">
                            <p className="text-sm mb-4">For {systemSettings?.company?.companyName || 'Company'}</p>
                            <img src={purchaseData.signature.image} alt="Signature" className="w-40 h-auto" />
                        </div>
                    )}
                </footer>

                {/* Terms and Conditions */}
                <section className="mt-2">
                    <h3 className="font-semibold mb-2">Terms & Conditions :</h3>
                    <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1">
                        <li>{purchaseData?.termsAndCondition}</li>
                    </ol>
                </section>

                <div className="mt-2 text-center text-sm text-gray-500">
                    <p>Thanks for your Business</p>
                </div>

            </div>
        </>
    );
}

export default OverviewPurchase;