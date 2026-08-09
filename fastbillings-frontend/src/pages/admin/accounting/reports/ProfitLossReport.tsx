import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface CategoryTotal {
  name: string;
  total: number;
}

interface ProfitLossData {
  period: { from: string; to: string };
  revenue: { total: number; byCategory: CategoryTotal[] };
  costOfGoodsSold: { total: number };
  grossProfit: number;
  operatingExpenses: { total: number; byCategory: CategoryTotal[] };
  operatingIncome: number;
  manualEntries: {
    income: number;
    expense: number;
    incomeByAccount: CategoryTotal[];
    expenseByAccount: CategoryTotal[];
  };
  netIncome: number;
  taxes: { outputTax: number; inputTax: number; netTax: number };
}

type RowKind = 'section' | 'item' | 'subtotal' | 'total' | 'note';

interface StatementRow {
  kind: RowKind;
  label: string;
  amount?: number;
  indent?: number;
  sno?: string;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function cleanLabel(name: string): string {
  return name.replace(/^Demo\s+/i, '').trim() || name;
}

function buildRows(data: ProfitLossData): StatementRow[] {
  const rows: StatementRow[] = [];
  const otherIncome = data.manualEntries.income || 0;
  const otherExpense = data.manualEntries.expense || 0;
  const totalIncome = data.revenue.total + otherIncome;

  rows.push({ kind: 'section', label: 'A. Income' });

  if (data.revenue.byCategory.length === 0) {
    rows.push({
      kind: 'item',
      sno: '1',
      label: 'Revenue from operations / Sales',
      amount: data.revenue.total,
      indent: 1,
    });
  } else {
    rows.push({
      kind: 'item',
      sno: '1',
      label: 'Revenue from operations',
      indent: 1,
    });
    data.revenue.byCategory.forEach((c) => {
      rows.push({
        kind: 'item',
        label: cleanLabel(c.name),
        amount: c.total,
        indent: 2,
      });
    });
    rows.push({
      kind: 'subtotal',
      label: 'Total revenue from operations',
      amount: data.revenue.total,
      indent: 1,
    });
  }

  rows.push({
    kind: 'item',
    sno: '2',
    label: 'Other income (journal adjustments)',
    amount: otherIncome,
    indent: 1,
  });
  if (otherIncome !== 0 && data.manualEntries.incomeByAccount?.length) {
    data.manualEntries.incomeByAccount.forEach((c) => {
      rows.push({
        kind: 'item',
        label: cleanLabel(c.name),
        amount: c.total,
        indent: 2,
      });
    });
  }

  rows.push({
    kind: 'total',
    sno: '3',
    label: 'Total Income (1 + 2)',
    amount: totalIncome,
  });

  rows.push({ kind: 'section', label: 'B. Expenditure' });
  rows.push({
    kind: 'item',
    sno: '4',
    label: 'Cost of goods sold / Direct costs',
    amount: data.costOfGoodsSold.total,
    indent: 1,
  });
  rows.push({
    kind: 'subtotal',
    sno: '5',
    label: 'Gross Profit (3 − 4)',
    amount: data.grossProfit,
  });

  rows.push({
    kind: 'item',
    sno: '6',
    label: 'Indirect / Operating expenses',
    indent: 1,
  });
  if (data.operatingExpenses.byCategory.length === 0) {
    rows.push({
      kind: 'item',
      label: 'Nil',
      amount: 0,
      indent: 2,
    });
  } else {
    data.operatingExpenses.byCategory.forEach((c, i) => {
      rows.push({
        kind: 'item',
        sno: `6.${i + 1}`,
        label: cleanLabel(c.name),
        amount: c.total,
        indent: 2,
      });
    });
  }
  rows.push({
    kind: 'subtotal',
    label: 'Total operating expenses',
    amount: data.operatingExpenses.total,
    indent: 1,
  });

  if (otherExpense !== 0) {
    rows.push({
      kind: 'item',
      sno: '7',
      label: 'Other expenses (journal adjustments)',
      amount: otherExpense,
      indent: 1,
    });
    data.manualEntries.expenseByAccount?.forEach((c) => {
      rows.push({
        kind: 'item',
        label: cleanLabel(c.name),
        amount: c.total,
        indent: 2,
      });
    });
  }

  const totalExpenditure =
    data.costOfGoodsSold.total + data.operatingExpenses.total + otherExpense;
  rows.push({
    kind: 'total',
    sno: otherExpense !== 0 ? '8' : '7',
    label: 'Total Expenditure',
    amount: totalExpenditure,
  });

  rows.push({ kind: 'section', label: 'C. Profit / Loss' });
  rows.push({
    kind: 'subtotal',
    sno: otherExpense !== 0 ? '9' : '8',
    label: 'Profit before tax / Operating income',
    amount: data.operatingIncome,
  });
  rows.push({
    kind: 'total',
    sno: otherExpense !== 0 ? '10' : '9',
    label: data.netIncome >= 0 ? 'Net Profit for the period' : 'Net Loss for the period',
    amount: data.netIncome,
  });

  rows.push({ kind: 'section', label: 'D. Tax memo (GST — not part of taxable P&L)' });
  rows.push({
    kind: 'note',
    label: 'Output tax collected',
    amount: data.taxes.outputTax,
    indent: 1,
  });
  rows.push({
    kind: 'note',
    label: 'Input tax paid',
    amount: data.taxes.inputTax,
    indent: 1,
  });
  rows.push({
    kind: 'note',
    label: 'Net GST',
    amount: data.taxes.netTax,
    indent: 1,
  });

  return rows;
}

export default function ProfitLossReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const yearStart = isoDate(new Date(new Date().getFullYear(), 0, 1));
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(`${Constants.GET_PROFIT_LOSS_URL}?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load profit & loss report');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Profit & Loss</h1>
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

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="pnl-print-root"
          title="Statement of Profit and Loss"
          subtitle={`for the period from ${formatDate(data.period.from)} to ${formatDate(data.period.to)} (ITR / Schedule P&L style)`}
          footnote="Figures are as per books maintained in FastBillings. GST amounts in Section D are for memo only and are excluded from net profit computation above."
        >
          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={`${reportTable.th} w-14`}>S.No</th>
                <th className={reportTable.th}>Particulars</th>
                <th className={`${reportTable.thRight} w-40`}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                if (row.kind === 'section') {
                  return (
                    <tr key={i}>
                      <td colSpan={3} className={reportTable.section}>
                        {row.label}
                      </td>
                    </tr>
                  );
                }

                const pad =
                  row.indent === 2 ? 'pl-8' : row.indent === 1 ? 'pl-4' : 'pl-2';
                const isStrong = row.kind === 'total' || row.kind === 'subtotal';
                const amountClass =
                  row.kind === 'total'
                    ? reportTable.total
                    : row.kind === 'subtotal'
                      ? reportTable.subtotal
                      : '';

                return (
                  <tr key={i}>
                    <td className={`${reportTable.td} text-center`}>{row.sno || ''}</td>
                    <td
                      className={`${reportTable.td} ${pad} ${
                        isStrong ? 'font-semibold' : ''
                      } ${row.kind === 'note' ? 'italic text-gray-600' : ''}`}
                    >
                      {row.label}
                    </td>
                    <td className={`${reportTable.tdRight} ${amountClass}`}>
                      {row.amount !== undefined ? formatInr(row.amount) : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
