import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';

interface B2BRow {
  gstin: string;
  customerName: string;
  invoiceNumber: string | null;
  date: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total: number;
}

interface B2CRow {
  placeOfSupply: string;
  invoiceCount: number;
  taxableValue: number;
  tax: number;
}

interface Summary {
  totalInvoices: number;
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  totalTax: number;
}

interface GSTR1Data {
  period: { from: string; to: string };
  b2b: B2BRow[];
  b2c: B2CRow[];
  summary: Summary;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export default function GSTR1Report() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const start = monthStart(new Date());
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<GSTR1Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_GSTR1_URL}?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load GSTR-1 report');
    } finally {
      setLoading(false);
    }
  }

  async function download(format: 'json' | 'csv') {
    try {
      const res = await axios.get(
        `${Constants.EXPORT_GSTR1_URL}?from=${from}&to=${to}&format=${format}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        },
      );
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gstr1_${from}_${to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to download GSTR-1 ${format.toUpperCase()}`);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">GSTR-1 (Outward Supplies)</h1>
        <div className="flex items-center">
          <button type="button" onClick={() => window.print()} className="px-3 py-1 text-sm border rounded">
            Print / Save PDF
          </button>
          <button type="button" onClick={() => download('json')} className="px-3 py-1 text-sm border rounded ml-2">
            Download JSON
          </button>
          <button type="button" onClick={() => download('csv')} className="px-3 py-1 text-sm border rounded ml-2">
            Download CSV
          </button>
        </div>
      </div>

      <div className="flex items-end gap-4 mb-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {data && (
        <div className="space-y-4 text-sm">
          <div className="text-xs text-gray-400">
            Period: {formatDate(data.period.from)} —{' '}
            {formatDate(data.period.to)}
          </div>

          <section className="border rounded p-4 bg-purple-50">
            <h2 className="font-medium mb-2">Summary</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <div className="text-xs text-gray-500">Total Invoices</div>
                <div className="font-medium">{data.summary.totalInvoices}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Taxable Value</div>
                <div className="font-medium">{data.summary.totalTaxableValue.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">CGST</div>
                <div className="font-medium">{data.summary.totalCgst.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">SGST</div>
                <div className="font-medium">{data.summary.totalSgst.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">IGST</div>
                <div className="font-medium">{data.summary.totalIgst.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">CESS</div>
                <div className="font-medium">{data.summary.totalCess.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">Total Tax</div>
                <div className="font-medium">{data.summary.totalTax.toFixed(2)}</div>
              </div>
            </div>
          </section>

          <section className="border rounded p-4">
            <h2 className="font-medium mb-2">B2B (registered customers)</h2>
            {data.b2b.length === 0 ? (
              <div className="text-xs text-gray-400">No B2B invoices in period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-1 pr-2">GSTIN</th>
                      <th className="py-1 pr-2">Customer</th>
                      <th className="py-1 pr-2">Invoice</th>
                      <th className="py-1 pr-2">Date</th>
                      <th className="py-1 pr-2 text-right">Taxable</th>
                      <th className="py-1 pr-2 text-right">CGST</th>
                      <th className="py-1 pr-2 text-right">SGST</th>
                      <th className="py-1 pr-2 text-right">IGST</th>
                      <th className="py-1 pr-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.b2b.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 pr-2">{r.gstin}</td>
                        <td className="py-1 pr-2">{r.customerName}</td>
                        <td className="py-1 pr-2">{r.invoiceNumber}</td>
                        <td className="py-1 pr-2">{formatDate(r.date)}</td>
                        <td className="py-1 pr-2 text-right">{r.taxableValue.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{r.cgst.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{r.sgst.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{r.igst.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right font-medium">{r.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="border rounded p-4">
            <h2 className="font-medium mb-2">B2C (unregistered customers)</h2>
            {data.b2c.length === 0 ? (
              <div className="text-xs text-gray-400">No B2C invoices in period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-1 pr-2">Place of Supply</th>
                      <th className="py-1 pr-2 text-right">Invoice Count</th>
                      <th className="py-1 pr-2 text-right">Taxable Value</th>
                      <th className="py-1 pr-2 text-right">Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.b2c.map((r, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-1 pr-2">{r.placeOfSupply}</td>
                        <td className="py-1 pr-2 text-right">{r.invoiceCount}</td>
                        <td className="py-1 pr-2 text-right">{r.taxableValue.toFixed(2)}</td>
                        <td className="py-1 pr-2 text-right">{r.tax.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
