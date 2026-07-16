import { CirclePlusIcon, Edit, Sparkles, Trash2Icon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Table from "@components/admin/Table";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import Constants from "@constants/api";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import axios from "axios";
import TableRow from "@components/admin/TableRow";
import PaginationWrapper from "@components/admin/PaginationWrapper";
import DeleteConfirmationModal from "@components/admin/DeleteConfirmationModal";
import { hasPermission } from "@utils/hasPermission";
import type { PermissionAction } from "@models/permissions";
import LoaderSpinner from "@components/admin/LoaderSpinner";
import NoRecords from "@components/admin/NoRecords";
import type { TaxRate, TaxRegime } from "@models/taxRate";
import { STARTER_RATES } from "../../../../lib/taxRegimeDefaults";

interface PaginationData {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

type RegimeFilter = 'all' | TaxRegime;

const REGIME_OPTIONS: RegimeFilter[] = ['all', 'GST_INDIA', 'VAT_GENERIC', 'US_SALES_TAX', 'NONE'];

const regimeLabel = (r: RegimeFilter): string => {
    switch (r) {
        case 'all': return 'All';
        case 'GST_INDIA': return 'GST (India)';
        case 'VAT_GENERIC': return 'VAT';
        case 'US_SALES_TAX': return 'US Sales Tax';
        case 'NONE': return 'None';
    }
};

const regimeBadgeClass = (r: TaxRegime): string => {
    switch (r) {
        case 'GST_INDIA': return 'bg-indigo-100 text-indigo-700';
        case 'VAT_GENERIC': return 'bg-amber-100 text-amber-700';
        case 'US_SALES_TAX': return 'bg-sky-100 text-sky-700';
        case 'NONE': return 'bg-gray-100 text-gray-700';
    }
};

const TaxRateList: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
    const [pagination, setPagination] = useState<PaginationData>({ total: 0, page: 1, limit: 10, totalPages: 1 });
    const [isDeleteModalOpen, setDeleteModalOpen] = useState<boolean>(false);
    const [deleteItem, setDeleteItem] = useState<TaxRate | null>(null);
    const [regimeFilter, setRegimeFilter] = useState<RegimeFilter>('all');
    const [companyRegime, setCompanyRegime] = useState<TaxRegime | null>(null);
    const [isSeeding, setIsSeeding] = useState<boolean>(false);
    const search = searchParams.get('search') || '';
    const limit = Number(searchParams.get('limit') || 10);
    const page = Number(searchParams.get('page') || 1);
    const navigate = useNavigate();
    const { token, user } = useSelector((state: RootState) => state.auth);
    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const permissions = systemSettings?.permissions || [];
    const [isLoading, setIsLoading] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleCreateClick = () => {
        navigate('/admin/settings/tax-rates/new');
    };

    const handleEditClick = (item: TaxRate) => {
        navigate(`/admin/settings/tax-rates/edit/${item.id}`);
    };

    const handleDeleteClick = (item: TaxRate) => {
        setDeleteItem(item);
        setDeleteModalOpen(true);
    };

    const tableActions = [
        {
            label: 'Edit',
            icon: <Edit size={14} />,
            onClick: (item: TaxRate) => { handleEditClick(item); },
        },
        {
            label: 'Delete',
            icon: <Trash2Icon size={14} />,
            onClick: (item: TaxRate) => { handleDeleteClick(item); },
        },
    ];

    const tableHeaders = ['#', 'Name', 'Regime', 'Kind', 'Rate %', 'Active', 'Actions'];
    const restrictedActions = ['edit', 'delete'];
    const allowedActions = tableActions.filter((action) => {
        const actionLabel = action.label.toLowerCase() as PermissionAction;
        if (!restrictedActions.includes(actionLabel)) {
            return true;
        }
        return hasPermission(permissions, 'finance-settings', actionLabel);
    });

    if (allowedActions.length === 0) {
        tableHeaders.pop();
    }

    const fetchTaxRates = async (
        searchValue?: string,
        limitValue?: number,
        pageValue?: number,
        regimeValue?: RegimeFilter,
    ) => {
        try {
            setIsLoading(true);
            const params: Record<string, string | number> = {
                search: searchValue ?? '',
                limit: limitValue ?? 10,
                page: pageValue ?? 1,
            };
            if (regimeValue && regimeValue !== 'all') {
                params.regime = regimeValue;
            }
            const response = await axios.get(Constants.GET_TAX_RATES_FOR_LIST_URL, {
                params,
                headers: { 'Authorization': `Bearer ${token}` },
            });
            setTaxRates(response.data?.data?.taxRates || []);
            setPagination(response.data?.data?.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
        } catch (error) {
            console.error("Error fetching tax rates:", error);
            toast.error("Failed to fetch tax rates.");
        } finally {
            setIsLoading(false);
        }
    };

    const fetchCompanyRegime = async () => {
        if (!user?.id) return;
        try {
            const response = await axios.get(`${Constants.FETCH_COMPANY_SETTINGS_URL}/${user.id}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const regime = response.data?.data?.taxRegime as TaxRegime | undefined;
            if (regime && ['GST_INDIA', 'VAT_GENERIC', 'US_SALES_TAX', 'NONE'].includes(regime)) {
                setCompanyRegime(regime);
            } else {
                setCompanyRegime(null);
            }
        } catch (error) {
            // Not critical; just don't show seeding UX
            console.warn('Could not load company settings to determine tax regime:', error);
            setCompanyRegime(null);
        }
    };

    useEffect(() => {
        fetchTaxRates(search, limit, page, regimeFilter);
    }, [search, limit, page, regimeFilter]);

    useEffect(() => {
        fetchCompanyRegime();
    }, [user?.id]);

    const handleSearch = (keyword: string) => {
        setSearchParams({ search: keyword, limit: String(limit), page: '1' });
    };

    const handlePageLengthChange = (newLimit: number) => {
        setSearchParams({ search, limit: String(newLimit), page: '1' });
    };

    const handlePageChange = (newPage: number) => {
        setSearchParams({ search, limit: String(limit), page: String(newPage) });
    };

    const handleRegimeFilterChange = (opt: RegimeFilter) => {
        setRegimeFilter(opt);
        setSearchParams({ search, limit: String(limit), page: '1' });
    };

    const handleConfirmDelete = async () => {
        if (!deleteItem) return;
        try {
            setIsDeleting(true);
            await axios.delete(`${Constants.DELETE_TAX_RATE_URL}/${deleteItem.id}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            toast.success("Tax rate deleted successfully.");
            fetchTaxRates(search, limit, page, regimeFilter);
            setDeleteModalOpen(false);
            setDeleteItem(null);
        } catch (error) {
            console.error("Error deleting tax rate:", error);
            toast.error("Failed to delete tax rate.");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSeedStarter = async () => {
        if (!companyRegime || companyRegime === 'NONE') return;
        const starters = STARTER_RATES[companyRegime];
        if (!starters.length) {
            toast.info('No starter rates available for this regime.');
            return;
        }
        try {
            setIsSeeding(true);
            await Promise.all(
                starters.map((s) =>
                    axios.post(
                        Constants.CREATE_TAX_RATE_URL,
                        {
                            name: s.name,
                            rate: s.rate,
                            regime: companyRegime,
                            taxKind: s.taxKind,
                            isActive: true,
                        },
                        { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } },
                    ),
                ),
            );
            toast.success(`Seeded ${starters.length} starter tax rates.`);
            fetchTaxRates(search, limit, page, regimeFilter);
        } catch (error) {
            console.error('Error seeding starter tax rates:', error);
            toast.error('Failed to seed starter tax rates. Some may have been created.');
            fetchTaxRates(search, limit, page, regimeFilter);
        } finally {
            setIsSeeding(false);
        }
    };

    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);

    const isEmpty = !isLoading && taxRates.length === 0;
    const canShowSeed =
        isEmpty &&
        !search &&
        regimeFilter === 'all' &&
        companyRegime !== null &&
        companyRegime !== 'NONE' &&
        STARTER_RATES[companyRegime].length > 0 &&
        hasPermission(permissions, 'finance-settings', 'create');

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800 ">Tax Rates</h1>
                {hasPermission(permissions, 'finance-settings', 'create') &&
                    <button
                        onClick={() => { handleCreateClick(); }}
                        className="bg-purple-600 hover:bg-purple-600 text-white px-2 py-1 rounded-md shadow cursor-pointer flex items-center gap-2">
                        <CirclePlusIcon size={14} /> Add Tax Rate
                    </button>
                }
            </div>

            {/* Search Input & PageLength */}
            <div className="flex justify-between items-center">
                <input
                    type="text"
                    placeholder="Search by name..."
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="border border-gray-300 rounded-md px-4 py-2 w-full md:w-80 text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                />
                <select
                    value={limit}
                    onChange={(e) => handlePageLengthChange(Number(e.target.value))}
                    className="border border-gray-300 px-3 py-2 rounded-md bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                >
                    {[10, 25, 50].map((num) => (
                        <option className="text-gray-800 " key={num} value={num}>{num} / page</option>
                    ))}
                </select>
            </div>

            {/* Regime filter pills */}
            <div className="flex items-center gap-2 flex-wrap">
                {REGIME_OPTIONS.map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => handleRegimeFilterChange(opt)}
                        className={
                            'px-3 py-1 text-sm rounded-full border cursor-pointer ' +
                            (regimeFilter === opt
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                        }
                    >
                        {regimeLabel(opt)}
                    </button>
                ))}
            </div>

            {/* Seed starter library banner */}
            {canShowSeed && (
                <div className="flex items-center justify-between gap-4 p-4 bg-purple-50 border border-purple-200 rounded-md">
                    <div>
                        <p className="text-sm font-medium text-gray-800">
                            No tax rates yet. Seed the starter library for{' '}
                            <span className="font-semibold">{regimeLabel(companyRegime as RegimeFilter)}</span>?
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                            This will create {STARTER_RATES[companyRegime as TaxRegime].length} common rates you can edit later.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSeedStarter}
                        disabled={isSeeding}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-md shadow flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        <Sparkles size={14} />
                        {isSeeding ? 'Seeding...' : 'Seed starter library'}
                    </button>
                </div>
            )}

            {/* Table */}
            <Table headers={tableHeaders}>
                {!isLoading && taxRates && taxRates.map((rate, index) => (
                    <TableRow
                        key={rate.id}
                        index={index + 1}
                        row={rate}
                        columns={[
                            rate.name,
                            <span
                                className={
                                    'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                                    regimeBadgeClass(rate.regime)
                                }
                            >
                                {regimeLabel(rate.regime as RegimeFilter)}
                            </span>,
                            rate.taxKind ?? '—',
                            Number(rate.rate).toString(),
                            <span
                                className={
                                    'inline-flex items-center px-2 py-1 rounded-sm text-xs font-medium ' +
                                    (rate.isActive
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-700')
                                }
                            >
                                {rate.isActive ? 'Active' : 'Inactive'}
                            </span>,
                        ]}
                        actions={allowedActions.length > 0 ? allowedActions : undefined}
                    />
                ))}
                {!isLoading && !taxRates.length &&
                    <NoRecords colSpan={7} message="No tax rates found" />
                }
                {isLoading && (
                    <tr key="table-loader">
                        <td className="text-center py-1 text-gray-950 font-semibold" colSpan={7}>
                            <LoaderSpinner />
                        </td>
                    </tr>
                )}
            </Table>

            {/* Pagination Component */}
            <PaginationWrapper
                count={pagination.totalPages}
                page={page}
                from={from}
                to={to}
                total={pagination.total}
                onChange={(_, newPage) => handlePageChange(newPage)}
                paginationVariant="outlined"
                paginationShape="rounded"
            />

            <DeleteConfirmationModal
                isOpen={isDeleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                title="Delete Tax Rate"
                message="Are you sure you want to delete this tax rate? This action cannot be undone."
            />
        </div>
    );
};

export default TaxRateList;
