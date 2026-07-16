import styled from 'styled-components';
import { numberToWords } from '@utils/converters';
import type { InvoiceData } from '@models/invoice';
import { useSelector } from 'react-redux';
import type { RootState } from '@store/index';
import { useCurrencies } from '@hooks/useCurrencies';
import useDateFormatter from '@hooks/useDateFormatter';
import { QRCodeSVG } from 'qrcode.react';
import { upiDeepLink } from '@/lib/upiDeepLink';
import { resolveCompanyLogo } from '@utils/brandLogo';

type InvoiceDetailsProps = {
    invoiceData: InvoiceData
}
const InvoiceTemplateB: React.FC<InvoiceDetailsProps> = ({ invoiceData }) => {
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const { formatMoney } = useCurrencies();
    const fmt = (amount: number) => formatMoney(amount, invoiceData?.currencyCode);
    const { formatDate } = useDateFormatter();
    const logoSrc = resolveCompanyLogo(systemSettings?.company?.siteLogo);
    const InvoiceWrapper = styled.div`
    p{
      font-size: 12px;
      font-weight: 500;
    }
  `;

    return (
        <InvoiceWrapper className="bg-white pl-12 pr-12 font-sans text-gray-950 max-w-5xl mx-auto my-4">

            {/* Header Section */}
            <header className="pb-2 border-b border-gray-200">
                {/* Row 1: Logo + Title */}
                <div className="flex justify-between items-center">
                    {logoSrc ? (
                        <img
                            src={logoSrc}
                            alt="Company Logo"
                            className="w-32 h-auto"
                        />
                    ) : (
                        <div className="flex h-12 w-32 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            Your Logo
                        </div>
                    )}
                    <h1 className="text-xl font-bold text-gray-950">TAX INVOICE</h1>
                </div>

                {/* Row 2: Original + Date/Invoice */}
                <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
                    <p className="text-xs">Original For Recipient</p>
                    <div className="flex items-center gap-4">
                        <p>Date: {formatDate(invoiceData?.invoiceDate, systemSettings?.dateFormat.format ?? 'DD-MM-YYYY')}</p>
                        <p>
                            Invoice No: {invoiceData?.invoiceNumber}
                        </p>
                    </div>
                </div>
            </header>

            {/* Company Details */}
            <section className="mt-2 border-b border-gray-200 pb-2">
                <div>
                    <h2 className="font-bold text-purple-600 mb-2">{systemSettings?.company.companyName}</h2>
                    <p className="text-sm text-gray-600">Address: {systemSettings?.company.address}</p>
                    <p className="text-sm text-gray-600">Mobile: {systemSettings?.company.phone}</p>
                </div>
            </section>

            {/* Billing Information Section */}
            <section className="flex justify-between mt-2">
                <div className="w-2/5">
                    <h2 className="font-bold text-purple-600 mb-2">Invoice To :</h2>
                    <p className="font-semibold capitalize">{invoiceData?.billTo.name}</p>
                    <p className="text-sm text-gray-600">{invoiceData?.billTo?.billingAddress?.addressLine1}</p>
                    <p className="text-sm text-gray-600">{invoiceData?.billTo?.billingAddress?.city}, {invoiceData?.billTo?.billingAddress?.state}, {invoiceData?.billTo?.billingAddress?.country}</p>
                    <p className="text-sm text-gray-600">{invoiceData?.billTo?.email}</p>
                    <p className="text-sm text-gray-600">{invoiceData?.billTo.phone}</p>
                </div>
                <div className="w-2/5">
                    <h2 className="font-bold text-purple-600 mb-2">Pay To :</h2>
                    <p className="font-semibold">{invoiceData?.billFrom.name}</p>
                    <p className="text-sm text-gray-600">{invoiceData?.billFrom.address}</p>
                    <p className="text-sm text-gray-600">{invoiceData?.billFrom.email}</p>
                    <p className="text-sm text-gray-600">{invoiceData?.billFrom.phone}</p>
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
                        {invoiceData && invoiceData.items.map((item, index) => (
                            <tr key={item.id ?? item.productId ?? index} className="border-b border-gray-200">
                                <td className="p-3">{index + 1}</td>
                                <td className="p-3 font-medium">{item.name ?? item.productName ?? '-'}</td>
                                <td className="p-3 text-right">{item.qty}</td>
                                <td className="p-3 text-right">{fmt(item.rate)}</td>
                                <td className="p-3 text-right">{fmt(item.discount)}</td>
                                <td className="p-3 text-right font-medium">{fmt(Number(item.amount ?? item.lineTotal ?? 0))}</td>
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
                        <span className='font-semibold'>{fmt(invoiceData?.taxableAmount || 0)}</span>
                    </div>
                    {(() => {
                        type TaxLineRow = { kind: string | null; percent: number; name: string; amount: number };
                        const breakdown: Record<string, number> = {};
                        for (const line of invoiceData?.items ?? []) {
                            const rawTaxes = (line as unknown as { taxes?: unknown }).taxes;
                            const taxes: TaxLineRow[] = Array.isArray(rawTaxes)
                                ? (rawTaxes as TaxLineRow[])
                                : [];
                            for (const t of taxes) {
                                const key = t.kind ? `${t.kind} ${t.percent}%` : t.name;
                                breakdown[key] = (breakdown[key] ?? 0) + Number(t.amount ?? 0);
                            }
                        }
                        const entries = Object.entries(breakdown);
                        if (entries.length === 0) {
                            return (
                                <div className="flex justify-between text-sm text-gray-600 py-2">
                                    <span className='font-bold'>Tax</span>
                                    <span className='font-semibold'>{fmt(invoiceData?.vat || 0)}</span>
                                </div>
                            );
                        }
                        return entries.map(([label, amount]) => (
                            <div key={label} className="flex justify-between text-sm text-gray-600 py-2">
                                <span className='font-bold'>{label}</span>
                                <span className='font-semibold'>{fmt(amount)}</span>
                            </div>
                        ));
                    })()}
                    <div className="flex justify-between text-sm text-gray-600 py-2">
                        <span className='font-bold'>Discount</span>
                        <span className='font-semibold'>{fmt(invoiceData?.totalDiscount || 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg py-3">
                        <span className='font-bold'>Total</span>
                        <span className='font-semibold'>{fmt(invoiceData?.TotalAmount || 0)}</span>
                    </div>
                </div>
            </section>

            {/* Amount in words and Summary */}
            <section className="mt-4 pt-2 border-t border-gray-200">
                <p className="text-sm text-gray-600">Total Items / Qty : {invoiceData?.items.length} / {invoiceData?.items.reduce((sum, item) => sum + item.qty, 0)}</p>
                <p className="text-sm mt-2">
                    <span className="font-semibold">Total amount ( in words) : </span>
                    {numberToWords(invoiceData?.TotalAmount || 0)}
                </p>
            </section>

            {/* Footer: Bank Details & Signature */}
            <footer className="mt-2 pt-2 flex justify-between border-t border-gray-200">
                <div>
                    <h3 className="font-semibold mb-2">Payment Info</h3>
                    <p className="text-sm text-gray-600">Payment Status : {invoiceData.status}</p>
                    <p className="text-sm text-gray-600">Amount : {fmt(invoiceData.TotalAmount)}</p>
                </div>
                {(invoiceData as unknown as { publicViewEnabled?: boolean })?.publicViewEnabled && (invoiceData as unknown as { publicViewToken?: string })?.publicViewToken && (
                    <div className="flex flex-col items-center mt-4">
                        <QRCodeSVG
                            value={`${
                                (invoiceData as unknown as { company?: { publicBaseUrl?: string | null } } | null)?.company?.publicBaseUrl?.replace(/\/$/, '')
                                    ?? (typeof window !== 'undefined' ? window.location.origin : '')
                            }/invoice/${(invoiceData as unknown as { publicViewToken: string }).publicViewToken}`}
                            size={96}
                        />
                        <p className="text-xs text-gray-500 mt-1">Scan to view online</p>
                    </div>
                )}
                {(() => {
                    const company = (invoiceData as unknown as { company?: { merchantUpiId?: string | null; merchantName?: string | null; companyName?: string } } | null)?.company;
                    const upi = company?.merchantUpiId;
                    const amount = Number((invoiceData as unknown as { TotalAmount?: string | number } | null)?.TotalAmount ?? 0);
                    if (!upi || amount <= 0) return null;
                    const link = upiDeepLink({
                        vpa: upi,
                        payeeName: company?.merchantName || company?.companyName || 'Merchant',
                        amount,
                        note: (invoiceData as unknown as { invoiceNumber?: string | null } | null)?.invoiceNumber ?? '',
                    });
                    return (
                        <div className="flex flex-col items-center mt-4">
                            <QRCodeSVG value={link} size={96} />
                            <p className="text-xs text-gray-500 mt-1">Scan to pay via UPI</p>
                        </div>
                    );
                })()}
                {invoiceData?.signature?.image && (
                    <div className="text-center">
                        <p className="text-sm mb-4">For {systemSettings?.company?.companyName || 'Company'}</p>
                        <img src={invoiceData.signature.image} alt="Signature" className="w-40 h-auto" />
                    </div>
                )}
            </footer>

            {/* Terms and Conditions */}
            <section className="mt-4">
                <h3 className="font-semibold mb-2">Terms & Conditions :</h3>
                <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1">
                    <li>{invoiceData?.termsAndCondition}</li>
                </ol>
            </section>

            <div className="mt-2 text-center text-sm text-gray-500">
                <p>Thanks for your Business</p>
            </div>

        </InvoiceWrapper>
    );
}

export default InvoiceTemplateB;