import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "sonner";
import type { SyntheticEvent } from "react";

import type { RootState } from "@store/index";
import Constants from "@constants/api";
import InputField from "@components/admin/InputField";
import SearchableDropdown from "@components/admin/SearchableDropdown";
import ReactDateInput from "@components/admin/ReactDateInput";
import SubmitButton from "@components/admin/SubmitButton";
import Modal from "@components/admin/Modal";
import useDateFormatter from "@hooks/useDateFormatter";
import type { CountryPack, LedgerStatus, CutoverPreview } from "@models/ledgerSetup";

// ---- helpers ----------------------------------------------------------------

type Stage = "configure" | "review" | "live";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const ROLE_LABELS: Record<string, string> = {
    BANK: "Bank",
    CASH: "Cash",
    AR: "Accounts Receivable",
    INVENTORY: "Inventory",
    AP: "Accounts Payable",
    EQUITY: "Opening Equity",
};

const roleLabel = (key: string) => ROLE_LABELS[key] ?? key;

const fmtAmt = (raw: string, currency: string) =>
    `${currency} ${Number(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---- step indicator ---------------------------------------------------------

const STEPS: { key: Stage; label: string }[] = [
    { key: "configure", label: "Configure" },
    { key: "review", label: "Review" },
    { key: "live", label: "Live" },
];

const StepIndicator = ({ stage }: { stage: Stage }) => {
    const current = STEPS.findIndex((s) => s.key === stage);
    return (
        <div className="flex items-center gap-0 mb-6">
            {STEPS.map((step, idx) => (
                <div key={step.key} className="flex items-center">
                    <div className="flex flex-col items-center">
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${
                                idx < current
                                    ? "bg-purple-600 border-purple-600 text-white"
                                    : idx === current
                                    ? "bg-white border-purple-600 text-purple-600"
                                    : "bg-white border-gray-300 text-gray-400"
                            }`}
                        >
                            {idx < current ? "✓" : idx + 1}
                        </div>
                        <span
                            className={`mt-1 text-xs font-medium ${
                                idx <= current ? "text-purple-600" : "text-gray-400"
                            }`}
                        >
                            {step.label}
                        </span>
                    </div>
                    {idx < STEPS.length - 1 && (
                        <div
                            className={`h-0.5 w-16 mx-1 mb-4 ${
                                idx < current ? "bg-purple-600" : "bg-gray-300"
                            }`}
                        />
                    )}
                </div>
            ))}
        </div>
    );
};

// ---- main component ---------------------------------------------------------

