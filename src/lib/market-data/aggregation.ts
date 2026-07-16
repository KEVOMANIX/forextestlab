/**
 * Timeframe aggregation for candle data.
 *
 * Aggregates finer-timeframe candles into a coarser timeframe using UTC-aligned
 * buckets. Prices are decimal STRINGS; all numeric comparison and summation is
 * performed with decimal.js to avoid floating-point error.
 */

import { Decimal, d } from "@/lib/decimal";
import type { Candle, Timeframe } from "@/lib/market-data/types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

/** Start (UTC epoch ms) of the bucket that `timestampMs` falls into for `timeframe`. */
export function candleBucketStart(
  timestampMs: number,
  timeframe: Timeframe,
): number {
  const size = TIMEFRAME_MS[timeframe];
  return timestampMs - (timestampMs % size);
}

interface Ohlc {
  open: string;
  high: string;
  low: string;
  close: string;
}

/**
 * Aggregate finer-timeframe candles into a coarser timeframe.
 *
 * Rules: open = first candle's open; high = max high; low = min low;
 * close = last candle's close; volume = sum of available volumes (undefined if
 * none present); bid*_/_ask* aggregated the same way (open=first, high=max,
 * low=min, close=last) only when present on all candles in a bucket, else
 * omit; source = "aggregated"; UTC boundaries; deterministic; no duplicate
 * output candles; output sorted ascending by timestamp.
 *
 * Throws if TIMEFRAME_MS[to] is not an exact multiple of TIMEFRAME_MS[from],
 * or to < from.
 */
export function aggregateCandles(
  base: Candle[],
  from: Timeframe,
  to: Timeframe,
): Candle[] {
  const fromMs = TIMEFRAME_MS[from];
  const toMs = TIMEFRAME_MS[to];

  if (toMs < fromMs) {
    throw new Error(
      `Cannot aggregate from "${from}" to "${to}": target timeframe is smaller than source.`,
    );
  }
  if (toMs % fromMs !== 0) {
    throw new Error(
      `Cannot aggregate from "${from}" to "${to}": target is not an exact multiple of source.`,
    );
  }

  // Sort a copy ascending by timestamp; break ties on source for determinism.
  const sorted = [...base].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.source < b.source ? -1 : a.source > b.source ? 1 : 0;
  });

  const buckets = new Map<number, Candle[]>();
  const order: number[] = [];
  for (const candle of sorted) {
    const start = candleBucketStart(candle.timestamp, to);
    const existing = buckets.get(start);
    if (existing) {
      existing.push(candle);
    } else {
      buckets.set(start, [candle]);
      order.push(start);
    }
  }

  order.sort((a, b) => a - b);

  const result: Candle[] = [];
  for (const start of order) {
    const group = buckets.get(start);
    if (!group || group.length === 0) continue;
    result.push(aggregateBucket(start, group));
  }

  return result;
}

/** Aggregate one non-empty bucket of candles (already ascending) into a single candle. */
function aggregateBucket(timestamp: number, group: Candle[]): Candle {
  const first = group[0];
  const last = group[group.length - 1];
  // group is guaranteed non-empty by the caller; guard for noUncheckedIndexedAccess.
  if (!first || !last) {
    throw new Error("aggregateBucket received an empty group.");
  }

  let high = d(first.high);
  let low = d(first.low);
  let volumeSum = new Decimal(0);
  let hasVolume = false;

  for (const candle of group) {
    const h = d(candle.high);
    if (h.greaterThan(high)) high = h;
    const l = d(candle.low);
    if (l.lessThan(low)) low = l;
    if (candle.volume !== undefined) {
      volumeSum = volumeSum.plus(d(candle.volume));
      hasVolume = true;
    }
  }

  const candle: Candle = {
    timestamp,
    open: first.open,
    high: high.toString(),
    low: low.toString(),
    close: last.close,
    // Preserve demonstration provenance so aggregated synthetic candles cannot
    // be mistaken for licensed/imported historical data.
    source: group.every((item) => item.source === "demo")
      ? "demo"
      : "aggregated",
  };

  if (hasVolume) {
    candle.volume = volumeSum.toString();
  }

  const bid = aggregateOhlc(
    group,
    first,
    last,
    (c) => c.bidOpen,
    (c) => c.bidHigh,
    (c) => c.bidLow,
    (c) => c.bidClose,
  );
  if (bid) {
    candle.bidOpen = bid.open;
    candle.bidHigh = bid.high;
    candle.bidLow = bid.low;
    candle.bidClose = bid.close;
  }

  const ask = aggregateOhlc(
    group,
    first,
    last,
    (c) => c.askOpen,
    (c) => c.askHigh,
    (c) => c.askLow,
    (c) => c.askClose,
  );
  if (ask) {
    candle.askOpen = ask.open;
    candle.askHigh = ask.high;
    candle.askLow = ask.low;
    candle.askClose = ask.close;
  }

  return candle;
}

/**
 * Aggregate one OHLC price side (bid or ask). Returns undefined unless all four
 * fields are present on every candle in the group.
 */
function aggregateOhlc(
  group: Candle[],
  first: Candle,
  last: Candle,
  getOpen: (candle: Candle) => string | undefined,
  getHigh: (candle: Candle) => string | undefined,
  getLow: (candle: Candle) => string | undefined,
  getClose: (candle: Candle) => string | undefined,
): Ohlc | undefined {
  const openValue = getOpen(first);
  const closeValue = getClose(last);
  if (openValue === undefined || closeValue === undefined) return undefined;

  let high: Decimal | undefined;
  let low: Decimal | undefined;
  for (const candle of group) {
    const highRaw = getHigh(candle);
    const lowRaw = getLow(candle);
    if (
      getOpen(candle) === undefined ||
      getClose(candle) === undefined ||
      highRaw === undefined ||
      lowRaw === undefined
    ) {
      return undefined;
    }
    const h = d(highRaw);
    const l = d(lowRaw);
    if (high === undefined || h.greaterThan(high)) high = h;
    if (low === undefined || l.lessThan(low)) low = l;
  }
  if (high === undefined || low === undefined) return undefined;

  return {
    open: openValue,
    high: high.toString(),
    low: low.toString(),
    close: closeValue,
  };
}
