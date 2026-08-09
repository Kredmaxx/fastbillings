import { describe, expect, it, vi } from 'vitest';

import { findProductInventory, resolveWarehouseId } from './warehouseStock';

describe('warehouseStock', () => {
  it('returns requested warehouse when owned', async () => {
    const tx = {
      warehouse: {
        findFirst: vi.fn().mockResolvedValue({ id: 'wh-1' }),
        create: vi.fn(),
      },
      inventory: { findFirst: vi.fn() },
    };
    const id = await resolveWarehouseId(tx, {
      userId: 'u1',
      warehouseId: 'wh-1',
    });
    expect(id).toBe('wh-1');
    expect(tx.warehouse.create).not.toHaveBeenCalled();
  });

  it('creates default warehouse when none exists', async () => {
    const tx = {
      warehouse: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'wh-new' }),
      },
      inventory: { findFirst: vi.fn() },
    };
    const id = await resolveWarehouseId(tx, { userId: 'u1', tenantId: 't1' });
    expect(id).toBe('wh-new');
    expect(tx.warehouse.create).toHaveBeenCalled();
  });

  it('finds warehouse-scoped inventory before legacy null', async () => {
    const atWh = { id: 'inv-wh', warehouseId: 'wh-1' };
    const tx = {
      warehouse: { findFirst: vi.fn(), create: vi.fn() },
      inventory: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(atWh)
          .mockResolvedValueOnce({ id: 'inv-legacy', warehouseId: null }),
      },
    };
    const row = await findProductInventory(tx as never, {
      userId: 'u1',
      productId: 'p1',
      warehouseId: 'wh-1',
    });
    expect(row?.id).toBe('inv-wh');
    expect(tx.inventory.findFirst).toHaveBeenCalledTimes(1);
  });

  it('falls back to legacy null warehouse inventory', async () => {
    const tx = {
      warehouse: { findFirst: vi.fn(), create: vi.fn() },
      inventory: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'inv-legacy', warehouseId: null }),
      },
    };
    const row = await findProductInventory(tx as never, {
      userId: 'u1',
      productId: 'p1',
      warehouseId: 'wh-1',
    });
    expect(row?.id).toBe('inv-legacy');
  });
});
