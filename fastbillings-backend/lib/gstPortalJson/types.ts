/** Internal books worksheet shape returned by taxReportsController.gstr1. */
export interface Gstr1WorksheetData {
  period: { from: string | Date; to: string | Date };
  companyState?: string | null;
  b2b: Array<Gstr1WorksheetInvoiceRow & { gstin: string }>;
  b2cl: Array<Gstr1WorksheetInvoiceRow>;
  b2cs: Array<Gstr1WorksheetB2csRow>;
  cdnr: Array<Gstr1WorksheetNoteRow & { gstin: string }>;
  cdnur: Array<Gstr1WorksheetCdnurRow>;
  hsn: Array<Gstr1WorksheetHsnRow>;
  docs?: Array<Gstr1WorksheetDocRow>;
  nilExempt?: {
    nilRated?: { taxableValue: number };
    exempt?: { taxableValue: number };
    nonGst?: { taxableValue: number };
  };
  summary?: {
    totalTaxableValue?: number;
    totalTax?: number;
  };
}

export interface Gstr1WorksheetInvoiceRow {
  gstin?: string | null;
  customerName?: string;
  invoiceNumber?: string | null;
  date: string | Date;
  placeOfSupply?: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total?: number;
  reverseCharge?: boolean;
}

export interface Gstr1WorksheetB2csRow {
  placeOfSupply: string;
  supplyType?: string;
  rate?: number;
  invoiceCount?: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  tax?: number;
}

export interface Gstr1WorksheetNoteRow {
  noteNumber?: string | null;
  noteDate: string | Date;
  noteType?: 'C' | 'D';
  invoiceNumber?: string | null;
  customerName?: string;
  gstin?: string | null;
  placeOfSupply?: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total?: number;
}

export interface Gstr1WorksheetCdnurRow {
  placeOfSupply: string;
  noteType?: 'C' | 'D';
  noteCount?: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  tax?: number;
}

export interface Gstr1WorksheetHsnRow {
  hsn: string;
  description?: string;
  uqc?: string;
  rate?: number;
  qty?: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
}

export interface Gstr1WorksheetDocRow {
  nature: string;
  docType: string;
  from: string | null;
  to: string | null;
  totalNumber: number;
  cancelled: number;
  netIssued: number;
}

export interface Gstr1PortalBuildInput {
  worksheet: Gstr1WorksheetData;
  supplierGstin: string;
  /** Optional turnover for gt / cur_gt fields */
  grossTurnover?: number;
}

export interface Gstr1PortalJson {
  gstin: string;
  fp: string;
  version: string;
  gt?: number;
  cur_gt?: number;
  b2b?: Gstr1PortalB2bParty[];
  b2cl?: Gstr1PortalB2clPos[];
  b2cs?: Gstr1PortalB2csRow[];
  cdnr?: Gstr1PortalCdnrParty[];
  cdnur?: Gstr1PortalCdnurRow[];
  hsn?: { data: Gstr1PortalHsnRow[] };
  doc_issue?: { doc_det: Gstr1PortalDocDet[] };
  nil?: { inv: Gstr1PortalNilRow[] };
}

export interface Gstr1PortalItemLine {
  num: number;
  itm_det: {
    rt: number;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  };
}

export interface Gstr1PortalB2bParty {
  ctin: string;
  inv: Array<{
    inum: string;
    idt: string;
    val: number;
    pos: string;
    rchrg: 'Y' | 'N';
    inv_typ: 'R';
    itms: Gstr1PortalItemLine[];
  }>;
}

export interface Gstr1PortalB2clPos {
  pos: string;
  inv: Array<{
    inum: string;
    idt: string;
    val: number;
    itms: Gstr1PortalItemLine[];
  }>;
}

export interface Gstr1PortalB2csRow {
  sply_ty: 'INTRA' | 'INTER';
  typ: 'OE';
  pos: string;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface Gstr1PortalCdnrParty {
  ctin: string;
  nt: Array<{
    ntty: 'C' | 'D';
    nt_num: string;
    nt_dt: string;
    inum?: string;
    idt?: string;
    val: number;
    pos: string;
    itms: Gstr1PortalItemLine[];
  }>;
}

export interface Gstr1PortalCdnurRow {
  typ: 'B2CL' | 'B2CS';
  ntty: 'C' | 'D';
  pos: string;
  val: number;
  rt: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface Gstr1PortalHsnRow {
  num: number;
  hsn_sc: string;
  desc: string;
  uqc: string;
  qty: number;
  rt: number;
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
  csamt: number;
}

export interface Gstr1PortalDocDet {
  doc_num: number;
  docs: Array<{
    num: number;
    from: string;
    to: string;
    totnum: number;
    cancel: number;
    net_issue: number;
  }>;
}

export interface Gstr1PortalNilRow {
  sply_ty: 'INTRB2B' | 'INTRAB2B' | 'INTRAB2C';
  expt_amt: number;
  nil_amt: number;
  ngsup_amt: number;
}

export interface Gstr1PortalValidationIssue {
  code: string;
  message: string;
  section?: string;
  ref?: string;
}
