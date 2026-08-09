import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import useDateFormatter from '@hooks/useDateFormatter';
import PageBackButton from '@components/admin/layouts/PageBackButton';
import ReportPrintShell, {
  formatInr,
  reportTable,
} from '@components/admin/reports/ReportPrintShell';

interface Form24qData {
  form: string;
  period: {
    fy: string;
    quarter: string;
    quarterNumber: number;
    from: string;
    to: string;
  };
  deductor: { name: string; gstin: string | null; tan: string | null };
  notes?: string;
  warnings?: string[];
  readiness: { canFile: boolean; blockers: string[] };
  summary: {
    deducteeRowCount: number;
    panMissingCount: number;
    totalAmountPaidOrCredited: number;
    totalTds: number;
  };
  challanSummary?: {
    count: number;
    completeCount: number;
    depositedTotal: number;
    totalTax: number;
    shortfall: number;
  };
  allocationSummary?: {
    mappedDocumentCount: number;
    unmappedDocumentCount: number;
    mappedTax: number;
    unmappedTax: number;
  };
  challans?: Array<{
    id: string;
    bsrCode: string;
    challanNo: string;
    depositDate: string;
    section: string | null;
    amount: number;
    allocatedTotal?: number;
  }>;
  annexure: Array<{
    sno: number;
    deducteeName: string;
    deducteePan: string | null;
    panMissing: boolean;
    employeeCode: string | null;
    section: string;
    amountPaidOrCredited: number;
    tdsAmount: number;
    allocatedAmount?: number;
    challanNos?: string[];
    dateOfCreditOrPayment: string;
  }>;
}

interface Employee {
  id: string;
  name: string;
  pan: string | null;
  employeeCode: string | null;
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

export default function Form24qReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [quarter, setQuarter] = useState(currentQuarterLabel());
  const [data, setData] = useState<Form24qData | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({ name: '', pan: '', employeeCode: '' });
  const [dedForm, setDedForm] = useState({
    employeeId: '',
    payDate: new Date().toISOString().slice(0, 10),
    amountPaid: '',
    tdsAmount: '',
  });

