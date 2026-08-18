import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import ProfileCard from "@components/admin/ProfileImage";
import StatusBadge from "@components/admin/StatusBadge";
import Table from "@components/admin/Table";
import TableRow from "@components/admin/TableRow";
import Constants from "@constants/api";
import useDateFormatter from "@hooks/useDateFormatter";
import type { PermissionAction } from "@models/permissions";
import type { RootState } from "@store/index";
import { hasPermission } from "@utils/hasPermission";
import axios from "axios";
import { CirclePlusIcon, Edit, ReceiptIcon, Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

type SaleOrderRow = {
  id: string;
  saleOrderId: string | null;
  orderDate: string;
  status: string;
  TotalAmount: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  billTo: { id: string; name: string; email: string | null; image: string | null } | null;
};

type PaginationData = { total: number; page: number; limit: number; totalPages: number };

export default function SaleOrderList() {
  const navigate = useNavigate();
  const { token } = useSelector((state: RootState) => state.auth);
  const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
  const permissions = systemSettings?.permissions || [];
  const { formatDate } = useDateFormatter();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") || "";
  const limit = Number(searchParams.get("limit") || 10);
  const page = Number(searchParams.get("page") || 1);

  const [rows, setRows] = useState<SaleOrderRow[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<SaleOrderRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchOrders = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(Constants.GET_SALE_ORDERS_URL, {
        params: { search, limit, page },
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data.data;
      setRows(data?.saleOrders ?? []);
      if (data?.pagination) setPagination(data.pagination);
    } catch {
      toast.error("Failed to load sale orders");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchOrders();
  }, [search, limit, page, token]);

  const handleSearch = (value: string) => {
    setSearchParams({ search: value, limit: String(limit), page: "1" });
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      setIsDeleting(true);
      await axios.delete(`${Constants.DELETE_SALE_ORDER_URL}/${itemToDelete.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Sale order deleted");
      setItemToDelete(null);
      await fetchOrders();
    } catch (err) {
      toast.error(axios.isAxiosError(err) ? String(err.response?.data?.message ?? "Delete failed") : "Delete failed");
    } finally {
      setIsDeleting(false);
    }
  };

  const convertToInvoice = async (item: SaleOrderRow) => {
    try {
      const r = await axios.post(
        `${Constants.CONVERT_SALE_ORDER_TO_INVOICE_URL}/${item.id}/convert-to-invoice`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const invoiceId = r.data?.data?.invoiceId as string | undefined;
      toast.success("Converted to draft invoice — issue it to post stock and GL");
      if (invoiceId) navigate(`/admin/invoices/edit-invoice/${invoiceId}`);
      else await fetchOrders();
    } catch (err) {
      toast.error(
        axios.isAxiosError(err) ? String(err.response?.data?.message ?? "Convert failed") : "Convert failed",
      );
    }
  };

  const getActions = (item: SaleOrderRow) => {
    const actions = [
      {
        label: "Convert to Invoice",
        icon: <ReceiptIcon size={14} />,
        onClick: (row: SaleOrderRow) => {
          void convertToInvoice(row);
        },
      },
      {
        label: "Edit",
        icon: <Edit size={14} />,
        onClick: (row: SaleOrderRow) => navigate(`/admin/sale-orders/edit/${row.id}`),
      },
      {
        label: "Delete",
        icon: <Trash2Icon size={14} />,
        onClick: (row: SaleOrderRow) => setItemToDelete(row),
      },
    ];
    return actions.filter((action) => {
      if (action.label === "Convert to Invoice") {
        return !item.invoiceId && item.status !== "cancelled" && hasPermission(permissions, "invoices", "create");
      }
      if (action.label === "Edit") {
        return item.status !== "invoiced" && hasPermission(permissions, "sale-orders", "edit" as PermissionAction);
      }
      if (action.label === "Delete") {
        return !item.invoiceId && hasPermission(permissions, "sale-orders", "delete" as PermissionAction);
      }
      return true;
    });
  };

  const from = (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">Sale Orders</h1>
          <p className="text-sm text-slate-500">
            Confirm customer orders, then convert to a draft invoice. Stock and ledger post when you issue the invoice.
          </p>
        </div>
        {hasPermission(permissions, "sale-orders", "create") && (
          <button
            type="button"
            onClick={() => navigate("/admin/sale-orders/new")}
            className="flex cursor-pointer items-center gap-2 rounded-md bg-[#007BFF] px-3 py-1.5 text-white shadow hover:bg-[#000D33]"
          >
            <CirclePlusIcon size={14} /> New Sale Order
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <input
          type="text"
          placeholder="Search order no or customer…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-4 py-2 text-gray-950 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#007BFF] md:w-64"
        />
        <select
          value={limit}
          onChange={(e) => setSearchParams({ search, limit: e.target.value, page: "1" })}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-950"
        >
          {[10, 25, 50].map((num) => (
            <option key={num} value={num}>
              {num} / page
            </option>
          ))}
        </select>
      </div>

      <Table headers={["#", "Order No", "Customer", "Date", "Amount", "Status", "Actions"]}>
        {!isLoading &&
          rows.map((row, index) => (
            <TableRow
              key={row.id}
              index={(page - 1) * limit + index + 1}
              row={row}
              columns={[
                <span key="no" className="text-indigo-600">
                  {row.saleOrderId}
                  {row.invoiceNumber ? (
                    <span className="mt-0.5 block text-xs text-slate-400">Inv {row.invoiceNumber}</span>
                  ) : null}
                </span>,
                <ProfileCard
                  key="cust"
                  imageUrl={row.billTo?.image}
                  name={row.billTo?.name ?? "Customer"}
                  email={row.billTo?.email ?? undefined}
                />,
                <span key="date">{formatDate(row.orderDate, systemSettings?.dateFormat.format || "d-m-Y")}</span>,
                <span key="amt">{Number(row.TotalAmount).toFixed(2)}</span>,
                <StatusBadge key="st" status={row.status} />,
              ]}
              actions={getActions(row)}
            />
          ))}
        {!isLoading && rows.length === 0 && (
          <tr>
            <td className="py-6 text-center font-semibold text-gray-950" colSpan={7}>
              No sale orders yet
            </td>
          </tr>
        )}
        {isLoading && (
          <tr>
            <td className="py-6 text-center" colSpan={7}>
              <LoaderSpinner />
            </td>
          </tr>
        )}
      </Table>

      <PaginationWrapper
        count={pagination.totalPages}
        page={page}
        from={pagination.total === 0 ? 0 : from}
        to={to}
        total={pagination.total}
        onChange={(_, newPage) => setSearchParams({ search, limit: String(limit), page: String(newPage) })}
        paginationVariant="outlined"
        paginationShape="rounded"
      />

      <DeleteConfirmationModal
        isOpen={Boolean(itemToDelete)}
        onClose={() => setItemToDelete(null)}
        onConfirm={() => void confirmDelete()}
        isDeleting={isDeleting}
        title="Confirm Deletion"
        message="Are you sure you want to delete this sale order?"
      />
    </div>
  );
}
