import React from "react";
import Modal from "@components/admin/Modal";
import type { BankAccount } from "@models/bank-account";
import useDateFormatter from "@hooks/useDateFormatter";
import { useSelector } from "react-redux";
import type { RootState } from "@store/index";
import { useCurrencies } from "@hooks/useCurrencies";
import { getBankCodeType } from "@constants/bankCodeTypes";
import { CreditCard } from "lucide-react";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    bankAccount: BankAccount & { asOnDate?: string };
}

const BankAccountDetailsModal: React.FC<Props> = ({ isOpen, onClose, bankAccount }) => {
    if (!bankAccount) return null;

    const { data: systemSettings } = useSelector((state: RootState) => state.systemSettings);
    const { formatMoney, defaultCurrencyCode } = useCurrencies();
    const { formatDate } = useDateFormatter();
    const dateFormat = systemSettings?.dateFormat.format || "DD-MM-YYYY";
    const accountCurrency = bankAccount.currencyCode || defaultCurrencyCode;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Bank Account Overview">
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-300 rounded-xl">
                {/* --- Header --- */}
                <div className="px-6 py-4 border-b border-gray-300">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-700">
                                {bankAccount.accountHoldername}
                            </h2>
                            <p className="text-sm text-gray-700 mt-1 font-medium">
                                {bankAccount.bankName}
                            </p>
                        </div>
                        <span
                            className={`px-3 py-1 text-xs font-semibold rounded-full ${bankAccount.status
                                ? "bg-teal-500 text-white"
                                : "bg-rose-500/10 text-rose-400"
                                }`}
                        >
                            {bankAccount.status ? "Active" : "Inactive"}
                        </span>
                    </div>
                </div>

                {/* --- Balance Card --- */}
                <div className="p-6">
                    <div className="relative p-5 bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-300 rounded-xl shadow-md shadow-black/10">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-700">
                                    Current Balance
                                </p>
                                <p className={`text-3xl font-bold tracking-tight mt-1 ${bankAccount.currentBalance >= 0
                                    ? "text-gray-700"
                                    : "text-rose-500"
                                    }`}
                                >
                                    {formatMoney(bankAccount.currentBalance || 0, accountCurrency)}
                                </p>
                            </div>
                            <div className="p-3 rounded-full bg-gradient-to-r from-indigo-400 to-purple-600 text-white">
                                <CreditCard size={24} />
                            </div>
                        </div>
                        {bankAccount.asOnDate && (
                            <p className="text-xs text-slate-500 mt-3">
                                As on {formatDate(bankAccount.asOnDate, dateFormat)}
                            </p>
                        )}
                    </div>
                </div>

                {/* --- Account Info Section --- */}
                <div className="px-6 pb-6">
                    <h3 className="text-base font-semibold text-gray-700 mb-4">Account Details</h3>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                        <div className="col-span-1">
                            <dt className="text-xs uppercase tracking-wider font-medium text-slate-500">Account No.</dt>
                            <dd className="text-sm font-mono text-gray-400 mt-1">{bankAccount.accountNumber}</dd>
                        </div>
                        <div className="col-span-1">
                            <dt className="text-xs uppercase tracking-wider font-medium text-slate-500">{getBankCodeType(bankAccount.bankCodeType).label}</dt>
                            <dd className="text-sm font-mono text-gray-400 mt-1">{bankAccount.IFSCCode}</dd>
                        </div>
                        <div className="col-span-1">
                            <dt className="text-xs uppercase tracking-wider font-medium text-slate-500">Account Type</dt>
                            <dd className="text-sm capitalize text-gray-400 mt-1">{bankAccount.accountType}</dd>
                        </div>
                        <div className="col-span-1">
                            <dt className="text-xs uppercase tracking-wider font-medium text-slate-500">Branch</dt>
                            <dd className="text-sm text-gray-400 mt-1">{bankAccount.branchName}</dd>
                        </div>
                        <div className="col-span-2 border-t border-gray-300 my-2"></div>
                        <div className="col-span-1">
                            <dt className="text-xs uppercase tracking-wider font-medium text-slate-500">Currency</dt>
                            <dd className="text-sm text-gray-400 mt-1">{accountCurrency}</dd>
                        </div>
                        <div className="col-span-1">
                            <dt className="text-xs uppercase tracking-wider font-medium text-slate-500">Opening Balance</dt>
                            <dd className="text-sm text-gray-400 mt-1">{formatMoney(bankAccount.openingBalance || 0, accountCurrency)}</dd>
                        </div>
                        <div className="col-span-1">
                            <dt className="text-xs uppercase tracking-wider font-medium text-slate-500">Created On</dt>
                            <dd className="text-sm text-gray-400 mt-1">{formatDate(bankAccount.createdAt, dateFormat)}</dd>
                        </div>
                    </dl>
                </div>

                {/* --- Footer --- */}
                <div className="px-6 py-4 border-gray-200 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-gray-950 transition-colors shadow-md shadow-blue-600/10"
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default BankAccountDetailsModal;