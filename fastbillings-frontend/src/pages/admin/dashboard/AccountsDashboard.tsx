import Constants from '@constants/api';
import useDateFormatter from '@hooks/useDateFormatter';
import type { RootState } from '@store/index';
import axios from 'axios';
import { TrendingUp, TrendingDown, Scale, Landmark, ArrowRight, Wallet, Receipt, PiggyBank, CalendarClock, Repeat } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CardItem } from '@components/admin/dashboard/CardItem';
import { DashboardCard } from '@components/admin/dashboard/DashboardCard';
import Table from '@components/admin/Table';
import TableRow from '@components/admin/TableRow';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import MultiLineAreaChart from '@components/admin/MultiLineAreaChart';
import { useCurrencyFormatter } from '@hooks/useCurrencyFormatter';
import DashboardSubNav from '@components/admin/dashboard/DashboardSubNav';

interface MonthPoint { key: string; label: string; sales: number; expenses: number; }
interface PlanItem { id: string; label: string; amount: number; date: string | null; frequency?: string | null; }
interface Planning {
    monthlySeries: MonthPoint[];
    nextMonth: {
        label: string;
        expectedIncome: { recurringInvoices: number; dueInvoices: number; total: number };
        expectedExpenses: { recurringExpenses: number; total: number };
        projectedNet: number;
    };
    upcomingRecurringInvoices: PlanItem[];
    upcomingDueInvoices: PlanItem[];
    upcomingRecurringExpenses: PlanItem[];
}
interface ProfitLoss {
    revenue: { total: number };
    operatingExpenses: { total: number };
    netIncome: number;
    taxes: { netTax: number };
}
interface BalanceSheet {
    assets: { current: { cashAndBank: number; receivables: number }; total: number };
    liabilities: { current: { payables: number }; total: number };
    equity: { total: number };
}

const n = (v: unknown) => Number(v ?? 0);

