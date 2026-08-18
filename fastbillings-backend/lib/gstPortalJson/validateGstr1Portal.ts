import { isValidGstin, normalizeGstin } from '../einvoicePayload';
import type { Gstr1PortalJson, Gstr1PortalValidationIssue } from './types';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const FP_RE = /^(0[1-9]|1[0-2])\d{4}$/;
const PORTAL_DATE_RE = /^(0[1-9]|[12]\d|3[01])-(0[1-9]|1[0-2])-\d{4}$/;

export function validateGstr1PortalJson(payload: Gstr1PortalJson): Gstr1PortalValidationIssue[] {
  const issues: Gstr1PortalValidationIssue[] = [];

  const gstin = normalizeGstin(payload.gstin);
  if (!isValidGstin(gstin)) {
    issues.push({
      code: 'INVALID_SUPPLIER_GSTIN',
      message: 'Supplier GSTIN is missing or invalid in company settings.',
      section: 'header',
    });
  }

  if (!FP_RE.test(String(payload.fp ?? ''))) {
    issues.push({
      code: 'INVALID_FP',
      message: 'Filing period (fp) must be MMYYYY for the return month.',
      section: 'header',
    });
  }

  const hasData =
    (payload.b2b?.length ?? 0) > 0 ||
    (payload.b2cl?.length ?? 0) > 0 ||
    (payload.b2cs?.length ?? 0) > 0 ||
    (payload.cdnr?.length ?? 0) > 0 ||
    (payload.cdnur?.length ?? 0) > 0 ||
    (payload.hsn?.data?.length ?? 0) > 0;

  if (!hasData) {
    issues.push({
      code: 'EMPTY_RETURN',
      message: 'No outward supply sections to export for this period.',
    });
  }

  for (const party of payload.b2b ?? []) {
    if (!GSTIN_RE.test(normalizeGstin(party.ctin))) {
      issues.push({
        code: 'INVALID_CTIN',
        message: `Invalid recipient GSTIN: ${party.ctin}`,
        section: 'b2b',
        ref: party.ctin,
      });
    }
    for (const inv of party.inv) {
      if (!inv.inum) {
        issues.push({
          code: 'MISSING_INUM',
          message: 'B2B invoice number is required.',
          section: 'b2b',
          ref: party.ctin,
        });
      }
      if (!PORTAL_DATE_RE.test(inv.idt)) {
        issues.push({
          code: 'INVALID_IDT',
          message: `Invalid invoice date for ${inv.inum || 'invoice'}.`,
          section: 'b2b',
          ref: inv.inum,
        });
      }
      if (inv.pos === '00' || !/^\d{2}$/.test(inv.pos)) {
        issues.push({
          code: 'INVALID_POS',
          message: `Place of supply could not be resolved for invoice ${inv.inum}.`,
          section: 'b2b',
          ref: inv.inum,
        });
      }
    }
  }

  for (const posBlock of payload.b2cl ?? []) {
    if (posBlock.pos === '00' || !/^\d{2}$/.test(posBlock.pos)) {
      issues.push({
        code: 'INVALID_POS',
        message: 'B2CL place of supply could not be resolved to a state code.',
        section: 'b2cl',
      });
    }
    for (const inv of posBlock.inv) {
      if (!inv.inum) {
        issues.push({
          code: 'MISSING_INUM',
          message: 'B2CL invoice number is required.',
          section: 'b2cl',
        });
      }
    }
  }

  for (const row of payload.b2cs ?? []) {
    if (row.pos === '00' || !/^\d{2}$/.test(row.pos)) {
      issues.push({
        code: 'INVALID_POS',
        message: 'B2CS place of supply could not be resolved to a state code.',
        section: 'b2cs',
      });
    }
  }

  for (const row of payload.hsn?.data ?? []) {
    if (!row.hsn_sc || row.hsn_sc === 'UNSPECIFIED') {
      issues.push({
        code: 'MISSING_HSN',
        message: `HSN/SAC missing for summary row ${row.num}.`,
        section: 'hsn',
        ref: String(row.num),
      });
    }
  }

  return issues;
}
