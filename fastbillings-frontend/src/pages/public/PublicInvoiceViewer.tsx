import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

import Constants from '@constants/api';
import type { PublicInvoicePayload } from '@models/publicInvoice';
import { upiDeepLink } from '@/lib/upiDeepLink';
import useDateFormatter from '@hooks/useDateFormatter';

export default function PublicInvoiceViewer() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicInvoicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { formatDate } = useDateFormatter();

  useEffect(() => {
    if (!token) {
      setError('Invalid link');
      setLoading(false);
      return;
    }
    axios
      .get(`${Constants.GET_PUBLIC_INVOICE_URL}/${token}`)
      .then((r) => setData(r.data?.data?.invoice ?? null))
      .catch((e) => setError(axios.isAxiosError(e) && e.response?.status === 404 ? 'Link not found or revoked.' : 'Failed to load.'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-gray-500">No data.</div>;

  const items = Array.isArray(data.items) ? (data.items as Array<{ name?: string; qty?: number; rate?: number }>) : [];

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white print:p-0">
      <div className="flex justify-between items-center mb-4 print:hidden">
        <h1 className="text-2xl font-bold">{data.invoiceType === 'PROFORMA' ? 'Proforma' : 'Invoice'}</h1>
        <button type="button" onClick={() => window.print()} className="px-3 py-1 text-sm border rounded">Print / Save PDF</button>
      </div>

      <div className="border-t border-b py-4 my-4">
        <div className="flex justify-between text-sm">
          <div>
            <div className="font-medium">{data.company?.companyName}</div>
            <div className="text-gray-500">{data.company?.address}</div>
            <div className="text-gray-500">{data.company?.email}</div>
          </div>
          <div className="text-right">
            <div className="text-gray-500">#{data.invoiceNumber}</div>
            <div className="text-gray-500">{formatDate(data.invoiceDate)}</div>
            <div className="text-gray-500">Due {formatDate(data.dueDate)}</div>
          </div>
        </div>
      </div>

      <div className="mb-4 text-sm">
        <div className="font-medium">Bill to:</div>
        <div>{data.customer?.name}</div>
        <div className="text-gray-500">{data.customer?.email}</div>
      </div>

      <table className="w-full text-sm mb-4">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Item</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Rate</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} className="border-b">
              <td className="py-2">{item.name ?? (item as { productName?: string }).productName ?? '-'}</td>
              <td className="text-right">{item.qty ?? 0}</td>
              <td className="text-right">{item.rate ?? 0}</td>
              <td className="text-right">{((item.qty ?? 0) * (item.rate ?? 0)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end text-sm">
        <div className="w-64">
          <div className="flex justify-between"><span>Subtotal</span><span>{Number(data.taxableAmount ?? 0).toFixed(2)}</span></div>
          {data.vat !== null && data.vat !== undefined && (
            <div className="flex justify-between"><span>Tax</span><span>{Number(data.vat).toFixed(2)}</span></div>
          )}
          <div className="flex justify-between font-medium border-t pt-2 mt-2"><span>Total</span><span>{Number(data.TotalAmount ?? 0).toFixed(2)}</span></div>
        </div>
      </div>

      {(() => {
        const upi = data.company?.merchantUpiId;
        const amount = Number(data.TotalAmount ?? 0);
        if (!upi || amount <= 0) return null;
        const link = upiDeepLink({
          vpa: upi,
          payeeName: data.company?.merchantName || data.company?.companyName || 'Merchant',
          amount,
          note: data.invoiceNumber ?? '',
        });
        return (
          <div className="flex flex-col items-center mt-6">
            <QRCodeSVG value={link} size={128} />
            <p className="text-xs text-gray-500 mt-2">Scan to pay via UPI</p>
          </div>
        );
      })()}
    </div>
  );
}
