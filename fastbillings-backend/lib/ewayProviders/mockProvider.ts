import { randomInt } from 'crypto';

import type { EWayBillGenerateResult, EWayBillPayload, EWayBillProvider } from '../ewayProvider';

export class MockEWayBillProvider implements EWayBillProvider {
  readonly name = 'mock';

  async generate(payload: EWayBillPayload, _config: unknown): Promise<EWayBillGenerateResult> {
    const ewayBillNo = String(randomInt(100000000000, 999999999999));
    const ewayBillDate = new Date();
    const validUpto = new Date(ewayBillDate);
    validUpto.setDate(validUpto.getDate() + 1);
    return {
      ewayBillNo,
      ewayBillDate,
      validUpto,
      metadata: {
        provider: 'mock',
        invoiceNumber: payload.invoiceNumber,
        distanceKm: payload.distanceKm ?? null,
        vehicleNo: payload.vehicleNo ?? null,
      },
    };
  }

  async cancel(_ewayBillNo: string, _reason: string, _config: unknown): Promise<{ cancelledAt: Date }> {
    return { cancelledAt: new Date() };
  }
}

export const mockEWayBillProvider = new MockEWayBillProvider();
