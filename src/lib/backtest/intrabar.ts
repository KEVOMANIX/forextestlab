/**
 * Intrabar price paths: the order in which price moved inside one candle,
 * taken from real ticks.
 *
 * A candle only proves its open, high, low and close. When a stop-loss and a
 * take-profit (or a pending entry and its stop) both sit inside one candle,
 * OHLC cannot say which was reached first, and the execution policy used to
 * guess. With a path attached, the first touch decides.
 *
 * The path is a zigzag of the tick midpoints (moves under ~0.3 pip dropped),
 * rescaled so its extremes are exactly the candle's high and low, and framed
 * by the candle's open and close. The ticks come from a different archive than
 * the candles, so they are used for *shape and order*, never as prices of their
 * own: every level comparison still happens in the candle's own price space,
 * with the session's spread applied exactly as for OHLC.
 *
 * Pure and isomorphic: the server attaches paths to candles, and the browser
 * and server replay engines read the same paths, so they always agree.
 */

import type { Candle } from "@/lib/market-data/types";

/** `t`: milliseconds after the candle opened. `p`: mid price, in the candle's price space. */
export type IntrabarPath = { t: number[]; p: number[] };

type TickLike = { time: ArrayLike<number>; bid: ArrayLike<number>; ask: ArrayLike<number> };
type Ohlc = { timestamp: number; open: string | number; high: string | number; low: string | number; close: string | number };

/** Smallest reversal kept, in pips. Finer wiggles cannot change which of two sensibly placed levels is hit first. */
const ZIGZAG_PIPS = 0.3;

/**
 * Builds a candle's path from the ticks inside [timestamp, timestamp + durationMs).
 * Returns undefined when there are too few ticks to say anything.
 */
export function buildIntrabarPath(ticks: TickLike, from: number, to: number, candle: Ohlc, pipSize: number, precision: number): IntrabarPath | undefined {
  // Ticks are time ordered; find the window.
  let start = 0, end = ticks.time.length;
  { let low = 0, high = end; while (low < high) { const mid = (low + high) >> 1; if (ticks.time[mid]! < from) low = mid + 1; else high = mid; } start = low; }
  { let low = start, high = end; while (low < high) { const mid = (low + high) >> 1; if (ticks.time[mid]! < to) low = mid + 1; else high = mid; } end = low; }
  if (end - start < 2) return undefined;

  const threshold = ZIGZAG_PIPS * pipSize;
  const mid = (index: number) => (ticks.bid[index]! + ticks.ask[index]!) / 2;
  // Zigzag: keep the first tick, every confirmed turning point, and the last tick.
  const keepT: number[] = [ticks.time[start]!], keepP: number[] = [mid(start)];
  let extremeIndex = start, direction = 0;
  for (let index = start + 1; index < end; index++) {
    const price = mid(index), extreme = mid(extremeIndex), anchor = keepP[keepP.length - 1]!;
    if (direction >= 0 && price >= extreme) { extremeIndex = index; if (direction === 0 && price - anchor >= threshold) direction = 1; continue; }
    if (direction <= 0 && price <= extreme) { extremeIndex = index; if (direction === 0 && anchor - price >= threshold) direction = -1; continue; }
    if (Math.abs(price - extreme) >= threshold) {
      if (direction !== 0) { keepT.push(ticks.time[extremeIndex]!); keepP.push(extreme); }
      direction = price > extreme ? 1 : -1;
      extremeIndex = index;
    } else if (direction === 0) {
      extremeIndex = index;
    }
  }
  keepT.push(ticks.time[extremeIndex]!); keepP.push(mid(extremeIndex));
  if (extremeIndex !== end - 1) { keepT.push(ticks.time[end - 1]!); keepP.push(mid(end - 1)); }

  let tickLow = Infinity, tickHigh = -Infinity;
  for (const price of keepP) { if (price < tickLow) tickLow = price; if (price > tickHigh) tickHigh = price; }
  const low = Number(candle.low), high = Number(candle.high), open = Number(candle.open), close = Number(candle.close);
  if (!(tickHigh > tickLow) || !(high >= low)) return undefined;

  // Rescale onto the candle's range, then frame with its open and close.
  const scale = (high - low) / (tickHigh - tickLow);
  const factor = 10 ** precision;
  const round = (value: number) => Math.round(value * factor) / factor;
  const span = Math.max(1, to - from);
  const t: number[] = [0], p: number[] = [round(open)];
  for (let index = 0; index < keepP.length; index++) {
    const price = round(low + (keepP[index]! - tickLow) * scale);
    const at = Math.min(span - 1, Math.max(0, Math.round((keepT[index]! - from) / 100) * 100));
    if (price === p[p.length - 1]) continue;
    t.push(Math.max(at, t[t.length - 1]!)); p.push(price);
  }
  if (p[p.length - 1] !== round(close)) { t.push(Math.max(span - 1, t[t.length - 1]!)); p.push(round(close)); }
  return p.length >= 2 ? { t, p } : undefined;
}

/** The candle's path, if one is attached and well formed. */
export function pathOf(candle: Candle): IntrabarPath | undefined {
  const path = candle.path;
  return path && Array.isArray(path.p) && path.p.length >= 2 && path.t?.length === path.p.length ? path : undefined;
}

/** First path index where `test(mid)` holds, or -1. */
export function firstTouch(path: IntrabarPath, test: (mid: number) => boolean, fromIndex = 0): number {
  // Price moves monotonically between consecutive points, and every test is a
  // one-sided threshold, so a level crossed between two points is caught by
  // the later point itself.
  for (let index = fromIndex; index < path.p.length; index++) if (test(path.p[index]!)) return index;
  return -1;
}

