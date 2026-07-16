// lib/ledger/inventoryCost.ts
import { Prisma } from '@prisma/client';
import { toDecimal, ZERO, type DecimalInput } from './money';

export interface StockState {
  quantityOnHand: Prisma.Decimal;
  avgCost: Prisma.Decimal;
}

/** Weighted-average receipt: avg = (qoh*avg + qtyIn*unitCost)/(qoh+qtyIn).
 *  Keeps the prior average when qtyIn is zero or the resulting quantity is <= 0. */
export function applyReceipt(state: StockState, qtyIn: DecimalInput, unitCost: DecimalInput): StockState {
  const qIn = toDecimal(qtyIn);
  if (qIn.lessThanOrEqualTo(0)) return state;
  const newQty = state.quantityOnHand.plus(qIn);
  if (newQty.lessThanOrEqualTo(0)) {
    return { quantityOnHand: newQty, avgCost: state.avgCost };
  }
  const totalCost = state.quantityOnHand.times(state.avgCost).plus(qIn.times(toDecimal(unitCost)));
  return { quantityOnHand: newQty, avgCost: totalCost.dividedBy(newQty) };
}

/** Issue at current average. Returns COGS and the new state. Average is unchanged
 *  by an issue; quantity may go negative (oversell) — COGS still uses current avg. */
export function applyIssue(state: StockState, qtyOut: DecimalInput): { state: StockState; cogs: Prisma.Decimal } {
  const qOut = toDecimal(qtyOut);
  if (qOut.lessThanOrEqualTo(0)) return { state, cogs: ZERO };
  const cogs = qOut.times(state.avgCost);
  return { state: { quantityOnHand: state.quantityOnHand.minus(qOut), avgCost: state.avgCost }, cogs };
}
