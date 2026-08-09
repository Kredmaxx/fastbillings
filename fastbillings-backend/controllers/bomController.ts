import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';
import {
  optionalTenantId,
  requireUserId,
  tenantOrUserScope,
  UnauthorizedError,
} from '../lib/tenantScope';
import { explodeBomToLeaves, explodeGraph } from '../lib/bomExplode';

type LineInput = { componentProductId: string; qtyPerBuild: number; sortOrder?: number };

/** Dry-run explode against existing BOMs + proposed lines; rejects cycles. */
async function assertBomAcyclic(
  req: Request,
  finishedProductId: string,
  lines: LineInput[],
): Promise<void> {
  const all = await prisma.bom.findMany({
    where: { ...tenantOrUserScope(req), isActive: true },
    select: {
      finishedProductId: true,
      lines: { select: { componentProductId: true, qtyPerBuild: true } },
    },
  });
  const graph: Record<string, Array<{ componentProductId: string; qtyPerBuild: number }>> = {};
  for (const b of all) {
    graph[b.finishedProductId] = b.lines.map((l) => ({
      componentProductId: l.componentProductId,
      qtyPerBuild: Number(l.qtyPerBuild),
    }));
  }
  graph[finishedProductId] = lines.map((l) => ({
    componentProductId: l.componentProductId,
    qtyPerBuild: Number(l.qtyPerBuild),
  }));
  try {
    explodeGraph(graph, finishedProductId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('cycle')) {
      throw new Error('BOM cycle detected — a component (directly or via nested BOM) leads back to this finished good');
    }
    throw err;
  }
}