  async function loadEmployees() {
    try {
      const r = await axios.get(Constants.FETCH_SALARY_TDS_EMPLOYEES_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const list = (r.data?.data?.employees ?? []) as Employee[];
      setEmployees(list);
      if (!dedForm.employeeId && list[0]) {
        setDedForm((f) => ({ ...f, employeeId: list[0].id }));
      }
    } catch {
      /* ignore */
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_FORM_24Q_URL}?quarter=${encodeURIComponent(quarter)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load Form 24Q worksheet');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addEmployee() {
    if (!empForm.name.trim()) {
      toast.error('Employee name required');
      return;
    }
    try {
      await axios.post(
        Constants.FETCH_SALARY_TDS_EMPLOYEES_URL,
        {
          name: empForm.name.trim(),
          pan: empForm.pan.trim() || null,
          employeeCode: empForm.employeeCode.trim() || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Employee added');
      setEmpForm({ name: '', pan: '', employeeCode: '' });
      await loadEmployees();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to add employee';
      toast.error(msg);
    }
  }

  async function addDeduction() {
    if (!dedForm.employeeId || !(Number(dedForm.amountPaid) > 0)) {
      toast.error('Employee and amount paid are required');
      return;
    }
    try {
      await axios.post(
        Constants.FETCH_SALARY_TDS_DEDUCTIONS_URL,
        {
          employeeId: dedForm.employeeId,
          payDate: dedForm.payDate,
          amountPaid: Number(dedForm.amountPaid),
          tdsAmount: Number(dedForm.tdsAmount || 0),
          section: '192',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Salary TDS line recorded');
      setDedForm((f) => ({ ...f, amountPaid: '', tdsAmount: '' }));
      await load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to save deduction';
      toast.error(msg);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-4">
      <PageBackButton />
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">
            Form 24Q
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Books worksheet — not TRACES filing
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Quarterly salary TDS u/s 192 annexure — books only, not full payroll.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-3 py-1 text-sm border rounded disabled:opacity-50"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">FY quarter</label>
          <select
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
            className="p-1 border rounded text-sm"
          >
            {quarterOptions().map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-3 print:hidden">
        <div className="border rounded p-3 space-y-2 text-sm">
          <h2 className="font-semibold">Add employee</h2>
          <input
            placeholder="Name"
            value={empForm.name}
            onChange={(e) => setEmpForm((f) => ({ ...f, name: e.target.value }))}
            className="border rounded px-2 py-1 w-full"
          />
          <div className="flex gap-2">
            <input
              placeholder="PAN"
              value={empForm.pan}
              onChange={(e) => setEmpForm((f) => ({ ...f, pan: e.target.value.toUpperCase() }))}
              className="border rounded px-2 py-1 w-full"
              maxLength={10}
            />
            <input
              placeholder="Code"
              value={empForm.employeeCode}
              onChange={(e) => setEmpForm((f) => ({ ...f, employeeCode: e.target.value }))}
              className="border rounded px-2 py-1 w-28"
            />
          </div>
          <button type="button" onClick={addEmployee} className="px-3 py-1 bg-slate-800 text-white rounded">
            Add employee
          </button>
        </div>
        <div className="border rounded p-3 space-y-2 text-sm">
          <h2 className="font-semibold">Add salary TDS line</h2>
          <select
            value={dedForm.employeeId}
            onChange={(e) => setDedForm((f) => ({ ...f, employeeId: e.target.value }))}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="">Select employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.pan ? ` (${e.pan})` : ''}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={dedForm.payDate}
              onChange={(e) => setDedForm((f) => ({ ...f, payDate: e.target.value }))}
              className="border rounded px-2 py-1"
            />
            <input
              type="number"
              placeholder="Amount paid"
              value={dedForm.amountPaid}
              onChange={(e) => setDedForm((f) => ({ ...f, amountPaid: e.target.value }))}
              className="border rounded px-2 py-1 w-32"
            />
            <input
              type="number"
              placeholder="TDS"
              value={dedForm.tdsAmount}
              onChange={(e) => setDedForm((f) => ({ ...f, tdsAmount: e.target.value }))}
              className="border rounded px-2 py-1 w-28"
            />
          </div>
          <button type="button" onClick={addDeduction} className="px-3 py-1 bg-purple-600 text-white rounded">
            Add deduction
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && (
        <ReportPrintShell
          printId="form-24q-print-root"
          title="Form 24Q — Statement of TDS from salaries under section 192"
          subtitle={`FY ${data.period.fy} · ${data.period.quarter} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              <span className="font-semibold">Deductor:</span> {data.deductor.name}
            </div>
            <div>
              <span className="font-semibold">GSTIN:</span> {data.deductor.gstin || '—'} ·{' '}
              <span className="font-semibold">TAN:</span> {data.deductor.tan || 'Not captured'}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready for TRACES'} —{' '}
              {data.summary.panMissingCount} row(s) missing PAN
              {data.challanSummary
                ? ` · challans deposited ₹${formatInr(data.challanSummary.depositedTotal)} vs salary TDS ₹${formatInr(data.challanSummary.totalTax)}`
                : ''}
              {data.allocationSummary
                ? ` · line-mapped ₹${formatInr(data.allocationSummary.mappedTax)} · unmapped docs ${data.allocationSummary.unmappedDocumentCount}`
                : ''}
              .
            </div>
          </div>

          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>BSR code</th>
                <th className={reportTable.th}>Challan no</th>
                <th className={reportTable.th}>Deposit date</th>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.thRight}>Amount (₹)</th>
                <th className={reportTable.thRight}>Mapped (₹)</th>
              </tr>
            </thead>
            <tbody>
              {!data.challans || data.challans.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${reportTable.td} text-center text-gray-500`}>
                    No TDS deposit challans recorded for this quarter.
                  </td>
                </tr>
              ) : (
                data.challans.map((c) => (
                  <tr key={c.id}>
                    <td className={reportTable.td}>{c.bsrCode}</td>
                    <td className={reportTable.td}>{c.challanNo}</td>
                    <td className={reportTable.td}>{formatDate(c.depositDate)}</td>
                    <td className={reportTable.td}>{c.section || '—'}</td>
                    <td className={reportTable.tdRight}>{formatInr(c.amount)}</td>
                    <td className={reportTable.tdRight}>{formatInr(c.allocatedTotal ?? 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={`${reportTable.th} w-12`}>S.No</th>
                <th className={reportTable.th}>Employee</th>
                <th className={reportTable.th}>PAN</th>
                <th className={reportTable.th}>Section</th>
                <th className={reportTable.th}>Challan</th>
                <th className={reportTable.th}>Date</th>
                <th className={reportTable.thRight}>Amount (₹)</th>
                <th className={reportTable.thRight}>TDS (₹)</th>
                <th className={reportTable.thRight}>Mapped (₹)</th>
              </tr>
            </thead>
            <tbody>
              {data.annexure.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`${reportTable.td} text-center text-gray-500`}>
                    No salary TDS deductions in this quarter.
                  </td>
                </tr>
              ) : (
                data.annexure.map((r) => (
                  <tr key={r.sno}>
                    <td className={reportTable.td}>{r.sno}</td>
                    <td className={reportTable.td}>
                      {r.deducteeName}
                      {r.employeeCode ? (
                        <div className="text-[10px] text-gray-500">{r.employeeCode}</div>
                      ) : null}
                    </td>
                    <td className={`${reportTable.td} ${r.panMissing ? 'text-amber-700' : ''}`}>
                      {r.deducteePan || 'Missing'}
                    </td>
                    <td className={reportTable.td}>{r.section}</td>
                    <td className={reportTable.td}>
                      {(r.challanNos || []).length ? (r.challanNos || []).join(', ') : '—'}
                    </td>
                    <td className={reportTable.td}>{formatDate(r.dateOfCreditOrPayment)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.amountPaidOrCredited)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.tdsAmount)}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.allocatedAmount ?? 0)}</td>
                  </tr>
                ))
              )}
              {data.annexure.length > 0 ? (
                <tr>
                  <td className={`${reportTable.td} font-bold`} colSpan={6}>
                    Total ({data.summary.deducteeRowCount} rows)
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(data.summary.totalAmountPaidOrCredited)}
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(data.summary.totalTds)}
                  </td>
                  <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                    {formatInr(data.allocationSummary?.mappedTax ?? 0)}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {data.warnings && data.warnings.length > 0 ? (
            <ul className="mt-4 text-[11px] text-gray-600 list-disc pl-5 space-y-0.5">
              {data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
        </ReportPrintShell>
      )}
    </div>
  );
}
