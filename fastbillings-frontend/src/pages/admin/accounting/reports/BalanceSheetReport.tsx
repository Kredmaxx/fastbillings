import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface BankRow {
  id: string;
  name: string;
  balance: number;
}

interface BalanceSheetData {
  asOf: string;
  assets: {
    current: { cashAndBank: number; receivables: number; inventory: number };
    fixed: { total: number };
    total: number;
  };
  liabilities: {
    current: { payables: number; taxLiability: number };
    longTerm: { total: number };
    total: number;
  };
  equity: { ownerEquity: number; retainedEarnings: number; total: number };
  totalLiabilitiesAndEquity: number;
  bankBreakdown: BankRow[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type Row =
  | { kind: 'section'; label: string }
  | { kind: 'label'; label: string; indent?: number }
  | { kind: 'item'; label: string; amount: number; indent?: number }
  | { kind: 'total'; label: string; amount: number };

function RowView({ row }: { row: Row }) {
  if (row.kind === 'section') {
    return (
      <tr>
        <td colSpan={2} className={reportTable.section}>
          {row.label}
        </td>
      </tr>
    );
  }
  const pad = row.indent === 2 ? 'pl-8' : row.indent === 1 ? 'pl-4' : 'pl-2';
  if (row.kind === 'label') {
    return (
      <tr>
        <td className={`${reportTable.td} ${pad} font-medium`}>{row.label}</td>
        <td className={reportTable.tdRight} />
      </tr>
    );
  }
  const strong = row.kind === 'total' ? reportTable.total : '';
  return (
    <tr>
      <td className={`${reportTable.td} ${pad} ${row.kind === 'total' ? 'font-semibold' : ''}`}>
        {row.label}
      </td>
      <td className={`${reportTable.tdRight} ${strong}`}>{formatInr(row.amount)}</td>
    </tr>
  );
}

export default function BalanceSheetReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_BALANCE_SHEET_URL}?asOf=${asOf}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load balance sheet');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Row[] = data
    ? [
        { kind: 'section', label: 'I. Equity and Liabilities' },
        { kind: 'label', label: '1. Shareholders’ / Owner funds', indent: 1 },
        {
          kind: 'item',
          label: '(a) Owner equity / Capital',
          amount: data.equity.ownerEquity,
          indent: 2,
        },
        {
          kind: 'item',
          label: '(b) Reserves & surplus (retained earnings)',
          amount: data.equity.retainedEarnings,
          indent: 2,
        },
        { kind: 'total', label: 'Total Equity', amount: data.equity.total },
        { kind: 'label', label: '2. Non-current liabilities', indent: 1 },
        {
          kind: 'item',
          label: 'Long-term liabilities',
          amount: data.liabilities.longTerm.total,
          indent: 2,
        },
        { kind: 'label', label: '3. Current liabilities', indent: 1 },
        {
          kind: 'item',
          label: '(a) Trade payables',
          amount: data.liabilities.current.payables,
          indent: 2,
        },
        {
          kind: 'item',
          label: '(b) Tax liabilities',
          amount: data.liabilities.current.taxLiability,
          indent: 2,
        },
        { kind: 'total', label: 'Total Liabilities', amount: data.liabilities.total },
        {
          kind: 'total',
          label: 'Total Equity and Liabilities',
          amount: data.totalLiabilitiesAndEquity,
        },
        { kind: 'section', label: 'II. Assets' },
        { kind: 'label', label: '1. Non-current assets', indent: 1 },
        {
          kind: 'item',
          label: 'Fixed assets',
          amount: data.assets.fixed.total,
          indent: 2,
        },
        { kind: 'label', label: '2. Current assets', indent: 1 },
        {
          kind: 'item',
          label: '(a) Inventories',
          amount: data.assets.current.inventory,
          indent: 2,
        },
        {
          kind: 'item',
          label: '(b) Trade receivables',
          amount: data.assets.current.receivables,
          indent: 2,
        },
        {
          kind: 'item',
          label: '(c) Cash and bank balances',
          amount: data.assets.current.cashAndBank,
          indent: 2,
        },
        ...data.bankBreakdown.map(
          (b): Row => ({
            kind: 'item',
            label: `— ${b.name}`,
            amount: b.balance,
            indent: 2,
          }),
        ),
        { kind: 'total', label: 'Total Assets', amount: data.assets.total },
      ]
    : [];

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Balance Sheet</h1>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="flex items-end gap-4 mb-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">As Of</label>
          <input
            type="date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="p-1 border rounded text-sm"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="bs-print-root"
          title="Balance Sheet"
          subtitle={`as at ${formatDate(data.asOf)} (Schedule III / ITR style)`}
          footnote="Prepared from books maintained in FastBillings. Figures in Indian Rupees."
        >
          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={reportTable.th}>Particulars</th>
                <th className={`${reportTable.thRight} w-40`}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <RowView key={i} row={row} />
              ))}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
