import "server-only";

import { buildIntrabarPath } from "@/lib/backtest/intrabar";
import { getSymbolDefinition } from "@/lib/market-data/symbols";
import { TIMEFRAME_MS, type Candle, type Timeframe } from "@/lib/market-data/types";

import { DAY_MS } from "./format";
import { readTicks, tickStoreEnabled } from "./store";

/** Longest a candle request waits for a first-time month download before going on without paths. */
const DEFAULT_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(null); });
  });
}

/**
 * Returns `candles` with an intrabar tick path on each candle `want(index)`
 * selects (all of them by default). Candles are copied, never mutated, since
 * providers cache theirs. Without the tick store, or without ticks for a span,
 * candles come back unchanged and every rule falls back to OHLC.
 */
export async function attachTickPaths(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  options: { want?: (index: number) => boolean; timeoutMs?: number } = {},
): Promise<Candle[]> {
  if (!tickStoreEnabled() || candles.length === 0) return candles;
  const definition = getSymbolDefinition(symbol);
  if (!definition) return candles;
  const pipSize = Number(definition.pipSize), precision = definition.pricePrecision;
  const span = TIMEFRAME_MS[timeframe];
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  // Read ticks one UTC day at a time, so a long, sparse series never holds
  // more than a day of ticks (plus one candle's overhang) in memory.
  const byDay = new Map<number, number[]>();
  candles.forEach((candle, index) => {
    if (options.want && !options.want(index)) return;
    const day = Math.floor(candle.timestamp / DAY_MS) * DAY_MS;
    const list = byDay.get(day);
    if (list) list.push(index); else byDay.set(day, [index]);
  });
  if (byDay.size === 0) return candles;

  const out = candles.slice();
  for (const [day, indexes] of [...byDay].sort((a, b) => a[0] - b[0])) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const last = candles[indexes[indexes.length - 1]!]!;
    const ticks = await withTimeout(readTicks(symbol, Math.min(day, candles[indexes[0]!]!.timestamp), Math.max(day + DAY_MS, last.timestamp + span)), remaining);
    if (!ticks || ticks.time.length === 0) continue;
    for (const index of indexes) {
      const candle = candles[index]!;
      const path = buildIntrabarPath(ticks, candle.timestamp, candle.timestamp + span, candle, pipSize, precision);
      if (path) out[index] = { ...candle, path };
    }
  }
  return out;
}

/**
 * For simulators (Exit Optimizer, plan tests, Strategy Lab): run once on plain
 * candles, attach paths only to the candles where both levels were hit, and
 * run again — repeating while the corrected outcomes expose new such candles.
 * Loads a handful of tick windows instead of every month a test spans.
 */
export async function simulateWithTickPaths<T>(
  candles: Candle[],
  symbol: string,
  timeframe: Timeframe,
  simulate: (candles: Candle[]) => { result: T; ambiguous: Set<number> },
  maxPasses = 3,
): Promise<T> {
  let current = candles;
  let pass = simulate(current);
  if (!tickStoreEnabled()) return pass.result;
  const tried = new Set<number>();
  for (let round = 0; round < maxPasses; round++) {
    const fresh = [...pass.ambiguous].filter((timestamp) => !tried.has(timestamp));
    if (fresh.length === 0) break;
    for (const timestamp of fresh) tried.add(timestamp);
    const wanted = new Set(fresh);
    const next = await attachTickPaths(current, symbol, timeframe, { want: (index) => wanted.has(current[index]!.timestamp) });
    if (next === current) break;
    current = next;
    pass = simulate(current);
  }
  return pass.result;
}