const AccountsDashboard: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { format } = useCurrencyFormatter();
    const { formatDate } = useDateFormatter();
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [plan, setPlan] = useState<Planning | null>(null);
    const [pl, setPl] = useState<ProfitLoss | null>(null);
    const [bs, setBs] = useState<BalanceSheet | null>(null);
    const dateFmt = systemSettings?.dateFormat.format || 'd-m-Y';

    useEffect(() => {
        (async () => {
            try {
                setIsLoading(true);
                const h = { headers: { Authorization: `Bearer ${token}` } };
                const [planRes, plRes, bsRes] = await Promise.all([
                    axios.get(Constants.GET_ACCOUNTS_PLANNING_URL, h),
                    axios.get(Constants.GET_PROFIT_LOSS_URL, h),
                    axios.get(Constants.GET_BALANCE_SHEET_URL, h),
                ]);
                setPlan(planRes.data?.data ?? null);
                setPl(plRes.data?.data ?? null);
                setBs(bsRes.data?.data ?? null);
            } catch { /* ignore */ } finally { setIsLoading(false); }
        })();
    }, [token]);

    if (isLoading) {
        return <div className='p-6 bg-[#F4F8FF] min-h-full flex items-center justify-center'><LoaderSpinner /></div>;
    }

    const series = plan?.monthlySeries || [];
    const areaData: number[][] = series.length > 0 ? [series.map(m => m.sales), series.map(m => m.expenses)] : [];
    const months = series.map(m => m.label);
    const nm = plan?.nextMonth;
    const net = n(nm?.projectedNet);
    const panel = "rounded-2xl border border-[#D6E4FF]/80 bg-white/90 shadow-[0_8px_30px_rgba(0,11,30,0.04)] backdrop-blur-sm";

    return (
        <div className="relative min-h-full overflow-hidden bg-[#F4F8FF] px-4 py-4 font-sans md:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_10%_-10%,rgba(0,102,255,0.08),transparent_55%)]" />
            <div className="relative space-y-4">
            <DashboardSubNav />
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0066FF]">Dashboard</p>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#0B1533]">Accounts &amp; P&amp;L</h1>
                </div>
                <button onClick={() => navigate('/admin/accounting/reports/profit-loss')} className="text-sm text-[#0066FF] font-semibold flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-white cursor-pointer">Full P&amp;L <ArrowRight size={14} /></button>
            </div>

            <div className={`${panel} p-5`}>
                <h2 className="text-[15px] font-semibold text-[#0B1533] mb-2">Monthly Sales vs Expenses</h2>
                {areaData.length > 0
                    ? <MultiLineAreaChart data={areaData} categories={months} color={["#0066FF", "#F43F5E"]} seriesNames={["Sales", "Expenses"]} />
                    : <p className="text-sm text-[#8A97A8] py-8 text-center">No data</p>}
            </div>

            <div>
                <div className="flex items-center gap-2 mb-2">
                    <CalendarClock className="w-5 h-5 text-[#0066FF]" />
                    <h2 className="text-[15px] font-semibold text-[#0B1533]">Next Month Planning — {nm?.label || ''}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    <DashboardCard title="Expected Income" icon={<TrendingUp className="w-6 h-6" />}>
                        <CardItem icon={<Repeat className="w-5 h-5" />} label="Recurring Invoices" value={format(n(nm?.expectedIncome.recurringInvoices))} color="green" />
                        <CardItem icon={<Receipt className="w-5 h-5" />} label="Invoices Due" value={format(n(nm?.expectedIncome.dueInvoices))} color="blue" />
                        <CardItem icon={<TrendingUp className="w-5 h-5" />} label="Total Expected" value={format(n(nm?.expectedIncome.total))} color="cyan" />
                    </DashboardCard>
                    <DashboardCard title="Expected Expenses" icon={<TrendingDown className="w-6 h-6" />}>
                        <CardItem icon={<Repeat className="w-5 h-5" />} label="Recurring Expenses" value={format(n(nm?.expectedExpenses.recurringExpenses))} color="red" />
                        <CardItem icon={<TrendingDown className="w-5 h-5" />} label="Total Expected" value={format(n(nm?.expectedExpenses.total))} color="yellow" />
                    </DashboardCard>
                    <DashboardCard title="Projected Net" icon={net >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}>
                        <CardItem icon={net >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />} label={net >= 0 ? 'Projected Surplus' : 'Projected Shortfall'} value={format(net)} color={net >= 0 ? 'green' : 'red'} />
                        <CardItem icon={<Wallet className="w-5 h-5" />} label="Cash & Bank Now" value={format(n(bs?.assets.current.cashAndBank))} color="blue" />
                    </DashboardCard>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-3">Recurring Invoices (next month)</h2>
                    <Table headers={["Invoice", "Amount", "Date"]}>
                        {plan?.upcomingRecurringInvoices?.length ? plan.upcomingRecurringInvoices.map((it, i) => (
                            <TableRow key={it.id} index={i + 1} row={it} columns={[it.label, format(n(it.amount)), it.date ? formatDate(it.date, dateFmt) : '-']} />
                        )) : <tr><td colSpan={4} className="text-center py-4 text-[#8A97A8]">None scheduled</td></tr>}
                    </Table>
                </div>
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-3">Invoices Due (next month)</h2>
                    <Table headers={["Invoice", "Amount", "Due"]}>
                        {plan?.upcomingDueInvoices?.length ? plan.upcomingDueInvoices.map((it, i) => (
                            <TableRow key={it.id} index={i + 1} row={it} columns={[it.label, format(n(it.amount)), it.date ? formatDate(it.date, dateFmt) : '-']} />
                        )) : <tr><td colSpan={4} className="text-center py-4 text-[#8A97A8]">None due</td></tr>}
                    </Table>
                </div>
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-3">Recurring Expenses (next month)</h2>
                    <Table headers={["Expense", "Amount", "Date"]}>
                        {plan?.upcomingRecurringExpenses?.length ? plan.upcomingRecurringExpenses.map((it, i) => (
                            <TableRow key={it.id} index={i + 1} row={it} columns={[it.label, format(n(it.amount)), it.date ? formatDate(it.date, dateFmt) : '-']} />
                        )) : <tr><td colSpan={4} className="text-center py-4 text-[#8A97A8]">None scheduled</td></tr>}
                    </Table>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <DashboardCard title="P&L (to date)" icon={<Scale className="w-6 h-6" />}>
                    <CardItem icon={<TrendingUp className="w-5 h-5" />} label="Revenue" value={format(n(pl?.revenue.total))} color="green" />
                    <CardItem icon={<TrendingDown className="w-5 h-5" />} label="Operating Exp." value={format(n(pl?.operatingExpenses.total))} color="red" />
                    <CardItem icon={<Scale className="w-5 h-5" />} label="Net Income" value={format(n(pl?.netIncome))} color={n(pl?.netIncome) >= 0 ? 'green' : 'red'} />
                    <CardItem icon={<Receipt className="w-5 h-5" />} label="Net Tax" value={format(n(pl?.taxes.netTax))} color="cyan" />
                </DashboardCard>
                <DashboardCard title="Balance Sheet" icon={<Landmark className="w-6 h-6" />}>
                    <CardItem icon={<Wallet className="w-5 h-5" />} label="Total Assets" value={format(n(bs?.assets.total))} color="green" />
                    <CardItem icon={<Landmark className="w-5 h-5" />} label="Liabilities" value={format(n(bs?.liabilities.total))} color="red" />
                    <CardItem icon={<PiggyBank className="w-5 h-5" />} label="Equity" value={format(n(bs?.equity.total))} color="blue" />
                    <CardItem icon={<TrendingUp className="w-5 h-5" />} label="Receivables" value={format(n(bs?.assets.current.receivables))} color="cyan" />
                </DashboardCard>
                <DashboardCard title="Quick Links" icon={<ArrowRight className="w-6 h-6" />}>
                    <CardItem icon={<Wallet className="w-5 h-5" />} label="Payables" value={format(n(bs?.liabilities.current.payables))} color="red" />
                    <CardItem icon={<Receipt className="w-5 h-5" />} label="Cash & Bank" value={format(n(bs?.assets.current.cashAndBank))} color="green" />
                </DashboardCard>
            </div>
            </div>
        </div>
    );
};

export default AccountsDashboard;
