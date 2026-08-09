/**
 * Books helpers for §36(1)(va) employee PF/ESI contributions.
 * Due-date proxy = 15th of next month when not tagged — not EPFO/ESIC / Form 3CD.
 */

export function round36Va(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/** Default fund-Act due-date proxy: 15th of the calendar month after payDate (UTC). */
export function defaultEmployeeFundDueDate(payDate: Date): Date {
  return new Date(
    Date.UTC(payDate.getUTCFullYear(), payDate.getUTCMonth() + 1, 15, 23, 59, 59, 999),
  );
}

/**
 * Putative disallowance for one fund component when received in books but
 * undeposited or deposited after due date.
 */
export function putative36VaComponent(opts: {
  amount: number | null | undefined;
  dueDate: Date | null | undefined;
  depositedDate: Date | null | undefined;
  payDate: Date;
}): number {
  const amount = Number(opts.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const due = opts.dueDate ?? defaultEmployeeFundDueDate(opts.payDate);
  if (!opts.depositedDate) return round36Va(amount);
  if (opts.depositedDate.getTime() > due.getTime()) return round36Va(amount);
  return 0;
}

export function summarize36VaLine(opts: {
  payDate: Date;
  employeePfAmount?: number | null;
  employeeEsiAmount?: number | null;
  pfDueDate?: Date | null;
  pfDepositedDate?: Date | null;
  esiDueDate?: Date | null;
  esiDepositedDate?: Date | null;
}): {
  pfReceived: number;
  esiReceived: number;
  pfDisallowance: number;
  esiDisallowance: number;
  totalDisallowance: number;
  pfIssue: 'NONE' | 'UNDEPOSITED' | 'LATE';
  esiIssue: 'NONE' | 'UNDEPOSITED' | 'LATE';
} {
  const pfReceived = round36Va(Number(opts.employeePfAmount ?? 0));
  const esiReceived = round36Va(Number(opts.employeeEsiAmount ?? 0));

  function issue(
    amount: number,
    dueDate: Date | null | undefined,
    depositedDate: Date | null | undefined,
  ): 'NONE' | 'UNDEPOSITED' | 'LATE' {
    if (amount <= 0) return 'NONE';
    const due = dueDate ?? defaultEmployeeFundDueDate(opts.payDate);
    if (!depositedDate) return 'UNDEPOSITED';
    if (depositedDate.getTime() > due.getTime()) return 'LATE';
    return 'NONE';
  }

  const pfDisallowance = putative36VaComponent({
    amount: pfReceived,
    dueDate: opts.pfDueDate,
    depositedDate: opts.pfDepositedDate,
    payDate: opts.payDate,
  });
  const esiDisallowance = putative36VaComponent({
    amount: esiReceived,
    dueDate: opts.esiDueDate,
    depositedDate: opts.esiDepositedDate,
    payDate: opts.payDate,
  });

  return {
    pfReceived: pfReceived > 0 ? pfReceived : 0,
    esiReceived: esiReceived > 0 ? esiReceived : 0,
    pfDisallowance,
    esiDisallowance,
    totalDisallowance: round36Va(pfDisallowance + esiDisallowance),
    pfIssue: issue(pfReceived, opts.pfDueDate, opts.pfDepositedDate),
    esiIssue: issue(esiReceived, opts.esiDueDate, opts.esiDepositedDate),
  };
}
