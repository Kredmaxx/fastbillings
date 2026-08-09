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

interface Cmp08Data {
  period: {
    quarter: string;
    fy: string;
    quarterNumber: number;
    from: string;
    to: string;
  };
  isComposition: boolean;
  compositionRatePercent: number;
  notes?: string;
  warnings?: string[];
  outwardSupplies: {
    taxableTurnover: number;
    b2bTaxable: number;
    b2cTaxable: number;
    nilExempt: { nilRated: number; exempt: number; nonGst: number };
    invoiceCount: number;
    creditNoteCount: number;
    salesDebitNoteCount?: number;
  };
  inwardSupplies: {
    purchaseTaxable: number;
    purchaseCount: number;
    rcmTaxable: number;
    rcmPurchaseCount: number;
    note?: string;
  };
  taxPayable: {
    ratePercent: number;
    taxableTurnover: number;
    taxAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
  };
  monthlyBreakdown: Array<{
    month: string;
    outwardTaxable: number;
    invoiceCount: number;
    creditNoteCount: number;
    salesDebitNoteCount?: number;
    purchaseCount: number;
  }>;
}

function currentQuarterLabel(d = new Date()): string {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  const m = d.getMonth();
  let q = 1;
  if (m >= 3 && m <= 5) q = 1;
  else if (m >= 6 && m <= 8) q = 2;
  else if (m >= 9 && m <= 11) q = 3;
  else q = 4;
  return `${start}-${String(start + 1).slice(-2)}-Q${q}`;
}

function quarterOptions(count = 8): string[] {
  const cur = currentQuarterLabel();
  const startYear = Number(cur.slice(0, 4));
  const curQ = Number(cur.slice(-1));
  const out: string[] = [];
  let y = startYear;
  let q = curQ;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(y + 1).slice(-2)}-Q${q}`);
    q -= 1;
    if (q < 1) {
      q = 4;
      y -= 1;
    }
  }
  return out;
}

function SectionHeading({ children, colSpan = 2 }: { children: ReactNode; colSpan?: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className={reportTable.section}>
        {children}
      </td>
    </tr>
  );
}

export default function Cmp08Report() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const options = useMemo(() => quarterOptions(8), []);
  const [quarter, setQuarter] = useState(options[0] ?? currentQuarterLabel());
  const [rate, setRate] = useState('1');
  const [data, setData] = useState<Cmp08Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_CMP08_URL}?quarter=${encodeURIComponent(quarter)}&rate=${encodeURIComponent(rate)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load CMP-08 report');
    } finally {
      setLoading(false);
    }
  }

  async function download(format: 'json' | 'csv') {
    try {
      const res = await axios.get(
        `${Constants.EXPORT_CMP08_URL}?quarter=${encodeURIComponent(quarter)}&rate=${encodeURIComponent(rate)}&format=${format}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        },
      );
      const blob = new Blob([res.data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cmp08_${quarter}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to download CMP-08 ${format.toUpperCase()}`);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const warningsNote = data?.warnings?.length ? data.warnings.join(' ') : undefined;

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white space-y-4">
      <PageBackButton />
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">
            CMP-08 (composition)
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Books worksheet — not GSTN portal filing
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Quarterly composition tax worksheet — books only, not portal filing.
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

      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">Quarter (India FY)</label>
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="p-1 border rounded text-sm min-w-[160px]"
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500">Composition rate</label>
          <select
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="p-1 border rounded text-sm"
          >
            <option value="1">1% (traders / manufacturers)</option>
            <option value="5">5% (restaurants)</option>
            <option value="6">6% (services)</option>
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
          printId="cmp08-print-root"
          title="CMP-08 — Composition Tax Worksheet"
          subtitle={`${data.period.quarter} · ${formatDate(data.period.from)} – ${formatDate(data.period.to)} · Rate ${data.compositionRatePercent}% · ${
            data.isComposition ? 'Composition on' : 'Composition flag off'
          }`}
          footnote={
            [warningsNote, data.notes, 'Prepared from books maintained in FastBillings. Figures in Indian Rupees.']
              .filter(Boolean)
              .join(' ')
          }
          showSignatures={false}
        >
          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Outward Supplies (Taxable Turnover)</SectionHeading>
              <tr>
                <td className={reportTable.td}>Net taxable turnover (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.outwardSupplies.taxableTurnover)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>B2B gross (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.outwardSupplies.b2bTaxable)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>B2C gross (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.outwardSupplies.b2cTaxable)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Documents</td>
                <td className={reportTable.td}>
                  {data.outwardSupplies.invoiceCount} inv · {data.outwardSupplies.creditNoteCount} CN ·{' '}
                  {data.outwardSupplies.salesDebitNoteCount ?? 0} sales DN
                </td>
              </tr>
              <tr>
                <td className={reportTable.td}>Nil / Exempt / Non-GST (₹)</td>
                <td className={reportTable.td}>
                  Nil {formatInr(data.outwardSupplies.nilExempt.nilRated)} · Exempt{' '}
                  {formatInr(data.outwardSupplies.nilExempt.exempt)} · Non-GST{' '}
                  {formatInr(data.outwardSupplies.nilExempt.nonGst)}
                </td>
              </tr>
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Inward Supplies (Reference)</SectionHeading>
              <tr>
                <td className={reportTable.td}>Purchases (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.inwardSupplies.purchaseTaxable)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>Purchase count</td>
                <td className={reportTable.tdRight}>{data.inwardSupplies.purchaseCount}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>RCM taxable (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.inwardSupplies.rcmTaxable)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>RCM count</td>
                <td className={reportTable.tdRight}>{data.inwardSupplies.rcmPurchaseCount}</td>
              </tr>
              {data.inwardSupplies.note && (
                <tr>
                  <td colSpan={2} className={reportTable.td}>{data.inwardSupplies.note}</td>
                </tr>
              )}
            </tbody>
          </table>

          <table className={`${reportTable.table} mb-4`}>
            <tbody>
              <SectionHeading colSpan={2}>Tax Payable (Approx.)</SectionHeading>
              <tr>
                <td className={reportTable.td}>Tax @ {data.taxPayable.ratePercent}% (₹)</td>
                <td className={`${reportTable.tdRight} font-bold`}>{formatInr(data.taxPayable.taxAmount)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>CGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.taxPayable.cgst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>SGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.taxPayable.sgst)}</td>
              </tr>
              <tr>
                <td className={reportTable.td}>IGST (₹)</td>
                <td className={reportTable.tdRight}>{formatInr(data.taxPayable.igst)}</td>
              </tr>
            </tbody>
          </table>

          <table className={reportTable.table}>
            <tbody>
              <SectionHeading colSpan={6}>Monthly Breakdown</SectionHeading>
              <tr>
                <th className={reportTable.th}>Month</th>
                <th className={reportTable.thRight}>Outward Taxable (₹)</th>
                <th className={reportTable.thRight}>Invoices</th>
                <th className={reportTable.thRight}>CNs</th>
                <th className={reportTable.thRight}>Sales DNs</th>
                <th className={reportTable.thRight}>Purchases</th>
              </tr>
              {data.monthlyBreakdown.map((m) => (
                <tr key={m.month}>
                  <td className={reportTable.td}>{m.month}</td>
                  <td className={reportTable.tdRight}>{formatInr(m.outwardTaxable)}</td>
                  <td className={reportTable.tdRight}>{m.invoiceCount}</td>
                  <td className={reportTable.tdRight}>{m.creditNoteCount}</td>
                  <td className={reportTable.tdRight}>{m.salesDebitNoteCount ?? 0}</td>
                  <td className={reportTable.tdRight}>{m.purchaseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