const EPSILON = 1e-9;

/**
 * Which of a position's two levels the path reaches first. Longs are managed
 * on the bid (mid - half spread), shorts on the ask (mid + half spread).
 * Returns null when the path cannot separate them.
 */
export function firstLevelHit(path: IntrabarPath, direction: "long" | "short", stopLoss: number, takeProfit: number, halfSpread: number): "stop-loss" | "take-profit" | null {
  const quote = (mid: number) => (direction === "long" ? mid - halfSpread : mid + halfSpread);
  const stop = firstTouch(path, (mid) => (direction === "long" ? quote(mid) <= stopLoss + EPSILON : quote(mid) >= stopLoss - EPSILON));
  const profit = firstTouch(path, (mid) => (direction === "long" ? quote(mid) >= takeProfit - EPSILON : quote(mid) <= takeProfit + EPSILON));
  if (stop < 0 && profit < 0) return null;
  if (stop < 0) return "take-profit";
  if (profit < 0) return "stop-loss";
  if (stop === profit) return null;
  return stop < profit ? "stop-loss" : "take-profit";
}

/** Path index at which a pending order's executable quote reaches its price, or -1. */
export function pendingTouchIndex(path: IntrabarPath, isBuy: boolean, orderType: "limit" | "stop", requested: number, halfSpread: number): number {
  const quote = (mid: number) => (isBuy ? mid + halfSpread : mid - halfSpread);
  const below = (mid: number) => quote(mid) <= requested + EPSILON;
  const above = (mid: number) => quote(mid) >= requested - EPSILON;
  return firstTouch(path, orderType === "limit" ? (isBuy ? below : above) : (isBuy ? above : below));
}

/**
 * The rest of a candle after path index `index`, starting at `entryMid`: what a
 * position opened inside this candle can still be stopped or paid by. Without
 * this, a pending order filled near the candle's high was checked against the
 * low that came before it.
 */
export function candleAfter(candle: Candle, index: number, entryMid: number, precision: number): Candle {
  const path = pathOf(candle);
  if (!path || index < 0) return candle;
  const rest = path.p.slice(index);
  const p = [entryMid, ...rest];
  const t = [path.t[index]!, ...path.t.slice(index)];
  const fixed = (value: number) => value.toFixed(precision);
  return { ...candle, open: fixed(entryMid), high: fixed(Math.max(...p)), low: fixed(Math.min(...p)), path: { t, p } };
}

/** Price on the path `ms` after the candle opened, interpolated between points. */
export function priceAt(path: IntrabarPath, ms: number): number {
  if (ms <= path.t[0]!) return path.p[0]!;
  for (let index = 1; index < path.p.length; index++) {
    const at = path.t[index]!;
    if (at < ms) continue;
    const before = path.t[index - 1]!, from = path.p[index - 1]!;
    return at > before ? from + ((path.p[index]! - from) * (ms - before)) / (at - before) : path.p[index]!;
  }
  return path.p[path.p.length - 1]!;
}

/**
 * The part of a candle after `fromMs` up to and including `toMs`, as a candle
 * of its own whose path is just that stretch. Tick stepping runs the engine
 * on these pieces, so orders only see price that has actually been shown.
 * Null without a path.
 */
export function candleBetween(candle: Candle, fromMs: number, toMs: number, precision: number): Candle | null {
  const path = pathOf(candle);
  if (!path || !(toMs > fromMs)) return null;
  const round = (value: number) => Number(value.toFixed(precision));
  const t: number[] = [fromMs], p: number[] = [round(fromMs <= 0 ? Number(candle.open) : priceAt(path, fromMs))];
  for (let index = 0; index < path.p.length; index++) {
    const at = path.t[index]!;
    if (at > fromMs && at <= toMs) { t.push(at); p.push(path.p[index]!); }
  }
  if (t[t.length - 1]! < toMs && toMs < path.t[path.t.length - 1]!) { t.push(toMs); p.push(round(priceAt(path, toMs))); }
  if (p.length === 1) { t.push(toMs); p.push(p[0]!); }
  const fixed = (value: number) => value.toFixed(precision);
  return { ...candle, open: fixed(p[0]!), high: fixed(Math.max(...p)), low: fixed(Math.min(...p)), close: fixed(p[p.length - 1]!), path: { t, p } };
}

/**
 * The candle as it stood `elapsedMs` after it opened, following its tick path
 * (prices between two path points are interpolated). Tick replay draws this
 * while the minute is still forming. Null without a path.
 */
export function partialCandle(candle: Candle, elapsedMs: number, precision: number): Candle | null {
  if (!pathOf(candle) || elapsedMs < 0) return null;
  const piece = candleBetween(candle, 0, Math.max(1, elapsedMs), precision)!;
  const fixed = (value: number) => value.toFixed(precision);
  const open = Number(candle.open);
  return { timestamp: candle.timestamp, open: candle.open, high: fixed(Math.max(Number(piece.high), open)), low: fixed(Math.min(Number(piece.low), open)), close: piece.close, source: "forming" };
}

/** Path point times after `elapsedMs`: where the next "tick" step lands. */
export function nextPathTime(candle: Candle, elapsedMs: number): number | null {
  const path = pathOf(candle);
  if (!path) return null;
  for (const at of path.t) if (at > elapsedMs) return at;
  return null;
}
