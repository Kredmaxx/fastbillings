/** IndexedDB cache for POS catalog + offline sale queue. No extra npm deps. */

import { billedQtyToPrimary, type DualUomApi } from '@/lib/dualUom';

const DB_NAME = 'byzkon-pos';
const DB_VERSION = 1;

export type PosTaxRate = {
  id: string;
  name: string;
  rate: number;
  isActive: boolean;
  taxKind: string | null;
};

export type PosCatalogProduct = {
  id: string;
  name: string;
  code: string;
  barcode: string;
  sellingPrice: number;
  unit: { id: string; name: string } | null;
  dualUom?: DualUomApi | null;
  hsnSac: string | null;
  gstSupplyType: string;
  taxGroupId: string | null;
  taxRates: PosTaxRate[];
  enableInventory: boolean;
  itemType: string;
  stockQty: number;
};

export type PosBootstrapCache = {
  walkInCustomer: { id: string; name: string };
  paymentModes: Array<{ id: string; name: string; slug: string | null }>;
  bank: { id: string; bankName: string } | null;
  warehouseId: string;
  company: {
    companyName: string;
    gstin?: string | null;
    address?: string | null;
    phone?: string | null;
    merchantUpiId?: string | null;
    merchantName?: string | null;
  } | null;
};

export type PosQueuedSale = {
  clientSaleId: string;
  createdAt: string;
  payload: {
    clientSaleId: string;
    lines: Array<{ productId: string; qty: number; rate: number; unitKind?: string; qtyPrimary?: number }>;
    paymentModeId: string;
    warehouseId?: string;
    bankId?: string;
    customerId?: string;
  };
  receipt: {
    lines: Array<{ name: string; qty: number; rate: number; tax: number; amount: number }>;
    taxable: number;
    tax: number;
    total: number;
    paymentModeName: string;
  };
  lastError?: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      if (!db.objectStoreNames.contains('products')) {
        const store = db.createObjectStore('products', { keyPath: 'id' });
        store.createIndex('barcode', 'barcode', { unique: false });
        store.createIndex('code', 'code', { unique: false });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'clientSaleId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function saveBootstrap(data: PosBootstrapCache): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put(data, 'bootstrap');
  await txDone(tx);
}

export async function loadBootstrap(): Promise<PosBootstrapCache | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').get('bootstrap');
    req.onsuccess = () => resolve((req.result as PosBootstrapCache) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCatalog(products: PosCatalogProduct[], syncedAt: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['products', 'meta'], 'readwrite');
  tx.objectStore('products').clear();
  for (const p of products) tx.objectStore('products').put(p);
  tx.objectStore('meta').put(syncedAt, 'syncedAt');
  await txDone(tx);
}

export async function catalogSyncedAt(): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('meta').objectStore('meta').get('syncedAt');
    req.onsuccess = () => resolve((req.result as string) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function findCatalogProduct(code: string): Promise<PosCatalogProduct | null> {
  const needle = code.trim().toLowerCase();
  if (!needle) return null;
  const db = await openDb();
  const store = db.transaction('products').objectStore('products');
  const all: PosCatalogProduct[] = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as PosCatalogProduct[]) ?? []);
    req.onerror = () => reject(req.error);
  });
  return (
    all.find(
      (p) =>
        String(p.barcode ?? '').toLowerCase() === needle ||
        String(p.code ?? '').toLowerCase() === needle,
    ) ?? null
  );
}

export async function decrementLocalStock(productId: string, qty: number): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('products', 'readwrite');
  const store = tx.objectStore('products');
  const current = await new Promise<PosCatalogProduct | undefined>((resolve, reject) => {
    const req = store.get(productId);
    req.onsuccess = () => resolve(req.result as PosCatalogProduct | undefined);
    req.onerror = () => reject(req.error);
  });
  if (current) {
    current.stockQty = Math.max(0, Number(current.stockQty) - qty);
    store.put(current);
  }
  await txDone(tx);
}

export async function enqueueSale(sale: PosQueuedSale): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').put(sale);
  await txDone(tx);
}

export async function listQueuedSales(): Promise<PosQueuedSale[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('queue').objectStore('queue').getAll();
    req.onsuccess = () => resolve((req.result as PosQueuedSale[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedSale(clientSaleId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  tx.objectStore('queue').delete(clientSaleId);
  await txDone(tx);
}

export async function applyQueuedStockHolds(): Promise<void> {
  const queued = await listQueuedSales();
  for (const sale of queued) {
    if (sale.lastError) continue;
    for (const line of sale.payload.lines) {
      await decrementLocalStock(line.productId, line.qtyPrimary ?? billedQtyToPrimary(line.qty, line.unitKind, undefined));
    }
  }
}

export async function markQueuedSaleFailed(clientSaleId: string, lastError: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  const current = await new Promise<PosQueuedSale | undefined>((resolve, reject) => {
    const req = store.get(clientSaleId);
    req.onsuccess = () => resolve(req.result as PosQueuedSale | undefined);
    req.onerror = () => reject(req.error);
  });
  if (current) {
    current.lastError = lastError;
    store.put(current);
  }
  await txDone(tx);
}
