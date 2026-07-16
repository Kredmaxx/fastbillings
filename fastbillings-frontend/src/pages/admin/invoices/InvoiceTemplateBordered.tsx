import type { InvoiceData } from "@models/invoice";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import useDateFormatter from "@hooks/useDateFormatter";
import { useCurrencies } from "@hooks/useCurrencies";
import { numberToWords } from "@utils/converters";
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

/** Classic bordered invoice — red accent bars (commercial style). */
const InvoiceTemplateBordered: React.FC<Props> = ({ invoiceData }) => {
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
  const accent = "#C41E3A";

  return (
    <div className="bg-white font-sans text-gray-950 max-w-5xl mx-auto my-6 p-6">
      <div className="border-2 p-6" style={{ borderColor: accent }}>
        <header className="flex justify-between gap-6 pb-4">
          <div className="flex gap-3 items-start">
            {logoSrc ? (
              <img src={logoSrc} alt="" className="w-20 h-auto" />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-[9px] uppercase text-white font-bold"
                style={{ background: accent }}
              >
                Logo
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold" style={{ color: accent }}>
                {company?.companyName || "Company"}
              </h2>
              <p className="text-xs text-gray-600 mt-1">{company?.address}</p>
              <p className="text-xs text-gray-600">
                {[company?.city, company?.state, company?.pincode].filter(Boolean).join(", ")}
              </p>
              <p className="text-xs text-gray-600">Phone: {company?.phone}</p>
              <p className="text-xs text-gray-600">Email: {company?.email}</p>
              {sellerGstin(company) !== "—" && (
                <p className="text-xs font-semibold mt-1">GSTIN: {sellerGstin(company)}</p>
              )}
            </div>
          </div>
          <div className="text-right min-w-[200px]">
            <h1 className="text-3xl font-bold tracking-wide" style={{ color: accent }}>
              INVOICE
            </h1>
            <div className="mt-3 text-xs space-y-1 text-left ml-auto w-48">
              <div className="flex justify-between gap-2">
                <span className="font-bold">DATE</span>
                <span>{formatDate(invoiceData?.invoiceDate, dateFmt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-bold">INVOICE #</span>
                <span>{invoiceData?.invoiceNumber}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-bold">CUSTOMER ID</span>
                <span className="truncate max-w-[100px]">{invoiceData?.billTo?.id?.slice(0, 8) || "—"}</span>
              </div>
              {invoiceData?.dueDate && (
                <div className="flex justify-between gap-2">
                  <span className="font-bold">DUE DATE</span>
                  <span>{formatDate(invoiceData.dueDate, dateFmt)}</span>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="text-white text-sm font-bold px-3 py-1.5 mt-2" style={{ background: accent }}>
          BILL TO
        </div>
        <div className="py-3 text-sm space-y-0.5">
          <p className="font-semibold capitalize">{invoiceData?.billTo?.name}</p>
          <p>{invoiceData?.billTo?.billingAddress?.addressLine1}</p>
          <p>
            {[
              invoiceData?.billTo?.billingAddress?.city,
              invoiceData?.billTo?.billingAddress?.state,
              invoiceData?.billTo?.billingAddress?.pincode,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <p>{invoiceData?.billTo?.phone}</p>
          {buyerGstin(invoiceData) !== "—" && <p>GSTIN: {buyerGstin(invoiceData)}</p>}
        </div>

        <table className="w-full text-sm border-collapse mt-2">
          <thead>
            <tr className="text-white" style={{ background: accent }}>
              <th className="border border-white/40 p-2 w-10">No.</th>
              <th className="border border-white/40 p-2 text-left">PRODUCT</th>
              <th className="border border-white/40 p-2 text-left">DESCRIPTION</th>
              <th className="border border-white/40 p-2 w-16">QTY</th>
              <th className="border border-white/40 p-2 w-24">PRICE</th>
              <th className="border border-white/40 p-2 w-28">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.id ?? i} className={i % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                <td className="border p-2 text-center" style={{ borderColor: `${accent}55` }}>
                  {i + 1}
                </td>
                <td className="border p-2" style={{ borderColor: `${accent}55` }}>
                  {item.name ?? item.productName ?? "—"}
                </td>
                <td className="border p-2 text-xs text-gray-600" style={{ borderColor: `${accent}55` }}>
                  {getItemHsn(item) !== "—" ? `HSN ${getItemHsn(item)}` : item.unit || "—"}
                </td>
                <td className="border p-2 text-center" style={{ borderColor: `${accent}55` }}>
                  {item.qty}
                </td>
                <td className="border p-2 text-right" style={{ borderColor: `${accent}55` }}>
                  {fmt(item.rate)}
                </td>
                <td className="border p-2 text-right font-medium" style={{ borderColor: `${accent}55` }}>
                  {fmt(Number(item.amount ?? item.lineTotal ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex gap-6">
          <div className="flex-1">
            <div className="text-white text-sm font-bold px-3 py-1.5" style={{ background: accent }}>
              Terms & Conditions
            </div>
            <ol className="list-decimal list-inside text-xs text-gray-600 mt-2 space-y-1 px-1">
              <li>{invoiceData?.termsAndCondition || "Payment due as per due date."}</li>
              <li>Goods once sold will not be taken back.</li>
            </ol>
          </div>
          <div className="w-64 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{fmt(invoiceData?.taxableAmount || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Discount</span>
              <span>{fmt(invoiceData?.totalDiscount || 0)}</span>
            </div>
            {Object.keys(gst.byKind).length > 0 ? (
              Object.entries(gst.byKind).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span>{k}</span>
                  <span>{fmt(v)}</span>
                </div>
              ))
            ) : (
              <div className="flex justify-between">
                <span>Tax amount</span>
                <span>{fmt(invoiceData?.vat || 0)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base px-2 py-2 mt-1 rounded" style={{ background: "#E8EEF8" }}>
              <span>TOTAL</span>
              <span>{fmt(invoiceData?.TotalAmount || 0)}</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-1">
              Make all checks payable to {company?.companyName || "Company"}
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          If you have any questions about this invoice, please contact {company?.phone || ""}{" "}
          {company?.email || ""}
        </p>
        <div className="border-t mt-4 pt-3 text-center italic font-semibold" style={{ borderColor: accent, color: accent }}>
          Thank You For Your Business!
        </div>
      </div>
    </div>
  );
};

export default InvoiceTemplateBordered;
