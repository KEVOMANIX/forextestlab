/**
 * Tick data shared by the server tick store, the API and the browser.
 *
 * Ticks come from HistData's bid/ask archive (stored on the Oracle tick box,
 * one Parquet file per pair and month). Candles shown and traded in the app
 * come from the candle archive, which can differ from these ticks by a
 * fraction of a pip (or a few index points). Ticks are therefore used for
 * *where price went inside a candle, and in which order*, mapped onto that
 * candle's own range (see lib/backtest/intrabar.ts) — never as a second price.
 */

/** Ticks in time order. `time` is UTC milliseconds. */
export type TickSeries = { time: Float64Array; bid: Float64Array; ask: Float64Array };

export const EMPTY_TICKS: TickSeries = { time: new Float64Array(0), bid: new Float64Array(0), ask: new Float64Array(0) };

/**
 * App symbol -> tick archive symbol. Currency pairs and metals share a name;
 * the index CFDs use HistData's codes. Symbols with no tick archive are absent.
 */
const TICK_SYMBOL_ALIASES: Record<string, string> = {
  USATECHIDXUSD: "NSXUSD",
  USA500IDXUSD: "SPXUSD",
  DXY: "UDXUSD",
};

export function tickSymbolFor(symbol: string): string {
  const upper = symbol.toUpperCase();
  return TICK_SYMBOL_ALIASES[upper] ?? upper;
}

export const DAY_MS = 86_400_000;

/** `YYYY-MM` for a UTC time. */
export function monthKey(time: number): string {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Every `YYYY-MM` touched by [from, to). */
export function monthsBetween(from: number, to: number): string[] {
  const keys: string[] = [];
  const date = new Date(from);
  let year = date.getUTCFullYear(), month = date.getUTCMonth();
  while (Date.UTC(year, month, 1) < to || keys.length === 0) {
    keys.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month++;
    if (month === 12) { month = 0; year++; }
    if (keys.length > 600) break;
  }
  return keys;
}

/** Index of the first tick at or after `time` (binary search). */
export function lowerBound(times: ArrayLike<number>, time: number): number {
  let low = 0, high = times.length;
  while (low < high) { const mid = (low + high) >> 1; if (times[mid]! < time) low = mid + 1; else high = mid; }
  return low;
}

/** The ticks in [from, to), sharing the source buffers. */
export function sliceTicks(ticks: TickSeries, from: number, to: number): TickSeries {
  const start = lowerBound(ticks.time, from), end = lowerBound(ticks.time, to);
  return { time: ticks.time.subarray(start, end), bid: ticks.bid.subarray(start, end), ask: ticks.ask.subarray(start, end) };
}

/** Concatenates time-ordered, non-overlapping series. */
export function concatTicks(parts: TickSeries[]): TickSeries {
  const total = parts.reduce((sum, part) => sum + part.time.length, 0);
  const out = { time: new Float64Array(total), bid: new Float64Array(total), ask: new Float64Array(total) };
  let offset = 0;
  for (const part of parts) {
    out.time.set(part.time, offset); out.bid.set(part.bid, offset); out.ask.set(part.ask, offset);
    offset += part.time.length;
  }
  return out;
}

/*
 * Binary layout (little-endian), used for the per-day cache files and the API:
 *   0  "FTT1"            magic
 *   4  Uint32 count
 *   8  Float64 base      UTC ms; every time is base + offset
 *  16  Int32[count]      time offsets (ms) — a window is at most ~24 days
 *   …  pad to 8
 *   …  Float64[count]    bid
 *   …  Float32[count]    ask - bid
 */
const MAGIC = 0x31545446; // "FTT1"

function layout(count: number) {
  const times = 16;
  const bids = times + 4 * count + ((4 * count) % 8 === 0 ? 0 : 4);
  const spreads = bids + 8 * count;
  return { times, bids, spreads, bytes: spreads + 4 * count };
}

export function encodeTicks(ticks: TickSeries, base = ticks.time[0] ?? 0): ArrayBuffer {
  const count = ticks.time.length;
  const at = layout(count);
  const buffer = new ArrayBuffer(at.bytes);
  const view = new DataView(buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, count, true);
  view.setFloat64(8, base, true);
  const offsets = new Int32Array(buffer, at.times, count);
  const bids = new Float64Array(buffer, at.bids, count);
  const spreads = new Float32Array(buffer, at.spreads, count);
  for (let index = 0; index < count; index++) {
    offsets[index] = Math.round(ticks.time[index]! - base);
    bids[index] = ticks.bid[index]!;
    spreads[index] = ticks.ask[index]! - ticks.bid[index]!;
  }
  return buffer;
}

export function decodeTicks(input: ArrayBuffer | Uint8Array): TickSeries {
  // Typed views need an aligned, exclusively owned buffer.
  const buffer = input instanceof Uint8Array ? input.slice().buffer : input;
  if (buffer.byteLength < 16) throw new Error("Tick data is truncated.");
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("Not tick data.");
  const count = view.getUint32(4, true);
  const base = view.getFloat64(8, true);
  const at = layout(count);
  if (buffer.byteLength < at.bytes) throw new Error("Tick data is truncated.");
  const offsets = new Int32Array(buffer, at.times, count);
  const bids = new Float64Array(buffer, at.bids, count);
  const spreads = new Float32Array(buffer, at.spreads, count);
  const out = { time: new Float64Array(count), bid: new Float64Array(count), ask: new Float64Array(count) };
  for (let index = 0; index < count; index++) {
    out.time[index] = base + offsets[index]!;
    out.bid[index] = bids[index]!;
    // Float32 keeps the spread to well under a hundredth of a point.
    out.ask[index] = bids[index]! + Math.round(spreads[index]! * 1e6) / 1e6;
  }
  return out;
}

/** Splits a month (or any span) into UTC days: [dayStart, ticks][]. */
export function splitByDay(ticks: TickSeries): [number, TickSeries][] {
  const days: [number, TickSeries][] = [];
  let start = 0;
  while (start < ticks.time.length) {
    const day = Math.floor(ticks.time[start]! / DAY_MS) * DAY_MS;
    const end = lowerBound(ticks.time, day + DAY_MS);
    days.push([day, { time: ticks.time.subarray(start, end), bid: ticks.bid.subarray(start, end), ask: ticks.ask.subarray(start, end) }]);
    start = end;
  }
  return days;
}
