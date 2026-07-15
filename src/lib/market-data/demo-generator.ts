/**
 * Deterministic synthetic candle generator.
 *
 * Produces a stable pseudo-random walk seeded from (symbol, timeframe, index)
 * so the same request always yields the same candles. This is DEMONSTRATION
 * data — not a real market feed — and must always be labelled as such.
 *
 * Only midpoint OHLC is generated (no bid/ask), which exercises the engine's
 * simulated-spread path.
 */

import { Decimal } from "@/lib/decimal";
import { getSymbolDefinition } from "./symbols";
import { TIMEFRAME_MS, type Candle, type Timeframe } from "./types";

/** Fixed demonstration window (UTC) so generated data is fully deterministic. */
export const DEMO_RANGE_START = Date.UTC(2024, 2, 1, 0, 0, 0); // 2024-03-01
export const DEMO_RANGE_END = Date.UTC(2024, 2, 15, 0, 0, 0); // 2024-03-15

export const DEMO_SOURCE = "demo";

/** Small, fast integer hash for seeding. */
function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 PRNG — deterministic, seeded. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate deterministic candles for a symbol/timeframe across the whole demo
 * window. The walk is anchored per (symbol, timeframe) so slicing a sub-range
 * returns a consistent view.
 */
export function generateDemoSeries(
  symbol: string,
  timeframe: Timeframe,
): Candle[] {
  const def = getSymbolDefinition(symbol);
  if (!def) return [];

  const step = TIMEFRAME_MS[timeframe];
  const rand = mulberry32(hashString(`${symbol}:${timeframe}`));
  const precision = def.pricePrecision;
  const pip = new Decimal(def.pipSize);

  // Volatility/drift scaled to the timeframe (in pips).
  const stepsPerHour = 3_600_000 / step;
  const vol = pip.times(Math.max(6, 30 / Math.sqrt(stepsPerHour)));

  const candles: Candle[] = [];
  let close = new Decimal(def.demoBasePrice);

  for (let t = DEMO_RANGE_START; t < DEMO_RANGE_END; t += step) {
    const open = close;
    // Mean-reverting random walk so prices stay in a believable band.
    const shock = vol.times(rand() - 0.5).times(2);
    const reversion = new Decimal(def.demoBasePrice)
      .minus(open)
      .times(0.02);
    close = open.plus(shock).plus(reversion);

    const wickUp = vol.times(rand() * 0.6);
    const wickDown = vol.times(rand() * 0.6);
    const high = Decimal.max(open, close).plus(wickUp);
    const low = Decimal.min(open, close).minus(wickDown);
    const volume = new Decimal(200).plus(Math.floor(rand() * 800));

    candles.push({
      timestamp: t,
      open: open.toFixed(precision),
      high: high.toFixed(precision),
      low: low.toFixed(precision),
      close: close.toFixed(precision),
      volume: volume.toFixed(0),
      source: DEMO_SOURCE,
    });
  }

  return candles;
}
