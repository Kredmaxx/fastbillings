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
    font-size: 11px;
    font-weight: 500;
  }
`;

/** Compact GST tax invoice — dense layout for multi-line invoices. */
const InvoiceTemplateGstCompact: React.FC<Props> = ({ invoiceData }) => {
  const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
  const { formatDate } = useDateFormatter();
  const { formatMoney } = useCurrencies();
  const fmt = (n: number) => formatMoney(n, invoiceData?.currencyCode);
  const logoSrc = resolveCompanyLogo(systemSettings?.company?.siteLogo);
  const company = systemSettings?.company as
    | (typeof systemSettings.company & { gstin?: string | null; state?: string })
    | undefined;
  const sellerGst = sellerGstin(company);
  const buyerGst = buyerGstin(invoiceData);
  const pos = placeOfSupply(invoiceData);
  const items = (invoiceData?.items ?? []) as LineWithTax[];
  const gst = aggregateGstTaxes(items);
  const dateFmt = systemSettings?.dateFormat.format ?? "DD-MM-YYYY";

  return (
    <Wrapper className="bg-white px-8 py-6 font-sans text-gray-950 max-w-5xl mx-auto my-4 border border-gray-200">
      <div className="flex justify-between items-start border-b border-gray-300 pb-2">
        <div className="flex gap-2 items-start">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="w-20 h-auto" />
          ) : (
            <div className="w-20 h-10 border border-dashed border-gray-300 flex items-center justify-center text-[9px] text-gray-400 uppercase">
              Logo
            </div>
          )}
          <div>
            <p className="font-bold text-sm">{company?.companyName}</p>
            <p className="text-[10px] text-gray-600">{company?.address}</p>
            <p className="text-[10px] font-semibold">GSTIN: {sellerGst}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[9px] font-bold text-[#0066FF] tracking-wider">GST COMPLIANT</p>
          <h1 className="text-lg font-bold">TAX INVOICE</h1>
          <p className="text-[11px]">
            {invoiceData?.invoiceNumber} · {formatDate(invoiceData?.invoiceDate, dateFmt)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
        <div>
          <p className="font-bold text-[#0066FF]">Buyer</p>
          <p className="font-semibold capitalize">{invoiceData?.billTo?.name}</p>
          <p className="text-gray-600">{invoiceData?.billTo?.billingAddress?.addressLine1}</p>
          <p>GSTIN: {buyerGst}</p>
        </div>
        <div>
          <p className="font-bold text-[#0066FF]">Place of Supply</p>
          <p className="font-semibold">{pos}</p>
          <p className="text-gray-500">Reverse Charge: No</p>
        </div>
        <div>
          <p className="font-bold text-[#0066FF]">Seller</p>
          <p>{company?.email}</p>
          <p>{company?.phone}</p>
          <p className="text-gray-600">{company?.state}</p>
        </div>
      </div>

      <table className="w-full mt-3 text-[10px] border border-gray-300 border-collapse">
        <thead>
          <tr className="bg-gray-100">
            {["#", "Particulars", "HSN/SAC", "Qty", "Rate", "Taxable", "CGST", "SGST", "IGST", "Amount"].map(
              (h) => (
                <th key={h} className={`border border-gray-300 p-1 ${["Qty","Rate","Taxable","CGST","SGST","IGST","Amount"].includes(h) ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const taxes = Array.isArray(item.taxes) ? item.taxes : [];
            const cgst = taxes.filter((t) => (t.kind || "").toUpperCase() === "CGST").reduce((s, t) => s + Number(t.amount || 0), 0);
            const sgst = taxes
              .filter((t) => ["SGST", "UTGST"].includes((t.kind || "").toUpperCase()))
              .reduce((s, t) => s + Number(t.amount || 0), 0);
            const igst = taxes.filter((t) => (t.kind || "").toUpperCase() === "IGST").reduce((s, t) => s + Number(t.amount || 0), 0);
            return (
              <tr key={item.id ?? i}>
                <td className="border border-gray-300 p-1">{i + 1}</td>
                <td className="border border-gray-300 p-1">{item.name ?? item.productName}</td>
                <td className="border border-gray-300 p-1">{getItemHsn(item)}</td>
                <td className="border border-gray-300 p-1 text-right">{item.qty}</td>
                <td className="border border-gray-300 p-1 text-right">{fmt(item.rate)}</td>
                <td className="border border-gray-300 p-1 text-right">{fmt(getItemTaxable(item))}</td>
                <td className="border border-gray-300 p-1 text-right">{fmt(cgst)}</td>
                <td className="border border-gray-300 p-1 text-right">{fmt(sgst)}</td>
                <td className="border border-gray-300 p-1 text-right">{fmt(igst)}</td>
                <td className="border border-gray-300 p-1 text-right font-semibold">
                  {fmt(Number(item.amount ?? item.lineTotal ?? 0))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-3 flex justify-between text-[11px]">
        <div>
          <p>
            <span className="font-semibold">Amount in words:</span> {numberToWords(invoiceData?.TotalAmount || 0)}
          </p>
          <p className="text-gray-500 mt-1">
            Tax summary — CGST: {fmt(gst.cgst)} | SGST: {fmt(gst.sgst)} | IGST: {fmt(gst.igst)}
            {gst.cess > 0 ? ` | CESS: ${fmt(gst.cess)}` : ""}
          </p>
        </div>
        <div className="w-52 space-y-0.5">
          <div className="flex justify-between">
            <span>Taxable</span>
            <span>{fmt(invoiceData?.taxableAmount || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Tax</span>
            <span>{fmt(gst.cgst + gst.sgst + gst.igst + gst.cess || invoiceData?.vat || 0)}</span>
          </div>
          <div className="flex justify-between font-bold border-t border-gray-400 pt-1">
            <span>Total</span>
            <span>{fmt(invoiceData?.TotalAmount || 0)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-between text-[10px] border-t pt-2">
        <div>
          <p className="font-semibold">Bank: {invoiceData?.bank?.bankName || "—"}</p>
          <p>IFSC {invoiceData?.bank?.IFSCCode || "—"} · A/C {invoiceData?.bank?.accountNumber || "—"}</p>
        </div>
        <div className="text-center">
          <p>For {company?.companyName}</p>
          {invoiceData?.signature?.image && (
            <img src={invoiceData.signature.image} alt="" className="w-24 mx-auto" />
          )}
          <p className="mt-4 border-t border-gray-400">Authorised Signatory</p>
        </div>
      </div>
    </Wrapper>
  );
};

export default InvoiceTemplateGstCompact;
