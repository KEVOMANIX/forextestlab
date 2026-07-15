/**
 * Candle validation, de-duplication, and gap detection.
 *
 * All OHLC relationship checks use decimal.js (via @/lib/decimal) rather than
 * native float comparisons. Nothing here throws on bad data — every function
 * returns a structured result.
 */

import { d, isFiniteNumeric } from "@/lib/decimal";
import type { Candle, Timeframe } from "@/lib/market-data/types";
import { TIMEFRAME_MS } from "@/lib/market-data/types";

export interface RowValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * True when open/high/low/close are all finite numeric and satisfy:
 *   high >= max(open, close, low) and low <= min(open, close, high).
 */
export function isValidOhlc(
  open: string,
  high: string,
  low: string,
  close: string,
): boolean {
  if (
    !isFiniteNumeric(open) ||
    !isFiniteNumeric(high) ||
    !isFiniteNumeric(low) ||
    !isFiniteNumeric(close)
  ) {
    return false;
  }

  const o = d(open);
  const h = d(high);
  const l = d(low);
  const c = d(close);

  const maxOCL = o.greaterThan(c) ? o : c;
  const highFloor = maxOCL.greaterThan(l) ? maxOCL : l;
  if (h.lessThan(highFloor)) return false;

  const minOCH = o.lessThan(c) ? o : c;
  const lowCeil = minOCH.lessThan(h) ? minOCH : h;
  if (l.greaterThan(lowCeil)) return false;

  return true;
}

/** Validate a single candle's timestamp, OHLC, and any present bid/ask fields. */
export function validateCandle(candle: Candle): RowValidationResult {
  const errors: string[] = [];

  if (!Number.isFinite(candle.timestamp) || candle.timestamp <= 0) {
    errors.push("timestamp must be a finite number greater than 0");
  }

  const ohlc: Array<[string, string]> = [
    ["open", candle.open],
    ["high", candle.high],
    ["low", candle.low],
    ["close", candle.close],
  ];
  for (const [name, value] of ohlc) {
    if (!isFiniteNumeric(value)) {
      errors.push(`${name} is not a finite numeric value: "${value}"`);
    }
  }

  if (
    isFiniteNumeric(candle.open) &&
    isFiniteNumeric(candle.high) &&
    isFiniteNumeric(candle.low) &&
    isFiniteNumeric(candle.close) &&
    !isValidOhlc(candle.open, candle.high, candle.low, candle.close)
  ) {
    errors.push("OHLC relationship invalid (high/low bounds violated)");
  }

  const optional: Array<[string, string | undefined]> = [
    ["volume", candle.volume],
    ["bidOpen", candle.bidOpen],
    ["bidHigh", candle.bidHigh],
    ["bidLow", candle.bidLow],
    ["bidClose", candle.bidClose],
    ["askOpen", candle.askOpen],
    ["askHigh", candle.askHigh],
    ["askLow", candle.askLow],
    ["askClose", candle.askClose],
  ];
  for (const [name, value] of optional) {
    if (value !== undefined && !isFiniteNumeric(value)) {
      errors.push(`${name} is not a finite numeric value: "${value}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

export interface DedupeResult {
  candles: Candle[];
  duplicates: number;
}

/**
 * Sort candles ascending by timestamp. On duplicate timestamps, keep the LAST
 * occurrence (by original array order). `duplicates` counts removed candles.
 */
export function dedupeAndSort(candles: Candle[]): DedupeResult {
  const byTimestamp = new Map<number, Candle>();
  let duplicates = 0;

  for (const candle of candles) {
    if (byTimestamp.has(candle.timestamp)) duplicates += 1;
    byTimestamp.set(candle.timestamp, candle);
  }

  const sorted = [...byTimestamp.values()].sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  return { candles: sorted, duplicates };
}

export interface GapReport {
  expectedIntervals: number;
  missing: number;
  gaps: Array<{ from: number; to: number }>;
}

/**
 * Detect gaps in a sorted candle series. Assumes candles are sorted ascending.
 * The expected step is TIMEFRAME_MS[timeframe]; any pair of consecutive candles
 * more than one step apart is reported as a gap (`from`/`to` are the timestamps
 * bracketing the gap). `expectedIntervals` is the number of steps that should
 * exist between first and last; `missing` is how many are absent.
 */
export function detectGaps(
  candles: Candle[],
  timeframe: Timeframe,
): GapReport {
  const step = TIMEFRAME_MS[timeframe];
  const gaps: Array<{ from: number; to: number }> = [];

  if (candles.length < 2) {
    return { expectedIntervals: 0, missing: 0, gaps };
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  if (first === undefined || last === undefined) {
    return { expectedIntervals: 0, missing: 0, gaps };
  }

  const expectedIntervals = Math.round((last.timestamp - first.timestamp) / step);
  let missing = 0;

  for (let i = 1; i < candles.length; i += 1) {
    const prev = candles[i - 1];
    const curr = candles[i];
    if (prev === undefined || curr === undefined) continue;

    const delta = curr.timestamp - prev.timestamp;
    if (delta > step) {
      const stepsApart = Math.round(delta / step);
      missing += stepsApart - 1;
      gaps.push({ from: prev.timestamp, to: curr.timestamp });
    }
  }

  return { expectedIntervals, missing, gaps };
}
