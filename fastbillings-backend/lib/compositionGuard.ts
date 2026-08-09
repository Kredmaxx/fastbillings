import { prisma } from './prisma';

export type CompositionLineItem = {
  taxes?: Array<{ kind?: string | null; amount?: number; [k: string]: unknown }> | null;
  tax?: number;
  totalTax?: number;
  amount?: number;
  rate?: number;
  qty?: number;
  discount?: number;
  appliedTaxRateIds?: string[];
  [k: string]: unknown;
};

/** Load company composition flag (tenant-first, then owner userId). */
export async function companyIsComposition(opts: {
  userId: string;
  tenantId?: string | null;
}): Promise<boolean> {
  const row = opts.tenantId
    ? await prisma.companySettings.findFirst({
        where: { OR: [{ tenantId: opts.tenantId }, { userId: opts.userId }] },
        select: { isComposition: true },
      })
    : await prisma.companySettings.findUnique({
        where: { userId: opts.userId },
        select: { isComposition: true },
      });
  return Boolean(row?.isComposition);
}

/**
 * Strip GST/VAT line taxes for composition dealers.
 * Line amount becomes qty*rate − discount (no tax).
 */
export function stripGstFromDocumentItems<T extends CompositionLineItem>(items: T[]): T[] {
  return items.map((item) => {
    const qty = Number(item.qty ?? 0);
    const rate = Number(item.rate ?? 0);
    const discount = Number(item.discount ?? 0);
    const base = Math.max(0, qty * rate - discount);
    return {
      ...item,
      taxes: [],
      tax: 0,
      totalTax: 0,
      amount: base,
      appliedTaxRateIds: [],
    };
  });
}

/** True if any line still carries GST-kind tax amounts. */
export function documentHasGstTaxes(items: CompositionLineItem[]): boolean {
  for (const item of items) {
    if (Number(item.totalTax ?? item.tax ?? 0) > 0) return true;
    for (const t of item.taxes ?? []) {
      const kind = String(t.kind ?? '').toUpperCase();
      if (
        ['CGST', 'SGST', 'UTGST', 'IGST', 'CESS', 'VAT', 'SALES_TAX'].includes(kind) &&
        Number(t.amount ?? 0) > 0
      ) {
        return true;
      }
    }
  }
  return false;
}
