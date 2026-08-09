import type { EWayBillGenerateResult, EWayBillPayload, EWayBillProvider } from '../ewayProvider';
import { postJson, requireCreds } from '../gstProviders/httpJson';

export class MastersIndiaEWayBillProvider implements EWayBillProvider {
  readonly name = 'masters_india';

  async generate(payload: EWayBillPayload, config: unknown): Promise<EWayBillGenerateResult> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['username', 'password'], 'Masters India e-way');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');

    const json = await postJson(
      `${baseUrl}/api/v1/ewaybill/generate`,
      {},
      {
        user_name: cfg.username,
        password: cfg.password,
        gstin: cfg.gstin ?? payload.sellerGstin,
        data: {
          docNo: payload.invoiceNumber,
          docDate: payload.invoiceDate.toISOString().slice(0, 10),
          fromGstin: payload.sellerGstin,
          toGstin: payload.buyerGstin,
          totInvValue: payload.totalAmount,
          transDistance: payload.distanceKm ?? 0,
          vehicleNo: payload.vehicleNo,
          transporterId: payload.transporterGstin,
        },
      },
    );

    const data = (json.data ?? json) as Record<string, unknown>;
    const ewayBillNo = String(data.ewayBillNo ?? data.ewb_no ?? '');
    if (!ewayBillNo) {
      throw new Error(`Masters India e-way: no ewayBillNo in response: ${JSON.stringify(json).slice(0, 300)}`);
    }
    const ewayBillDate = new Date();
    return {
      ewayBillNo,
      ewayBillDate,
      validUpto: new Date(ewayBillDate.getTime() + 86400000),
      metadata: { provider: 'masters_india', raw: json },
    };
  }

  async cancel(ewayBillNo: string, reason: string, config: unknown): Promise<{ cancelledAt: Date }> {
    const cfg = (config ?? {}) as Record<string, unknown>;
    requireCreds(cfg, ['username', 'password'], 'Masters India e-way');
    const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');
    await postJson(`${baseUrl}/api/v1/ewaybill/cancel`, {}, {
      user_name: cfg.username,
      password: cfg.password,
      ewayBillNo,
      reason,
    });
    return { cancelledAt: new Date() };
  }
}

export const mastersIndiaEWayBillProvider = new MastersIndiaEWayBillProvider();
