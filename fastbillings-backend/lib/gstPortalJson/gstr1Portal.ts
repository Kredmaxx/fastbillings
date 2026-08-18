import { filingPeriodFromRange, portalDate, portalDocNumber, roundGst } from './format';
import { resolvePlaceOfSupplyCode } from './indianStateCodes';
import type {
  Gstr1PortalBuildInput,
  Gstr1PortalB2bParty,
  Gstr1PortalB2clPos,
  Gstr1PortalB2csRow,
  Gstr1PortalCdnrParty,
  Gstr1PortalCdnurRow,
  Gstr1PortalDocDet,
  Gstr1PortalHsnRow,
  Gstr1PortalItemLine,
  Gstr1PortalJson,
  Gstr1PortalNilRow,
  Gstr1WorksheetData,
  Gstr1WorksheetInvoiceRow,
  Gstr1WorksheetNoteRow,
} from './types';

function inferRate(row: {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}): number {
  const tax = row.cgst + row.sgst + row.igst;
  if (row.taxableValue <= 0 || tax <= 0) return 0;
  return roundGst((tax / row.taxableValue) * 100);
}

function invoiceItems(row: {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}): Gstr1PortalItemLine[] {
  const rt = inferRate(row);
  return [
    {
      num: 1,
      itm_det: {
        rt,
        txval: roundGst(row.taxableValue),
        iamt: roundGst(row.igst),
        camt: roundGst(row.cgst),
        samt: roundGst(row.sgst),
        csamt: roundGst(row.cess),
      },
    },
  ];
}

function invoiceVal(row: {
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total?: number;
}): number {
  if (row.total != null && row.total > 0) return roundGst(row.total);
  return roundGst(row.taxableValue + row.cgst + row.sgst + row.igst + row.cess);
}

function posCode(row: { placeOfSupply?: string; gstin?: string | null }): string {
  return resolvePlaceOfSupplyCode(row) ?? '00';
}

function buildB2b(rows: Array<Gstr1WorksheetInvoiceRow & { gstin: string }>): Gstr1PortalB2bParty[] {
  const byCtin = new Map<string, Gstr1PortalB2bParty>();
  for (const row of rows) {
    const ctin = String(row.gstin).trim().toUpperCase();
    if (!ctin) continue;
    const party = byCtin.get(ctin) ?? { ctin, inv: [] };
    party.inv.push({
      inum: portalDocNumber(row.invoiceNumber),
      idt: portalDate(row.date),
      val: invoiceVal(row),
      pos: posCode(row),
      rchrg: row.reverseCharge ? 'Y' : 'N',
      inv_typ: 'R',
      itms: invoiceItems(row),
    });
    byCtin.set(ctin, party);
  }
  return Array.from(byCtin.values());
}

function buildB2cl(rows: Gstr1WorksheetInvoiceRow[]): Gstr1PortalB2clPos[] {
  const byPos = new Map<string, Gstr1PortalB2clPos>();
  for (const row of rows) {
    const pos = posCode(row);
    const bucket = byPos.get(pos) ?? { pos, inv: [] };
    bucket.inv.push({
      inum: portalDocNumber(row.invoiceNumber),
      idt: portalDate(row.date),
      val: invoiceVal(row),
      itms: invoiceItems(row),
    });
    byPos.set(pos, bucket);
  }
  return Array.from(byPos.values());
}

function buildB2cs(rows: Gstr1WorksheetData['b2cs']): Gstr1PortalB2csRow[] {
  return rows.map((row) => {
    const interstate = String(row.supplyType ?? '').toLowerCase().includes('inter');
    return {
      sply_ty: interstate ? 'INTER' : 'INTRA',
      typ: 'OE',
      pos: posCode(row),
      rt: roundGst(Number(row.rate ?? inferRate(row))),
      txval: roundGst(row.taxableValue),
      iamt: roundGst(row.igst),
      camt: roundGst(row.cgst),
      samt: roundGst(row.sgst),
      csamt: roundGst(row.cess),
    };
  });
}

function buildCdnr(rows: Array<Gstr1WorksheetNoteRow & { gstin: string }>): Gstr1PortalCdnrParty[] {
  const byCtin = new Map<string, Gstr1PortalCdnrParty>();
  for (const row of rows) {
    const ctin = String(row.gstin).trim().toUpperCase();
    if (!ctin) continue;
    const party = byCtin.get(ctin) ?? { ctin, nt: [] };
    const ntty = row.noteType === 'D' ? 'D' : 'C';
    party.nt.push({
      ntty,
      nt_num: portalDocNumber(row.noteNumber),
      nt_dt: portalDate(row.noteDate),
      inum: row.invoiceNumber ? portalDocNumber(row.invoiceNumber) : undefined,
      val: invoiceVal(row),
      pos: posCode(row),
      itms: invoiceItems(row),
    });
    byCtin.set(ctin, party);
  }
  return Array.from(byCtin.values());
}

