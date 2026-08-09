import { describe, expect, it } from 'vitest';
import { explodeGraph } from './bomExplode';

describe('explodeGraph (multi-level BOM)', () => {
  it('returns single-level lines as leaves', () => {
    const leaves = explodeGraph(
      {
        FG: [
          { componentProductId: 'A', qtyPerBuild: 2 },
          { componentProductId: 'B', qtyPerBuild: 1 },
        ],
      },
      'FG',
    );
    expect(leaves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 'A', qtyPerBuild: 2 }),
        expect.objectContaining({ productId: 'B', qtyPerBuild: 1 }),
      ]),
    );
  });

  it('explodes nested BOM and aggregates shared leaves', () => {
    // FG = 1×SUB + 1×Screw
    // SUB = 2×Widget + 1×Screw
    // → Widget 2, Screw 2
    const leaves = explodeGraph(
      {
        FG: [
          { componentProductId: 'SUB', qtyPerBuild: 1 },
          { componentProductId: 'Screw', qtyPerBuild: 1 },
        ],
        SUB: [
          { componentProductId: 'Widget', qtyPerBuild: 2 },
          { componentProductId: 'Screw', qtyPerBuild: 1 },
        ],
      },
      'FG',
    );
    const byId = Object.fromEntries(leaves.map((l) => [l.productId, l.qtyPerBuild]));
    expect(byId.Widget).toBe(2);
    expect(byId.Screw).toBe(2);
    expect(byId.SUB).toBeUndefined();
  });

  it('scales nested qty through parents', () => {
    // FG = 3×SUB; SUB = 2×Part → Part 6
    const leaves = explodeGraph(
      {
        FG: [{ componentProductId: 'SUB', qtyPerBuild: 3 }],
        SUB: [{ componentProductId: 'Part', qtyPerBuild: 2 }],
      },
      'FG',
    );
    expect(leaves).toEqual([expect.objectContaining({ productId: 'Part', qtyPerBuild: 6 })]);
  });

  it('throws on cycles', () => {
    expect(() =>
      explodeGraph(
        {
          FG: [{ componentProductId: 'A', qtyPerBuild: 1 }],
          A: [{ componentProductId: 'FG', qtyPerBuild: 1 }],
        },
        'FG',
      ),
    ).toThrow(/cycle/);
  });
});
