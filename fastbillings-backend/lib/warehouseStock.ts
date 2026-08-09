/**
 * Resolve default / document warehouse and find Inventory rows scoped by warehouse.
 * Legacy rows with null warehouseId are accepted as a fallback and can be claimed.
 */

export type WarehouseStockTx = {
  warehouse: {
    findFirst: (args: unknown) => Promise<{ id: string } | null>;
    create: (args: { data: unknown }) => Promise<{ id: string }>;
  };
  inventory: {
    findFirst: (args: unknown) => Promise<InventoryRow | null>;
  };
};

export type InventoryRow = {
  id: string;
  productId: string;
  warehouseId: string | null;
  userId: string;
  quantity: number;
  quantityOnHand: unknown;
  avgCost: unknown;
  inventory_history: unknown;
  isDeleted: boolean;
  tenantId?: string | null;
};

export async function resolveWarehouseId(
  tx: WarehouseStockTx,
  opts: {
    userId: string;
    tenantId?: string | null;
    warehouseId?: string | null;
  },
): Promise<string> {
  const ownership = opts.tenantId
    ? { OR: [{ tenantId: opts.tenantId }, { userId: opts.userId }] }
    : { userId: opts.userId };

  if (opts.warehouseId) {
    const named = await tx.warehouse.findFirst({
      where: { id: opts.warehouseId, isDeleted: false, ...ownership },
      select: { id: true },
    });
    if (named) return named.id;
  }

  const existingDefault = await tx.warehouse.findFirst({
    where: { isDeleted: false, isDefault: true, ...ownership },
    select: { id: true },
  });
  if (existingDefault) return existingDefault.id;

  const anyWh = await tx.warehouse.findFirst({
    where: { isDeleted: false, ...ownership },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (anyWh) return anyWh.id;

  const created = await tx.warehouse.create({
    data: {
      userId: opts.userId,
      tenantId: opts.tenantId ?? null,
      name: 'Main Warehouse',
      code: 'MAIN',
      isDefault: true,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Prefer inventory at the given warehouse; fall back to legacy null-warehouse row.
 */
export async function findProductInventory(
  tx: WarehouseStockTx,
  opts: { userId: string; productId: string; warehouseId: string },
): Promise<InventoryRow | null> {
  const atWh = await tx.inventory.findFirst({
    where: {
      productId: opts.productId,
      userId: opts.userId,
      warehouseId: opts.warehouseId,
      isDeleted: false,
    },
  });
  if (atWh) return atWh;

  return tx.inventory.findFirst({
    where: {
      productId: opts.productId,
      userId: opts.userId,
      warehouseId: null,
      isDeleted: false,
    },
  });
}
