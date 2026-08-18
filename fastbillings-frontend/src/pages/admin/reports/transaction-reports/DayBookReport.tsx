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
import { BookOpen, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";

interface DayBookEntry {
  id: string;
  date: string;
  type: string;
  docNumber: string | null;
  party: string | null;
  debit: number;
  credit: number;
  balance: number;
  status: string;
  currency: string | null;
  description: string | null;
}

interface DayBookTotals {
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
}

interface DayBookPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface DayBookResponse {
  success: boolean;
  data: {
    entries: DayBookEntry[];
    totals: DayBookTotals;
    pagination: DayBookPagination;
  };
}

const TYPE_BADGE: Record<string, string> = {
  Invoice: "bg-blue-100 text-blue-700",
  "Credit Note": "bg-orange-100 text-orange-700",
  Purchase: "bg-purple-100 text-purple-700",
  Expense: "bg-red-100 text-red-700",
  "Petty Cash": "bg-yellow-100 text-yellow-700",
  "Payment Received": "bg-green-100 text-green-700",
};

const DayBookReport: React.FC = () => {
  const { token } = useSelector((state: RootState) => state.auth);
  const { format } = useCurrencyFormatter();
  const { formatDate } = useDateFormatter();
  const [entries, setEntries] = useState<DayBookEntry[]>([]);
  const [totals, setTotals] = useState<DayBookTotals | null>(null);
  const [pagination, setPagination] = useState<DayBookPagination>({
    total: 0,
    page: 1,
    limit: 50,
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

  const limit = Number(searchParams.get("limit") || 50);
  const page = Number(searchParams.get("page") || 1);

  useEffect(() => {
    if (token) fetchDayBook();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, debouncedSearch, page, limit]);

  const fetchDayBook = async (range = dateRange) => {
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
      const res = await axios.get<DayBookResponse>(Constants.GET_DAY_BOOK_URL, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      if (res.data.success) {
        setEntries(res.data.data.entries);
        setTotals(res.data.data.totals);
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
      fetchDayBook(range);
    } else {
      setDateRangeError("Please select both start and end date");
    }
  };

  const clearFilters = () => {
    setDateRange({ startDate: null, endDate: null });
    setSearchInput("");
    fetchDayBook({ startDate: null, endDate: null });
  };

  const handlePageChange = (newPage: number) =>
    setSearchParams({ limit: String(limit), page: String(newPage) });

  const handleLimitChange = (newLimit: number) =>
    setSearchParams({ limit: String(newLimit), page: "1" });

  const fmtAmt = (n: number) => format(n);
  const balanceColor = (n: number) =>
    n >= 0 ? "text-green-600" : "text-red-600";

  const headers = [
    "Date",
    "Type",
    "Doc #",
    "Party / Category",
    "Description",
    "Debit (In)",
    "Credit (Out)",
    "Balance",
    "Status",
  ];

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Day Book</h1>
          <p className="text-sm text-gray-500">
            Chronological register of all transactions
          </p>
        </div>
      </div>

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Total Inflow (Debit)</p>
            <p className="text-xl font-bold text-green-600">
              {fmtAmt(totals.totalDebit)}
            </p>
            <TrendingUp className="h-4 w-4 text-green-400 mt-1" />
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Total Outflow (Credit)</p>
            <p className="text-xl font-bold text-red-500">
              {fmtAmt(totals.totalCredit)}
            </p>
            <TrendingDown className="h-4 w-4 text-red-400 mt-1" />
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500 mb-1">Net Balance</p>
            <p className={`text-xl font-bold ${balanceColor(totals.netBalance)}`}>
              {fmtAmt(totals.netBalance)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <DateRangePicker
          onChange={handleRangeChange}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
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
            {entries.length === 0 ? (
              <TableRow>
                <td
                  colSpan={headers.length}
                  className="py-12 text-center text-gray-400"
                >
                  No transactions found for the selected period.
                </td>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id}>
                  <td className="px-4 py-3 text-sm whitespace-nowrap">
                    {formatDate(entry.date)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[entry.type] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {entry.docNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {entry.party ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-[180px] truncate">
                    {entry.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-green-600">
                    {entry.debit > 0 ? fmtAmt(entry.debit) : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-red-500">
                    {entry.credit > 0 ? fmtAmt(entry.credit) : "—"}
                  </td>
                  <td
                    className={`px-4 py-3 text-sm text-right font-semibold ${balanceColor(entry.balance)}`}
                  >
                    {fmtAmt(entry.balance)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 uppercase">
                    {entry.status}
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

export default DayBookReport;
