import Constants from "@constants/api";
import useDateFormatter from "@hooks/useDateFormatter";
import type { RootState } from "@store/index";
import axios from "axios";
import {
  Calendar,
  Clock,
  Users,
  FileText,
  ShoppingCart,
  Truck,
  Receipt,
  LayoutGrid,
  ArrowRight,
  User,
  Package,
  BarChart2,
  BadgeDollarSign,
  CreditCard,
  AlertCircle,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useState, useEffect, type ReactNode } from "react";
import { useSelector } from "react-redux";
import { CardItem } from "@components/admin/dashboard/CardItem";
import { DashboardCard } from "@components/admin/dashboard/DashboardCard";
import Table from "@components/admin/Table";
import type {
  CustomersShape,
  PirchartShape,
  PurchaseStats,
  RecentInvoices,
  RecentPayments,
  RecentPurchase,
  SaleStats,
  SuppliersShape,
} from "@models/dashboard";
import TableRow from "@components/admin/TableRow";
import InvoiceStatusBadge from "@components/admin/InvoiceStatusBadge";
import { useCurrencyFormatter } from "@hooks/useCurrencyFormatter";
import PaymentModeBadge from "@components/admin/PaymentModeBadge";
import { useNavigate } from "react-router-dom";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import ProfileCard from "@components/admin/ProfileImage";
import ApexGradientPie from "@components/admin/dashboard/ApexGradientPie";
import MultiLineAreaChart from "@components/admin/MultiLineAreaChart";
import DashboardSubNav from "@components/admin/dashboard/DashboardSubNav";

interface AgingBuckets {
  current: number;
  days30: number;
  days60: number;
  days90: number;
  beyond90: number;
}
interface TopDebtor {
  customerId: string;
  customerName: string;
  outstanding: number;
  oldestInvoiceDays: number;
}
interface DashboardData {
  totalInvoiceCount: number;
  totalProductCount: number;
  totalCustomerCount: number;
  totalSupplierCount: number;
  lastFiveCustomers: CustomersShape[];
  lastFiveSuppliers: SuppliersShape[];
  lastFiveInvoices: RecentInvoices[];
  lastFivePayments: RecentPayments[];
  lastFivePurchases: RecentPurchase[];
  sales: SaleStats;
  purchases: PurchaseStats;
  graph1: PirchartShape[];
  graph2: GraphItem[];
  agingBuckets?: AgingBuckets;
  topDebtors?: TopDebtor[];
}
interface DashboardDataResponse {
  data: DashboardData;
}
interface GraphItem {
  month: string;
  purchases: number;
  sales: number;
}

const panel =
  "rounded-2xl border border-[#D6E4FF]/80 bg-white/90 shadow-[0_8px_30px_rgba(0,11,30,0.04)] backdrop-blur-sm";

