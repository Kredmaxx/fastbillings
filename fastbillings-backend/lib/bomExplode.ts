import { Prisma } from '@prisma/client';

export type BomExplodeTx = {
  bom: {
    findFirst: (args: unknown) => Promise<{
      id: string;
      finishedProductId: string;
      lines: Array<{ componentProductId: string; qtyPerBuild: Prisma.Decimal | number | string }>;
    } | null>;
  };
};

export type ExplodedLeaf = {
  productId: string;
  /** Quantity of this leaf per 1 unit of the top-level finished good. */
  qtyPerBuild: number;
  depth: number;
};

export type ExplodeNode = {
  productId: string;
  qtyPerBuild: number;
  depth: number;
  isLeaf: boolean;
  bomId?: string;
  children?: ExplodeNode[];
};

const MAX_DEPTH = 12;

function ownershipWhere(userId: string, tenantId?: string | null) {
  return tenantId
    ? { isDeleted: false, isActive: true, OR: [{ tenantId }, { userId }] }
    : { isDeleted: false, isActive: true, userId };
}

/**
 * Recursively explode a BOM to leaf materials.
 * Components that themselves have an active BOM are expanded (not consumed as stock).
 * Detects cycles (A→B→A).
 */
export async function explodeBomToLeaves(
  tx: BomExplodeTx,
  opts: {
    userId: string;
    tenantId?: string | null;
    bomId: string;
    /** Cap recursion depth (default 12). */
    maxDepth?: number;
  },
): Promise<{ leaves: ExplodedLeaf[]; tree: ExplodeNode }> {
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const root = await tx.bom.findFirst({
    where: { id: opts.bomId, ...ownershipWhere(opts.userId, opts.tenantId) },
    include: { lines: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!root || root.lines.length === 0) {
    throw new Error('BOM not found or has no lines');
  }

  const leafMap = new Map<string, { qty: number; depth: number }>();

  async function loadBomForProduct(productId: string) {
    return tx.bom.findFirst({
      where: {
        finishedProductId: productId,
        ...ownershipWhere(opts.userId, opts.tenantId),
      },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async function walk(
    lines: Array<{ componentProductId: string; qtyPerBuild: Prisma.Decimal | number | string }>,
    multiplier: number,
    path: Set<string>,
    depth: number,
  ): Promise<ExplodeNode[]> {
    if (depth > maxDepth) {
      throw new Error(`BOM explode exceeded max depth (${maxDepth}) — check for deep nesting`);
    }
    const nodes: ExplodeNode[] = [];
    for (const line of lines) {
      const qty = multiplier * Number(line.qtyPerBuild);
      if (!(qty > 0)) continue;
      const productId = line.componentProductId;
      if (path.has(productId)) {
        throw new Error(`BOM cycle detected involving product ${productId.slice(0, 8)}…`);
      }
      const childBom = await loadBomForProduct(productId);
      if (childBom && childBom.lines.length > 0) {
        const nextPath = new Set(path);
        nextPath.add(productId);
        const children = await walk(childBom.lines, qty, nextPath, depth + 1);
        nodes.push({
          productId,
          qtyPerBuild: qty,
          depth,
          isLeaf: false,
          bomId: childBom.id,
          children,
        });
      } else {
        const prev = leafMap.get(productId);
        leafMap.set(productId, {
          qty: (prev?.qty ?? 0) + qty,
          depth: Math.max(prev?.depth ?? 0, depth),
        });
        nodes.push({
          productId,
          qtyPerBuild: qty,
          depth,
          isLeaf: true,
        });
      }
    }
    return nodes;
  }

  const rootPath = new Set<string>([root.finishedProductId]);
  const children = await walk(root.lines, 1, rootPath, 1);

  const leaves: ExplodedLeaf[] = [...leafMap.entries()].map(([productId, v]) => ({
    productId,
    qtyPerBuild: v.qty,
    depth: v.depth,
  }));

  return {
    leaves,
    tree: {
      productId: root.finishedProductId,
      qtyPerBuild: 1,
      depth: 0,
      isLeaf: false,
      bomId: root.id,
      children,
    },
  };
}

/** Pure helper for unit tests — explode an in-memory BOM graph. */
export function explodeGraph(
  boms: Record<string, Array<{ componentProductId: string; qtyPerBuild: number }>>,
  rootFinishedProductId: string,
  maxDepth = MAX_DEPTH,
): ExplodedLeaf[] {
  const leafMap = new Map<string, { qty: number; depth: number }>();

  function walk(
    finishedId: string,
    lines: Array<{ componentProductId: string; qtyPerBuild: number }>,
    multiplier: number,
    path: Set<string>,
    depth: number,
  ): void {
    if (depth > maxDepth) throw new Error('max depth');
    for (const line of lines) {
      const qty = multiplier * line.qtyPerBuild;
      const pid = line.componentProductId;
      if (path.has(pid)) throw new Error(`cycle:${pid}`);
      const childLines = boms[pid];
      if (childLines?.length) {
        const next = new Set(path);
        next.add(pid);
        walk(pid, childLines, qty, next, depth + 1);
      } else {
        const prev = leafMap.get(pid);
        leafMap.set(pid, {
          qty: (prev?.qty ?? 0) + qty,
          depth: Math.max(prev?.depth ?? 0, depth),
        });
      }
    }
  }

  const rootLines = boms[rootFinishedProductId];
  if (!rootLines?.length) throw new Error('root bom missing');
  walk(rootFinishedProductId, rootLines, 1, new Set([rootFinishedProductId]), 1);

  return [...leafMap.entries()].map(([productId, v]) => ({
    productId,
    qtyPerBuild: v.qty,
    depth: v.depth,
  }));
}
