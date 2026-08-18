import axios from 'axios';
import Constants from '@constants/api';
import {
  listQueuedSales,
  markQueuedSaleFailed,
  removeQueuedSale,
  type PosQueuedSale,
} from './posDb';

export type SyncResult = { synced: number; failed: number; remaining: number };

export async function flushPosQueue(token: string): Promise<SyncResult> {
  const queued = await listQueuedSales();
  let synced = 0;
  let failed = 0;
  const headers = { Authorization: `Bearer ${token}` };

  for (const sale of queued) {
    if (sale.lastError) continue;
    try {
      await axios.post(Constants.POS_SALES_URL, sale.payload, { headers });
      await removeQueuedSale(sale.clientSaleId);
      synced += 1;
    } catch (err) {
      if (axios.isAxiosError(err) && !err.response) {
        // Still offline / network — stop; remaining stay pending.
        break;
      }
      const status = axios.isAxiosError(err) ? err.response?.status : 0;
      const message = axios.isAxiosError(err)
        ? String(err.response?.data?.message ?? err.message)
        : 'Sync failed';
      if (status === 409 || status === 400 || status === 422 || status === 401 || status === 403) {
        await markQueuedSaleFailed(sale.clientSaleId, message);
        failed += 1;
        continue;
      }
      break;
    }
  }

  const remaining = (await listQueuedSales()).length;
  return { synced, failed, remaining };
}

export function newClientSaleId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type { PosQueuedSale };
