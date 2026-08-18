import { DateRangePicker } from "@components/admin/DateRangePicker";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import Constants from "@constants/api";
import { useCurrencyFormatter } from "@hooks/useCurrencyFormatter";
import useDateFormatter from "@hooks/useDateFormatter";
import { useDebounce } from "@hooks/useDebounce";
import type { RootState } from "@store/index";
import { formatLocalDateTime } from "@utils/converters";
import axios from "axios";
import { TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";

interface BillRow {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  customerName: string | null;
  revenue: number;
  taxableRevenue: number;
  tax: number;
  discount: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  status: string;
  currency: string | null;
  itemCount: number;
}

interface BillSummary {
  totalRevenue: number;
  totalTaxableRevenue: number;
  totalTax: number;
  totalDiscount: number;
  totalCogs: number;
  totalGrossProfit: number;
  overallMarginPct: number;
}

interface BillWiseProfitResponse {
  success: boolean;
  data: {
    rows: BillRow[];
    summary: BillSummary;
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  };
}

const marginColor = (pct: number) => {
  if (pct >= 30) return "text-green-600";
  if (pct >= 10) return "text-yellow-600";
  return "text-red-500";
};

const BillWiseProfitReport: React.FC = () => {
  const { token } = useSelector((state: RootState) => state.auth);
  const { format } = useCurrencyFormatter();
  const { formatDate } = useDateFormatter();
  const [rows, setRows] = useState<BillRow[]>([]);
  const [summary, setSummary] = useState<BillSummary | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [dateRange, setDateRange] = useState<{
    startDate: Date | null;
    endDate: Date | null;
  }>({ startDate: null, endDate: null });
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 500);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const limit = Number(searchParams.get("limit") || 20);
  const page = Number(searchParams.get("page") || 1);

  useEffect(() => {
    if (token) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, debouncedSearch, page, limit]);

  const fetchReport = async (range = dateRange) => {
    try {
      setIsLoading(true);
      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      };
      if (range.startDate && range.endDate) {
        params.startDate = formatLocalDateTime(range.startDate, "start", true);
        params.endDate = formatLocalDateTime(range.endDate, "end", true);
      }
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await axios.get<BillWiseProfitResponse>(
        Constants.GET_BILL_WISE_PROFIT_URL,
        { headers: { Authorization: `Bearer ${token}` }, params },
      );
      if (res.data.success) {
        setRows(res.data.data.rows);
        setSummary(res.data.data.summary);
        setPagination(res.data.data.pagination);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRangeChange = (range: {
    startDate: Date | null;
    endDate: Date | null;
  }) => {
    setDateRange(range);
    if (range.startDate && range.endDate) {
      setDateRangeError(null);
      fetchReport(range);
    } else {
      setDateRangeError("Please select both start and end date");
    }
  };

  const clearFilters = () => {
    setDateRange({ startDate: null, endDate: null });
    setSearchInput("");
    fetchReport({ startDate: null, endDate: null });
  };

  const handlePageChange = (newPage: number) =>
    setSearchParams({ limit: String(limit), page: String(newPage) });

  const handleLimitChange = (newLimit: number) =>
    setSearchParams({ limit: String(newLimit), page: "1" });

  const fmtAmt = (n: number) => format(n);

  const headers = [
    "Invoice #",
    "Date",
    "Customer",
    "Revenue",
    "Taxable Revenue",
    "Tax",
    "Discount",
    "COGS",
    "Gross Profit",
    "Margin %",
    "Items",
    "Status",
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="h-7 w-7 text-green-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Bill-wise Profit
          </h1>
          <p className="text-sm text-gray-500">
            Per-invoice gross profit — revenue minus cost of goods sold
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Revenue", value: summary.totalRevenue, color: "text-blue-600" },
            { label: "Total COGS", value: summary.totalCogs, color: "text-red-500" },
            { label: "Gross Profit", value: summary.totalGrossProfit, color: summary.totalGrossProfit >= 0 ? "text-green-600" : "text-red-500" },
            { label: "Overall Margin", value: null, pct: summary.overallMarginPct, color: marginColor(summary.overallMarginPct) },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border bg-white p-4 shadow-sm">
              <p className="text-xs text-gray-500 mb-1">{card.label}</p>
              <p className={`text-xl font-bold ${card.color}`}>
                {card.pct !== undefined
                  ? `${card.pct.toFixed(1)}%`
                  : fmtAmt(card.value ?? 0)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <DateRangePicker
          onChange={handleRangeChange}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
        />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search invoice or customer…"
          className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        {dateRangeError && (
          <p className="text-xs text-red-500">{dateRangeError}</p>
        )}
        <button
          onClick={clearFilters}
          className="text-sm text-gray-500 underline hover:text-gray-700"
        >
          Clear filters
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoaderSpinner />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <Table headers={headers}>
            {rows.length === 0 ? (
              <TableRow>
                <td
                  colSpan={headers.length}
                  className="py-12 text-center text-gray-400"
                >
                  No invoices found for the selected filters.
                </td>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <td className="px-4 py-3 text-sm font-medium text-blue-600">
                    {row.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {formatDate(row.invoiceDate)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {row.customerName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium">
                    {fmtAmt(row.revenue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">
                    {fmtAmt(row.taxableRevenue)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {fmtAmt(row.tax)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-500">
                    {row.discount > 0 ? fmtAmt(row.discount) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-500">
                    {row.cogs > 0 ? fmtAmt(row.cogs) : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm text-right font-semibold ${row.grossProfit >= 0 ? "text-green-600" : "text-red-500"}`}
                  >
                    {fmtAmt(row.grossProfit)}
                  </td>
                  <td className={`px-4 py-3 text-sm text-right font-semibold ${marginColor(row.grossMarginPct)}`}>
                    {row.grossMarginPct.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-sm text-center text-gray-500">
                    {row.itemCount}
                  </td>
                  <td className="px-4 py-3 text-xs uppercase text-gray-400">
                    {row.status}
                  </td>
                </TableRow>
              ))
            )}
          </Table>
        </div>
      )}

      <PaginationWrapper
        total={pagination.total}
        page={pagination.page}
        limit={pagination.limit}
        totalPages={pagination.totalPages}
        onPageChange={handlePageChange}
        onLimitChange={handleLimitChange}
      />
    </div>
  );
};

export default BillWiseProfitReport;
