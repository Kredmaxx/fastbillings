import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import axios from 'axios';
import { toast } from 'sonner';

import type { RootState } from '@store/index';
import Constants from '@constants/api';
import CurrencySelect from '@components/admin/CurrencySelect';
import SubmitButton from '@components/admin/SubmitButton';
import { useDocumentDefaults } from '@hooks/useDocumentDefaults';

interface SignatureOption {
    id: string;
    name: string;
}

const DocumentDefaultsPage: React.FC = () => {
    const { token } = useSelector((s: RootState) => s.auth);
    const { defaults, loading, refetch } = useDocumentDefaults();

    // form state — mirrors DocumentDefaults shape
    const [currencyCode, setCurrencyCode] = useState('');
    const [signType, setSignType] = useState<'none' | 'digitalSignature' | 'eSignature'>('none');
    const [signatureId, setSignatureId] = useState<string>('');
    const [paymentTermsDays, setPaymentTermsDays] = useState<string>('');
    const [defaultNotes, setDefaultNotes] = useState('');
    const [defaultTerms, setDefaultTerms] = useState('');

    // saved signature list (for manual-signature picker)
    const [signatures, setSignatures] = useState<SignatureOption[]>([]);
    const [signaturesLoading, setSignaturesLoading] = useState(false);

    const [saving, setSaving] = useState(false);

    // ---- populate form once defaults load ----
    useEffect(() => {
        if (loading) return;
        setCurrencyCode(defaults.defaultCurrencyCode ?? '');
        setSignType(defaults.defaultSignType ?? 'none');
        setSignatureId(defaults.defaultSignatureId ?? '');
        setPaymentTermsDays(
            defaults.paymentTermsDays != null ? String(defaults.paymentTermsDays) : ''
        );
        setDefaultNotes(defaults.defaultNotes ?? '');
        setDefaultTerms(defaults.defaultTerms ?? '');
    }, [loading, defaults]);

    // ---- load saved signatures for manual picker ----
    useEffect(() => {
        if (!token) return;
        setSignaturesLoading(true);
        axios
            .get(Constants.FETCH_SIGNATURES_WITH_SEARCH_URL, {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit: 200 },
            })
            .then((res) => {
                const raw: Array<{ id: string; signatureName: string }> =
                    Array.isArray(res.data?.data) ? res.data.data : [];
                setSignatures(raw.map((s) => ({ id: s.id, name: s.signatureName })));
            })
            .catch(() => {
                // non-critical — leave list empty
            })
            .finally(() => setSignaturesLoading(false));
    }, [token]);

    // ---- save handler ----
    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            const payload: Record<string, unknown> = {
                defaultSignType: signType,
                defaultNotes,
                defaultTerms,
            };
            if (currencyCode) payload.defaultCurrencyCode = currencyCode;
            if (signType === 'digitalSignature' && signatureId) {
                payload.defaultSignatureId = signatureId;
            } else {
                payload.defaultSignatureId = null;
            }
            const terms = paymentTermsDays.trim();
            payload.paymentTermsDays =
                terms === '' || terms === '0' ? null : Number(terms);

            await axios.put(Constants.UPDATE_DOCUMENT_DEFAULTS_URL, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Document defaults saved');
            refetch();
        } catch {
            toast.error('Failed to save document defaults');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-bold text-gray-800">Document Defaults</h1>
                <p className="text-gray-500">Loading...</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-800">Document Defaults</h1>
            </div>

            <p className="text-sm text-gray-500">
                These defaults are pre-applied to every new document (invoice, quotation, etc.) and
                can be changed per document.
            </p>

            <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
                {/* ---- Currency ---- */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-700">Currency</h2>
                    <CurrencySelect
                        label="Default Currency"
                        value={currencyCode}
                        onChange={setCurrencyCode}
                    />
                    <p className="text-xs text-gray-400">
                        Leave blank to use the company's default currency.
                    </p>
                </div>

                {/* ---- Signature ---- */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-700">Default Signature</h2>

                    <div className="space-y-2">
                        {(
                            [
                                { value: 'none', label: 'No Signature' },
                                { value: 'digitalSignature', label: 'Manual Signature' },
                                { value: 'eSignature', label: 'eSignature' },
                            ] as const
                        ).map(({ value, label }) => (
                            <label
                                key={value}
                                className="flex items-center gap-3 cursor-pointer"
                            >
                                <input
                                    type="radio"
                                    name="signType"
                                    value={value}
                                    checked={signType === value}
                                    onChange={() => setSignType(value)}
                                    className="accent-purple-600"
                                />
                                <span className="text-sm text-gray-700">{label}</span>
                            </label>
                        ))}
                    </div>

                    {signType === 'digitalSignature' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Saved Signature
                            </label>
                            <select
                                value={signatureId}
                                onChange={(e) => setSignatureId(e.target.value)}
                                disabled={signaturesLoading}
                                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950 bg-white"
                            >
                                <option value="">— select a signature —</option>
                                {signatures.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                            {signaturesLoading && (
                                <p className="text-xs text-gray-400 mt-1">Loading signatures…</p>
                            )}
                        </div>
                    )}
                </div>

                {/* ---- Payment Terms ---- */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-700">Payment Terms</h2>
                    <div>
                        <label
                            htmlFor="paymentTermsDays"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Payment Due (days)
                        </label>
                        <input
                            id="paymentTermsDays"
                            type="number"
                            min={0}
                            step={1}
                            value={paymentTermsDays}
                            onChange={(e) => setPaymentTermsDays(e.target.value)}
                            placeholder="e.g. 30"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950 bg-white"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                            Due date = document date + N days. Leave blank or 0 for no due date.
                        </p>
                    </div>
                </div>

                {/* ---- Notes & Terms ---- */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
                    <h2 className="text-base font-semibold text-gray-700">
                        Default Notes &amp; Terms
                    </h2>

                    <div>
                        <label
                            htmlFor="defaultNotes"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Default Notes
                        </label>
                        <textarea
                            id="defaultNotes"
                            rows={3}
                            value={defaultNotes}
                            onChange={(e) => setDefaultNotes(e.target.value)}
                            placeholder="Notes visible to the customer…"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950 bg-white"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="defaultTerms"
                            className="block text-sm font-medium text-gray-700 mb-1"
                        >
                            Default Terms &amp; Conditions
                        </label>
                        <textarea
                            id="defaultTerms"
                            rows={4}
                            value={defaultTerms}
                            onChange={(e) => setDefaultTerms(e.target.value)}
                            placeholder="Terms and conditions…"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-600 focus:border-purple-600 sm:text-sm text-gray-950 bg-white"
                        />
                    </div>
                </div>

                {/* ---- Save button ---- */}
                <div className="flex justify-end">
                    <SubmitButton isLoading={saving} isDisabled={saving}>
                        {saving ? 'Saving…' : 'Save Document Defaults'}
                    </SubmitButton>
                </div>
            </form>
        </div>
    );
};

export default DocumentDefaultsPage;
