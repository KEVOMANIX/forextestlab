/**
 * Pure technical-indicator math for the price chart. No chart/React imports —
 * every function takes plain numbers so it can be unit-tested in isolation.
 *
 * Series are index-aligned to the input candles; positions without enough
 * lookback are `null` so the chart can skip them (a gap, not a zero).
 */

export interface OHLCV {
  time: number; // seconds (UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type MaybeNumber = number | null;

export function sma(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (!values.length) return out;
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seed = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      seed += values[i]!;
      if (i === period - 1) {
        prev = seed / period;
        out[i] = prev;
      }
      continue;
    }
    prev = values[i]! * k + (prev as number) * (1 - k);
    out[i] = prev;
  }
  return out;
}

export interface BollingerBand {
  upper: MaybeNumber;
  middle: MaybeNumber;
  lower: MaybeNumber;
}

export function bollinger(values: number[], period = 20, mult = 2): BollingerBand[] {
  const mid = sma(values, period);
  return values.map((_, i) => {
    const m = mid[i];
    if (m == null) return { upper: null, middle: null, lower: null };
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j]! - m) ** 2;
    const sd = Math.sqrt(variance / period);
    return { upper: m + mult * sd, middle: m, lower: m - mult * sd };
  });
}

/** Session-agnostic cumulative VWAP over the provided candles. */
export function vwap(candles: OHLCV[]): MaybeNumber[] {
  let cumPV = 0;
  let cumV = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume && c.volume > 0 ? c.volume : 1; // forex often lacks volume → treat as tick-equal
    cumPV += typical * v;
    cumV += v;
    return cumV ? cumPV / cumV : null;
  });
}

export function rsi(values: number[], period = 14): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i]! - values[i - 1]!;
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i]! - values[i - 1]!;
    const g = diff >= 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export interface MacdPoint {
  macd: MaybeNumber;
  signal: MaybeNumber;
  hist: MaybeNumber;
}

export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const macdLine: MaybeNumber[] = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? (emaFast[i] as number) - (emaSlow[i] as number) : null,
  );
  // Signal = EMA of the (defined portion of the) MACD line.
  const defined = macdLine.filter((v): v is number => v != null);
  const signalDefined = ema(defined, signalPeriod);
  let cursor = 0;
  const signal: MaybeNumber[] = macdLine.map((v) => (v == null ? null : signalDefined[cursor++] ?? null));
  return macdLine.map((m, i) => ({
    macd: m,
    signal: signal[i]!,
    hist: m != null && signal[i] != null ? m - (signal[i] as number) : null,
  }));
}

/** Heikin-Ashi transform. Smooths noise; classic TradingView chart type. */
export function heikinAshi(candles: OHLCV[]): OHLCV[] {
  const out: OHLCV[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const close = (c.open + c.high + c.low + c.close) / 4;
    const prev = out[i - 1];
    const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    out.push({
      time: c.time,
      open,
      close,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      volume: c.volume,
    });
  }
  return out;
}
