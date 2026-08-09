/**
 * Flatten tax-audit pack JSON into CSV for CA handoff.
 * Books worksheet dump only — not Form 3CD XML / e-filing.
 */

export function escapeTaxAuditPackCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export type TaxAuditPackExportClause = {
  clause: string;
  title: string;
  status: string;
  amount: number | null;
  detailPath: string;
  notes: string;
  includeInPutativeSum?: boolean;
  putativeExtra?: number;
};

export type TaxAuditPackExportData = {
  form?: string;
  notes?: string;
  period?: { fy?: string; from?: string; to?: string };
  summary?: Record<string, unknown>;
  readiness?: { canFile?: boolean; blockers?: string[] };
  clauses?: TaxAuditPackExportClause[];
  worksheets?: Record<string, unknown>;
};

export function taxAuditPackToCsv(data: TaxAuditPackExportData): string {
  const lines: string[] = [];
  const push = (cells: unknown[]) => lines.push(cells.map(escapeTaxAuditPackCsv).join(','));

  push(['Section', 'Key', 'Value']);
  push(['meta', 'form', data.form ?? 'TAX-AUDIT-PACK']);
  push(['meta', 'notes', data.notes ?? '']);
  push(['period', 'fy', data.period?.fy ?? '']);
  push(['period', 'from', data.period?.from ?? '']);
  push(['period', 'to', data.period?.to ?? '']);

  const summary = data.summary ?? {};
  for (const [k, v] of Object.entries(summary)) {
    push(['summary', k, v]);
  }

  push(['readiness', 'canFile', data.readiness?.canFile ?? false]);
  for (const b of data.readiness?.blockers ?? []) {
    push(['readiness', 'blocker', b]);
  }

  lines.push('');
  push([
    'Clause',
    'Title',
    'Status',
    'Amount',
    'IncludeInPutativeSum',
    'PutativeExtra',
    'DetailPath',
    'Notes',
  ]);
  for (const c of data.clauses ?? []) {
    push([
      c.clause,
      c.title,
      c.status,
      c.amount ?? '',
      c.includeInPutativeSum === false ? 'false' : 'true',
      c.putativeExtra ?? '',
      c.detailPath,
      c.notes,
    ]);
  }

  const worksheets = data.worksheets ?? {};
  if (Object.keys(worksheets).length > 0) {
    lines.push('');
    push(['Worksheet', 'Key', 'Value']);
    for (const [name, payload] of Object.entries(worksheets)) {
      if (payload == null) {
        push([name, 'value', '']);
        continue;
      }
      if (typeof payload !== 'object' || Array.isArray(payload)) {
        push([name, 'value', payload]);
        continue;
      }
      for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
        if (v != null && typeof v === 'object') {
          push([name, k, JSON.stringify(v)]);
        } else {
          push([name, k, v]);
        }
      }
    }
  }

  return lines.join('\n');
}