const SectionHeader = ({
  title,
  icon,
  onViewAll,
  viewLabel = "View all",
}: {
  title: string;
  icon: ReactNode;
  onViewAll?: () => void;
  viewLabel?: string;
}) => (
  <div className="mb-4 flex items-center justify-between gap-3">
    <h4 className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-[#0B1533]">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F4F8FF] text-[#0066FF] ring-1 ring-[#D6E4FF]">
        {icon}
      </span>
      {title}
    </h4>
    {onViewAll && (
      <button
        type="button"
        onClick={onViewAll}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#0066FF] transition hover:bg-[#F4F8FF]"
      >
        {viewLabel} <ArrowRight className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

const KpiTile = ({
  label,
  value,
  hint,
  icon,
  tone = "blue",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  tone?: "blue" | "cyan" | "navy" | "emerald";
}) => {
  const tones = {
    blue: "from-[#0066FF] to-[#0052CC]",
    cyan: "from-[#00D2FF] to-[#0066FF]",
    navy: "from-[#0B1533] to-[#000B1E]",
    emerald: "from-emerald-500 to-emerald-600",
  };
  return (
    <div className={`${panel} relative overflow-hidden p-4`}>
      <div
        className={`absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br ${tones[tone]} opacity-[0.12]`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5A6B7D]">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#0B1533]">{value}</p>
          {hint && <p className="mt-1 text-xs text-[#8A97A8]">{hint}</p>}
        </div>
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tones[tone]} text-white shadow-[0_8px_18px_rgba(0,102,255,0.22)]`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
};

const DashboardPage: React.FC = () => {
  const { user, token } = useSelector((state: RootState) => state.auth);
  const [time, setTime] = useState<Date>(new Date());
  const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
  const { formatDate } = useDateFormatter();
  const { format } = useCurrencyFormatter();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalInvoiceCount: 0,
    totalProductCount: 0,
    totalCustomerCount: 0,
    totalSupplierCount: 0,
    lastFiveCustomers: [],
    lastFiveSuppliers: [],
    lastFiveInvoices: [],
    lastFivePayments: [],
    lastFivePurchases: [],
    sales: {
      totalSalesAmount: 0,
      totalDueAmount: 0,
      receivedAmount: 0,
      quotationCount: 0,
    },
    purchases: {
      totalPurchasesAmount: 0,
      totalPaidPurchases: 0,
      totalDuePurchases: 0,
      debitNoteCount: 0,
    },
    graph1: [],
    graph2: [],
  });

  let pieChartData: { id: string; value: number; label: string }[] = [];
  if (dashboardData.graph1.length > 0) {
    pieChartData = dashboardData.graph1.map((item) => ({
      id: item.name,
      value: item.totalQty,
      label: item.name
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" "),
    }));
  }

  let purchaseAndSaleChartData: number[][] = [];
  if (dashboardData.graph2.length > 0) {
    purchaseAndSaleChartData[0] = dashboardData.graph2.map((item) => item.purchases);
    purchaseAndSaleChartData[1] = dashboardData.graph2.map((item) => item.sales);
  }

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get<DashboardDataResponse>(Constants.GET_DASHBOARD_DATA_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data) {
        setDashboardData((prev) => ({ ...prev, ...response.data.data }));
      }
    } catch {
      /* keep empty state */
    } finally {
      setIsLoading(false);
    }
  };

  const formattedTime: string = time.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[#F4F8FF] p-6 font-sans">
        <LoaderSpinner />
      </div>
    );
  }

  const fullName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Guest";

  return (
    <div className="relative min-h-full overflow-hidden bg-[#F4F8FF] px-4 py-4 font-sans md:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_10%_-10%,rgba(0,102,255,0.08),transparent_55%),radial-gradient(ellipse_60%_40%_at_90%_0%,rgba(0,210,255,0.08),transparent_50%)]" />

      <div className="relative space-y-5">
        <DashboardSubNav />

        {/* Hero */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#000B1E] via-[#0B1533] to-[#0066FF] p-6 text-white shadow-[0_20px_50px_rgba(0,11,30,0.25)] md:p-7">
          <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(0,210,255,0.35),transparent_65%)]" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.08),transparent_70%)]" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#00D2FF]">
                Overview
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">
                {getGreeting()}, {fullName}
              </h1>
              <p className="mt-1.5 max-w-xl text-sm text-white/75">
                Welcome back. Here&apos;s how invoicing, collections, and purchases look today.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/80">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  <Calendar size={13} />
                  {formatDate(time, systemSettings?.dateFormat.format || "d-m-Y")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15">
                  <Clock size={13} />
                  {formattedTime}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/admin/invoices/create")}
                className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#0066FF] shadow-sm transition hover:bg-[#F4F8FF]"
              >
                New invoice
              </button>
              <button
                type="button"
                onClick={() => navigate("/admin/dashboard/sales")}
                className="rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
              >
                Sales view
              </button>
            </div>
          </div>
        </section>

        {/* KPI strip */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Total sales"
            value={format(dashboardData.sales.totalSalesAmount || 0)}
            hint={`${dashboardData.totalInvoiceCount || 0} invoices`}
            icon={<TrendingUp size={18} />}
            tone="blue"
          />
          <KpiTile
            label="Collected"
            value={format(dashboardData.sales.receivedAmount || 0)}
            hint="Paid amount"
            icon={<Wallet size={18} />}
            tone="emerald"
          />
          <KpiTile
            label="Amount due"
            value={format(dashboardData.sales.totalDueAmount || 0)}
            hint="Outstanding receivables"
            icon={<AlertCircle size={18} />}
            tone="navy"
          />
          <KpiTile
            label="Purchases"
            value={format(dashboardData.purchases.totalPurchasesAmount || 0)}
            hint={`${dashboardData.totalSupplierCount || 0} suppliers`}
            icon={<ShoppingCart size={18} />}
            tone="cyan"
          />
        </section>

        {/* Stat groups */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <DashboardCard title="Overview" icon={<LayoutGrid className="h-5 w-5" />}>
            <CardItem
              icon={<FileText className="h-4 w-4" />}
              label="Invoices"
              value={dashboardData.totalInvoiceCount || 0}
              color="blue"
            />
            <CardItem
              icon={<User className="h-4 w-4" />}
              label="Customers"
              value={dashboardData.totalCustomerCount || 0}
              color="green"
            />
            <CardItem
              icon={<Package className="h-4 w-4" />}
              label="Products"
              value={dashboardData.totalProductCount || 0}
              color="yellow"
            />
            <CardItem
              icon={<Truck className="h-4 w-4" />}
              label="Suppliers"
              value={dashboardData.totalSupplierCount || 0}
              color="cyan"
            />
          </DashboardCard>

          <DashboardCard title="Sales Statistics" icon={<BarChart2 className="h-5 w-5" />}>
            <CardItem
              icon={<BadgeDollarSign className="h-4 w-4" />}
              label="Total Sales"
              value={format(dashboardData.sales.totalSalesAmount || 0)}
              color="blue"
            />
            <CardItem
              icon={<CreditCard className="h-4 w-4" />}
              label="Paid Amount"
              value={format(dashboardData.sales.receivedAmount || 0)}
              color="green"
            />
            <CardItem
              icon={<AlertCircle className="h-4 w-4" />}
              label="Amount Due"
              value={format(dashboardData.sales.totalDueAmount || 0)}
              color="red"
            />
            <CardItem
              icon={<FileText className="h-4 w-4" />}
              label="Quotations"
              value={dashboardData.sales.quotationCount}
              color="cyan"
            />
          </DashboardCard>

          <DashboardCard title="Purchase Statistics" icon={<ShoppingCart className="h-5 w-5" />}>
            <CardItem
              icon={<FileText className="h-4 w-4" />}
              label="Total Purchases"
              value={format(dashboardData.purchases.totalPurchasesAmount || 0)}
              color="blue"
            />
            <CardItem
              icon={<CreditCard className="h-4 w-4" />}
              label="Paid Amount"
              value={format(dashboardData.purchases.totalPaidPurchases || 0)}
              color="green"
            />
            <CardItem
              icon={<AlertCircle className="h-4 w-4" />}
              label="Amount Due"
              value={format(dashboardData.purchases.totalDuePurchases || 0)}
              color="red"
            />
            <CardItem
              icon={<FileText className="h-4 w-4" />}
              label="Debit Notes"
              value={dashboardData.purchases.debitNoteCount}
              color="cyan"
            />
          </DashboardCard>
        </section>

        {/* Aging + debtors */}
        {dashboardData?.agingBuckets && (
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className={`${panel} p-5`}>
              <h3 className="mb-4 text-[15px] font-semibold text-[#0B1533]">
                Outstanding dues by age
              </h3>
              <div className="space-y-3">
                {(() => {
                  const buckets = dashboardData.agingBuckets!;
                  const rows = [
                    { label: "Current", value: buckets.current, color: "bg-emerald-500" },
                    { label: "1–30 days", value: buckets.days30, color: "bg-amber-400" },
                    { label: "31–60 days", value: buckets.days60, color: "bg-orange-500" },
                    { label: "61–90 days", value: buckets.days90, color: "bg-rose-400" },
                    { label: "90+ days", value: buckets.beyond90, color: "bg-rose-600" },
                  ];
                  const total = rows.reduce((s, r) => s + r.value, 0);
                  return rows.map((b) => {
                    const pct = total > 0 ? (b.value / total) * 100 : 0;
                    return (
                      <div key={b.label}>
                        <div className="mb-1 flex justify-between text-xs text-[#3D4F63]">
                          <span className="font-medium">{b.label}</span>
                          <span className="font-semibold text-[#0B1533]">{format(b.value)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#EEF3FB]">
                          <div
                            className={`h-2 rounded-full ${b.color} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <div className={`${panel} p-5`}>
              <h3 className="mb-4 text-[15px] font-semibold text-[#0B1533]">Top debtors</h3>
              {dashboardData.topDebtors && dashboardData.topDebtors.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8EEF5] text-left text-[11px] uppercase tracking-wide text-[#8A97A8]">
                        <th className="pb-2 font-semibold">Customer</th>
                        <th className="pb-2 text-right font-semibold">Outstanding</th>
                        <th className="pb-2 text-right font-semibold">Oldest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.topDebtors.map((d) => (
                        <tr key={d.customerId} className="border-b border-[#F0F4FA]">
                          <td className="py-2.5 font-medium text-[#0B1533]">{d.customerName}</td>
                          <td className="py-2.5 text-right text-[#3D4F63]">
                            {format(d.outstanding)}
                          </td>
                          <td className="py-2.5 text-right text-[#5A6B7D]">
                            {d.oldestInvoiceDays}d
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-[#8A97A8]">No outstanding debtors</p>
              )}
            </div>
          </section>
        )}

        {/* Charts */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-10">
          <div className={`lg:col-span-7 ${panel} p-5`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#0B1533]">Sales vs purchases</h2>
              <span className="rounded-full bg-[#F4F8FF] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#0066FF] ring-1 ring-[#D6E4FF]">
                Monthly
              </span>
            </div>
            <MultiLineAreaChart
              data={purchaseAndSaleChartData}
              seriesNames={["Purchase", "Sales"]}
              categories={dashboardData.graph2.map((item) => item.month)}
              color={["#00D2FF", "#0066FF"]}
            />
          </div>
          <div className={`lg:col-span-3 ${panel} p-5`}>
            <h2 className="mb-2 text-center text-[15px] font-semibold text-[#0B1533]">
              Top products
            </h2>
            <div className="flex justify-center">
              <ApexGradientPie
                data={
                  pieChartData.length
                    ? pieChartData
                    : [{ id: "No Data", label: "No Data", value: 1 }]
                }
                height={280}
                width={280}
                colors={
                  pieChartData.length
                    ? ["#0066FF", "#00D2FF", "#34D399", "#F59E0B", "#0B1533"]
                    : ["#E5E7EB"]
                }
              />
            </div>
          </div>
        </section>

        {/* Customers & suppliers */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={`${panel} p-5`}>
            <SectionHeader
              title="Recent customers"
              icon={<Users className="h-4 w-4" />}
              onViewAll={() => navigate("/admin/customers")}
            />
            <Table headers={["#", "Name", "Phone", "Created On"]}>
              {dashboardData.lastFiveCustomers?.map((customer, index) => (
                <TableRow
                  key={customer.id}
                  row={customer}
                  index={index + 1}
                  columns={[
                    <ProfileCard
                      imageUrl={customer.imageUrl}
                      name={customer.name}
                      email={customer.email}
                    />,
                    customer.phone,
                    formatDate(customer.createdAt, systemSettings?.dateFormat.format || "d-m-Y"),
                  ]}
                />
              ))}
              {!dashboardData.lastFiveCustomers.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm font-medium text-[#8A97A8]">
                    <Users className="mx-auto mb-2 h-6 w-6 text-[#C7D9F5]" />
                    No customers found
                  </td>
                </tr>
              )}
            </Table>
          </div>

          <div className={`${panel} p-5`}>
            <SectionHeader
              title="Recent suppliers"
              icon={<Truck className="h-4 w-4" />}
              onViewAll={() => navigate("/admin/suppliers")}
            />
            <Table headers={["#", "Name", "Phone", "Created On"]}>
              {dashboardData.lastFiveSuppliers?.map((supplier, index) => (
                <TableRow
                  key={supplier.id}
                  row={supplier}
                  index={index + 1}
                  columns={[
                    <ProfileCard
                      imageUrl={supplier.profileImageUrl}
                      name={supplier.name}
                      email={supplier.email}
                    />,
                    supplier.phone,
                    formatDate(supplier.createdAt, systemSettings?.dateFormat.format || "d-m-Y"),
                  ]}
                />
              ))}
              {!dashboardData.lastFiveSuppliers.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm font-medium text-[#8A97A8]">
                    <Truck className="mx-auto mb-2 h-6 w-6 text-[#C7D9F5]" />
                    No suppliers found
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </section>

        {/* Invoices */}
        <section className={`${panel} p-5`}>
          <SectionHeader
            title="Recent invoices"
            icon={<Receipt className="h-4 w-4" />}
            onViewAll={() => navigate("/admin/invoices")}
          />
          <Table headers={["#", "Invoice No", "Customer", "Amount", "Status", "Created On"]}>
            {dashboardData.lastFiveInvoices?.map((invoice, index) => (
              <TableRow
                key={invoice.id}
                index={index + 1}
                row={invoice}
                columns={[
                  invoice.invoiceNumber,
                  <ProfileCard
                    imageUrl={invoice.customer.imageUrl}
                    name={invoice.customer.name}
                    email={invoice.customer.email}
                  />,
                  format(invoice.totalAmount),
                  <InvoiceStatusBadge status={invoice.status} />,
                  formatDate(invoice.createdAt, systemSettings?.dateFormat.format || "d-m-Y"),
                ]}
              />
            ))}
            {!dashboardData.lastFiveInvoices?.length && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm font-medium text-[#8A97A8]">
                  <Receipt className="mx-auto mb-2 h-6 w-6 text-[#C7D9F5]" />
                  No invoices found
                </td>
              </tr>
            )}
          </Table>
        </section>

        {/* Payments & purchases */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className={`${panel} p-5`}>
            <SectionHeader
              title="Recent invoice payments"
              icon={<CreditCard className="h-4 w-4" />}
            />
            <Table headers={["#", "Invoice No", "Amount", "Payment Method"]}>
              {dashboardData.lastFivePayments?.map((payment, index) => (
                <TableRow
                  key={payment.id}
                  row={payment}
                  index={index + 1}
                  columns={[
                    payment.invoice.invoiceNumber,
                    format(payment.invoice.totalAmount),
                    <PaymentModeBadge mode={payment.payment_method.name} />,
                  ]}
                />
              ))}
              {!dashboardData.lastFivePayments.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm font-medium text-[#8A97A8]">
                    <Receipt className="mx-auto mb-2 h-6 w-6 text-[#C7D9F5]" />
                    No payments found
                  </td>
                </tr>
              )}
            </Table>
          </div>

          <div className={`${panel} p-5`}>
            <SectionHeader
              title="Recent purchases"
              icon={<ShoppingCart className="h-4 w-4" />}
              onViewAll={() => navigate("/admin/purchases")}
            />
            <Table headers={["#", "Purchase No", "Supplier", "Amount"]}>
              {dashboardData.lastFivePurchases?.map((purchase, index) => (
                <TableRow
                  key={purchase.id}
                  row={purchase}
                  index={index + 1}
                  columns={[
                    purchase.purchaseId,
                    <ProfileCard
                      imageUrl={purchase.vendor?.profileImage ?? ""}
                      name={purchase.vendor?.name ?? ""}
                      email={purchase.vendor?.email ?? ""}
                    />,
                    format(purchase.totalAmount),
                  ]}
                />
              ))}
              {!dashboardData.lastFivePurchases.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm font-medium text-[#8A97A8]">
                    <ShoppingCart className="mx-auto mb-2 h-6 w-6 text-[#C7D9F5]" />
                    No purchases found
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DashboardPage;
