import Constants from '@constants/api';
import useDateFormatter from '@hooks/useDateFormatter';
import type { RootState } from '@store/index';
import axios from 'axios';
import { TrendingDown, Receipt, Layers, FileText, ArrowRight, ShoppingCart, Wallet } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CardItem } from '@components/admin/dashboard/CardItem';
import { DashboardCard } from '@components/admin/dashboard/DashboardCard';
import Table from '@components/admin/Table';
import TableRow from '@components/admin/TableRow';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import { useCurrencyFormatter } from '@hooks/useCurrencyFormatter';
import DashboardSubNav from '@components/admin/dashboard/DashboardSubNav';

interface ByCategory { name: string; total: number; }
interface ProfitLoss {
    costOfGoodsSold: { total: number };
    operatingExpenses: { total: number; byCategory: ByCategory[] };
    taxes: { inputTax: number };
}
interface ExpenseRow {
    id: string;
    expenseId?: string;
    amount: number | string;
    currencyCode?: string | null;
    expenseDate: string | null;
    expenseCategory?: { id: string; name: string } | null;
    paymentMode?: { id: string; name: string } | null;
    paymentStatus?: string | null;
    description?: string | null;
}

const n = (v: unknown) => Number(v ?? 0);

const ExpensesDashboard: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { format } = useCurrencyFormatter();
    const { formatDate } = useDateFormatter();
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [pl, setPl] = useState<ProfitLoss | null>(null);
    const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const dateFmt = systemSettings?.dateFormat.format || 'd-m-Y';

    useEffect(() => {
        (async () => {
            try {
                setIsLoading(true);
                const [plRes, exRes] = await Promise.all([
                    axios.get(Constants.GET_PROFIT_LOSS_URL, { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get(Constants.FETCH_EXPENSES_FOR_LIST_URL, {
                        params: { page: 1, limit: 8 },
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                ]);
                setPl(plRes.data?.data ?? null);
                setExpenses(exRes.data?.data?.expenses ?? []);
                setTotalCount(exRes.data?.data?.pagination?.total ?? 0);
            } catch { /* ignore */ } finally { setIsLoading(false); }
        })();
    }, [token]);

    if (isLoading) {
        return <div className='p-6 bg-[#F4F8FF] min-h-full flex items-center justify-center'><LoaderSpinner /></div>;
    }

    const opex = n(pl?.operatingExpenses.total);
    const cogs = n(pl?.costOfGoodsSold.total);
    const totalExpenses = opex + cogs;
    const cats = (pl?.operatingExpenses.byCategory || []).slice(0, 8);
    const panel = "rounded-2xl border border-[#D6E4FF]/80 bg-white/90 shadow-[0_8px_30px_rgba(0,11,30,0.04)] backdrop-blur-sm";

    return (
        <div className="relative min-h-full overflow-hidden bg-[#F4F8FF] px-4 py-4 font-sans md:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_10%_-10%,rgba(0,102,255,0.08),transparent_55%)]" />
            <div className="relative space-y-4">
            <DashboardSubNav />
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0066FF]">Dashboard</p>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#0B1533]">Expenses</h1>
                </div>
                <button onClick={() => navigate('/admin/expenses')} className="text-sm text-[#0066FF] font-semibold flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-white cursor-pointer">All Expenses <ArrowRight size={14} /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <DashboardCard title="Expense Summary" icon={<TrendingDown className="w-6 h-6" />}>
                    <CardItem icon={<TrendingDown className="w-5 h-5" />} label="Total Expenses" value={format(totalExpenses)} color="red" />
                    <CardItem icon={<Wallet className="w-5 h-5" />} label="Operating Exp." value={format(opex)} color="yellow" />
                    <CardItem icon={<ShoppingCart className="w-5 h-5" />} label="COGS" value={format(cogs)} color="blue" />
                    <CardItem icon={<FileText className="w-5 h-5" />} label="Expense Records" value={totalCount} color="cyan" />
                </DashboardCard>
                <DashboardCard title="Tax" icon={<Receipt className="w-6 h-6" />}>
                    <CardItem icon={<Receipt className="w-5 h-5" />} label="Input Tax (ITC)" value={format(n(pl?.taxes.inputTax))} color="green" />
                    <CardItem icon={<Layers className="w-5 h-5" />} label="Categories" value={cats.length} color="indigo" />
                </DashboardCard>
                <DashboardCard title="Quick Links" icon={<Layers className="w-6 h-6" />}>
                    <CardItem icon={<FileText className="w-5 h-5" />} label="Expense Report" value="Open" color="blue" />
                    <CardItem icon={<Layers className="w-5 h-5" />} label="Categories" value="Manage" color="cyan" />
                </DashboardCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-3">Expenses by Category</h2>
                    <Table headers={["Category", "Amount"]}>
                        {cats.length > 0 ? cats.map((c, i) => (
                            <TableRow key={c.name + i} index={i + 1} row={c} columns={[c.name, format(n(c.total))]} />
                        )) : <tr><td colSpan={3} className="text-center py-4 text-[#8A97A8]">No category data</td></tr>}
                    </Table>
                </div>
                <div className={`${panel} p-5`}>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[15px] font-semibold text-[#0B1533]">Recent Expenses</h2>
                        <button onClick={() => navigate('/admin/reports/expense')} className="text-sm text-[#0066FF] font-semibold flex items-center gap-1 cursor-pointer">Report <ArrowRight size={14} /></button>
                    </div>
                    <Table headers={["Category", "Amount", "Mode", "Date"]}>
                        {expenses.length > 0 ? expenses.map((e, i) => (
                            <TableRow key={e.id} index={i + 1} row={e} columns={[
                                e.expenseCategory?.name || e.description || '-',
                                format(n(e.amount)),
                                e.paymentMode?.name || '-',
                                e.expenseDate ? formatDate(e.expenseDate, dateFmt) : '-',
                            ]} />
                        )) : <tr><td colSpan={5} className="text-center py-4 text-[#8A97A8]">No expenses</td></tr>}
                    </Table>
                </div>
            </div>
            </div>
        </div>
    );
};

export default ExpensesDashboard;
