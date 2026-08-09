import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

interface ExpenseBlock {
  summary: {
    expenseCount: number;
    categoryCount: number;
    grossAmount: number;
    taxAmount: number;
    netAmount: number;
    unclassifiedExpenseCount: number;
  };
  byClass: Array<{
    taxClass: string;
    expenseCount: number;
    categoryCount: number;
    grossAmount: number;
    taxAmount: number;
    netAmount: number;
  }>;
  categories: Array<{
    categoryId: string;
    categoryTitle: string;
    taxClass: string;
    expenseCount: number;
    grossAmount: number;
    taxAmount: number;
    netAmount: number;
  }>;
}

interface IncomeBlock {
  summary: {
    invoiceCount: number;
    salesDebitNoteCount?: number;
    creditNoteCount?: number;
    otherReceiptCount?: number;
    invoiceLineCount?: number;
    salesDebitNoteLineCount?: number;
    creditNoteLineCount?: number;
    lineCount: number;
    categoryCount: number;
    invoiceTaxableAmount?: number;
    salesDebitNoteTaxableAmount?: number;
    creditNoteTaxableAmount?: number;
    otherReceiptAmount?: number;
    taxableAmount: number;
    taxAmount: number;
    lineTotal: number;
    unclassifiedLineCount: number;
  };
  byClass: Array<{
    taxClass: string;
    lineCount: number;
    categoryCount: number;
    invoiceCount: number;
    salesDebitNoteCount?: number;
    creditNoteCount?: number;
    otherReceiptCount?: number;
    invoiceTaxableAmount?: number;
    salesDebitNoteTaxableAmount?: number;
    creditNoteTaxableAmount?: number;
    otherReceiptAmount?: number;
    taxableAmount: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  categories: Array<{
    categoryId: string;
    categoryTitle: string;
    taxClass: string;
    lineCount: number;
    invoiceCount: number;
    salesDebitNoteCount?: number;
    creditNoteCount?: number;
    otherReceiptCount?: number;
    invoiceTaxableAmount?: number;
    salesDebitNoteTaxableAmount?: number;
    creditNoteTaxableAmount?: number;
    otherReceiptAmount?: number;
    taxableAmount: number;
    taxAmount: number;
    lineTotal: number;
  }>;
  otherReceipts?: Array<{
    sno: number;
    id: string;
    receiptDate: string;
    description: string;
    taxClass: string;
    amount: number;
    notes?: string | null;
  }>;
}

interface DisallowanceWorksheets {
  notes?: string;
  totalPutativeDisallowance: number;
  section40A3: {
    threshold: number;
    bucketCount?: number;
    rowCount: number;
    expenseCount: number;
    supplierPaymentCount: number;
    exceptedCount?: number;
    totalPutativeDisallowance: number;
  };
  section43Bh: {
    daysLimit: number;
    msmeSupplierCount: number;
    disallowRowCount: number;
    totalPutativeDisallowance: number;
    latePaidRowCount: number;
    latePaidAmount: number;
  };
  section43B?: {
    disallowRowCount: number;
    totalPutativeDisallowance: number;
    latePaidRowCount: number;
    latePaidAmount: number;
    returnDueDate?: string;
  };
  section40A2?: {
    relatedSupplierCount: number;
    purchaseRowCount: number;
    expenseRowCount: number;
    purchaseAmount: number;
    expenseAmount: number;
    totalRelatedPartyPayments: number;
    fmvTaggedRowCount?: number;
    totalExcessOverFmv?: number;
  };
  section36Va?: {
    lineCount: number;
    pfReceived: number;
    esiReceived: number;
    disallowRowCount: number;
    totalPutativeDisallowance: number;
  };
  section40Aia?: {
    disallowRate: number;
    rowCount: number;
    nonDeductionCount: number;
    nonDepositCount: number;
    totalPutativeDisallowance: number;
  };
  section40Ai?: {
    disallowRate: number;
    rowCount: number;
    nonDeductionCount: number;
    nonDepositCount: number;
    totalPutativeDisallowance: number;
  };
}

interface TaxAuditClassData {
  period: { fy: string; from: string; to: string };
  notes?: string;
  warnings?: string[];
  readiness: { canFile: boolean; blockers: string[] };
  expense?: ExpenseBlock;
  income?: IncomeBlock;
  summary?: ExpenseBlock['summary'];
  byClass?: ExpenseBlock['byClass'];
  categories?: ExpenseBlock['categories'];
  disallowanceWorksheets?: DisallowanceWorksheets;
}

const TAX_CLASSES = ['BUSINESS', 'EXEMPT', 'CAPITAL', 'OTHER', 'UNCLASSIFIED'] as const;

function currentFy(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (m >= 3) return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return `${y - 1}-${String(y % 100).padStart(2, '0')}`;
}

export default function TaxAuditClassificationReport() {
  const token = useSelector((s: RootState) => s.auth.token);
  const { formatDate } = useDateFormatter();
  const [fy, setFy] = useState(currentFy());
  const [data, setData] = useState<TaxAuditClassData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    receiptDate: new Date().toISOString().slice(0, 10),
    description: '',
    amount: '',
    taxClass: 'OTHER' as (typeof TAX_CLASSES)[number],
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await axios.get(
        `${Constants.GET_TAX_AUDIT_CLASSIFICATION_URL}?fy=${encodeURIComponent(fy)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setData(r.data?.data ?? null);
    } catch {
      setError('Failed to load tax-audit classification worksheet');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveReceipt() {
    if (!form.description.trim() || !(Number(form.amount) > 0)) {
      toast.error('Description and amount are required');
      return;
    }
    setSaving(true);
    try {
      await axios.post(
        Constants.FETCH_TAX_AUDIT_OTHER_RECEIPTS_URL,
        {
          receiptDate: form.receiptDate,
          description: form.description.trim(),
          amount: Number(form.amount),
          taxClass: form.taxClass,
          notes: form.notes.trim() || null,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      toast.success('Other receipt recorded');
      setForm((f) => ({ ...f, description: '', amount: '', notes: '' }));
      await load();
    } catch (e: unknown) {
      const msg =
        axios.isAxiosError(e) && e.response?.data?.message
          ? String(e.response.data.message)
          : 'Failed to save';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function removeReceipt(id: string) {
    try {
      await axios.delete(`${Constants.FETCH_TAX_AUDIT_OTHER_RECEIPTS_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success('Deleted');
      await load();
    } catch {
      toast.error('Failed to delete');
    }
  }

  const expense: ExpenseBlock | null = data
    ? data.expense || {
        summary: data.summary!,
        byClass: data.byClass || [],
        categories: data.categories || [],
      }
    : null;
  const income = data?.income ?? null;

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white space-y-4">
      <PageBackButton />
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">
            Tax-audit classification
            <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800">
              Books worksheet — not Form 3CD
            </span>
          </h1>
          <p className="text-sm text-gray-500">
            Expenses by tax class; income = invoices + sales DNs − credit notes + other receipts.
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
          <label className="block text-xs text-gray-500">FY (YYYY-YY)</label>
          <input
            value={fy}
            onChange={(e) => setFy(e.target.value)}
            className="p-1 border rounded text-sm w-28"
          />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">
          Reload
        </button>
      </div>

      <div className="border rounded p-3 space-y-2 print:hidden">
        <h2 className="text-sm font-semibold">Add other receipt (manual)</h2>
        <div className="flex flex-wrap gap-3 items-end text-sm">
          <div>
            <label className="block text-xs text-gray-500">Date</label>
            <input
              type="date"
              value={form.receiptDate}
              onChange={(e) => setForm((f) => ({ ...f, receiptDate: e.target.value }))}
              className="border rounded px-2 py-1"
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className="block text-xs text-gray-500">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="border rounded px-2 py-1 w-full"
              placeholder="Interest, scrap sale, etc."
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Amount</label>
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="border rounded px-2 py-1 w-28"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Tax class</label>
            <select
              value={form.taxClass}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  taxClass: e.target.value as (typeof TAX_CLASSES)[number],
                }))
              }
              className="border rounded px-2 py-1"
            >
              {TAX_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={saveReceipt}
            className="px-3 py-1 bg-purple-600 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500 print:hidden">Loading…</p>}
      {error && <p className="text-red-600 print:hidden">{error}</p>}

      {data && expense && (
        <ReportPrintShell
          printId="tax-audit-class-print-root"
          title="Tax-audit classification"
          subtitle={`FY ${data.period.fy} · ${formatDate(data.period.from)} — ${formatDate(data.period.to)}`}
          footnote={data.notes}
          showSignatures={false}
        >
          <div className="mb-3 text-xs border border-black p-2 space-y-1">
            <div>
              Expenses: {expense.summary.expenseCount} · Invoices: {income?.summary.invoiceCount ?? 0} ·
              Sales DNs: {income?.summary.salesDebitNoteCount ?? 0} · Credit notes:{' '}
              {income?.summary.creditNoteCount ?? 0} · Other receipts:{' '}
              {income?.summary.otherReceiptCount ?? 0} · Lines: {income?.summary.lineCount ?? 0}
            </div>
            <div className="text-amber-800">
              Filing readiness: {data.readiness.canFile ? 'Ready' : 'Not ready for Form 3CD'} — books
              worksheet only.
            </div>
            {data.warnings?.length ? (
              <ul className="list-disc pl-4">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {data.disallowanceWorksheets && (
            <div className="mb-4 text-xs border border-black p-2 space-y-2">
              <div className="font-bold">Putative disallowance worksheets (books)</div>
              <p className="text-gray-600">{data.disallowanceWorksheets.notes}</p>
              <div className="print:hidden">
                <Link
                  to="/admin/accounting/reports/tax-audit-pack"
                  className="text-blue-700 underline"
                >
                  Open Form 3CD–style tax-audit pack index
                </Link>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div>
                  §40A(3) cash:{' '}
                  {data.disallowanceWorksheets.section40A3.bucketCount != null
                    ? `${data.disallowanceWorksheets.section40A3.bucketCount} bucket(s) / `
                    : ''}
                  {data.disallowanceWorksheets.section40A3.rowCount} doc(s) ·{' '}
                  {formatInr(data.disallowanceWorksheets.section40A3.totalPutativeDisallowance)}
                  {data.disallowanceWorksheets.section40A3.exceptedCount != null &&
                    data.disallowanceWorksheets.section40A3.exceptedCount > 0 && (
                      <div className="text-gray-500">
                        Rule 6DD excepted: {data.disallowanceWorksheets.section40A3.exceptedCount}
                      </div>
                    )}
                  <div className="print:hidden mt-1">
                    <Link
                      to="/admin/accounting/reports/cash-expense-disallowance"
                      className="text-blue-700 underline"
                    >
                      Open §40A(3) detail
                    </Link>
                  </div>
                </div>
                <div>
                  §43B(h) MSME: {data.disallowanceWorksheets.section43Bh.disallowRowCount} row(s) ·{' '}
                  {formatInr(data.disallowanceWorksheets.section43Bh.totalPutativeDisallowance)}
                  <div className="text-gray-500">
                    Late paid in FY: {data.disallowanceWorksheets.section43Bh.latePaidRowCount} ·{' '}
                    {formatInr(data.disallowanceWorksheets.section43Bh.latePaidAmount)}
                  </div>
                  <div className="print:hidden mt-1">
                    <Link
                      to="/admin/accounting/reports/msme-43bh-disallowance"
                      className="text-blue-700 underline"
                    >
                      Open §43B(h) detail
                    </Link>
                  </div>
                </div>
                {data.disallowanceWorksheets.section43B && (
                  <div>
                    §43B statutory: {data.disallowanceWorksheets.section43B.disallowRowCount} row(s) ·{' '}
                    {formatInr(data.disallowanceWorksheets.section43B.totalPutativeDisallowance)}
                    <div className="text-gray-500">
                      Late paid after due proxy:{' '}
                      {data.disallowanceWorksheets.section43B.latePaidRowCount} ·{' '}
                      {formatInr(data.disallowanceWorksheets.section43B.latePaidAmount)}
                    </div>
                    <div className="print:hidden mt-1">
                      <Link
                        to="/admin/accounting/reports/section-43b-disallowance"
                        className="text-blue-700 underline"
                      >
                        Open §43B detail
                      </Link>
                    </div>
                  </div>
                )}
                {data.disallowanceWorksheets.section40A2 && (
                  <div>
                    §40A(2) related-party:{' '}
                    {data.disallowanceWorksheets.section40A2.relatedSupplierCount} supplier(s) ·{' '}
                    {formatInr(data.disallowanceWorksheets.section40A2.totalRelatedPartyPayments)}{' '}
                    disclosure
                    <div className="text-gray-500">
                      FMV-tagged {data.disallowanceWorksheets.section40A2.fmvTaggedRowCount ?? 0} ·
                      putative excess{' '}
                      {formatInr(data.disallowanceWorksheets.section40A2.totalExcessOverFmv ?? 0)}
                    </div>
                    <div className="print:hidden mt-1">
                      <Link
                        to="/admin/accounting/reports/section-40a-2-related-party"
                        className="text-blue-700 underline"
                      >
                        Open §40A(2) detail
                      </Link>
                    </div>
                  </div>
                )}
                {data.disallowanceWorksheets.section36Va && (
                  <div>
                    §36(1)(va) employee PF/ESI:{' '}
                    {data.disallowanceWorksheets.section36Va.disallowRowCount} row(s) ·{' '}
                    {formatInr(data.disallowanceWorksheets.section36Va.totalPutativeDisallowance)}
                    <div className="text-gray-500">
                      PF received {formatInr(data.disallowanceWorksheets.section36Va.pfReceived)} ·
                      ESI {formatInr(data.disallowanceWorksheets.section36Va.esiReceived)}
                    </div>
                    <div className="print:hidden mt-1">
                      <Link
                        to="/admin/accounting/reports/section-36-1-va-disallowance"
                        className="text-blue-700 underline"
                      >
                        Open §36(1)(va) detail
                      </Link>
                    </div>
                  </div>
                )}
                {data.disallowanceWorksheets.section40Aia && (
                  <div>
                    §40(a)(ia) resident: {data.disallowanceWorksheets.section40Aia.rowCount} row(s) ·{' '}
                    {formatInr(data.disallowanceWorksheets.section40Aia.totalPutativeDisallowance)}
                    <div className="text-gray-500">
                      Non-deduction {data.disallowanceWorksheets.section40Aia.nonDeductionCount} ·
                      non-deposit {data.disallowanceWorksheets.section40Aia.nonDepositCount}
                    </div>
                    <div className="print:hidden mt-1">
                      <Link
                        to="/admin/accounting/reports/section-40a-ia-disallowance"
                        className="text-blue-700 underline"
                      >
                        Open §40(a)(ia) detail
                      </Link>
                    </div>
                  </div>
                )}
                {data.disallowanceWorksheets.section40Ai && (
                  <div>
                    §40(a)(i) NR: {data.disallowanceWorksheets.section40Ai.rowCount} row(s) ·{' '}
                    {formatInr(data.disallowanceWorksheets.section40Ai.totalPutativeDisallowance)}
                    <div className="text-gray-500">
                      Non-deduction {data.disallowanceWorksheets.section40Ai.nonDeductionCount} ·
                      non-deposit {data.disallowanceWorksheets.section40Ai.nonDepositCount}
                    </div>
                    <div className="print:hidden mt-1">
                      <Link
                        to="/admin/accounting/reports/section-40a-i-disallowance"
                        className="text-blue-700 underline"
                      >
                        Open §40(a)(i) detail
                      </Link>
                    </div>
                  </div>
                )}
                <div className="font-medium md:col-span-3">
                  Combined putative: {formatInr(data.disallowanceWorksheets.totalPutativeDisallowance)}
                </div>
              </div>
            </div>
          )}

          <h2 className="text-sm font-bold mb-2">Expenses by tax class</h2>
          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Tax class</th>
                <th className={reportTable.thRight}>Categories</th>
                <th className={reportTable.thRight}>Expenses</th>
                <th className={reportTable.thRight}>Gross</th>
                <th className={reportTable.thRight}>GST</th>
                <th className={reportTable.thRight}>Net</th>
              </tr>
            </thead>
            <tbody>
              {expense.byClass.map((b) => (
                <tr key={b.taxClass}>
                  <td className={reportTable.td}>{b.taxClass}</td>
                  <td className={reportTable.tdRight}>{b.categoryCount}</td>
                  <td className={reportTable.tdRight}>{b.expenseCount}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.grossAmount)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.taxAmount)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.netAmount)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${reportTable.td} font-bold`} colSpan={3}>
                  Total
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(expense.summary.grossAmount)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(expense.summary.taxAmount)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(expense.summary.netAmount)}
                </td>
              </tr>
            </tbody>
          </table>

          <h2 className="text-sm font-bold mb-2">Expense categories</h2>
          <table className={`${reportTable.table} mb-6`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Category</th>
                <th className={reportTable.th}>Tax class</th>
                <th className={reportTable.thRight}>Count</th>
                <th className={reportTable.thRight}>Net</th>
              </tr>
            </thead>
            <tbody>
              {expense.categories.map((c) => (
                <tr key={c.categoryId}>
                  <td className={reportTable.td}>{c.categoryTitle}</td>
                  <td className={reportTable.td}>{c.taxClass}</td>
                  <td className={reportTable.tdRight}>{c.expenseCount}</td>
                  <td className={reportTable.tdRight}>{formatInr(c.netAmount)}</td>
                </tr>
              ))}
              {expense.categories.length === 0 && (
                <tr>
                  <td className={reportTable.td} colSpan={4}>
                    No expenses in this FY.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <h2 className="text-sm font-bold mb-2">Income by tax class (inv + SDN − CN + other)</h2>
          <table className={`${reportTable.table} mb-4`}>
            <thead>
              <tr>
                <th className={reportTable.th}>Tax class</th>
                <th className={reportTable.thRight}>Inv.</th>
                <th className={reportTable.thRight}>SDN</th>
                <th className={reportTable.thRight}>CN</th>
                <th className={reportTable.thRight}>Other</th>
                <th className={reportTable.thRight}>Net taxable</th>
                <th className={reportTable.thRight}>Net GST</th>
              </tr>
            </thead>
            <tbody>
              {(income?.byClass || []).map((b) => (
                <tr key={b.taxClass}>
                  <td className={reportTable.td}>{b.taxClass}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.invoiceTaxableAmount ?? 0)}</td>
                  <td className={reportTable.tdRight}>
                    {formatInr(b.salesDebitNoteTaxableAmount ?? 0)}
                  </td>
                  <td className={reportTable.tdRight}>{formatInr(b.creditNoteTaxableAmount ?? 0)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.otherReceiptAmount ?? 0)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.taxableAmount)}</td>
                  <td className={reportTable.tdRight}>{formatInr(b.taxAmount)}</td>
                </tr>
              ))}
              <tr>
                <td className={`${reportTable.td} font-bold`}>Total</td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(income?.summary.invoiceTaxableAmount ?? 0)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(income?.summary.salesDebitNoteTaxableAmount ?? 0)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(income?.summary.creditNoteTaxableAmount ?? 0)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(income?.summary.otherReceiptAmount ?? 0)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(income?.summary.taxableAmount ?? 0)}
                </td>
                <td className={`${reportTable.tdRight} ${reportTable.total}`}>
                  {formatInr(income?.summary.taxAmount ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>

          <h2 className="text-sm font-bold mb-2">Other receipts (manual)</h2>
          <table className={`${reportTable.table} mb-6`}>
            <thead>
              <tr>
                <th className={`${reportTable.th} w-12`}>S.No</th>
                <th className={reportTable.th}>Date</th>
                <th className={reportTable.th}>Description</th>
                <th className={reportTable.th}>Tax class</th>
                <th className={reportTable.thRight}>Amount</th>
                <th className={`${reportTable.th} print:hidden`}> </th>
              </tr>
            </thead>
            <tbody>
              {(income?.otherReceipts || []).length === 0 ? (
                <tr>
                  <td className={reportTable.td} colSpan={6}>
                    No other receipts in this FY.
                  </td>
                </tr>
              ) : (
                (income?.otherReceipts || []).map((r) => (
                  <tr key={r.id}>
                    <td className={reportTable.td}>{r.sno}</td>
                    <td className={reportTable.td}>{formatDate(r.receiptDate)}</td>
                    <td className={reportTable.td}>{r.description}</td>
                    <td className={reportTable.td}>{r.taxClass}</td>
                    <td className={reportTable.tdRight}>{formatInr(r.amount)}</td>
                    <td className={`${reportTable.td} print:hidden`}>
                      <button
                        type="button"
                        onClick={() => removeReceipt(r.id)}
                        className="text-xs text-red-600 underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <h2 className="text-sm font-bold mb-2">Income product categories</h2>
          <table className={reportTable.table}>
            <thead>
              <tr>
                <th className={reportTable.th}>Category</th>
                <th className={reportTable.th}>Tax class</th>
                <th className={reportTable.thRight}>Inv.</th>
                <th className={reportTable.thRight}>SDN</th>
                <th className={reportTable.thRight}>CN</th>
                <th className={reportTable.thRight}>Other</th>
                <th className={reportTable.thRight}>Net taxable</th>
              </tr>
            </thead>
            <tbody>
              {(income?.categories || []).map((c) => (
                <tr key={c.categoryId}>
                  <td className={reportTable.td}>{c.categoryTitle}</td>
                  <td className={reportTable.td}>{c.taxClass}</td>
                  <td className={reportTable.tdRight}>{formatInr(c.invoiceTaxableAmount ?? 0)}</td>
                  <td className={reportTable.tdRight}>
                    {formatInr(c.salesDebitNoteTaxableAmount ?? 0)}
                  </td>
                  <td className={reportTable.tdRight}>{formatInr(c.creditNoteTaxableAmount ?? 0)}</td>
                  <td className={reportTable.tdRight}>{formatInr(c.otherReceiptAmount ?? 0)}</td>
                  <td className={reportTable.tdRight}>{formatInr(c.taxableAmount)}</td>
                </tr>
              ))}
              {(income?.categories || []).length === 0 && (
                <tr>
                  <td className={reportTable.td} colSpan={7}>
                    No income lines in this FY.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </ReportPrintShell>
      )}
    </div>
  );
}