function buildCdnur(rows: Gstr1WorksheetData['cdnur']): Gstr1PortalCdnurRow[] {
  return rows.map((row) => ({
    typ: 'B2CS',
    ntty: row.noteType === 'D' ? 'D' : 'C',
    pos: posCode(row),
    val: roundGst(row.taxableValue),
    rt: inferRate(row),
    iamt: roundGst(row.igst),
    camt: roundGst(row.cgst),
    samt: roundGst(row.sgst),
    csamt: roundGst(row.cess),
  }));
}

function buildHsn(rows: Gstr1WorksheetData['hsn']): Gstr1PortalHsnRow[] {
  return rows.map((row, i) => ({
    num: i + 1,
    hsn_sc: String(row.hsn).slice(0, 8),
    desc: String(row.description ?? row.hsn).slice(0, 30),
    uqc: String(row.uqc ?? 'OTH').slice(0, 3).toUpperCase(),
    qty: roundGst(Number(row.qty ?? 0)),
    rt: roundGst(Number(row.rate ?? 0)),
    txval: roundGst(row.taxableValue),
    iamt: roundGst(row.igst),
    camt: roundGst(row.cgst),
    samt: roundGst(row.sgst),
    csamt: roundGst(row.cess),
  }));
}

function buildDocIssue(docs: Gstr1WorksheetData['docs']): Gstr1PortalDocDet[] | undefined {
  if (!docs?.length) return undefined;
  const portalDocs = docs
    .filter((d) => !String(d.docType).includes('PUR'))
    .map((d, i) => ({
      num: i + 1,
      from: String(d.from ?? '1'),
      to: String(d.to ?? '1'),
      totnum: d.totalNumber,
      cancel: d.cancelled,
      net_issue: d.netIssued,
    }));
  if (!portalDocs.length) return undefined;
  return [{ doc_num: 1, docs: portalDocs }];
}

function buildNil(nilExempt: Gstr1WorksheetData['nilExempt']): Gstr1PortalNilRow[] | undefined {
  if (!nilExempt) return undefined;
  const nil = roundGst(nilExempt.nilRated?.taxableValue ?? 0);
  const expt = roundGst(nilExempt.exempt?.taxableValue ?? 0);
  const ng = roundGst(nilExempt.nonGst?.taxableValue ?? 0);
  if (nil === 0 && expt === 0 && ng === 0) return undefined;
  return [
    {
      sply_ty: 'INTRAB2C',
      expt_amt: expt,
      nil_amt: nil,
      ngsup_amt: ng,
    },
  ];
}

/** Transform books GSTR-1 worksheet → GST offline-tool style JSON. */
export function buildGstr1PortalJson(input: Gstr1PortalBuildInput): Gstr1PortalJson {
  const { worksheet, supplierGstin } = input;
  const from = new Date(worksheet.period.from);
  const to = new Date(worksheet.period.to);
  const fp = filingPeriodFromRange(from, to);
  const gt = input.grossTurnover ?? worksheet.summary?.totalTaxableValue;

  const out: Gstr1PortalJson = {
    gstin: supplierGstin.trim().toUpperCase(),
    fp,
    version: 'GST3.1.8',
  };

  if (gt != null && gt > 0) {
    out.gt = roundGst(gt);
    out.cur_gt = roundGst(gt);
  }

  const b2b = buildB2b(worksheet.b2b ?? []);
  if (b2b.length) out.b2b = b2b;

  const b2cl = buildB2cl(worksheet.b2cl ?? []);
  if (b2cl.length) out.b2cl = b2cl;

  const b2cs = buildB2cs(worksheet.b2cs ?? []);
  if (b2cs.length) out.b2cs = b2cs;

  const cdnr = buildCdnr(worksheet.cdnr ?? []);
  if (cdnr.length) out.cdnr = cdnr;

  const cdnur = buildCdnur(worksheet.cdnur ?? []);
  if (cdnur.length) out.cdnur = cdnur;

  const hsnRows = buildHsn(worksheet.hsn ?? []);
  if (hsnRows.length) out.hsn = { data: hsnRows };

  const docIssue = buildDocIssue(worksheet.docs);
  if (docIssue) out.doc_issue = { doc_det: docIssue };

  const nil = buildNil(worksheet.nilExempt);
  if (nil) out.nil = { inv: nil };

  return out;
}
