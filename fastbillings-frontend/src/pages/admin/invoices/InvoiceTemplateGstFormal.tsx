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
  type TaxLineRow,
} from "./gstInvoiceUtils";

type Props = { invoiceData: InvoiceData };

function taxOf(item: LineWithTax, kinds: string[]): number {
  const taxes = Array.isArray(item.taxes) ? item.taxes : [];
  return taxes
    .filter((t: TaxLineRow) => kinds.includes((t.kind || "").toUpperCase()))
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

/** Formal GST tax invoice — yellow table headers, CGST/SGST/CESS columns. */
const InvoiceTemplateGstFormal: React.FC<Props> = ({ invoiceData }) => {
  const { data: systemSettings } = useSelector((s: RootState) => s.systemSettings);
  const { formatDate } = useDateFormatter();
  const { formatMoney } = useCurrencies();
  const fmt = (n: number) => formatMoney(n, invoiceData?.currencyCode);
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
  const lineBlue = "#5B9BD5";
  const headYellow = "#FFF2CC";

  const sumTaxable = items.reduce((s, i) => s + getItemTaxable(i), 0);
  const sumCgst = items.reduce((s, i) => s + taxOf(i, ["CGST"]), 0);
  const sumSgst = items.reduce((s, i) => s + taxOf(i, ["SGST", "UTGST"]), 0);
  const sumCess = items.reduce((s, i) => s + taxOf(i, ["CESS"]), 0);
  const sumTotal = items.reduce((s, i) => s + Number(i.amount ?? i.lineTotal ?? 0), 0);

  return (
    <div className="bg-white font-sans text-gray-950 max-w-5xl mx-auto my-6 px-8 py-6 text-[12px]">
      <div className="flex justify-between items-start gap-4">
        <div className="flex gap-3">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="w-16 h-16 object-contain border border-gray-200" />
          ) : (
            <div className="w-16 h-16 border border-gray-300 flex items-center justify-center text-[9px] text-gray-400 uppercase">
              Logo
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold">{company?.companyName || "Company"}</h2>
            <p className="text-gray-600">GSTIN: {sellerGst}</p>
            <p className="text-gray-600">State: {company?.state || "—"}</p>
            <p className="text-gray-600">PAN: {(company as { pan?: string })?.pan || "—"}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-[#1F4E79]">{fmt(invoiceData?.TotalAmount || 0)}</p>
          <p className="text-gray-500 text-[11px]">Total</p>
          <div className="mt-2 space-y-0.5 text-left ml-auto w-48">
            <p>
              <span className="text-gray-500">Invoice Date:</span>{" "}
              {formatDate(invoiceData?.invoiceDate, dateFmt)}
            </p>
            <p>
              <span className="text-gray-500">Invoice No:</span> {invoiceData?.invoiceNumber}
            </p>
            <p>
              <span className="text-gray-500">Reference No:</span> {invoiceData?.referenceNo || "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="relative my-5">
        <div className="border-t-2" style={{ borderColor: lineBlue }} />
        <span
          className="absolute left-1/2 -translate-x-1/2 -top-3 bg-white px-4 text-sm font-bold tracking-widest"
          style={{ color: lineBlue }}
        >
          TAX INVOICE
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-[11px]">
        <div>
          <p className="font-semibold text-gray-500 mb-1">Customer Name / GSTIN</p>
          <div className="bg-gray-100 rounded px-2 py-2 min-h-[56px]">
            <p className="font-semibold capitalize">{invoiceData?.billTo?.name}</p>
            <p>GSTIN: {buyerGst}</p>
          </div>
        </div>
        <div>
          <p className="font-semibold text-gray-500 mb-1">Billing Address</p>
          <div className="bg-gray-100 rounded px-2 py-2 min-h-[56px]">
            <p>{invoiceData?.billTo?.billingAddress?.addressLine1}</p>
            <p>
              {[invoiceData?.billTo?.billingAddress?.city, invoiceData?.billTo?.billingAddress?.state]
                .filter(Boolean)
                .join(", ")}
            </p>
          </div>
        </div>
        <div>
          <p className="font-semibold text-gray-500 mb-1">Shipping Address</p>
          <div className="bg-gray-100 rounded px-2 py-2 min-h-[56px]">
            <p>{invoiceData?.billTo?.billingAddress?.addressLine1}</p>
            <p>
              {[invoiceData?.billTo?.billingAddress?.city, invoiceData?.billTo?.billingAddress?.pincode]
                .filter(Boolean)
                .join(" - ")}
            </p>
          </div>
        </div>
      </div>

      <div className="relative my-4">
        <div className="border-t" style={{ borderColor: lineBlue }} />
      </div>

      <div className="grid grid-cols-3 gap-4 text-[11px] mb-3">
        <p>
          <span className="text-gray-500">Country of Supply:</span> India
        </p>
        <p>
          <span className="text-gray-500">Place of Supply:</span> {pos}
        </p>
        <p>
          <span className="text-gray-500">Due Date:</span>{" "}
          {invoiceData?.dueDate ? formatDate(invoiceData.dueDate, dateFmt) : "—"}
        </p>
      </div>

      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr style={{ background: headYellow }}>
            {[
              "Item",
              "HSN/SAC",
              "Qty",
              "Rate",
              "Discount",
              "Taxable Value",
              "CGST",
              "SGST/UTGST",
              "CESS",
              "Total",
            ].map((h) => (
              <th key={h} className="border border-gray-300 p-1.5 text-left font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={item.id ?? i}>
              <td className="border border-gray-300 p-1.5">
                {i + 1}. {item.name ?? item.productName}
              </td>
              <td className="border border-gray-300 p-1.5">{getItemHsn(item)}</td>
              <td className="border border-gray-300 p-1.5 text-right">{item.qty}</td>
              <td className="border border-gray-300 p-1.5 text-right">{fmt(item.rate)}</td>
              <td className="border border-gray-300 p-1.5 text-right">{fmt(item.discount)}</td>
              <td className="border border-gray-300 p-1.5 text-right">{fmt(getItemTaxable(item))}</td>
              <td className="border border-gray-300 p-1.5 text-right">{fmt(taxOf(item, ["CGST"]))}</td>
              <td className="border border-gray-300 p-1.5 text-right">
                {fmt(taxOf(item, ["SGST", "UTGST"]))}
              </td>
              <td className="border border-gray-300 p-1.5 text-right">{fmt(taxOf(item, ["CESS"]))}</td>
              <td className="border border-gray-300 p-1.5 text-right font-semibold">
                {fmt(Number(item.amount ?? item.lineTotal ?? 0))}
              </td>
            </tr>
          ))}
          <tr style={{ background: headYellow }} className="font-semibold">
            <td className="border border-gray-300 p-1.5" colSpan={5}>
              Total
            </td>
            <td className="border border-gray-300 p-1.5 text-right">{fmt(sumTaxable || invoiceData?.taxableAmount || 0)}</td>
            <td className="border border-gray-300 p-1.5 text-right">{fmt(sumCgst || gst.cgst)}</td>
            <td className="border border-gray-300 p-1.5 text-right">{fmt(sumSgst || gst.sgst)}</td>
            <td className="border border-gray-300 p-1.5 text-right">{fmt(sumCess || gst.cess)}</td>
            <td className="border border-gray-300 p-1.5 text-right">{fmt(sumTotal || invoiceData?.TotalAmount || 0)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-[12px]">
          <div className="flex justify-between">
            <span>Taxable Amount</span>
            <span>{fmt(invoiceData?.taxableAmount || sumTaxable)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Tax</span>
            <span>{fmt(gst.cgst + gst.sgst + gst.igst + gst.cess || invoiceData?.vat || 0)}</span>
          </div>
          <div className="flex justify-between font-bold text-sm border-t pt-1">
            <span>Invoice Total</span>
            <span>{fmt(invoiceData?.TotalAmount || 0)}</span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-[11px]">
        <span className="font-semibold">Total amount (in words): </span>
        <span className="bg-gray-100 px-2 py-0.5 rounded">{numberToWords(invoiceData?.TotalAmount || 0)}</span>
      </p>

      <div className="mt-8 flex justify-end text-[11px]">
        <div className="text-center w-48">
          {invoiceData?.signature?.image && (
            <img src={invoiceData.signature.image} alt="" className="h-12 mx-auto mb-1" />
          )}
          <div className="border-t border-gray-400 pt-1">(Authorised Signatory)</div>
        </div>
      </div>

      <div className="mt-6 border-t-2 pt-2 text-center text-[10px] text-gray-500" style={{ borderColor: lineBlue }}>
        {company?.companyName}
        {company?.city ? `, ${company.city}` : ""}
        {company?.pincode ? ` - ${company.pincode}` : ""}
      </div>
    </div>
  );
};

export default InvoiceTemplateGstFormal;
