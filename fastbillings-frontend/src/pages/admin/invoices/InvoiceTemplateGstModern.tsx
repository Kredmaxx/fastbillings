import styled from "styled-components";
import { numberToWords } from "@utils/converters";
import type { InvoiceData } from "@models/invoice";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import useDateFormatter from "@hooks/useDateFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import { resolveCompanyLogo } from "@utils/brandLogo";
import {
  aggregateGstTaxes,
  buyerGstin,
  getItemHsn,
  getItemTaxable,
  placeOfSupply,
  sellerGstin,
  type LineWithTax,
} from "./gstInvoiceUtils";

type Props = { invoiceData: InvoiceData };

const Wrapper = styled.div`
  p {
    font-size: 12px;
    font-weight: 500;
  }
`;

/** Modern GST tax invoice — navy header band + CGST/SGST/IGST columns summary. */
const InvoiceTemplateGstModern: React.FC<Props> = ({ invoiceData }) => {
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
    <Wrapper className="bg-white font-sans text-gray-950 max-w-5xl mx-auto my-6 overflow-hidden rounded-xl shadow-sm border border-gray-100">
      <div className="bg-gradient-to-r from-[#000B1E] via-[#0B1533] to-[#0066FF] px-10 py-6 text-white">
        <div className="flex justify-between items-start gap-4">
          <div className="flex gap-3 items-center">
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" className="h-12 w-auto bg-white rounded px-2 py-1" />
            ) : (
              <div className="h-12 w-28 flex items-center justify-center rounded border border-white/30 text-[10px] uppercase tracking-wide text-white/70">
                Your Logo
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold">{company?.companyName}</h2>
              <p className="text-xs text-white/80">{company?.address}</p>
              <p className="text-xs font-semibold text-[#00D2FF] mt-1">GSTIN: {sellerGst}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#00D2FF] font-bold">GST Compliant</p>
            <h1 className="text-2xl font-bold">TAX INVOICE</h1>
            <p className="text-sm mt-1">{invoiceData?.invoiceNumber}</p>
            <p className="text-xs text-white/75">
              {formatDate(invoiceData?.invoiceDate, dateFmt)}
            </p>
          </div>
        </div>
      </div>

      <div className="px-10 py-5">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl bg-[#F4F8FF] p-3">
            <p className="font-bold text-[#0066FF] mb-1">Buyer</p>
            <p className="font-semibold capitalize">{invoiceData?.billTo?.name}</p>
            <p className="text-gray-600">{invoiceData?.billTo?.billingAddress?.addressLine1}</p>
            <p className="text-gray-600">
              {[invoiceData?.billTo?.billingAddress?.city, invoiceData?.billTo?.billingAddress?.state]
                .filter(Boolean)
                .join(", ")}
            </p>
            <p className="mt-1 font-semibold">GSTIN: {buyerGst}</p>
          </div>
          <div className="rounded-xl bg-[#F4F8FF] p-3">
            <p className="font-bold text-[#0066FF] mb-1">Place of Supply</p>
            <p className="font-semibold text-base">{pos}</p>
            <p className="text-gray-500 mt-2">Reverse Charge: No</p>
          </div>
          <div className="rounded-xl bg-[#F4F8FF] p-3">
            <p className="font-bold text-[#0066FF] mb-1">Seller Contact</p>
            <p>{company?.email}</p>
            <p>{company?.phone}</p>
            <p className="text-gray-600 mt-1">
              {[company?.city, company?.state, company?.pincode].filter(Boolean).join(", ")}
            </p>
          </div>
        </div>

        <table className="w-full mt-5 text-xs border-collapse">
          <thead>
            <tr className="border-b-2 border-[#0066FF] text-[#000B1E]">
              <th className="py-2 text-left">#</th>
              <th className="py-2 text-left">Item</th>
              <th className="py-2 text-left">HSN/SAC</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Taxable</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id ?? i} className="border-b border-gray-100">
                <td className="py-2">{i + 1}</td>
                <td className="py-2 font-medium">{item.name ?? item.productName}</td>
                <td className="py-2">{getItemHsn(item)}</td>
                <td className="py-2 text-right">{item.qty}</td>
                <td className="py-2 text-right">{fmt(item.rate)}</td>
                <td className="py-2 text-right">{fmt(getItemTaxable(item))}</td>
                <td className="py-2 text-right font-semibold">
                  {fmt(Number(item.amount ?? item.lineTotal ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs">
              <span className="font-semibold">In words: </span>
              {numberToWords(invoiceData?.TotalAmount || 0)}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-blue-50 p-2">
                <p className="text-gray-500">CGST</p>
                <p className="font-bold text-[#0066FF]">{fmt(gst.cgst)}</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-2">
                <p className="text-gray-500">SGST</p>
                <p className="font-bold text-[#0066FF]">{fmt(gst.sgst)}</p>
              </div>
              <div className="rounded-lg bg-cyan-50 p-2">
                <p className="text-gray-500">IGST</p>
                <p className="font-bold text-[#0066FF]">{fmt(gst.igst)}</p>
              </div>
            </div>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span>Taxable</span>
              <span className="font-semibold">{fmt(invoiceData?.taxableAmount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Tax</span>
              <span className="font-semibold">
                {fmt(gst.cgst + gst.sgst + gst.igst + gst.cess + (gst.other || invoiceData?.vat || 0))}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span className="font-semibold">{fmt(invoiceData?.totalDiscount || 0)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
              <span>Total Payable</span>
              <span className="text-[#0066FF]">{fmt(invoiceData?.TotalAmount || 0)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-between items-end text-xs border-t pt-4">
          <div>
            <p className="font-semibold mb-1">Bank</p>
            <p>{invoiceData?.bank?.bankName || "—"} · {invoiceData?.bank?.IFSCCode || "—"}</p>
            <p>A/C {invoiceData?.bank?.accountNumber || "—"}</p>
          </div>
          <div className="text-center">
            <p>For {company?.companyName}</p>
            {invoiceData?.signature?.image && (
              <img src={invoiceData.signature.image} alt="" className="w-28 mx-auto my-1" />
            )}
            <p className="border-t border-gray-300 pt-1 mt-6">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </Wrapper>
  );
};

export default InvoiceTemplateGstModern;
