/**
 * Pure execution primitives for the simulated trading engine.
 *
 * Handles spread (native bid/ask or simulated), slippage, commission,
 * stop-loss / take-profit fills, intrabar ambiguity, and P&L — all with
 * decimal.js. No React, no DB: fully unit-testable.
 */

import { Decimal, d } from "@/lib/decimal";
import type { Candle } from "@/lib/market-data/types";
import type { ExecutionPolicy, ExitReason, TradeDirection } from "./types";

/** Bid/ask view of a candle's OHLC, as Decimals. */
export interface BidAskCandle {
  bidOpen: Decimal;
  bidHigh: Decimal;
  bidLow: Decimal;
  bidClose: Decimal;
  askOpen: Decimal;
  askHigh: Decimal;
  askLow: Decimal;
  askClose: Decimal;
  /** True when the source candle carried real bid/ask data. */
  nativeSpread: boolean;
}

function allBidAskPresent(c: Candle): boolean {
  return (
    c.bidOpen != null &&
    c.bidHigh != null &&
    c.bidLow != null &&
    c.bidClose != null &&
    c.askOpen != null &&
    c.askHigh != null &&
    c.askLow != null &&
    c.askClose != null
  );
}

/**
 * Derive a bid/ask candle. Uses native bid/ask when the source provides it;
 * otherwise applies a symmetric simulated half-spread around the midpoint OHLC.
 */
export function deriveBidAsk(
  candle: Candle,
  spreadPips: string,
  pipSize: string,
): BidAskCandle {
  if (allBidAskPresent(candle)) {
    return {
      bidOpen: d(candle.bidOpen as string),
      bidHigh: d(candle.bidHigh as string),
      bidLow: d(candle.bidLow as string),
      bidClose: d(candle.bidClose as string),
      askOpen: d(candle.askOpen as string),
      askHigh: d(candle.askHigh as string),
      askLow: d(candle.askLow as string),
      askClose: d(candle.askClose as string),
      nativeSpread: true,
    };
  }

  const half = d(spreadPips).times(pipSize).dividedBy(2);
  const o = d(candle.open);
  const h = d(candle.high);
  const l = d(candle.low);
  const c = d(candle.close);
  return {
    bidOpen: o.minus(half),
    bidHigh: h.minus(half),
    bidLow: l.minus(half),
    bidClose: c.minus(half),
    askOpen: o.plus(half),
    askHigh: h.plus(half),
    askLow: l.plus(half),
    askClose: c.plus(half),
    nativeSpread: false,
  };
}

/**
 * Market fill price for a new position at the current (just-revealed) candle.
 * Long fills at ask, short at bid; slippage always moves the fill adversely.
 */
export function entryFillPrice(
  direction: TradeDirection,
  candle: Candle,
  spreadPips: string,
  pipSize: string,
  slippagePips: string,
): Decimal {
  const ba = deriveBidAsk(candle, spreadPips, pipSize);
  const slip = d(slippagePips).times(pipSize);
  return direction === "long"
    ? ba.askClose.plus(slip)
    : ba.bidClose.minus(slip);
}

/** Manual/session-end close fill: long exits at bid, short exits at ask. */
export function exitFillPrice(
  direction: TradeDirection,
  candle: Candle,
  spreadPips: string,
  pipSize: string,
): Decimal {
  const ba = deriveBidAsk(candle, spreadPips, pipSize);
  return direction === "long" ? ba.bidClose : ba.askClose;
}

export interface ExitCheck {
  price: string;
  reason: ExitReason;
  intrabarAmbiguous: boolean;
}

/**
 * Check whether an open position's stop-loss or take-profit is touched by the
 * given candle. Returns null when neither is hit.
 *
 * Long positions are managed on the BID; short positions on the ASK.
 * When both levels are touched in the same candle, `intrabarAmbiguous` is set
 * and the execution policy decides which fills first (conservative → the
 * adverse stop-loss).
 */
export function checkStopTakeProfit(
  direction: TradeDirection,
  stopLoss: string | null,
  takeProfit: string | null,
  candle: Candle,
  spreadPips: string,
  pipSize: string,
  policy: ExecutionPolicy,
): ExitCheck | null {
  const ba = deriveBidAsk(candle, spreadPips, pipSize);

  let slHit = false;
  let tpHit = false;

  if (direction === "long") {
    if (stopLoss != null) slHit = ba.bidLow.lessThanOrEqualTo(stopLoss);
    if (takeProfit != null) tpHit = ba.bidHigh.greaterThanOrEqualTo(takeProfit);
  } else {
    if (stopLoss != null) slHit = ba.askHigh.greaterThanOrEqualTo(stopLoss);
    if (takeProfit != null) tpHit = ba.askLow.lessThanOrEqualTo(takeProfit);
  }

  if (!slHit && !tpHit) return null;

  const ambiguous = slHit && tpHit;
  if (ambiguous) {
    // Conservative assumes the adverse level (stop-loss) was reached first.
    const takeStop = policy === "conservative";
    return {
      price: (takeStop ? stopLoss : takeProfit) as string,
      reason: takeStop ? "stop-loss" : "take-profit",
      intrabarAmbiguous: true,
    };
  }

  return slHit
    ? { price: stopLoss as string, reason: "stop-loss", intrabarAmbiguous: false }
    : {
        price: takeProfit as string,
        reason: "take-profit",
        intrabarAmbiguous: false,
      };
}

export function commissionForLots(
  commissionPerLot: string,
  lots: string,
): string {
  return d(commissionPerLot).times(lots).toFixed(2);
}

/** Realised or unrealised P&L in the account currency. */
export function computePnl(params: {
  direction: TradeDirection;
  entryPrice: string;
  exitPrice: string;
  lots: string;
  pipSize: string;
  pipValueAccountPerLot: string;
  commission: string;
}): { pnl: string; pips: string } {
  const entry = d(params.entryPrice);
  const exit = d(params.exitPrice);
  const priceDiff =
    params.direction === "long" ? exit.minus(entry) : entry.minus(exit);
  const pips = priceDiff.dividedBy(params.pipSize);
  const gross = pips
    .times(params.pipValueAccountPerLot)
    .times(params.lots);
  const pnl = gross.minus(params.commission);
  return { pnl: pnl.toFixed(2), pips: pips.toFixed(1) };
}
