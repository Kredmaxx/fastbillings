import styled from "styled-components";
import { numberToWords } from "@utils/converters";
import type { InvoiceData } from "@models/invoice";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import useDateFormatter from "@hooks/useDateFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import { QRCodeSVG } from "qrcode.react";
import { upiDeepLink } from "@/lib/upiDeepLink";
import { resolveCompanyLogo } from "@utils/brandLogo";
import {
  aggregateGstTaxes,
  buyerGstin,
  getItemHsn,
  getItemTaxable,
  placeOfSupply,
  sellerGstin,
  stateCodeFromGstin,
  type LineWithTax,
} from "./gstInvoiceUtils";

type Props = { invoiceData: InvoiceData };

const Wrapper = styled.div`
  p {
    font-size: 12px;
    font-weight: 500;
  }
`;

/** Classic India GST tax invoice — HSN, place of supply, CGST/SGST/IGST. */
const InvoiceTemplateGstClassic: React.FC<Props> = ({ invoiceData }) => {
  const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
  const { formatDate } = useDateFormatter();
  const { formatMoney } = useCurrencies();
  const fmt = (n: number) => formatMoney(n, invoiceData?.currencyCode);
  const logoSrc = resolveCompanyLogo(systemSettings?.company?.siteLogo);
  const company = systemSettings?.company as
    | (typeof systemSettings.company & { gstin?: string | null; state?: string; city?: string; pincode?: string })
    | undefined;
  const sellerGst = sellerGstin(company);
  const buyerGst = buyerGstin(invoiceData);
  const pos = placeOfSupply(invoiceData);
  const items = (invoiceData?.items ?? []) as LineWithTax[];
  const gst = aggregateGstTaxes(items);
  const dateFmt = systemSettings?.dateFormat.format ?? "DD-MM-YYYY";

  return (
    <Wrapper className="bg-white px-10 py-8 font-sans text-gray-950 max-w-5xl mx-auto my-6">
      <header className="border-b-2 border-[#0066FF] pb-3">
        <div className="flex justify-between gap-4">
          <div className="flex gap-3 items-start">
            {logoSrc ? (
              <img src={logoSrc} alt="Company Logo" className="w-28 h-auto" />
            ) : (
              <div className="flex h-12 w-28 items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                Your Logo
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-[#000B1E]">{company?.companyName || "Company"}</h2>
              <p className="text-xs text-gray-600">{company?.address}</p>
              {(company?.city || company?.state) && (
                <p className="text-xs text-gray-600">
                  {[company?.city, company?.state, company?.pincode].filter(Boolean).join(", ")}
                </p>
              )}
              <p className="text-xs text-gray-600">Phone: {company?.phone}</p>
              <p className="text-xs font-semibold text-[#0066FF] mt-1">
                GSTIN: {sellerGst}
                {sellerGst !== "—" && (
                  <span className="ml-2 text-gray-500 font-medium">
                    (State Code: {stateCodeFromGstin(sellerGst)})
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#0066FF]">GST Compliant</p>
            <h1 className="text-2xl font-bold text-[#000B1E]">TAX INVOICE</h1>
            <p className="text-xs text-gray-500">Original for Recipient</p>
            <div className="mt-2 text-sm space-y-0.5">
              <p>
                <span className="text-gray-500">Invoice No:</span>{" "}
                <span className="font-semibold">{invoiceData?.invoiceNumber}</span>
              </p>
              <p>
                <span className="text-gray-500">Date:</span>{" "}
                {formatDate(invoiceData?.invoiceDate, dateFmt)}
              </p>
              {invoiceData?.dueDate && (
                <p>
                  <span className="text-gray-500">Due Date:</span>{" "}
                  {formatDate(invoiceData.dueDate, dateFmt)}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 mt-4 text-sm">
        <div className="rounded-lg border border-[#D6E4FF] p-3">
          <h3 className="font-bold text-[#0066FF] mb-1">Bill To (Buyer)</h3>
          <p className="font-semibold capitalize">{invoiceData?.billTo?.name}</p>
          <p className="text-xs text-gray-600">{invoiceData?.billTo?.billingAddress?.addressLine1}</p>
          <p className="text-xs text-gray-600">
            {[
              invoiceData?.billTo?.billingAddress?.city,
              invoiceData?.billTo?.billingAddress?.state,
              invoiceData?.billTo?.billingAddress?.pincode,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p className="text-xs text-gray-600">{invoiceData?.billTo?.billingAddress?.country}</p>
          <p className="text-xs mt-1 font-semibold">GSTIN: {buyerGst}</p>
          <p className="text-xs text-gray-600">{invoiceData?.billTo?.email}</p>
          <p className="text-xs text-gray-600">{invoiceData?.billTo?.phone}</p>
        </div>
        <div className="rounded-lg border border-[#D6E4FF] p-3">
          <h3 className="font-bold text-[#0066FF] mb-1">Supply Details</h3>
          <p className="text-xs">
            <span className="text-gray-500">Place of Supply:</span>{" "}
            <span className="font-semibold">{pos}</span>
          </p>
          <p className="text-xs mt-1">
            <span className="text-gray-500">Reverse Charge:</span> No
          </p>
          <p className="text-xs mt-1">
            <span className="text-gray-500">Document Type:</span> Tax Invoice
          </p>
          {invoiceData?.referenceNo && (
            <p className="text-xs mt-1">
              <span className="text-gray-500">Reference:</span> {invoiceData.referenceNo}
            </p>
          )}
        </div>
      </section>

      <section className="mt-4 overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#0066FF] text-white">
              <th className="p-2 font-semibold">#</th>
              <th className="p-2 font-semibold">Description</th>
              <th className="p-2 font-semibold">HSN/SAC</th>
              <th className="p-2 font-semibold text-right">Qty</th>
              <th className="p-2 font-semibold text-right">Rate</th>
              <th className="p-2 font-semibold text-right">Disc.</th>
              <th className="p-2 font-semibold text-right">Taxable</th>
              <th className="p-2 font-semibold text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id ?? item.productId ?? index} className="border-b border-gray-200">
                <td className="p-2">{index + 1}</td>
                <td className="p-2 font-medium">{item.name ?? item.productName ?? "—"}</td>
                <td className="p-2">{getItemHsn(item)}</td>
                <td className="p-2 text-right">{item.qty}</td>
                <td className="p-2 text-right">{fmt(item.rate)}</td>
                <td className="p-2 text-right">{fmt(item.discount)}</td>
                <td className="p-2 text-right">{fmt(getItemTaxable(item))}</td>
                <td className="p-2 text-right font-medium">
                  {fmt(Number(item.amount ?? item.lineTotal ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-4 flex justify-between gap-6">
        <div className="flex-1 text-xs space-y-1">
          <p>
            <span className="font-semibold">Amount in words: </span>
            {numberToWords(invoiceData?.TotalAmount || 0)}
          </p>
          <p className="text-gray-500">
            Total Items / Qty: {items.length} / {items.reduce((s, i) => s + Number(i.qty || 0), 0)}
          </p>
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
            Declaration: We declare that this invoice shows the actual price of the goods / services
            described and that all particulars are true and correct.
          </div>
        </div>
        <div className="w-72 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-600">Taxable Value</span>
            <span className="font-semibold">{fmt(invoiceData?.taxableAmount || 0)}</span>
          </div>
          {Object.keys(gst.byKind).length > 0 ? (
            Object.entries(gst.byKind).map(([label, amount]) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-600">{label}</span>
                <span className="font-semibold">{fmt(amount)}</span>
              </div>
            ))
          ) : (
            <div className="flex justify-between">
              <span className="text-gray-600">Tax</span>
              <span className="font-semibold">{fmt(invoiceData?.vat || 0)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Discount</span>
            <span className="font-semibold">{fmt(invoiceData?.totalDiscount || 0)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-[#0066FF] pt-2 text-base font-bold">
            <span>Grand Total</span>
            <span className="text-[#0066FF]">{fmt(invoiceData?.TotalAmount || 0)}</span>
          </div>
        </div>
      </section>

      <footer className="mt-5 pt-3 border-t border-gray-200 flex justify-between gap-4 text-xs">
        <div>
          <h4 className="font-semibold mb-1">Bank Details</h4>
          <p>Bank: {invoiceData?.bank?.bankName || "—"}</p>
          <p>A/C: {invoiceData?.bank?.accountNumber || "—"}</p>
          <p>IFSC: {invoiceData?.bank?.IFSCCode || "—"}</p>
          <p>Branch: {invoiceData?.bank?.branchName || "—"}</p>
        </div>
        {(() => {
          const upi = (invoiceData as { company?: { merchantUpiId?: string | null } })?.company
            ?.merchantUpiId;
          const amount = Number(invoiceData?.TotalAmount ?? 0);
          if (!upi || amount <= 0) return null;
          return (
            <div className="flex flex-col items-center">
              <QRCodeSVG
                value={upiDeepLink({
                  vpa: upi,
                  payeeName: company?.companyName || "Merchant",
                  amount,
                  note: invoiceData?.invoiceNumber ?? "",
                })}
                size={80}
              />
              <p className="text-gray-500 mt-1">Pay via UPI</p>
            </div>
          );
        })()}
        <div className="text-center min-w-[140px]">
          <p className="mb-2">For {company?.companyName || "Company"}</p>
          {invoiceData?.signature?.image ? (
            <img src={invoiceData.signature.image} alt="Signature" className="w-32 h-auto mx-auto" />
          ) : (
            <div className="h-12" />
          )}
          <p className="border-t border-gray-300 pt-1 mt-2">Authorised Signatory</p>
        </div>
      </footer>

      {invoiceData?.termsAndCondition && (
        <section className="mt-4 text-[11px] text-gray-600">
          <h4 className="font-semibold text-gray-800 mb-1">Terms & Conditions</h4>
          <p>{invoiceData.termsAndCondition}</p>
        </section>
      )}
      <p className="mt-4 text-center text-xs text-gray-400">Thank you for your business</p>
    </Wrapper>
  );
};

export default InvoiceTemplateGstClassic;
