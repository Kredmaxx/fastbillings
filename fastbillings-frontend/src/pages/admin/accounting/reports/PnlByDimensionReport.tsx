import { useEffect, useState, type SyntheticEvent } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import SearchableDropdown from '@components/admin/SearchableDropdown';
import useDateFormatter from '@hooks/useDateFormatter';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface DimensionOption {
  id: string;
  name: string;
  code?: string;
}

interface PnlData {
  revenue?: number;
  expense?: number;
  net?: number;
  [key: string]: unknown;
}

type DimensionType = 'cost-center' | 'project';

function formatFieldLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

export default function PnlByDimensionReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const today = isoDate(new Date());
  const yearStart = isoDate(new Date(new Date().getFullYear(), 0, 1));

  const [dimension, setDimension] = useState<DimensionType>('cost-center');
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [options, setOptions] = useState<DimensionOption[]>([]);
  const [selected, setSelected] = useState<DimensionOption | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);

  async function loadOptions(dim: DimensionType) {
    setListLoading(true);
    setSelected(null);
    setInputValue('');
    setData(null);
    try {
      const url = dim === 'cost-center' ? Constants.FETCH_COST_CENTERS_URL : Constants.FETCH_PROJECTS_URL;
      const r = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      const raw: DimensionOption[] = r.data?.data ?? [];
      setOptions(raw.map((item) => ({
        id: String(item.id),
        name: item.name ?? item.code ?? String(item.id),
        code: item.code,
      })));
    } catch {
      toast.error(`Failed to load ${dim === 'cost-center' ? 'cost centers' : 'projects'}`);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadOptions(dimension);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimension]);

  async function load() {
    if (!selected) {
      toast.error(`Please select a ${dimension === 'cost-center' ? 'cost center' : 'project'} first.`);
      return;
    }
    setLoading(true);
    try {
      const baseUrl = dimension === 'cost-center'
        ? Constants.FETCH_PNL_BY_COST_CENTER_URL
        : Constants.FETCH_PNL_BY_PROJECT_URL;
      const paramKey = dimension === 'cost-center' ? 'costCenterId' : 'projectId';
      const r = await axios.get(`${baseUrl}?from=${from}&to=${to}&${paramKey}=${selected.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(r.data?.data ?? null);
    } catch {
      toast.error('Failed to load P&L report');
    } finally {
      setLoading(false);
    }
  }

  function handleDimensionChange(dim: DimensionType) {
    setDimension(dim);
    setData(null);
  }

  const revenue = typeof data?.revenue === 'number' ? data.revenue : null;
  const expense = typeof data?.expense === 'number' ? data.expense : null;
  const net = typeof data?.net === 'number' ? data.net : null;

  const extraKeys = data
    ? Object.keys(data).filter((k) => !['revenue', 'expense', 'net'].includes(k))
    : [];

  const dimensionLabel = dimension === 'cost-center' ? 'Cost Centre' : 'Project';

  return (
    <div className="p-6 max-w-4xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">P&amp;L by Dimension</h1>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="flex gap-2 mb-6 print:hidden">
        <button
          type="button"
          onClick={() => handleDimensionChange('cost-center')}
          className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
            dimension === 'cost-center'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'text-gray-600 border-gray-300 hover:border-purple-400'
          }`}
        >
          Cost Center
        </button>
        <button
          type="button"
          onClick={() => handleDimensionChange('project')}
          className={`px-4 py-1.5 text-sm rounded-full border transition-colors ${
            dimension === 'project'
              ? 'bg-purple-600 text-white border-purple-600'
              : 'text-gray-600 border-gray-300 hover:border-purple-400'
          }`}
        >
          Project
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6 print:hidden">
        <div className="min-w-[200px]">
          <SearchableDropdown
            label={dimension === 'cost-center' ? 'Cost Center' : 'Project'}
            value={selected}
            options={options}
            inputValue={inputValue}
            onInputChange={(_e: SyntheticEvent, v: string) => setInputValue(v)}
            onChange={(_e: SyntheticEvent, v: DimensionOption | null) => setSelected(v)}
            loading={listLoading}
            placeholder={`Select ${dimension === 'cost-center' ? 'cost center' : 'project'}`}
          />
        </div>
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
        <button
          type="button"
          onClick={load}
          disabled={loading || !selected}
          className="px-3 py-1 text-sm bg-purple-600 text-white rounded disabled:opacity-50"
        >
          Run Report
        </button>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}

      {!loading && data && selected && (
        <ReportPrintShell
          printId="pnl-dimension-print-root"
          title={`Profit & Loss by ${dimensionLabel}`}
          subtitle={`${selected.name} — from ${formatDate(from)} to ${formatDate(to)}`}
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
              <tr>
                <td className={reportTable.td}>Revenue</td>
                <td className={reportTable.tdRight}>
                  {revenue !== null ? formatInr(revenue) : '—'}
                </td>
              </tr>
              <tr>
                <td className={reportTable.td}>Expense</td>
                <td className={reportTable.tdRight}>
                  {expense !== null ? formatInr(expense) : '—'}
                </td>
              </tr>
              <tr>
                <td className={`${reportTable.td} ${reportTable.total}`}>
                  Net {net !== null && net >= 0 ? 'Profit' : 'Loss'}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {net !== null ? formatInr(net) : '—'}
                </td>
              </tr>
              {extraKeys.length > 0 && (
                <>
                  <tr>
                    <td colSpan={2} className={reportTable.section}>
                      Additional Particulars
                    </td>
                  </tr>
                  {extraKeys.map((k) => (
                    <tr key={k}>
                      <td className={`${reportTable.td} capitalize`}>{formatFieldLabel(k)}</td>
                      <td className={reportTable.tdRight}>
                        {typeof data[k] === 'number'
                          ? formatInr(data[k] as number)
                          : String(data[k])}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
