import { useEffect, useState, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface TaxCols {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total?: number;
  tax?: number;
}

interface B2BRow extends TaxCols {
  reverseCharge?: boolean;
  gstin: string;
  customerName: string;
  invoiceNumber: string | null;
  date: string;
  placeOfSupply?: string;
}

interface B2CLRow extends TaxCols {
  customerName: string;
  invoiceNumber: string | null;
  date: string;
  placeOfSupply: string;
}

interface B2CSRow extends TaxCols {
  placeOfSupply: string;
  supplyType?: string;
  rate?: number;
  invoiceCount: number;
}

interface CdnrRow extends TaxCols {
  gstin: string;
  customerName: string;
  noteNumber: string | null;
  noteDate: string;
  invoiceNumber: string | null;
  placeOfSupply: string;
}

interface CdnurRow extends TaxCols {
  placeOfSupply: string;
  noteCount: number;
}

interface HsnRow extends TaxCols {
  hsn: string;
  description: string;
  qty: number;
  uqc?: string;
  rate?: number;
}

interface DocsRow {
  nature: string;
  docType: string;
  from: string | null;
  to: string | null;
  totalNumber: number;
  cancelled: number;
  netIssued: number;
}

interface Summary {
  totalInvoices: number;
  totalCreditNotes?: number;
  b2bCount?: number;
  b2clCount?: number;
  b2csGroups?: number;
  cdnrCount?: number;
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalCess: number;
  totalTax: number;
}

interface NilExemptBlock {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

interface GSTR1Data {
  period: { from: string; to: string };
  b2b: B2BRow[];
  b2cl?: B2CLRow[];
  b2cs?: B2CSRow[];
  b2c: Array<{ placeOfSupply: string; invoiceCount: number; taxableValue: number; tax: number }>;
  cdnr?: CdnrRow[];
  cdnur?: CdnurRow[];
  hsn?: HsnRow[];
  docs?: DocsRow[];
  notes?: string;
  nilExempt?: {
    nilRated: NilExemptBlock;
    exempt: NilExemptBlock;
    nonGst: NilExemptBlock;
  };
  summary: Summary;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function SectionHeading({ children, colSpan = 10 }: { children: ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={reportTable.section}>
        {children}
      </td>
    </tr>
  );
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

  const b2cl = data?.b2cl ?? [];
  const b2cs = data?.b2cs ?? [];
  const cdnr = data?.cdnr ?? [];
  const cdnur = data?.cdnur ?? [];
  const hsn = data?.hsn ?? [];
  const docs = data?.docs ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">
          GSTR-1 (Outward Supplies)
          <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
            Books worksheet — not GSTN portal filing
          </span>
        </h1>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!data}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
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
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="gstr1-print-root"
          title="GSTR-1 — Outward Supplies"
          subtitle={`for the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)}`}
          footnote={
            data.notes ||
            'Prepared from books maintained in FastBillings. Figures in Indian Rupees. Not a portal filing package.'
          }
          showSignatures={false}
        >
          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={4}>Summary</SectionHeading>
              <tr>
                <td className={reportTable.td}>Invoices</td>
                <td className={reportTable.tdRight}>{data.summary.totalInvoices}</td>
                <td className={reportTable.td}>Credit Notes</td>
                <td className={reportTable.tdRight}>{data.summary.totalCreditNotes ?? 0}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Taxable Value (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalTaxableValue)}</td>
                <td className={reportTable.td}>Total Tax (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalTax)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>CGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalCgst)}</td>
                <td className={reportTable.td}>SGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalSgst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>IGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalIgst)}</td>
                <td className={reportTable.td}>CESS (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.summary.totalCess)}</td>
              </tr>
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={10}>B2B (Registered)</SectionHeading>
              <tr>
                <th className={reportTable.th}>GSTIN</th>
                <th className={reportTable.th}>Customer</th>
                <th className={reportTable.th}>Invoice</th>
                <th className={reportTable.th}>Date</th>
                <th className={reportTable.th}>RCM</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>CGST (₹)</th>
                <th className={reportTable.thRight}>SGST (₹)</th>
                <th className={reportTable.thRight}>IGST (₹)</th>
                <th className={reportTable.thRight}>Total (₹)</th>
              </tr>
              {data.b2b.length === 0 ? (
                <tr>
                  <td colSpan={10} className={reportTable.td}>No B2B invoices in period.</td>
                </tr>
              ) : (
                data.b2b.map((r, i) => (
                  <tr key={i}>
                    <td className={reportTable.td}>{r.gstin}</td>
                    <td className={reportTable.td}>{r.customerName}</td>
                    <td className={reportTable.td}>{r.invoiceNumber}</td>
                    <td className={reportTable.td}>{formatDate(r.date)}</td>
                    <td className={reportTable.td}>{r.reverseCharge ? 'Y' : 'N'}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.taxableValue)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.cgst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.sgst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.igst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.total ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={6}>B2CL (Inter-state Unregistered &gt; ₹2.5L)</SectionHeading>
              <tr>
                <th className={reportTable.th}>Customer</th>
                <th className={reportTable.th}>Invoice</th>
                <th className={reportTable.th}>Place of Supply</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>IGST (₹)</th>
                <th className={reportTable.thRight}>Total (₹)</th>
              </tr>
              {b2cl.length === 0 ? (
                <tr>
                  <td colSpan={6} className={reportTable.td}>No B2CL invoices in period.</td>
                </tr>
              ) : (
                b2cl.map((r, i) => (
                  <tr key={i}>
                    <td className={reportTable.td}>{r.customerName}</td>
                    <td className={reportTable.td}>{r.invoiceNumber}</td>
                    <td className={reportTable.td}>{r.placeOfSupply}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.taxableValue)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.igst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.total ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={6}>B2CS (Other Unregistered — Aggregated)</SectionHeading>
              <tr>
                <th className={reportTable.th}>Place of Supply</th>
                <th className={reportTable.th}>Type</th>
                <th className={reportTable.thRight}>Rate %</th>
                <th className={reportTable.thRight}>Invoices</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>Tax (₹)</th>
              </tr>
              {b2cs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={reportTable.td}>No B2CS supplies in period.</td>
                </tr>
              ) : (
                b2cs.map((r, i) => (
                  <tr key={i}>
                    <td className={reportTable.td}>{r.placeOfSupply}</td>
                    <td className={reportTable.td}>{r.supplyType ?? '—'}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.rate ?? 0)}</td>
                    <td className={reportTable.tdRight}>{r.invoiceCount}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.taxableValue)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.tax ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={6}>CDNR (Credit Notes — Registered)</SectionHeading>
              <tr>
                <th className={reportTable.th}>GSTIN</th>
                <th className={reportTable.th}>Customer</th>
                <th className={reportTable.th}>Note</th>
                <th className={reportTable.th}>Invoice</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>Total (₹)</th>
              </tr>
              {cdnr.length === 0 ? (
                <tr>
                  <td colSpan={6} className={reportTable.td}>No registered credit notes in period.</td>
                </tr>
              ) : (
                cdnr.map((r, i) => (
                  <tr key={i}>
                    <td className={reportTable.td}>{r.gstin}</td>
                    <td className={reportTable.td}>{r.customerName}</td>
                    <td className={reportTable.td}>{r.noteNumber}</td>
                    <td className={reportTable.td}>{r.invoiceNumber}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.taxableValue)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.total ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={4}>CDNUR (Credit Notes — Unregistered)</SectionHeading>
              <tr>
                <th className={reportTable.th}>Place of Supply</th>
                <th className={reportTable.thRight}>Notes</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>Tax (₹)</th>
              </tr>
              {cdnur.length === 0 ? (
                <tr>
                  <td colSpan={4} className={reportTable.td}>No unregistered credit notes in period.</td>
                </tr>
              ) : (
                cdnur.map((r, i) => (
                  <tr key={i}>
                    <td className={reportTable.td}>{r.placeOfSupply}</td>
                    <td className={reportTable.tdRight}>{r.noteCount}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.taxableValue)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.tax ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {data.nilExempt && (
            <table className={`${reportTable.table} mb-4`}>
              <tbody>
                <SectionHeading colSpan={6}>Nil / Exempt / Non-GST (Line Taxable Value)</SectionHeading>
                <tr>
                  <td className={reportTable.td}>Nil-rated (₹)</td>
                  <td className={reportTable.tdRight}>{formatInr(data.nilExempt.nilRated.taxableValue)}</td>
                  <td className={reportTable.td}>Exempt (₹)</td>
                  <td className={reportTable.tdRight}>{formatInr(data.nilExempt.exempt.taxableValue)}</td>
                  <td className={reportTable.td}>Non-GST (₹)</td>
                  <td className={reportTable.tdRight}>{formatInr(data.nilExempt.nonGst.taxableValue)}</td>
                </tr>
              </tbody>
            </table>
          )}

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={9}>HSN Summary</SectionHeading>
              <tr>
                <th className={reportTable.th}>HSN</th>
                <th className={reportTable.th}>UQC</th>
                <th className={reportTable.thRight}>Rate %</th>
                <th className={reportTable.th}>Description</th>
                <th className={reportTable.thRight}>Qty</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>CGST (₹)</th>
                <th className={reportTable.thRight}>SGST (₹)</th>
                <th className={reportTable.thRight}>IGST (₹)</th>
              </tr>
              {hsn.length === 0 ? (
                <tr>
                  <td colSpan={9} className={reportTable.td}>No HSN lines in period.</td>
                </tr>
              ) : (
                hsn.map((r, i) => (
                  <tr key={i}>
                    <td className={reportTable.td}>{r.hsn}</td>
                    <td className={reportTable.td}>{r.uqc ?? 'OTH'}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.rate ?? 0)}</td>
                    <td className={reportTable.td}>{r.description}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.qty)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.taxableValue)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.cgst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.sgst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.igst)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <table className={reportTable.table}>
            <tbody>
              <SectionHeading colSpan={7}>Documents Issued (Table 13 Style)</SectionHeading>
              <tr>
                <th className={reportTable.th}>Nature</th>
                <th className={reportTable.th}>Type</th>
                <th className={reportTable.th}>From</th>
                <th className={reportTable.th}>To</th>
                <th className={reportTable.thRight}>Total</th>
                <th className={reportTable.thRight}>Cancelled</th>
                <th className={reportTable.thRight}>Net Issued</th>
              </tr>
              {docs.length === 0 ? (
                <tr>
                  <td colSpan={7} className={reportTable.td}>No documents in period.</td>
                </tr>
              ) : (
                docs.map((r, i) => (
                  <tr key={i}>
                    <td className={reportTable.td}>{r.nature}</td>
                    <td className={reportTable.td}>{r.docType}</td>
                    <td className={reportTable.td}>{r.from ?? '—'}</td>
                    <td className={reportTable.td}>{r.to ?? '—'}</td>
                    <td className={reportTable.tdRight}>{r.totalNumber}</td>
                    <td className={reportTable.tdRight}>{r.cancelled}</td>
                    <td className={reportTable.tdRight}>{r.netIssued}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
