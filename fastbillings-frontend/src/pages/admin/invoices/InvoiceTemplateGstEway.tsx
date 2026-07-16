import type { InvoiceData } from "@models/invoice";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import useDateFormatter from "@hooks/useDateFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import { numberToWords } from "@utils/converters";
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
  type LineWithTax,
} from "./gstInvoiceUtils";

type Props = { invoiceData: InvoiceData };

/** Dense GST e-invoice style — transporter / IRN slots, billing & shipping, QR. */
const InvoiceTemplateGstEway: React.FC<Props> = ({ invoiceData }) => {
  const { data: systemSettings } = useSelector((s: RootState) => s.systemSettings);
  const { formatDate } = useDateFormatter();
  const { formatMoney } = useCurrencies();
  const fmt = (n: number) => formatMoney(n, invoiceData?.currencyCode);
  const logoSrc = resolveCompanyLogo(systemSettings?.company?.siteLogo);
  const company = systemSettings?.company as
    | (typeof systemSettings.company & { gstin?: string | null; state?: string; city?: string; pincode?: string })
    | undefined;
  const dateFmt = systemSettings?.dateFormat.format ?? "DD-MM-YYYY";
  const items = (invoiceData?.items ?? []) as LineWithTax[];
  const gst = aggregateGstTaxes(items);
  const sellerGst = sellerGstin(company);
  const buyerGst = buyerGstin(invoiceData);
  const pos = placeOfSupply(invoiceData);
  const invExtra = invoiceData as InvoiceData & {
    ewayBillNo?: string | null;
    irn?: string | null;
    ackNo?: string | null;
    transporterName?: string | null;
    vehicleNo?: string | null;
  };

  const cell = "border border-black p-1.5 text-[10px]";

  return (
    <div className="bg-white font-sans text-black max-w-5xl mx-auto my-4 p-3 text-[11px]">
      <div className="border border-black">
        <div className="flex justify-between px-2 py-1 border-b border-black text-[10px]">
          <span>Page No. 1 of 1</span>
          <span className="font-bold tracking-widest">TAX INVOICE</span>
          <span>Original Copy</span>
        </div>

        <div className="flex gap-3 p-3 border-b border-black items-start">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="w-16 h-16 object-contain border border-gray-300" />
          ) : (
            <div className="w-16 h-16 border border-dashed border-gray-400 flex items-center justify-center text-[9px]">
              Add Logo
            </div>
          )}
          <div className="flex-1 text-center">
            <p className="font-bold text-base">{company?.companyName || "Company Name"}</p>
            <p className="text-[10px] text-gray-700">{company?.address}</p>
            <p className="text-[10px]">
              Mobile: {company?.phone || "—"} | Email: {company?.email || "—"}
            </p>
            <p className="text-[10px] font-semibold">
              GSTIN: {sellerGst} | State: {company?.state || "—"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black p-2 space-y-0.5">
            <p>
              <b>Invoice Number:</b> {invoiceData?.invoiceNumber}
            </p>
            <p>
              <b>Invoice Date:</b> {formatDate(invoiceData?.invoiceDate, dateFmt)}
            </p>
            <p>
              <b>Due date:</b>{" "}
              {invoiceData?.dueDate ? formatDate(invoiceData.dueDate, dateFmt) : "—"}
            </p>
            <p>
              <b>Place of Supply:</b> {pos}
            </p>
            <p>
              <b>Reverse Charge:</b> No
            </p>
          </div>
          <div className="p-2 space-y-0.5">
            <p>
              <b>Transporter:</b> {invExtra.transporterName || "—"}
            </p>
            <p>
              <b>Vehicle No.:</b> {invExtra.vehicleNo || "—"}
            </p>
            <p>
              <b>E-Way Bill No.:</b> {invExtra.ewayBillNo || "—"}
            </p>
            <p>
              <b>IRN:</b> {invExtra.irn || "—"}
            </p>
            <p>
              <b>Ack No.:</b> {invExtra.ackNo || "—"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-b border-black">
          <div className="border-r border-black p-2">
            <p className="font-bold mb-1 underline">Billing Details</p>
            <p>
              <b>Name:</b> {invoiceData?.billTo?.name}
            </p>
            <p>
              <b>GSTIN:</b> {buyerGst}
            </p>
            <p>
              <b>Mobile:</b> {invoiceData?.billTo?.phone || "—"}
            </p>
            <p>
              <b>Email:</b> {invoiceData?.billTo?.email || "—"}
            </p>
            <p>
              <b>Address:</b> {invoiceData?.billTo?.billingAddress?.addressLine1}
              {invoiceData?.billTo?.billingAddress?.city
                ? `, ${invoiceData.billTo.billingAddress.city}`
                : ""}
            </p>
          </div>
          <div className="p-2">
            <p className="font-bold mb-1 underline">Shipping Details</p>
            <p>
              <b>Name:</b> {invoiceData?.billTo?.name}
            </p>
            <p>
              <b>GSTIN:</b> {buyerGst}
            </p>
            <p>
              <b>Mobile:</b> {invoiceData?.billTo?.phone || "—"}
            </p>
            <p>
              <b>Address:</b> {invoiceData?.billTo?.billingAddress?.addressLine1}
              {invoiceData?.billTo?.billingAddress?.state
                ? `, ${invoiceData.billTo.billingAddress.state}`
                : ""}
            </p>
          </div>
        </div>

        <div className="border-b border-black px-2 py-1 text-[10px] bg-gray-50 flex gap-4 flex-wrap">
          <span>
            <b>IRN:</b> {invExtra.irn || "—"}
          </span>
          <span>
            <b>Ack No.:</b> {invExtra.ackNo || "—"}
          </span>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100">
              {["Sr.", "Item Description", "HSN/SAC", "Qty", "Unit", "List Price", "Disc.", "Tax %", "Amount (₹)"].map(
                (h) => (
                  <th key={h} className={`${cell} font-bold text-left`}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const taxes = Array.isArray(item.taxes) ? item.taxes : [];
              const taxPct = taxes.reduce((s, t) => s + Number(t.percent || 0), 0);
              return (
                <tr key={item.id ?? i}>
                  <td className={cell}>{i + 1}</td>
                  <td className={cell}>{item.name ?? item.productName}</td>
                  <td className={cell}>{getItemHsn(item)}</td>
                  <td className={cell}>{item.qty}</td>
                  <td className={cell}>{item.unit || "NOS"}</td>
                  <td className={`${cell} text-right`}>{fmt(item.rate)}</td>
                  <td className={`${cell} text-right`}>{fmt(item.discount)}</td>
                  <td className={`${cell} text-right`}>{taxPct ? taxPct.toFixed(2) : "—"}</td>
                  <td className={`${cell} text-right font-semibold`}>
                    {fmt(Number(item.amount ?? item.lineTotal ?? 0))}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className={`${cell} font-bold`} colSpan={8}>
                Total
              </td>
              <td className={`${cell} text-right font-bold`}>{fmt(invoiceData?.TotalAmount || 0)}</td>
            </tr>
          </tbody>
        </table>

        <div className="border-b border-black p-2 grid grid-cols-2 gap-2">
          <div>
            <p>
              <b>Total in Words:</b> {numberToWords(invoiceData?.TotalAmount || 0)}
            </p>
            <p className="mt-1">
              <b>Taxable Value:</b> {fmt(invoiceData?.taxableAmount || 0)} | <b>CGST:</b>{" "}
              {fmt(gst.cgst)} | <b>SGST:</b> {fmt(gst.sgst)} | <b>IGST:</b> {fmt(gst.igst)}
              {gst.cess > 0 ? ` | CESS: ${fmt(gst.cess)}` : ""}
            </p>
          </div>
          <div className="text-right">
            <p>
              Invoice Balance: <b>{fmt(invoiceData?.TotalAmount || 0)}</b>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-0 text-[10px]">
          <div className="border-r border-black p-2">
            <p className="font-bold mb-1">Terms and Conditions</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>{invoiceData?.termsAndCondition || "Subject to local jurisdiction."}</li>
              <li>Goods once sold will not be taken back.</li>
            </ol>
          </div>
          <div className="border-r border-black p-2 flex flex-col items-center">
            <p className="font-bold mb-1 self-start">Payment / UPI</p>
            {(() => {
              const upi = (invoiceData as { company?: { merchantUpiId?: string | null } })?.company
                ?.merchantUpiId;
              const amount = Number(invoiceData?.TotalAmount ?? 0);
              if (!upi || amount <= 0) {
                return (
                  <div className="w-20 h-20 border border-dashed border-gray-400 flex items-center justify-center text-[8px] text-gray-400">
                    QR
                  </div>
                );
              }
              return (
                <QRCodeSVG
                  value={upiDeepLink({
                    vpa: upi,
                    payeeName: company?.companyName || "Merchant",
                    amount,
                    note: invoiceData?.invoiceNumber ?? "",
                  })}
                  size={72}
                />
              );
            })()}
            <p className="mt-1 self-start">
              Bank: {invoiceData?.bank?.bankName || "—"}
              <br />
              A/C: {invoiceData?.bank?.accountNumber || "—"}
              <br />
              IFSC: {invoiceData?.bank?.IFSCCode || "—"}
            </p>
          </div>
          <div className="border-r border-black p-2 flex flex-col items-center">
            <p className="font-bold mb-1 self-start">E-Invoice QR</p>
            <div className="w-20 h-20 border border-gray-400 flex items-center justify-center text-[8px] text-gray-400">
              {invExtra.irn ? "IRN Linked" : "No IRN"}
            </div>
          </div>
          <div className="p-2 text-right">
            <p className="font-bold">For {company?.companyName}</p>
            {invoiceData?.signature?.image ? (
              <img src={invoiceData.signature.image} alt="" className="h-10 ml-auto my-2" />
            ) : (
              <div className="h-10" />
            )}
            <p className="mt-6 border-t border-black pt-1 inline-block">Signature</p>
          </div>
        </div>
      </div>
      <p className="text-center text-[9px] text-gray-500 mt-2">
        Invoice created with FastBillings
      </p>
    </div>
  );
};

export default InvoiceTemplateGstEway;
