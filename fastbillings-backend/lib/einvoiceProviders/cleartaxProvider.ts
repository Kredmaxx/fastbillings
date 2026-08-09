import type { EInvoiceGenerateResult, EInvoicePayload, EInvoiceProvider } from '../einvoiceProvider';
import { postJson, requireCreds } from '../gstProviders/httpJson';

/**
 * ClearTax-style e-invoice adapter.
 * Paths follow a common sandbox shape; map field names if your ClearTax product differs.
 */
export class ClearTaxEInvoiceProvider implements EInvoiceProvider {
  readonly name = 'cleartax';

  async generate(payload: EInvoicePayload, config: unknown): Promise<EInvoiceGenerateResult> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['apiKey', 'apiSecret'], 'ClearTax e-invoice');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');

    const body = {
      transaction: {
        Version: '1.1',
        TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', EcmGstin: null },
        DocDtls: {
          Typ: 'INV',
          No: payload.invoiceNumber,
          Dt: formatDdMmYyyy(payload.invoiceDate),
        },
        SellerDtls: {
          Gstin: payload.sellerGstin,
          ...(payload.sellerName ? { LglNm: payload.sellerName } : {}),
        },
        BuyerDtls: {
          Gstin: payload.buyerGstin,
          Pos: payload.placeOfSupply,
          ...(payload.buyerName ? { LglNm: payload.buyerName } : {}),
        },
        ValDtls: {
          AssVal: payload.taxableAmount,
          CgstVal: payload.cgst,
          SgstVal: payload.sgst,
          IgstVal: payload.igst,
          CesVal: payload.cess,
          TotInvVal: payload.totalAmount,
        },
        ItemList: payload.items.map((it, idx) => ({
          SlNo: String(idx + 1),
          PrdDesc: it.name,
          IsServc: it.isService ? 'Y' : 'N',
          HsnCd: it.hsn,
          Qty: it.qty,
          Unit: it.uqc || 'OTH',
          UnitPrice: it.rate,
          TotAmt: it.amount,
          AssAmt: it.taxableAmount,
          GstRt: it.gstRate,
          CgstAmt: it.cgst,
          SgstAmt: it.sgst,
          IgstAmt: it.igst,
          CesAmt: it.cess,
        })),
      },
      customFields: { invoiceId: payload.invoiceId },
    };

    const json = await postJson(
      `${baseUrl}/v2/eInvoice/generate`,
      {
        'x-cleartax-auth-token': String(cfg.apiKey),
        'x-cleartax-product': 'EInvoice',
        'x-api-secret': String(cfg.apiSecret),
        ...(cfg.gstin ? { gstin: String(cfg.gstin) } : {}),
      },
      body,
    );

    const govt = (json.govt_response ?? json.data ?? json) as Record<string, unknown>;
    const irn = String(govt.Irn ?? govt.irn ?? '');
    if (!irn) {
      throw new Error(`ClearTax e-invoice: no IRN in response: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return {
      irn,
      ackNo: String(govt.AckNo ?? govt.ackNo ?? ''),
      ackDate: parseDate(govt.AckDt ?? govt.ackDate) ?? new Date(),
      signedInvoice: String(govt.SignedInvoice ?? govt.signedInvoice ?? ''),
      signedQRCode: String(govt.SignedQRCode ?? govt.signedQRCode ?? ''),
      metadata: { provider: 'cleartax', raw: json },
    };
  }

  async cancel(irn: string, reason: string, config: unknown): Promise<{ cancelledAt: Date }> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['apiKey', 'apiSecret'], 'ClearTax e-invoice');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');
    await postJson(
      `${baseUrl}/v2/eInvoice/cancel`,
      {
        'x-cleartax-auth-token': String(cfg.apiKey),
        'x-cleartax-product': 'EInvoice',
        'x-api-secret': String(cfg.apiSecret),
      },
      { irn, CnlRsn: reason, CnlRem: reason },
    );
    return { cancelledAt: new Date() };
  }

  async getStatus(irn: string, _config: unknown): Promise<{ status: 'GENERATED' }> {
    void irn;
    return { status: 'GENERATED' };
  }
}

export const clearTaxEInvoiceProvider = new ClearTaxEInvoiceProvider();

function formatDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
