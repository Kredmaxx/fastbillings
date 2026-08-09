import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import PageBackButton from '@components/admin/layouts/PageBackButton';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface TaxBlock {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

interface TaxPayable {
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

interface GSTR9Data {
  period: { fy: string; from: string; to: string };
  notes?: string;
  table4_outward: {
    b2b: TaxBlock;
    b2cl: TaxBlock;
    b2cs: TaxBlock;
    cdnr: TaxBlock;
    cdnur: TaxBlock;
    salesDebitNotes?: TaxBlock;
    net: TaxBlock;
    reverseChargeFlagged: TaxBlock;
    interStateUnregisteredTaxable: number;
  };
  table5_nilExempt?: {
    nilRated?: TaxBlock;
    exempt?: TaxBlock;
    nonGst?: TaxBlock;
    note?: string;
  };
  table5_inwardNilExempt?: {
    nilRated?: TaxBlock;
    exempt?: TaxBlock;
    nonGst?: TaxBlock;
    note?: string;
  };
  table6_itc: {
    purchases: TaxBlock;
    debitNotes: TaxBlock;
    net: TaxBlock;
  };
  table9_taxPaidApprox: TaxPayable;
  hsnAnnual: Array<{
    hsn: string;
    description: string;
    qty: number;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    outward: TaxBlock;
    itc: TaxBlock;
    taxPayable: TaxPayable;
    invoiceCount: number;
    purchaseCount: number;
  }>;
  documentCounts: {
    invoices: number;
    creditNotes: number;
    salesDebitNotes?: number;
    purchases: number;
    debitNotes: number;
  };
}

function currentFyLabel(d = new Date()): string {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function fyOptions(count = 5): string[] {
  const cur = currentFyLabel();
  const start = Number(cur.slice(0, 4));
  return Array.from({ length: count }, (_, i) => {
    const y = start - i;
    return `${y}-${String(y + 1).slice(-2)}`;
  });
}

function SectionHeading({ children, colSpan = 6 }: { children: ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={reportTable.section}>
        {children}
      </td>
    </tr>
  );
}

function TaxBlockRow({ label, block }: { label: string; block: TaxBlock }) {
  return (
    <tr>
      <td className={reportTable.td}>{label}</td>
      <td className={reportTable.tdRight}>{formatInr(block.taxableValue)}</td>
      <td className={reportTable.tdRight}>{formatInr(block.cgst)}</td>
      <td className={reportTable.tdRight}>{formatInr(block.sgst)}</td>
      <td className={reportTable.tdRight}>{formatInr(block.igst)}</td>
      <td className={reportTable.tdRight}>{formatInr(block.cess)}</td>
    </tr>
  );
}

function TaxBlockTable({ title, rows }: { title: string; rows: Array<{ label: string; block: TaxBlock }> }) {
  if (rows.length === 0) return null;
  return (
    <table className={`${reportTable.table} mb-4`}>
      <tbody>
        <SectionHeading colSpan={6}>{title}</SectionHeading>
        <tr>
          <th className={reportTable.th}>Particulars</th>
          <th className={reportTable.thRight}>Taxable (₹)</th>
          <th className={reportTable.thRight}>CGST (₹)</th>
          <th className={reportTable.thRight}>SGST (₹)</th>
          <th className={reportTable.thRight}>IGST (₹)</th>
          <th className={reportTable.thRight}>CESS (₹)</th>
        </tr>
        {rows.map(({ label, block }) => (
          <TaxBlockRow key={label} label={label} block={block} />
        ))}
      </tbody>
    </table>
  );
}

export default function GSTR9Report() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const options = useMemo(() => fyOptions(5), []);
  const [fy, setFy] = useState(options[0] ?? currentFyLabel());
  const [data, setData] = useState<GSTR9Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_GSTR9_URL}?fy=${encodeURIComponent(fy)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load GSTR-9 report');
    } finally {
      setLoading(false);
    }
  }

  async function download(format: 'json' | 'csv') {
    try {
      const res = await axios.get(
        `${Constants.EXPORT_GSTR9_URL}?fy=${encodeURIComponent(fy)}&format=${format}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        },
      );
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gstr9_${fy}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to download GSTR-9 ${format.toUpperCase()}`);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const table4Rows = data
    ? [
        { label: 'B2B', block: data.table4_outward.b2b },
        { label: 'B2CL', block: data.table4_outward.b2cl },
        { label: 'B2CS', block: data.table4_outward.b2cs },
        { label: 'CDNR (credit notes registered)', block: data.table4_outward.cdnr },
        { label: 'CDNUR', block: data.table4_outward.cdnur },
        ...(data.table4_outward.salesDebitNotes
          ? [{ label: 'Sales debit notes (add to outward)', block: data.table4_outward.salesDebitNotes }]
          : []),
        { label: 'Net outward', block: data.table4_outward.net },
      ]
    : [];

  const table5OutwardRows = data?.table5_nilExempt
    ? [
        ...(data.table5_nilExempt.nilRated
          ? [{ label: 'Nil-rated', block: data.table5_nilExempt.nilRated }]
          : []),
        ...(data.table5_nilExempt.exempt
          ? [{ label: 'Exempt', block: data.table5_nilExempt.exempt }]
          : []),
        ...(data.table5_nilExempt.nonGst
          ? [{ label: 'Non-GST', block: data.table5_nilExempt.nonGst }]
          : []),
      ]
    : [];

  const table5InwardRows = data?.table5_inwardNilExempt
    ? [
        ...(data.table5_inwardNilExempt.nilRated
          ? [{ label: 'Nil-rated', block: data.table5_inwardNilExempt.nilRated }]
          : []),
        ...(data.table5_inwardNilExempt.exempt
          ? [{ label: 'Exempt', block: data.table5_inwardNilExempt.exempt }]
          : []),
        ...(data.table5_inwardNilExempt.nonGst
          ? [{ label: 'Non-GST', block: data.table5_inwardNilExempt.nonGst }]
          : []),
      ]
    : [];

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-4">
      <PageBackButton />
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">
            GSTR-9 (annual)
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Books worksheet — not GSTN portal filing
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Books worksheet for the financial year — not a portal filing package.
          </p>
        </div>
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

      <div className="flex items-end gap-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">Financial year</label>
          <select
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="p-1 border rounded text-sm min-w-[140px]"
          >
            {options.map((o) => (
              <option key={o} value={o}>
                FY {o}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-blue-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && !loading && (
        <ReportPrintShell
          printId="gstr9-print-root"
          title="GSTR-9 — Annual Return Worksheet"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} – ${formatDate(data.period.to)}`}
          footnote={
            data.notes ||
            'Prepared from books maintained in FastBillings. Figures in Indian Rupees. Not a portal filing package.'
          }
          showSignatures={false}
        >
          <TaxBlockTable title="Table 4 — Outward Supplies (Books)" rows={table4Rows} />

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <tr>
                <td className={reportTable.td}>Inter-state unregistered taxable (₹)</td>
                <td className={reportTable.tdRight}>
                  {formatInr(data.table4_outward.interStateUnregisteredTaxable)}
                </td>
              </tr>
            </tbody>
          </table>

          <TaxBlockTable
            title="Table 6 — ITC (Books)"
            rows={[
              { label: 'Purchases', block: data.table6_itc.purchases },
              { label: 'Debit notes (reduce ITC)', block: data.table6_itc.debitNotes },
              { label: 'Net eligible ITC', block: data.table6_itc.net },
            ]}
          />

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Table 9 — Tax Payable (Approx.)</SectionHeading>
              <tr>
                <td className={reportTable.td}>CGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.table9_taxPaidApprox.cgst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>SGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.table9_taxPaidApprox.sgst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>IGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.table9_taxPaidApprox.igst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>CESS (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.table9_taxPaidApprox.cess)}</td>
              </tr>
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Document Counts</SectionHeading>
              <tr>
                <td className={reportTable.td}>Invoices</td>
                <td className={reportTable.tdRight}>{data.documentCounts.invoices}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Credit notes</td>
                <td className={reportTable.tdRight}>{data.documentCounts.creditNotes}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Sales debit notes</td>
                <td className={reportTable.tdRight}>{data.documentCounts.salesDebitNotes ?? 0}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Purchases</td>
                <td className={reportTable.tdRight}>{data.documentCounts.purchases}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Purchase debit notes</td>
                <td className={reportTable.tdRight}>{data.documentCounts.debitNotes}</td>
              </tr>
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={8}>Monthly Breakdown</SectionHeading>
              <tr>
                <th className={reportTable.th}>Month</th>
                <th className={reportTable.thRight}>Out Taxable (₹)</th>
                <th className={reportTable.thRight}>ITC Taxable (₹)</th>
                <th className={reportTable.thRight}>Pay CGST (₹)</th>
                <th className={reportTable.thRight}>Pay SGST (₹)</th>
                <th className={reportTable.thRight}>Pay IGST (₹)</th>
                <th className={reportTable.thRight}>Inv</th>
                <th className={reportTable.thRight}>Pur</th>
              </tr>
              {data.monthlyBreakdown.map((m) => (
                <tr key={m.month}>
                  <td className={reportTable.td}>{m.month}</td>
                  <td className={reportTable.tdRight}>{formatInr(m.outward.taxableValue)}</td>
                  <td className={reportTable.tdRight}>{formatInr(m.itc.taxableValue)}</td>
                  <td className={reportTable.tdRight}>{formatInr(m.taxPayable.cgst)}</td>
                  <td className={reportTable.tdRight}>{formatInr(m.taxPayable.sgst)}</td>
                  <td className={reportTable.tdRight}>{formatInr(m.taxPayable.igst)}</td>
                  <td className={reportTable.tdRight}>{m.invoiceCount}</td>
                  <td className={reportTable.tdRight}>{m.purchaseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={7}>HSN Annual</SectionHeading>
              <tr>
                <th className={reportTable.th}>HSN</th>
                <th className={reportTable.th}>Description</th>
                <th className={reportTable.thRight}>Qty</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>CGST (₹)</th>
                <th className={reportTable.thRight}>SGST (₹)</th>
                <th className={reportTable.thRight}>IGST (₹)</th>
              </tr>
              {data.hsnAnnual.length === 0 ? (
                <tr>
                  <td colSpan={7} className={reportTable.td}>No HSN lines</td>
                </tr>
              ) : (
                data.hsnAnnual.map((h) => (
                  <tr key={String(h.hsn)}>
                    <td className={reportTable.td}>{h.hsn}</td>
                    <td className={reportTable.td}>{h.description}</td>
                    <td className={reportTable.tdRight}>{h.qty}</td>
                    <td className={reportTable.tdRight}>{formatInr(h.taxableValue)}</td>
                    <td className={reportTable.tdRight}>{formatInr(h.cgst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(h.sgst)}</td>
                    <td className={reportTable.tdRight}>{formatInr(h.igst)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {table5OutwardRows.length > 0 && (
            <TaxBlockTable title="Table 5 — Nil / Exempt / Non-GST (Outward)" rows={table5OutwardRows} />
          )}

          {table5InwardRows.length > 0 && (
            <TaxBlockTable title="Table 5 — Nil / Exempt / Non-GST (Inward)" rows={table5InwardRows} />
          )}
        </ReportPrintShell>
      )}
    </div>
  );
}
