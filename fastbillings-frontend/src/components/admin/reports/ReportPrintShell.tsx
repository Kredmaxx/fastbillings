import type { ReactNode } from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '@store/index';

type Props = {
  /** Unique id used for print isolation (must be unique per page). */
  printId: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Optional footer note under signature lines */
  footnote?: string;
  showSignatures?: boolean;
};

export function useActiveCompanyName(fallback = 'Assessee'): string {
  const tenants = useSelector((s: RootState) => s.auth.tenants);
  const activeTenantId = useSelector((s: RootState) => s.auth.activeTenantId);
  return (
    tenants.find((t) => t.tenantId === activeTenantId)?.name ||
    tenants[0]?.name ||
    fallback
  );
}

export function formatInr(n: number): string {
  return Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formal print wrapper: company header + A4 print isolation (hides admin chrome).
 */
export default function ReportPrintShell({
  printId,
  title,
  subtitle,
  children,
  footnote,
  showSignatures = true,
}: Props) {
  const companyName = useActiveCompanyName();

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm 14mm; }
          body * { visibility: hidden !important; }
          #${printId}, #${printId} * { visibility: visible !important; }
          #${printId} {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>
      <div id={printId} className="text-[13px] text-black leading-snug">
        <header className="text-center border-b-2 border-black pb-3 mb-3">
          <div className="text-base font-bold uppercase tracking-wide">{companyName}</div>
          <div className="text-sm font-semibold mt-1">{title}</div>
          {subtitle ? <div className="text-xs mt-0.5">{subtitle}</div> : null}
        </header>
        {children}
        {showSignatures ? (
          <footer className="mt-6 grid grid-cols-2 gap-8 text-xs">
            <div>
              <div className="border-t border-black pt-1 w-48">Prepared by</div>
            </div>
            <div className="text-right">
              <div className="border-t border-black pt-1 w-48 ml-auto">Authorised Signatory</div>
            </div>
          </footer>
        ) : null}
        {footnote ? (
          <p className="mt-4 text-[10px] text-gray-500">{footnote}</p>
        ) : null}
      </div>
    </>
  );
}

/** Shared bordered statement table cell helpers */
export const reportTable = {
  table: 'w-full border-collapse border border-black',
  th: 'border border-black px-2 py-1.5 text-left font-semibold bg-gray-100 print:bg-transparent',
  thRight:
    'border border-black px-2 py-1.5 text-right font-semibold bg-gray-100 print:bg-transparent',
  td: 'border border-black px-2 py-1 align-top',
  tdRight: 'border border-black px-2 py-1 align-top text-right tabular-nums',
  section:
    'border border-black px-2 py-1.5 font-bold uppercase text-[12px] bg-gray-50 print:bg-transparent',
  total: 'font-bold border-t border-b-2 border-black',
  subtotal: 'font-semibold',
};