const LedgerSetupWizard: React.FC = () => {
    const { token } = useSelector((state: RootState) => state.auth);
    const { formatDate } = useDateFormatter();

    // stage
    const [stage, setStage] = useState<Stage>("configure");
    const [statusLoading, setStatusLoading] = useState(true);
    const [liveStatus, setLiveStatus] = useState<LedgerStatus | null>(null);

    // configure stage
    const [packs, setPacks] = useState<CountryPack[]>([]);
    const [packsLoading, setPacksLoading] = useState(false);
    const [selectedPack, setSelectedPack] = useState<{ id: string; name: string } | null>(null);
    const [packInputValue, setPackInputValue] = useState("");
    const [functionalCurrency, setFunctionalCurrency] = useState("");
    const [fiscalYearStartMonth, setFiscalYearStartMonth] = useState<number>(1);
    const [goLiveDate, setGoLiveDate] = useState<Date | null>(null);
    const [configuring, setConfiguring] = useState(false);

    // review stage
    const [preview, setPreview] = useState<CutoverPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [committing, setCommitting] = useState(false);
    const [showCommitModal, setShowCommitModal] = useState(false);

    // ---- on mount: load status -----------------------------------------------

    useEffect(() => {
        (async () => {
            try {
                setStatusLoading(true);
                const resp = await axios.get(Constants.FETCH_LEDGER_STATUS_URL, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const s = resp.data?.data as LedgerStatus | undefined;
                if (!s) {
                    toast.error("Unexpected response loading ledger status");
                    setStage("configure");
                    loadPacks();
                    return;
                }
                setLiveStatus(s);
                if (s.ledgerInitialized) {
                    setStage("live");
                } else if (s.configured) {
                    setStage("review");
                    loadPreview();
                } else {
                    setStage("configure");
                    loadPacks();
                }
            } catch {
                toast.error("Failed to load ledger status");
                setStage("configure");
                loadPacks();
            } finally {
                setStatusLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- data loaders --------------------------------------------------------

    const loadPacks = async () => {
        try {
            setPacksLoading(true);
            const resp = await axios.get(Constants.FETCH_LEDGER_COUNTRY_PACKS_URL, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setPacks(resp.data?.data?.packs ?? []);
        } catch {
            toast.error("Failed to load country packs");
        } finally {
            setPacksLoading(false);
        }
    };

    const loadPreview = async () => {
        try {
            setPreviewLoading(true);
            const resp = await axios.get(Constants.FETCH_LEDGER_CUTOVER_PREVIEW_URL, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setPreview(resp.data?.data ?? null);
        } catch {
            toast.error("Failed to load cutover preview");
        } finally {
            setPreviewLoading(false);
        }
    };

    // ---- configure: pack select ---------------------------------------------

    const packOptions = packs.map((p) => ({
        id: p.countryCode,
        name: `${p.name} (${p.countryCode})`,
    }));

    const handlePackChange = (_e: SyntheticEvent, value: { id: string; name: string } | null) => {
        setSelectedPack(value);
        if (value) {
            const pack = packs.find((p) => p.countryCode === value.id);
            if (pack) {
                setFunctionalCurrency(pack.defaultFunctionalCurrency);
                setFiscalYearStartMonth(pack.fiscalYearStartMonth);
            }
        }
    };

    // ---- configure: apply & preview -----------------------------------------

    const handleApplyAndPreview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedPack) {
            toast.error("Please select a country");
            return;
        }
        if (!functionalCurrency.trim()) {
            toast.error("Functional currency is required");
            return;
        }
        if (!goLiveDate) {
            toast.error("Go-live date is required");
            return;
        }
        try {
            setConfiguring(true);
            const payload = {
                countryCode: selectedPack.id,
                functionalCurrency: functionalCurrency.trim(),
                fiscalYearStartMonth,
                goLiveDate: goLiveDate.toISOString().slice(0, 10),
            };
            await axios.post(Constants.POST_LEDGER_SETUP_URL, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success("Setup applied. Loading preview...");
            await loadPreview();
            setStage("review");
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 400) {
                const msg = (err.response.data as { message?: string })?.message;
                toast.error(msg ?? "Setup failed");
            } else {
                toast.error("Failed to apply ledger setup");
            }
        } finally {
            setConfiguring(false);
        }
    };

    // ---- review: commit ------------------------------------------------------

    const handleCommit = async () => {
        try {
            setCommitting(true);
            await axios.post(Constants.POST_LEDGER_CUTOVER_COMMIT_URL, {}, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success("Ledger is now live");
            setShowCommitModal(false);
            setStage("live");
        } catch {
            toast.error("Commit failed. Please try again.");
            return;
        } finally {
            setCommitting(false);
        }
        // Best-effort status refresh for the live summary card. A failure here
        // must NOT report a commit failure — the ledger is already live, so we
        // fall back to the status loaded on mount.
        try {
            const resp = await axios.get(Constants.FETCH_LEDGER_STATUS_URL, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setLiveStatus((prev) => resp.data?.data ?? prev);
        } catch {
            /* non-critical: keep the existing liveStatus */
        }
    };

    // ---- render --------------------------------------------------------------

    if (statusLoading) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-bold text-gray-800">Ledger Setup</h1>
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    // computed equity for review card
    const openingEquity = preview
        ? Number(preview.summary.bank) +
          Number(preview.summary.cash) +
          Number(preview.summary.ar) +
          Number(preview.summary.inventory) -
          Number(preview.summary.ap)
        : 0;

    const currency = liveStatus?.functionalCurrency ?? functionalCurrency ?? "";

    // draft journal totals
    const totalDebit = preview
        ? preview.lines
              .filter((l) => l.side === "debit")
              .reduce((s, l) => s + Number(l.amount), 0)
        : 0;
    const totalCredit = preview
        ? preview.lines
              .filter((l) => l.side === "credit")
              .reduce((s, l) => s + Number(l.amount), 0)
        : 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">Ledger Setup</h1>
            </div>

            <StepIndicator stage={stage} />

            {/* ---------------------------------------------------------------- configure */}
            {stage === "configure" && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-2xl">
                    <h2 className="text-lg font-semibold text-gray-700 mb-1">Configure Your Ledger</h2>
                    <p className="text-sm text-gray-500 mb-4">
                        Select a country pack to seed your chart of accounts, then confirm the functional
                        currency, fiscal year start, and go-live date.
                    </p>

                    {/* warning callout */}
                    <div className="mb-5 flex gap-2 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                        <span className="mt-0.5 shrink-0">⚠</span>
                        <span>
                            Once you commit the cutover, the country and currency are locked and cannot be
                            changed.
                        </span>
                    </div>

                    <form onSubmit={handleApplyAndPreview} className="space-y-4">
                        {/* country pack */}
                        <SearchableDropdown
                            label="Country"
                            required
                            value={selectedPack}
                            options={packOptions}
                            inputValue={packInputValue}
                            onInputChange={(_e, v) => setPackInputValue(v)}
                            onChange={handlePackChange}
                            loading={packsLoading}
                            placeholder="Select a country"
                        />

                        {/* functional currency */}
                        <InputField
                            id="functionalCurrency"
                            label="Functional Currency"
                            placeholder="e.g. INR, USD"
                            required
                            value={functionalCurrency}
                            onChange={(e) => setFunctionalCurrency(e.target.value)}
                        />

                        {/* fiscal year start */}
                        <div>
                            <label
                                htmlFor="fiscalYearStart"
                                className="block text-sm font-medium text-gray-700 mb-1"
                            >
                                Fiscal Year Start Month <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="fiscalYearStart"
                                value={fiscalYearStartMonth}
                                onChange={(e) => setFiscalYearStartMonth(Number(e.target.value))}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950 bg-white"
                            >
                                {MONTH_NAMES.map((name, idx) => (
                                    <option key={idx + 1} value={idx + 1}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* go-live date */}
                        <div>
                            <ReactDateInput
                                id="goLiveDate"
                                name="goLiveDate"
                                label="Go-Live Date"
                                required
                                selected={goLiveDate}
                                onChange={(date) => setGoLiveDate(date)}
                                placeholder="Select go-live date"
                            />
                            <p className="text-xs text-gray-500 -mt-3">
                                Opening balances are captured as of the day before this date; documents
                                dated on/after it post to the ledger.
                            </p>
                        </div>

                        <div className="pt-2 flex justify-end">
                            <SubmitButton isLoading={configuring} isDisabled={configuring}>
                                {configuring ? "Saving..." : "Apply & Preview"}
                            </SubmitButton>
                        </div>
                    </form>
                </div>
            )}

            {/* ---------------------------------------------------------------- review */}
            {stage === "review" && (
                <div className="space-y-4 max-w-3xl">
                    <div className="bg-white rounded-lg border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-gray-700">Cutover Preview</h2>
                            {preview && (
                                <span
                                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                                        preview.balanced
                                            ? "bg-green-100 text-green-700"
                                            : "bg-red-100 text-red-700"
                                    }`}
                                >
                                    {preview.balanced ? "✓ Balanced" : "✗ Unbalanced"}
                                </span>
                            )}
                        </div>

                        {previewLoading && (
                            <p className="text-sm text-gray-500">Loading preview...</p>
                        )}

                        {!previewLoading && preview && (
                            <>
                                {/* opening balances summary */}
                                <div className="mb-5">
                                    <h3 className="text-sm font-semibold text-gray-600 mb-2">
                                        Opening Balances
                                        <span className="ml-2 text-xs font-normal text-gray-400">
                                            as of {formatDate(preview.asOf)}
                                        </span>
                                    </h3>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                        {[
                                            { label: "Bank", val: preview.summary.bank },
                                            { label: "Cash", val: preview.summary.cash },
                                            { label: "Accounts Receivable", val: preview.summary.ar },
                                            { label: "Inventory", val: preview.summary.inventory },
                                            { label: "Accounts Payable", val: preview.summary.ap },
                                            {
                                                label: "Opening Equity",
                                                val: openingEquity.toFixed(2),
                                            },
                                        ].map(({ label, val }) => (
                                            <div
                                                key={label}
                                                className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2"
                                            >
                                                <p className="text-xs text-gray-500">{label}</p>
                                                <p className="text-sm font-semibold text-gray-800">
                                                    {fmtAmt(String(val), currency)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* draft journal table */}
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-600 mb-2">
                                        Draft Opening Journal
                                    </h3>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr className="bg-gray-100 text-gray-600 text-left">
                                                    <th className="px-3 py-2 font-medium">Account Role</th>
                                                    <th className="px-3 py-2 font-medium text-right">Debit</th>
                                                    <th className="px-3 py-2 font-medium text-right">Credit</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.lines.map((line, idx) => (
                                                    <tr
                                                        key={idx}
                                                        className="border-t border-gray-100 hover:bg-gray-50"
                                                    >
                                                        <td className="px-3 py-2 text-gray-700">
                                                            {roleLabel(line.roleKey)}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-gray-800">
                                                            {line.side === "debit"
                                                                ? fmtAmt(line.amount, currency)
                                                                : "—"}
                                                        </td>
                                                        <td className="px-3 py-2 text-right text-gray-800">
                                                            {line.side === "credit"
                                                                ? fmtAmt(line.amount, currency)
                                                                : "—"}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                                                    <td className="px-3 py-2 text-gray-700">Total</td>
                                                    <td className="px-3 py-2 text-right text-gray-800">
                                                        {fmtAmt(totalDebit.toFixed(2), currency)}
                                                    </td>
                                                    <td className="px-3 py-2 text-right text-gray-800">
                                                        {fmtAmt(totalCredit.toFixed(2), currency)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* action buttons */}
                    <div className="flex gap-3 justify-between">
                        <button
                            type="button"
                            onClick={() => {
                                setStage("configure");
                                loadPacks();
                            }}
                            disabled={committing}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 disabled:opacity-50"
                        >
                            ← Back
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCommitModal(true)}
                            disabled={previewLoading || committing}
                            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-gray-950 disabled:opacity-50 flex items-center gap-2"
                        >
                            {committing ? "Committing..." : "Commit — Go Live"}
                        </button>
                    </div>
                </div>
            )}

            {/* ---------------------------------------------------------------- live */}
            {stage === "live" && liveStatus && (
                <div className="max-w-xl bg-white rounded-lg border border-green-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xl font-bold">
                            ✓
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800">Your ledger is live.</h2>
                            <p className="text-sm text-gray-500">
                                The accounting ledger is active and accepting transactions.
                            </p>
                        </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <dt className="text-gray-500">Country</dt>
                            <dd className="font-medium text-gray-800">{liveStatus.countryCode ?? "—"}</dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Functional Currency</dt>
                            <dd className="font-medium text-gray-800">
                                {liveStatus.functionalCurrency ?? "—"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Fiscal Year Start</dt>
                            <dd className="font-medium text-gray-800">
                                {liveStatus.fiscalYearStartMonth != null
                                    ? MONTH_NAMES[liveStatus.fiscalYearStartMonth - 1]
                                    : "—"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Go-Live Date</dt>
                            <dd className="font-medium text-gray-800">
                                {formatDate(liveStatus.goLiveDate)}
                            </dd>
                        </div>
                    </dl>
                </div>
            )}

            {/* ---------------------------------------------------------------- commit confirmation modal */}
            <Modal
                isOpen={showCommitModal}
                onClose={() => setShowCommitModal(false)}
                title="Commit — Go Live"
                size="md"
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-700">
                        This posts the opening balances journal entry and makes the ledger live. Country
                        and functional currency will become locked and cannot be changed.
                    </p>
                    <p className="text-sm font-medium text-gray-800">Continue?</p>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowCommitModal(false)}
                            disabled={committing}
                            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <SubmitButton
                            isLoading={committing}
                            isDisabled={committing}
                            onClick={handleCommit}
                        >
                            {committing ? "Committing..." : "Yes, Go Live"}
                        </SubmitButton>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default LedgerSetupWizard;
