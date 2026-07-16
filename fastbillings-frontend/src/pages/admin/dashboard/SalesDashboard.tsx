import Constants from '@constants/api';
import useDateFormatter from '@hooks/useDateFormatter';
import type { RootState } from '@store/index';
import axios from 'axios';
import { BarChart2, FileText, BadgeDollarSign, CreditCard, AlertCircle, Receipt, ArrowRight, Users, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { CardItem } from '@components/admin/dashboard/CardItem';
import { DashboardCard } from '@components/admin/dashboard/DashboardCard';
import Table from '@components/admin/Table';
import TableRow from '@components/admin/TableRow';
import InvoiceStatusBadge from '@components/admin/InvoiceStatusBadge';
import PaymentModeBadge from '@components/admin/PaymentModeBadge';
import LoaderSpinner from '@components/admin/LoaderSpinner';
import ApexGradientPie from '@components/admin/dashboard/ApexGradientPie';
import MultiLineAreaChart from '@components/admin/MultiLineAreaChart';
import { useCurrencyFormatter } from '@hooks/useCurrencyFormatter';
import type { PirchartShape, RecentInvoices, RecentPayments, SaleStats } from '@models/dashboard';
import DashboardSubNav from '@components/admin/dashboard/DashboardSubNav';

interface AgingBuckets { current: number; days30: number; days60: number; days90: number; beyond90: number; }
interface TopDebtor { customerId: string; customerName: string; outstanding: number; oldestInvoiceDays: number; }
interface GraphItem { month: string; purchases: number; sales: number; }
interface DashboardData {
    totalInvoiceCount: number;
    totalCustomerCount: number;
    lastFiveInvoices: RecentInvoices[];
    lastFivePayments: RecentPayments[];
    sales: SaleStats;
    graph1: PirchartShape[];
    graph2: GraphItem[];
    agingBuckets?: AgingBuckets;
    topDebtors?: TopDebtor[];
}

const SalesDashboard: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { formatDate } = useDateFormatter();
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const { format } = useCurrencyFormatter();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);
    const [data, setData] = useState<DashboardData>({
        totalInvoiceCount: 0,
        totalCustomerCount: 0,
        lastFiveInvoices: [],
        lastFivePayments: [],
        sales: { totalSalesAmount: 0, totalDueAmount: 0, receivedAmount: 0, quotationCount: 0 },
        graph1: [],
        graph2: [],
    });
    const dateFmt = systemSettings?.dateFormat.format || 'd-m-Y';

    useEffect(() => {
        (async () => {
            try {
                setIsLoading(true);
                const res = await axios.get<{ data: DashboardData }>(Constants.GET_DASHBOARD_DATA_URL, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data) setData(prev => ({ ...prev, ...res.data.data }));
            } catch { /* ignore */ } finally { setIsLoading(false); }
        })();
    }, [token]);

    const pieChartData = (data.graph1 || []).map(item => ({
        id: item.name, value: item.totalQty,
        label: item.name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
    }));
    const areaData: number[][] = [];
    if ((data.graph2 || []).length > 0) {
        areaData[0] = data.graph2.map(i => i.sales);
        areaData[1] = data.graph2.map(i => i.purchases);
    }
    const months = (data.graph2 || []).map(i => i.month);
    const aging = data.agingBuckets;

    if (isLoading) {
        return <div className='p-6 bg-[#F4F8FF] min-h-full flex items-center justify-center'><LoaderSpinner /></div>;
    }

    const panel = "rounded-2xl border border-[#D6E4FF]/80 bg-white/90 shadow-[0_8px_30px_rgba(0,11,30,0.04)] backdrop-blur-sm";

    return (
        <div className="relative min-h-full overflow-hidden bg-[#F4F8FF] px-4 py-4 font-sans md:px-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_10%_-10%,rgba(0,102,255,0.08),transparent_55%)]" />
            <div className="relative space-y-4">
            <DashboardSubNav />
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#0066FF]">Dashboard</p>
                    <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#0B1533]">Sales &amp; Invoices</h1>
                </div>
                <button onClick={() => navigate('/admin/invoices')} className="text-sm text-[#0066FF] font-semibold flex items-center gap-1 rounded-lg px-2.5 py-1.5 hover:bg-white cursor-pointer">All Invoices <ArrowRight size={14} /></button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <DashboardCard title="Sales Statistics" icon={<BarChart2 className="w-6 h-6" />}>
                    <CardItem icon={<BadgeDollarSign className="w-5 h-5" />} label="Total Sales" value={format(data.sales.totalSalesAmount || 0)} color="blue" />
                    <CardItem icon={<CreditCard className="w-5 h-5" />} label="Received" value={format(data.sales.receivedAmount || 0)} color="green" />
                    <CardItem icon={<AlertCircle className="w-5 h-5" />} label="Amount Due" value={format(data.sales.totalDueAmount || 0)} color="red" />
                    <CardItem icon={<FileText className="w-5 h-5" />} label="Quotations" value={data.sales.quotationCount || 0} color="cyan" />
                </DashboardCard>
                <DashboardCard title="Overview" icon={<FileText className="w-6 h-6" />}>
                    <CardItem icon={<FileText className="w-5 h-5" />} label="Invoices" value={data.totalInvoiceCount || 0} color="blue" />
                    <CardItem icon={<Users className="w-5 h-5" />} label="Customers" value={data.totalCustomerCount || 0} color="green" />
                </DashboardCard>
                <DashboardCard title="Outstanding (Aging)" icon={<AlertTriangle className="w-6 h-6" />}>
                    <CardItem icon={<AlertCircle className="w-5 h-5" />} label="Current" value={format(aging?.current || 0)} color="green" />
                    <CardItem icon={<AlertCircle className="w-5 h-5" />} label="1-30 days" value={format(aging?.days30 || 0)} color="yellow" />
                    <CardItem icon={<AlertCircle className="w-5 h-5" />} label="31-60 days" value={format(aging?.days60 || 0)} color="yellow" />
                    <CardItem icon={<AlertCircle className="w-5 h-5" />} label="90+ days" value={format(aging?.beyond90 || 0)} color="red" />
                </DashboardCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-2">Sales vs Purchases</h2>
                    {areaData.length > 0
                        ? <MultiLineAreaChart data={areaData} categories={months} color={["#0066FF", "#00D2FF"]} seriesNames={["Sales", "Purchases"]} />
                        : <p className="text-sm text-[#8A97A8] py-8 text-center">No data</p>}
                </div>
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-2">Top Products by Sales</h2>
                    {pieChartData.length > 0
                        ? <ApexGradientPie data={pieChartData} colors={["#0066FF", "#00D2FF", "#34D399", "#F59E0B", "#0B1533"]} width={380} height={300} />
                        : <p className="text-sm text-[#8A97A8] py-8 text-center">No data</p>}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-3">Recent Invoices</h2>
                    <Table headers={["Invoice", "Customer", "Amount", "Status", "Date"]}>
                        {data.lastFiveInvoices?.length > 0 ? data.lastFiveInvoices.map((inv, i) => (
                            <TableRow key={inv.id} index={i + 1} row={inv} columns={[
                                <span className="text-[#0066FF] font-medium">{inv.invoiceNumber}</span>,
                                inv.customer?.name || '-',
                                format(inv.totalAmount || 0),
                                <InvoiceStatusBadge status={inv.status} />,
                                formatDate(inv.createdAt, dateFmt),
                            ]} />
                        )) : <tr><td colSpan={6} className="text-center py-4 text-[#8A97A8]">No invoices</td></tr>}
                    </Table>
                </div>
                <div className={`${panel} p-5`}>
                    <h2 className="text-[15px] font-semibold text-[#0B1533] mb-3">Recent Payments</h2>
                    <Table headers={["Invoice", "Amount", "Method"]}>
                        {data.lastFivePayments?.length > 0 ? data.lastFivePayments.map((p, i) => (
                            <TableRow key={p.id} index={i + 1} row={p} columns={[
                                <span className="text-[#0066FF] font-medium">{p.invoice?.invoiceNumber || '-'}</span>,
                                format(p.amount || 0),
                                <PaymentModeBadge mode={p.payment_method?.name || '-'} />,
                            ]} />
                        )) : <tr><td colSpan={4} className="text-center py-4 text-[#8A97A8]">No payments</td></tr>}
                    </Table>
                </div>
            </div>

            {data.topDebtors && data.topDebtors.length > 0 && (
                <div className={`${panel} p-5`}>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-[15px] font-semibold text-[#0B1533]">Top Debtors</h2>
                        <button onClick={() => navigate('/admin/accounting/reports/ar-aging')} className="text-sm text-[#0066FF] font-semibold flex items-center gap-1 cursor-pointer">AR Aging <ArrowRight size={14} /></button>
                    </div>
                    <Table headers={["Customer", "Outstanding", "Oldest (days)"]}>
                        {data.topDebtors.map((d, i) => (
                            <TableRow key={d.customerId} index={i + 1} row={d} columns={[
                                d.customerName,
                                <span className="text-red-600">{format(d.outstanding || 0)}</span>,
                                d.oldestInvoiceDays,
                            ]} />
                        ))}
                    </Table>
                </div>
            )}

            <div className="flex justify-end">
                <button onClick={() => navigate('/admin/reports/income')} className="text-sm text-[#0066FF] font-semibold flex items-center gap-1 cursor-pointer"><Receipt size={14} /> Full Income Report <ArrowRight size={14} /></button>
            </div>
            </div>
        </div>
    );
};

export default SalesDashboard;
