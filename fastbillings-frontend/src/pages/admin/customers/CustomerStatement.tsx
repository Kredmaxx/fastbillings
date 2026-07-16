import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import axios from 'axios';

import Constants from '@constants/api';
import type { RootState } from '@store/index';
import { useCurrencies } from '@hooks/useCurrencies';
import useDateFormatter from '@hooks/useDateFormatter';

interface StatementLine {
  date: string;
  kind: 'INVOICE' | 'PAYMENT';
  reference: string;
  description: string;
  debit: number;
  credit: number;
}

interface CurrencyStatement {
  currencyCode: string;
  openingBalance: number;
  lines: StatementLine[];
  totals: { debit: number; credit: number };
  closingBalance: number;
}

interface StatementData {
  customer: { id: string; name: string; email: string | null; phone: string | null; currencyCode?: string | null };
  period: { from: string; to: string };
  byCurrency: CurrencyStatement[];
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function CustomerStatement() {
  const { id } = useParams<{ id: string }>();
  const token = useSelector((s: RootState) => s.auth.token);
  const { resolveCurrency } = useCurrencies();
  const { formatDate } = useDateFormatter();

  const todayIso = isoDate(new Date());
  const nintyDaysAgoIso = isoDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));

  const [from, setFrom] = useState<string>(nintyDaysAgoIso);
  const [to, setTo] = useState<string>(todayIso);
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${Constants.GET_CUSTOMER_STATEMENT_URL}/${id}/statement?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data?.data ?? null);
    } catch (e) {
      setError(axios.isAxiosError(e) && e.response?.status === 404 ? 'Customer not found' : 'Failed to load statement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const moneyIn = (code: string) => {
    const sym = resolveCurrency(code).symbol;
    return (n: number) => `${sym}${n.toFixed(2)}`;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto bg-white">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <h1 className="text-2xl font-bold">Customer Statement</h1>
        <button type="button" onClick={() => window.print()} className="px-3 py-1 text-sm border rounded">Print / Save PDF</button>
      </div>

      <div className="flex items-end gap-4 mb-4 print:hidden">
        <div>
          <label className="block text-xs text-gray-500">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="p-1 border rounded text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="p-1 border rounded text-sm" />
        </div>
        <button type="button" onClick={load} className="px-3 py-1 text-sm bg-purple-600 text-white rounded">Reload</button>
      </div>

      {loading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {data && (
        <>
          <div className="border rounded p-4 mb-4">
            <div className="text-lg font-medium">{data.customer.name}</div>
            <div className="text-sm text-gray-500">{data.customer.email}</div>
            <div className="text-sm text-gray-500">{data.customer.phone}</div>
            <div className="text-xs text-gray-400 mt-2">
              Period: {formatDate(data.period.from)} — {formatDate(data.period.to)}
            </div>
            {data.byCurrency.length > 1 && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                This customer transacts in multiple currencies — each is reconciled separately below (no conversion).
              </div>
            )}
          </div>

          {data.byCurrency.map((section) => {
            const money = moneyIn(section.currencyCode);
            const sym = resolveCurrency(section.currencyCode);
            let running = section.openingBalance;
            return (
              <div key={section.currencyCode} className="mb-8">
                <h2 className="text-base font-semibold mb-2">
                  Statement in {sym.code} ({sym.symbol})
                </h2>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left bg-gray-50">
                      <th className="py-2 px-2">Date</th>
                      <th className="py-2 px-2">Reference</th>
                      <th className="py-2 px-2">Description</th>
                      <th className="py-2 px-2 text-right">Debit</th>
                      <th className="py-2 px-2 text-right">Credit</th>
                      <th className="py-2 px-2 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b font-medium bg-gray-50">
                      <td className="py-2 px-2" colSpan={5}>Opening Balance</td>
                      <td className="py-2 px-2 text-right">{money(section.openingBalance)}</td>
                    </tr>
                    {section.lines.map((line, idx) => {
                      running = running + line.debit - line.credit;
                      return (
                        <tr key={idx} className="border-b">
                          <td className="py-2 px-2">{formatDate(line.date)}</td>
                          <td className="py-2 px-2">{line.reference}</td>
                          <td className="py-2 px-2">{line.description}</td>
                          <td className="py-2 px-2 text-right">{line.debit > 0 ? money(line.debit) : '—'}</td>
                          <td className="py-2 px-2 text-right">{line.credit > 0 ? money(line.credit) : '—'}</td>
                          <td className="py-2 px-2 text-right">{money(running)}</td>
                        </tr>
                      );
                    })}
                    {section.lines.length === 0 && (
                      <tr className="border-b">
                        <td className="py-3 px-2 text-gray-400 text-center" colSpan={6}>No transactions in this period</td>
                      </tr>
                    )}
                    <tr className="border-t-2 font-medium bg-gray-50">
                      <td className="py-2 px-2" colSpan={3}>Totals</td>
                      <td className="py-2 px-2 text-right">{money(section.totals.debit)}</td>
                      <td className="py-2 px-2 text-right">{money(section.totals.credit)}</td>
                      <td className="py-2 px-2 text-right">{money(section.closingBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
