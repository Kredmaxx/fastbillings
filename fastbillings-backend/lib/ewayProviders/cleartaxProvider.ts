import type { EWayBillGenerateResult, EWayBillPayload, EWayBillProvider } from '../ewayProvider';
import { postJson, requireCreds } from '../gstProviders/httpJson';

export class ClearTaxEWayBillProvider implements EWayBillProvider {
  readonly name = 'cleartax';

  async generate(payload: EWayBillPayload, config: unknown): Promise<EWayBillGenerateResult> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['apiKey', 'apiSecret'], 'ClearTax e-way');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');

    const json = await postJson(
      `${baseUrl}/v1/eWayBill/generate`,
      {
        'x-cleartax-auth-token': String(cfg.apiKey),
        'x-api-secret': String(cfg.apiSecret),
        'x-cleartax-product': 'EWayBill',
      },
      {
        supplyType: 'O',
        subSupplyType: '1',
        docType: 'INV',
        docNo: payload.invoiceNumber,
        docDate: payload.invoiceDate.toISOString().slice(0, 10),
        fromGstin: payload.sellerGstin,
        toGstin: payload.buyerGstin,
        totInvValue: payload.totalAmount,
        transDistance: payload.distanceKm ?? 0,
        vehicleNo: payload.vehicleNo,
        transporterId: payload.transporterGstin,
        transporterName: payload.transporterName,
        fromPincode: payload.fromPincode,
        toPincode: payload.toPincode,
      },
    );

    const data = (json.data ?? json) as Record<string, unknown>;
    const ewayBillNo = String(data.ewayBillNo ?? data.EwbNo ?? '');
    if (!ewayBillNo) {
      throw new Error(`ClearTax e-way: no ewayBillNo in response: ${JSON.stringify(json).slice(0, 300)}`);
    }
    const ewayBillDate = new Date();
    const validUpto = data.validUpto ? new Date(String(data.validUpto)) : new Date(ewayBillDate.getTime() + 86400000);
    return {
      ewayBillNo,
      ewayBillDate,
      validUpto,
      metadata: { provider: 'cleartax', raw: json },
    };
  }

  async cancel(ewayBillNo: string, reason: string, config: unknown): Promise<{ cancelledAt: Date }> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['apiKey', 'apiSecret'], 'ClearTax e-way');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');
    await postJson(
      `${baseUrl}/v1/eWayBill/cancel`,
      {
        'x-cleartax-auth-token': String(cfg.apiKey),
        'x-api-secret': String(cfg.apiSecret),
      },
      { ewayBillNo, cancelRsnCode: '2', cancelRmrk: reason },
    );
    return { cancelledAt: new Date() };
  }
}

export const clearTaxEWayBillProvider = new ClearTaxEWayBillProvider();
