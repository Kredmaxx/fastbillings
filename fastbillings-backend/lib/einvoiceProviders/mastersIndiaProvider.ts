import type { EInvoiceGenerateResult, EInvoicePayload, EInvoiceProvider } from '../einvoiceProvider';
import { postJson, requireCreds } from '../gstProviders/httpJson';

/** Masters India–style e-invoice adapter (credentialed HTTP). */
export class MastersIndiaEInvoiceProvider implements EInvoiceProvider {
  readonly name = 'masters_india';

  async generate(payload: EInvoicePayload, config: unknown): Promise<EInvoiceGenerateResult> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['username', 'password'], 'Masters India e-invoice');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');

    const json = await postJson(
      `${baseUrl}/api/v1/einvoice/generate`,
      {
        Authorization: `Bearer ${String(cfg.apiKey ?? '')}`,
      },
      {
        user_name: cfg.username,
        password: cfg.password,
        gstin: cfg.gstin ?? payload.sellerGstin,
        data: {
          TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N' },
          DocDtls: {
            Typ: 'INV',
            No: payload.invoiceNumber,
            Dt: payload.invoiceDate.toISOString().slice(0, 10),
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
      },
    );

    const data = (json.data ?? json) as Record<string, unknown>;
    const irn = String(data.Irn ?? data.irn ?? '');
    if (!irn) {
      throw new Error(`Masters India e-invoice: no IRN in response: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return {
      irn,
      ackNo: String(data.AckNo ?? data.ack_no ?? ''),
      ackDate: new Date(),
      signedInvoice: String(data.SignedInvoice ?? data.signed_invoice ?? ''),
      signedQRCode: String(data.SignedQRCode ?? data.signed_qr_code ?? ''),
      metadata: { provider: 'masters_india', raw: json },
    };
  }

  async cancel(irn: string, reason: string, config: unknown): Promise<{ cancelledAt: Date }> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['username', 'password'], 'Masters India e-invoice');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');
    await postJson(`${baseUrl}/api/v1/einvoice/cancel`, {}, { irn, reason, user_name: cfg.username, password: cfg.password });
    return { cancelledAt: new Date() };
  }

  async getStatus(_irn: string, _config: unknown): Promise<{ status: 'GENERATED' }> {
    return { status: 'GENERATED' };
  }
}

export const mastersIndiaEInvoiceProvider = new MastersIndiaEInvoiceProvider();
