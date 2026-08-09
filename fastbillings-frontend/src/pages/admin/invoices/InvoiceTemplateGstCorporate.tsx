import type { InvoiceData } from "@models/invoice";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import useDateFormatter from "@hooks/useDateFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import { numberToWords } from "@utils/converters";
import { QRCodeSVG } from "qrcode.react";
import { upiDeepLink } from "@/lib/upiDeepLink";
import { resolveCompanyLogo } from "@utils/brandLogo";
import { invoiceAmountDue, invoiceTcsAmount } from "@utils/invoiceTotals";
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

/** Corporate blue/teal GST invoice — freight / manufacturing style. */
const InvoiceTemplateGstCorporate: React.FC<Props> = ({ invoiceData }) => {
  const { data: systemSettings } = useSelector((s: RootState) => s.systemSettings);
  const { formatDate } = useDateFormatter();
  const { formatMoney } = useCurrencies();
  const fmt = (n: number) => formatMoney(n, invoiceData?.currencyCode);
  const tcsAmt = invoiceTcsAmount(invoiceData);
  const amountDue = invoiceAmountDue(invoiceData);
  const logoSrc = resolveCompanyLogo(systemSettings?.company?.siteLogo);
  const company = systemSettings?.company as
    | (typeof systemSettings.company & {
        gstin?: string | null;
        state?: string;
        city?: string;
        pincode?: string;
        pan?: string | null;
      })
    | undefined;
  const dateFmt = systemSettings?.dateFormat.format ?? "DD-MM-YYYY";
  const items = (invoiceData?.items ?? []) as LineWithTax[];
  const gst = aggregateGstTaxes(items);
  const sellerGst = sellerGstin(company);
  const buyerGst = buyerGstin(invoiceData);
  const pos = placeOfSupply(invoiceData);
  const blue = "#1E4D8C";
  const teal = "#2A9D8F";
  const invExtra = invoiceData as InvoiceData & {
    ewayBillNo?: string | null;
    transporterName?: string | null;
  };

  return (
    <div className="bg-white font-sans text-gray-950 max-w-5xl mx-auto my-6 px-8 py-6 text-[12px] border border-gray-200">
      <header className="flex justify-between items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: blue }}>
            {company?.companyName || "Company"}
          </h1>
          <div className="mt-1 px-2 py-1 text-white text-[10px] font-medium" style={{ background: teal }}>
            Smart Invoicing · Powerful ERP · Better Business
          </div>
          <p className="text-[11px] text-gray-600 mt-2">{company?.address}</p>
          <p className="text-[11px] text-gray-600">
            {[company?.city, company?.state, company?.pincode].filter(Boolean).join(", ")}
          </p>
          <p className="text-[11px] text-gray-600">
            Tel: {company?.phone || "—"} · Email: {company?.email || "—"}
          </p>
        </div>
        <div className="text-center">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="h-16 w-auto mx-auto" />
          ) : (
            <div
              className="w-16 h-16 mx-auto flex items-center justify-center text-[9px] text-white font-bold rounded"
              style={{ background: `linear-gradient(135deg, ${blue}, ${teal})` }}
            >
              LOGO
            </div>
          )}
        </div>
      </header>

      <div className="flex justify-between items-center mt-3 text-[11px]">
        <p>
          <b>PAN:</b> {(company as { pan?: string })?.pan || "—"}
        </p>
        <h2 className="text-lg font-bold tracking-widest" style={{ color: blue }}>
          TAX INVOICE
        </h2>
        <p className="font-semibold" style={{ color: teal }}>
          ORIGINAL FOR RECIPIENT
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3 border border-gray-300 text-[11px]">
        <div className="p-3 border-r border-gray-300">
          <p className="font-bold mb-1" style={{ color: blue }}>
            Customer Detail
          </p>
          <p>
            <b>M/S:</b> {invoiceData?.billTo?.name}
          </p>
          <p>
            <b>Address:</b> {invoiceData?.billTo?.billingAddress?.addressLine1}
            {invoiceData?.billTo?.billingAddress?.city
              ? `, ${invoiceData.billTo.billingAddress.city}`
              : ""}
            {invoiceData?.billTo?.billingAddress?.state
              ? `, ${invoiceData.billTo.billingAddress.state}`
              : ""}
          </p>
          <p>
            <b>Phone:</b> {invoiceData?.billTo?.phone || "—"}
          </p>
          <p>
            <b>GSTIN:</b> {buyerGst}
          </p>
          <p>
            <b>Place of Supply:</b> {pos}
          </p>
        </div>
        <div className="p-3">
          <p className="font-bold mb-1" style={{ color: blue }}>
            Invoice / Transport
          </p>
          <p>
            <b>Invoice No:</b> {invoiceData?.invoiceNumber}
          </p>
          <p>
            <b>Invoice Date:</b> {formatDate(invoiceData?.invoiceDate, dateFmt)}
          </p>
          <p>
            <b>Seller GSTIN:</b> {sellerGst}
          </p>
          <p>
            <b>E-Way Bill No:</b> {invExtra.ewayBillNo || "—"}
          </p>
          <p>
            <b>Transport:</b> {invExtra.transporterName || "—"}
          </p>
        </div>
      </div>

      <table className="w-full mt-3 border-collapse text-[11px]">
        <thead>
          <tr style={{ background: blue }} className="text-white">
            {["Sr.", "Name of Product / Service", "HSN / SAC", "Qty", "Rate", "Taxable Value"].map((h) => (
              <th key={h} className="border border-gray-300 p-2 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id ?? i}>
              <td className="border border-gray-300 p-2">{i + 1}</td>
              <td className="border border-gray-300 p-2 font-medium">
                {item.name ?? item.productName}
              </td>
              <td className="border border-gray-300 p-2">{getItemHsn(item)}</td>
              <td className="border border-gray-300 p-2">
                {item.qty} {item.unit || "NOS"}
              </td>
              <td className="border border-gray-300 p-2 text-right">{fmt(item.rate)}</td>
              <td className="border border-gray-300 p-2 text-right">{fmt(getItemTaxable(item))}</td>
            </tr>
          ))}
          {(gst.igst > 0 || gst.cgst > 0 || gst.sgst > 0) && (
            <tr className="bg-gray-50">
              <td className="border border-gray-300 p-2" colSpan={5}>
                {gst.igst > 0
                  ? `IGST`
                  : `CGST + SGST`}{" "}
                {Object.keys(gst.byKind).length > 0 && (
                  <span className="text-gray-500">
                    ({Object.keys(gst.byKind).join(", ")})
                  </span>
                )}
              </td>
              <td className="border border-gray-300 p-2 text-right font-semibold">
                {fmt(gst.igst + gst.cgst + gst.sgst + gst.cess)}
              </td>
            </tr>
          )}
          {tcsAmt > 0 && (
            <tr>
              <td className="border border-gray-300 p-2" colSpan={5}>
                TCS{invoiceData?.tcsSection ? ` (${invoiceData.tcsSection})` : ""}
              </td>
              <td className="border border-gray-300 p-2 text-right">
                {fmt(tcsAmt)}
              </td>
            </tr>
          )}
          <tr className="font-bold">
            <td className="border border-gray-300 p-2" colSpan={3}>
              {tcsAmt > 0 ? "Total (incl. TCS)" : "Total"}
            </td>
            <td className="border border-gray-300 p-2">
              {items.reduce((s, i) => s + Number(i.qty || 0), 0)}
            </td>
            <td className="border border-gray-300 p-2" />
            <td className="border border-gray-300 p-2 text-right" style={{ color: blue }}>
              {fmt(amountDue)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-2 text-[11px] font-semibold uppercase">
        {numberToWords(amountDue)}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-4 text-[11px]">
        <table className="border-collapse border border-gray-300">
          <thead>
            <tr style={{ background: `${teal}22` }}>
              <th className="border border-gray-300 p-1.5 text-left">HSN/SAC Tax Summary</th>
              <th className="border border-gray-300 p-1.5 text-right">Taxable</th>
              <th className="border border-gray-300 p-1.5 text-right">Tax</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(gst.byKind).length === 0 ? (
              <tr>
                <td className="border border-gray-300 p-1.5" colSpan={3}>
                  Tax: {fmt(invoiceData?.vat || 0)}
                </td>
              </tr>
            ) : (
              Object.entries(gst.byKind).map(([label, amount]) => (
                <tr key={label}>
                  <td className="border border-gray-300 p-1.5">{label}</td>
                  <td className="border border-gray-300 p-1.5 text-right">
                    {fmt(invoiceData?.taxableAmount || 0)}
                  </td>
                  <td className="border border-gray-300 p-1.5 text-right">{fmt(amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div>
          <p className="text-gray-600">
            Total Tax in words:{" "}
            <span className="font-semibold uppercase">
              {numberToWords(gst.cgst + gst.sgst + gst.igst + gst.cess || invoiceData?.vat || 0)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-[11px] border-t pt-3">
        <div>
          <p className="font-bold mb-1" style={{ color: blue }}>
            Bank Details
          </p>
          <p>Bank: {invoiceData?.bank?.bankName || "—"}</p>
          <p>Branch: {invoiceData?.bank?.branchName || "—"}</p>
          <p>A/C: {invoiceData?.bank?.accountNumber || "—"}</p>
          <p>IFSC: {invoiceData?.bank?.IFSCCode || "—"}</p>
          <div className="mt-2 border border-gray-200 p-2 min-h-[48px]">
            <p className="font-semibold text-[10px]">Terms & Conditions</p>
            <p className="text-[10px] text-gray-600">
              {invoiceData?.termsAndCondition || `Subject to ${company?.state || "local"} jurisdiction.`}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-start">
          {(() => {
            const upi = (invoiceData as { company?: { merchantUpiId?: string | null } })?.company
              ?.merchantUpiId;
            const amount = amountDue;
            if (!upi || amount <= 0) {
              return (
                <div className="w-24 h-24 border border-dashed border-gray-300 flex items-center justify-center text-[9px] text-gray-400">
                  UPI QR
                </div>
              );
            }
            return (
              <>
                <QRCodeSVG
                  value={upiDeepLink({
                    vpa: upi,
                    payeeName: company?.companyName || "Merchant",
                    amount,
                    note: invoiceData?.invoiceNumber ?? "",
                  })}
                  size={88}
                />
                <p className="mt-1 text-[10px]" style={{ color: teal }}>
                  Pay using UPI
                </p>
              </>
            );
          })()}
        </div>
        <div className="text-right">
          <p className="font-bold">For {company?.companyName}</p>
          {invoiceData?.signature?.image ? (
            <img src={invoiceData.signature.image} alt="" className="h-12 ml-auto my-2" />
          ) : (
            <div className="h-12" />
          )}
          <p className="border-t border-gray-400 pt-1 inline-block mt-4">Authorised Signatory</p>
          <p className="text-[9px] text-gray-400 mt-2 italic">
            This is a computer generated invoice
          </p>
        </div>
      </div>

      <p className="text-center mt-4 text-[11px] font-medium" style={{ color: teal }}>
        Thank you for shopping with us!
      </p>
    </div>
  );
};

export default InvoiceTemplateGstCorporate;