async function assertInventoryProduct(
  req: Request,
  productId: string,
  label: string,
): Promise<void> {
  // Products are tenant-keyed — never resolve by bare id (attach IDOR / catalog leak).
  const tenantId = optionalTenantId(req);
  if (!tenantId) {
    throw new Error('Workspace context required');
  }
  const p = await prisma.product.findFirst({
    where: { id: productId, tenantId },
    select: { id: true, item_type: true, enable_inventory: true, name: true },
  });
  if (!p || p.item_type === 'Service' || !p.enable_inventory) {
    throw new Error(`${label} must be an inventory-tracked product`);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const rows = await prisma.bom.findMany({
      where: { ...tenantOrUserScope(req) },
      include: {
        finishedProduct: { select: { id: true, name: true, code: true, trackingMode: true } },
        lines: {
          include: {
            componentProduct: {
              select: { id: true, name: true, code: true, trackingMode: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: { select: { lines: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json({ success: true, data: { boms: rows } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bom list error:', err);
    res.status(500).json({ success: false, message: 'Failed to list BOMs' });
  }
}

export async function getById(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const row = await prisma.bom.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      include: {
        finishedProduct: { select: { id: true, name: true, code: true, trackingMode: true } },
        lines: {
          include: {
            componentProduct: {
              select: { id: true, name: true, code: true, trackingMode: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!row) {
      res.status(404).json({ success: false, message: 'BOM not found' });
      return;
    }
    res.json({ success: true, data: { bom: row } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to fetch BOM' });
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const body = req.body as {
      finishedProductId?: string;
      name?: string;
      lines?: LineInput[];
    };
    if (!body.finishedProductId) {
      res.status(400).json({ success: false, message: 'finishedProductId required' });
      return;
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      res.status(400).json({ success: false, message: 'At least one BOM line required' });
      return;
    }

    await assertInventoryProduct(req, body.finishedProductId, 'Finished product');
    for (const l of body.lines) {
      if (l.componentProductId === body.finishedProductId) {
        res.status(400).json({ success: false, message: 'Component cannot equal finished product' });
        return;
      }
      if (!(Number(l.qtyPerBuild) > 0)) {
        res.status(400).json({ success: false, message: 'qtyPerBuild must be positive' });
        return;
      }
      await assertInventoryProduct(req, l.componentProductId, 'Component');
    }
    await assertBomAcyclic(req, body.finishedProductId, body.lines);

    const bom = await prisma.bom.create({
      data: {
        userId,
        tenantId,
        finishedProductId: body.finishedProductId,
        name: body.name?.trim() || null,
        lines: {
          create: body.lines.map((l, i) => ({
            componentProductId: l.componentProductId,
            qtyPerBuild: new Prisma.Decimal(Number(l.qtyPerBuild)),
            sortOrder: l.sortOrder ?? i,
          })),
        },
      },
      include: {
        finishedProduct: { select: { id: true, name: true, code: true } },
        lines: {
          include: { componentProduct: { select: { id: true, name: true, code: true } } },
        },
      },
    });

    res.status(201).json({ success: true, message: 'BOM created', data: { bom } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ success: false, message: 'A BOM already exists for this finished product' });
      return;
    }
    console.error('bom create error:', err);
    const msg = err instanceof Error ? err.message : 'Failed to create BOM';
    res.status(msg.includes('cycle') || msg.includes('BOM cycle') ? 400 : 500).json({
      success: false,
      message: msg,
    });
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const body = req.body as {
      name?: string;
      isActive?: boolean;
      lines?: LineInput[];
    };

    const existing = await prisma.bom.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      select: { id: true, finishedProductId: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'BOM not found' });
      return;
    }

    if (Array.isArray(body.lines)) {
      if (body.lines.length === 0) {
        res.status(400).json({ success: false, message: 'At least one BOM line required' });
        return;
      }
      for (const l of body.lines) {
        if (l.componentProductId === existing.finishedProductId) {
          res.status(400).json({ success: false, message: 'Component cannot equal finished product' });
          return;
        }
        if (!(Number(l.qtyPerBuild) > 0)) {
          res.status(400).json({ success: false, message: 'qtyPerBuild must be positive' });
          return;
        }
        await assertInventoryProduct(req, l.componentProductId, 'Component');
      }
      await assertBomAcyclic(req, existing.finishedProductId, body.lines);
    }

    const bom = await prisma.$transaction(async (tx) => {
      if (Array.isArray(body.lines)) {
        await tx.bomLine.deleteMany({ where: { bomId: id } });
        await tx.bomLine.createMany({
          data: body.lines.map((l, i) => ({
            bomId: id,
            componentProductId: l.componentProductId,
            qtyPerBuild: new Prisma.Decimal(Number(l.qtyPerBuild)),
            sortOrder: l.sortOrder ?? i,
          })),
        });
      }
      return tx.bom.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: body.name?.trim() || null } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive === true } : {}),
        },
        include: {
          finishedProduct: { select: { id: true, name: true, code: true } },
          lines: {
            include: { componentProduct: { select: { id: true, name: true, code: true } } },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    res.json({ success: true, message: 'BOM updated', data: { bom } });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bom update error:', err);
    const msg = err instanceof Error ? err.message : 'Failed to update BOM';
    res.status(msg.includes('cycle') || msg.includes('BOM cycle') ? 400 : 500).json({
      success: false,
      message: msg,
    });
  }
}

export async function explode(req: Request, res: Response): Promise<void> {
  try {
    const userId = requireUserId(req);
    const tenantId = optionalTenantId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.bom.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'BOM not found' });
      return;
    }

    const { leaves, tree } = await explodeBomToLeaves(prisma as never, {
      userId,
      tenantId,
      bomId: id,
    });

    const productIds = [
      ...new Set([tree.productId, ...leaves.map((l) => l.productId), ...collectTreeProductIds(tree)]),
    ];
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        ...(tenantId ? { tenantId } : {}),
      },
      select: { id: true, name: true, code: true, trackingMode: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    res.json({
      success: true,
      data: {
        leaves: leaves.map((l) => ({
          ...l,
          product: byId.get(l.productId) ?? null,
        })),
        tree: annotateTree(tree, byId),
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    console.error('bom explode error:', err);
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to explode BOM',
    });
  }
}

function collectTreeProductIds(node: {
  productId: string;
  children?: Array<{ productId: string; children?: unknown[] }>;
}): string[] {
  const ids = [node.productId];
  for (const c of node.children ?? []) {
    ids.push(...collectTreeProductIds(c as typeof node));
  }
  return ids;
}

function annotateTree(
  node: {
    productId: string;
    qtyPerBuild: number;
    depth: number;
    isLeaf: boolean;
    bomId?: string;
    children?: Array<{
      productId: string;
      qtyPerBuild: number;
      depth: number;
      isLeaf: boolean;
      bomId?: string;
      children?: unknown[];
    }>;
  },
  byId: Map<string, { id: string; name: string; code: string; trackingMode: string }>,
): unknown {
  return {
    ...node,
    product: byId.get(node.productId) ?? null,
    children: (node.children ?? []).map((c) => annotateTree(c as typeof node, byId)),
  };
}

export async function remove(req: Request, res: Response): Promise<void> {
  try {
    requireUserId(req);
    const { id } = req.params as { id: string };
    const existing = await prisma.bom.findFirst({
      where: { id, ...tenantOrUserScope(req) },
      select: { id: true },
    });
    if (!existing) {
      res.status(404).json({ success: false, message: 'BOM not found' });
      return;
    }
    await prisma.bom.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });
    res.json({ success: true, message: 'BOM deleted' });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      res.status(401).json({ success: false, message: err.message });
      return;
    }
    res.status(500).json({ success: false, message: 'Failed to delete BOM' });
  }
}

const handlers = { list, getById, create, update, remove, explode };
module.exports = handlers;
module.exports.default = handlers;
