import { QRCodeSVG } from "qrcode.react";

export type PosReceiptLine = {
  name: string;
  qty: number;
  rate: number;
  tax: number;
  amount: number;
};

export type PosReceiptData = {
  companyName: string;
  address?: string | null;
  phone?: string | null;
  gstin?: string | null;
  invoiceNumber: string;
  dateLabel: string;
  paymentMode: string;
  lines: PosReceiptLine[];
  taxable: number;
  tax: number;
  total: number;
  upiLink?: string | null;
  pending?: boolean;
};

export default function PosReceipt({ data }: { data: PosReceiptData }) {
  return (
    <div className="pos-receipt mx-auto bg-white text-black" style={{ width: "72mm", fontFamily: "ui-monospace, monospace" }}>
      <div className="text-center">
        <p className="text-sm font-bold uppercase">{data.companyName}</p>
        {data.address && <p className="text-[10px] leading-tight">{data.address}</p>}
        {data.phone && <p className="text-[10px]">Ph: {data.phone}</p>}
        {data.gstin && <p className="text-[10px] font-semibold">GSTIN: {data.gstin}</p>}
      </div>
      <hr className="my-2 border-dashed border-black" />
      <p className="text-[11px]">Bill: {data.invoiceNumber}</p>
      {data.pending && (
        <p className="text-[10px] font-semibold">PENDING SYNC — not yet on server</p>
      )}
      <p className="text-[11px]">{data.dateLabel}</p>
      <p className="text-[11px]">Pay: {data.paymentMode}</p>
      <hr className="my-2 border-dashed border-black" />
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left font-semibold">Item</th>
            <th className="text-right font-semibold">Qty</th>
            <th className="text-right font-semibold">Amt</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line, i) => (
            <tr key={`${line.name}-${i}`}>
              <td className="pr-1 align-top">
                {line.name}
                <div className="text-[9px] text-gray-700">
                  {line.qty} × {line.rate.toFixed(2)}
                </div>
              </td>
              <td className="text-right align-top">{line.qty}</td>
              <td className="text-right align-top">{line.amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr className="my-2 border-dashed border-black" />
      <div className="text-[11px]">
        <div className="flex justify-between">
          <span>Taxable</span>
          <span>{data.taxable.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{data.tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL</span>
          <span>{data.total.toFixed(2)}</span>
        </div>
      </div>
      {data.upiLink && (
        <div className="mt-3 flex flex-col items-center">
          <QRCodeSVG value={data.upiLink} size={88} />
          <p className="mt-1 text-[9px]">Scan to pay UPI</p>
        </div>
      )}
      <p className="mt-3 text-center text-[10px]">Thank you</p>
    </div>
  );
}
