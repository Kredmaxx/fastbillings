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

interface GSTR3BData {
  period: { from: string; to: string };
  outwardSupplies?: {
    invoices: TaxBlock;
    creditNotes: TaxBlock;
    salesDebitNotes?: TaxBlock;
    net: TaxBlock;
  };
  eligibleItc?: {
    purchases: TaxBlock;
    debitNotes: TaxBlock;
    gross?: TaxBlock;
    reversal?: TaxBlock;
    net: TaxBlock;
  };
  itcReversal?: TaxBlock & { entryCount?: number; note?: string };
  '4B_itcReversal'?: TaxBlock;
  '4C_itcNet'?: TaxBlock;
  '3.1_outwardSupplies': TaxBlock;
  '3.1_inwardReverseCharge'?: TaxBlock;
  inwardReverseCharge?: { purchases: TaxBlock; purchaseCount: number };
  inwardNilExempt?: {
    nilRated: number;
    exempt: number;
    nonGst: number;
    note?: string;
  };
  '3.1_exemptInward'?: {
    nilRated: number;
    exempt: number;
    nonGst: number;
    note?: string;
  };
  '3.2_interStateUnregistered': { taxableValue: number };
  '4_itcEligible': TaxBlock;
  '6.1_taxPayable': TaxPayable;
  summary?: {
    invoiceCount: number;
    creditNoteCount: number;
    salesDebitNoteCount?: number;
    debitNoteCount: number;
    purchaseCount: number;
    reverseChargePurchaseCount?: number;
    reverseChargeInvoiceCount?: number;
  };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStart(d: Date): string {
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
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

export default function GSTR3BReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const start = monthStart(new Date());
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<GSTR3BData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_GSTR3B_URL}?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load GSTR-3B report');
    } finally {
      setLoading(false);
    }
  }

  async function download(format: 'json' | 'csv') {
    try {
      const res = await axios.get(
        `${Constants.EXPORT_GSTR3B_URL}?from=${from}&to=${to}&format=${format}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        },
      );
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gstr3b_${from}_${to}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to download GSTR-3B ${format.toUpperCase()}`);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inwardNil = data?.inwardNilExempt ?? data?.['3.1_exemptInward'];
  const itcReversalBlock =
    data?.eligibleItc?.reversal ||
    data?.['4B_itcReversal'] ||
    (data?.itcReversal as TaxBlock | undefined);

  const outwardRows: Array<{ label: string; block: TaxBlock }> = data
    ? data.outwardSupplies
      ? [
          { label: 'Invoices (gross)', block: data.outwardSupplies.invoices },
          { label: 'Less: Credit notes', block: data.outwardSupplies.creditNotes },
          ...(data.outwardSupplies.salesDebitNotes
            ? [{ label: 'Add: Sales debit notes', block: data.outwardSupplies.salesDebitNotes }]
            : []),
          { label: 'Net outward', block: data.outwardSupplies.net },
        ]
      : [{ label: 'Net outward supplies', block: data['3.1_outwardSupplies'] }]
    : [];

  const itcRows: Array<{ label: string; block: TaxBlock }> = data
    ? data.eligibleItc
      ? [
          { label: '4(A) Purchases', block: data.eligibleItc.purchases },
          { label: 'Less: Debit notes', block: data.eligibleItc.debitNotes },
          ...(data.eligibleItc.gross
            ? [{ label: '4(A) Gross ITC', block: data.eligibleItc.gross }]
            : []),
          ...(itcReversalBlock
            ? [{
                label: `4(B) ITC reversed${
                  data.itcReversal?.entryCount != null ? ` (${data.itcReversal.entryCount})` : ''
                }`,
                block: itcReversalBlock,
              }]
            : []),
          { label: '4(C) Net ITC (after reversal)', block: data.eligibleItc.net },
        ]
      : [{ label: 'Eligible ITC', block: data['4_itcEligible'] }]
    : [];

  const totalTaxPayable = data
    ? data['6.1_taxPayable'].cgst +
      data['6.1_taxPayable'].sgst +
      data['6.1_taxPayable'].igst +
      data['6.1_taxPayable'].cess
    : 0;

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">
          GSTR-3B
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
          printId="gstr3b-print-root"
          title="GSTR-3B — Monthly Return Worksheet"
          subtitle={`for the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)}${
            data.summary
              ? ` (${data.summary.invoiceCount} invoices · ${data.summary.creditNoteCount} CNs · ${data.summary.purchaseCount} purchases)`
              : ''
          }`}
          footnote="Prepared from books maintained in FastBillings. Figures in Indian Rupees. Not a portal filing package."
          showSignatures={false}
        >
          <TaxBlockTable title="3.1 Outward Supplies" rows={outwardRows} />

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={6}>3.1(d) Inward Supplies Liable to Reverse Charge</SectionHeading>
              <tr>
                <th className={reportTable.th}>Particulars</th>
                <th className={reportTable.thRight}>Taxable (₹)</th>
                <th className={reportTable.thRight}>CGST (₹)</th>
                <th className={reportTable.thRight}>SGST (₹)</th>
                <th className={reportTable.thRight}>IGST (₹)</th>
                <th className={reportTable.thRight}>CESS (₹)</th>
              </tr>
              {data.inwardReverseCharge ? (
                <TaxBlockRow
                  label={`RCM purchases (${data.inwardReverseCharge.purchaseCount})`}
                  block={data.inwardReverseCharge.purchases}
                />
              ) : data['3.1_inwardReverseCharge'] ? (
                <TaxBlockRow label="RCM purchases" block={data['3.1_inwardReverseCharge']} />
              ) : (
                <tr>
                  <td colSpan={6} className={reportTable.td}>No RCM purchases in period.</td>
                </tr>
              )}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={4}>3.1 — Inward Nil / Exempt / Non-GST</SectionHeading>
              {inwardNil ? (
                <>
                  <tr>
                    <td className={reportTable.td}>Nil-rated (₹)</td>
                    <td className={reportTable.tdRight}>{formatInr(inwardNil.nilRated)}</td>
                    <td className={reportTable.td}>Exempt (₹)</td>
                    <td className={reportTable.tdRight}>{formatInr(inwardNil.exempt)}</td>
                  </tr>
                  <tr>
                    <td className={reportTable.td}>Non-GST (₹)</td>
                    <td className={reportTable.tdRight}>{formatInr(inwardNil.nonGst)}</td>
                    <td colSpan={2} className={reportTable.td}>
                      {inwardNil.note || ''}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={4} className={reportTable.td}>No inward nil/exempt lines in period.</td>
                </tr>
              )}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>3.2 Inter-State Supplies to Unregistered Persons</SectionHeading>
              <tr>
                <td className={reportTable.td}>Taxable Value (₹)</td>
                <td className={reportTable.tdRight}>
                  {formatInr(data['3.2_interStateUnregistered'].taxableValue)}
                </td>
              </tr>
            </tbody>
          </table>

          <TaxBlockTable title="4. Eligible ITC" rows={itcRows} />

          <table className={reportTable.table}>
            <tbody>
              <SectionHeading colSpan={2}>6.1 Tax Payable</SectionHeading>
              <tr>
                <td className={reportTable.td}>CGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data['6.1_taxPayable'].cgst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>SGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data['6.1_taxPayable'].sgst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>IGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data['6.1_taxPayable'].igst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>CESS (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data['6.1_taxPayable'].cess)}</td>
              </tr>
              <tr>
                <td className={`${reportTable.td} ${reportTable.total}`}>Total Tax Payable (₹)</td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(totalTaxPayable)}
                </td>
              </tr>
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
