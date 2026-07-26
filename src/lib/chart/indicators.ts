/**
 * Pure technical-indicator math for the price chart. No chart/React imports —
 * every function takes plain numbers/candles so it can be unit-tested in
 * isolation and reused by the indicator framework (see `indicator-defs.ts`).
 *
 * Series are index-aligned to the input candles; positions without enough
 * lookback are `null` so the chart can skip them (a gap, not a zero). Formulas
 * follow TradingView conventions (Wilder smoothing for RSI/ATR/ADX, etc.) so
 * outputs are near-identical to the platform's built-ins.
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
export type PriceSource = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";

/** Extract the chosen price source from candles (close, hl2, hlc3, …). */
export function pickSource(candles: OHLCV[], source: PriceSource): number[] {
  switch (source) {
    case "open": return candles.map((c) => c.open);
    case "high": return candles.map((c) => c.high);
    case "low": return candles.map((c) => c.low);
    case "hl2": return candles.map((c) => (c.high + c.low) / 2);
    case "hlc3": return candles.map((c) => (c.high + c.low + c.close) / 3);
    case "ohlc4": return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
    default: return candles.map((c) => c.close);
  }
}

// ── Moving averages ────────────────────────────────────────────────────────

export function sma(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (period < 1) return out;
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
  if (!values.length || period < 1) return out;
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

/** Linear weighted moving average — most recent bar weighted heaviest. */
export function wma(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (period < 1) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < values.length; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) acc += values[i - j]! * (period - j);
    out[i] = acc / denom;
  }
  return out;
}

/** Hull moving average: WMA(2·WMA(n/2) − WMA(n), √n). Fast + smooth. */
export function hma(values: number[], period: number): MaybeNumber[] {
  if (period < 2) return sma(values, Math.max(1, period));
  const half = wma(values, Math.floor(period / 2));
  const full = wma(values, period);
  const raw = values.map((_, i) => (half[i] != null && full[i] != null ? 2 * half[i]! - full[i]! : null));
  // Feed only the defined tail into the final WMA, then re-align.
  const firstDefined = raw.findIndex((v) => v != null);
  if (firstDefined < 0) return new Array(values.length).fill(null);
  const tail = raw.slice(firstDefined).map((v) => (v ?? 0));
  const smoothed = wma(tail, Math.max(1, Math.round(Math.sqrt(period))));
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  for (let i = 0; i < smoothed.length; i++) out[firstDefined + i] = smoothed[i] ?? null;
  return out;
}

/** Wilder's smoothing (RMA / SMMA) — the recursive average behind RSI/ATR/ADX. */
export function rma(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i]!;
  let prev = sum / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (prev * (period - 1) + values[i]!) / period;
    out[i] = prev;
  }
  return out;
}

/** Named moving-average dispatcher used by the "smoothing type" input. */
export function movingAverage(values: number[], period: number, type: "SMA" | "EMA" | "WMA" | "RMA"): MaybeNumber[] {
  switch (type) {
    case "EMA": return ema(values, period);
    case "WMA": return wma(values, period);
    case "RMA": return rma(values, period);
    default: return sma(values, period);
  }
}

// ── Rolling extremes / deviation ─────────────────────────────────────────────

function highest(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let m = -Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j]! > m) m = values[j]!;
    out[i] = m;
  }
  return out;
}

function lowest(values: number[], period: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    let m = Infinity;
    for (let j = i - period + 1; j <= i; j++) if (values[j]! < m) m = values[j]!;
    out[i] = m;
  }
  return out;
}

/** Rolling (population) standard deviation. */
export function stdev(values: number[], period: number): MaybeNumber[] {
  const mid = sma(values, period);
  return values.map((_, i) => {
    const m = mid[i];
    if (m == null) return null;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j]! - m) ** 2;
    return Math.sqrt(variance / period);
  });
}

// ── Bands / channels ─────────────────────────────────────────────────────────

export interface Band {
  upper: MaybeNumber;
  middle: MaybeNumber;
  lower: MaybeNumber;
}

export function bollinger(values: number[], period = 20, mult = 2): Band[] {
  const mid = sma(values, period);
  const sd = stdev(values, period);
  return values.map((_, i) => {
    const m = mid[i];
    const s = sd[i];
    if (m == null || s == null) return { upper: null, middle: null, lower: null };
    return { upper: m + mult * s, middle: m, lower: m - mult * s };
  });
}

export function keltner(candles: OHLCV[], emaPeriod = 20, atrPeriod = 10, mult = 2): Band[] {
  const mid = ema(pickSource(candles, "close"), emaPeriod);
  const range = atr(candles, atrPeriod);
  return candles.map((_, i) => {
    const m = mid[i];
    const a = range[i];
    if (m == null || a == null) return { upper: null, middle: null, lower: null };
    return { upper: m + mult * a, middle: m, lower: m - mult * a };
  });
}

export function donchian(candles: OHLCV[], period = 20): Band[] {
  const hi = highest(candles.map((c) => c.high), period);
  const lo = lowest(candles.map((c) => c.low), period);
  return candles.map((_, i) => {
    const u = hi[i];
    const l = lo[i];
    if (u == null || l == null) return { upper: null, middle: null, lower: null };
    return { upper: u, middle: (u + l) / 2, lower: l };
  });
}

// ── Volatility ───────────────────────────────────────────────────────────────

/** True range for each bar (needs the previous close). */
function trueRange(candles: OHLCV[]): number[] {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1]!.close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

/** Wilder's Average True Range. */
export function atr(candles: OHLCV[], period = 14): MaybeNumber[] {
  return rma(trueRange(candles), period);
}

// ── VWAP ─────────────────────────────────────────────────────────────────────

/** Cumulative VWAP over all provided candles (no session reset). */
export function vwap(candles: OHLCV[]): MaybeNumber[] {
  let cumPV = 0;
  let cumV = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume && c.volume > 0 ? c.volume : 1; // forex often lacks volume → tick-equal
    cumPV += typical * v;
    cumV += v;
    return cumV ? cumPV / cumV : null;
  });
}

/** Session VWAP — resets at each UTC-day boundary. Returns line + ±σ bands. */
export function sessionVwap(candles: OHLCV[], bandMult = 1): { vwap: MaybeNumber[]; upper: MaybeNumber[]; lower: MaybeNumber[] } {
  const line: MaybeNumber[] = new Array(candles.length).fill(null);
  const upper: MaybeNumber[] = new Array(candles.length).fill(null);
  const lower: MaybeNumber[] = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  let cumPV2 = 0;
  let day = -1;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const d = Math.floor(c.time / 86400);
    if (d !== day) {
      day = d;
      cumPV = 0;
      cumV = 0;
      cumPV2 = 0;
    }
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume && c.volume > 0 ? c.volume : 1;
    cumPV += typical * v;
    cumPV2 += typical * typical * v;
    cumV += v;
    if (!cumV) continue;
    const mean = cumPV / cumV;
    line[i] = mean;
    const variance = Math.max(0, cumPV2 / cumV - mean * mean);
    const sd = Math.sqrt(variance);
    upper[i] = mean + bandMult * sd;
    lower[i] = mean - bandMult * sd;
  }
  return { vwap: line, upper, lower };
}

/** Anchored VWAP — cumulative from `anchorIndex` onward (bars before are null). */
export function anchoredVwap(candles: OHLCV[], anchorIndex: number): MaybeNumber[] {
  const out: MaybeNumber[] = new Array(candles.length).fill(null);
  let cumPV = 0;
  let cumV = 0;
  for (let i = Math.max(0, anchorIndex); i < candles.length; i++) {
    const c = candles[i]!;
    const typical = (c.high + c.low + c.close) / 3;
    const v = c.volume && c.volume > 0 ? c.volume : 1;
    cumPV += typical * v;
    cumV += v;
    out[i] = cumV ? cumPV / cumV : null;
  }
  return out;
}

// ── Trend ─────────────────────────────────────────────────────────────────────

export interface SupertrendPoint {
  value: MaybeNumber;
  /** true = uptrend (support below price), false = downtrend, null = warmup. */
  up: boolean | null;
}

export function supertrend(candles: OHLCV[], period = 10, mult = 3): SupertrendPoint[] {
  const range = atr(candles, period);
  const out: SupertrendPoint[] = candles.map(() => ({ value: null, up: null }));
  let finalUpper = 0;
  let finalLower = 0;
  let prevUpper = 0;
  let prevLower = 0;
  let up = true;
  for (let i = 0; i < candles.length; i++) {
    const a = range[i];
    if (a == null) continue;
    const c = candles[i]!;
    const mid = (c.high + c.low) / 2;
    const basicUpper = mid + mult * a;
    const basicLower = mid - mult * a;
    const prevClose = candles[i - 1]?.close ?? c.close;
    finalUpper = basicUpper < prevUpper || prevClose > prevUpper ? basicUpper : prevUpper;
    finalLower = basicLower > prevLower || prevClose < prevLower ? basicLower : prevLower;
    if (range[i - 1] == null) {
      up = c.close >= mid;
    } else if (up) {
      up = c.close >= finalLower;
    } else {
      up = c.close > finalUpper;
    }
    out[i] = { value: up ? finalLower : finalUpper, up };
    prevUpper = finalUpper;
    prevLower = finalLower;
  }
  return out;
}

export interface IchimokuLines {
  tenkan: MaybeNumber[];
  kijun: MaybeNumber[];
  spanA: MaybeNumber[];
  spanB: MaybeNumber[];
  chikou: MaybeNumber[];
}

/**
 * Ichimoku Cloud. Senkou spans are displaced `displacement` bars forward and
 * Chikou `displacement` bars back — displacement is applied within the candle
 * range (no projection past the last candle, which v4 can't time-index).
 */
export function ichimoku(candles: OHLCV[], tenkanLen = 9, kijunLen = 26, senkouBLen = 52, displacement = 26): IchimokuLines {
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const midChannel = (len: number): MaybeNumber[] => {
    const hi = highest(highs, len);
    const lo = lowest(lows, len);
    return candles.map((_, i) => (hi[i] != null && lo[i] != null ? (hi[i]! + lo[i]!) / 2 : null));
  };
  const tenkan = midChannel(tenkanLen);
  const kijun = midChannel(kijunLen);
  const spanARaw = candles.map((_, i) => (tenkan[i] != null && kijun[i] != null ? (tenkan[i]! + kijun[i]!) / 2 : null));
  const spanBRaw = midChannel(senkouBLen);
  const shiftForward = (arr: MaybeNumber[]): MaybeNumber[] => {
    const out: MaybeNumber[] = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) if (i + displacement < arr.length) out[i + displacement] = arr[i] ?? null;
    return out;
  };
  const shiftBack = (arr: MaybeNumber[]): MaybeNumber[] => {
    const out: MaybeNumber[] = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++) if (i - displacement >= 0) out[i - displacement] = arr[i] ?? null;
    return out;
  };
  return {
    tenkan,
    kijun,
    spanA: shiftForward(spanARaw),
    spanB: shiftForward(spanBRaw),
    chikou: shiftBack(candles.map((c) => c.close)),
  };
}

// ── Momentum / oscillators ────────────────────────────────────────────────────

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

export interface StochPoint {
  k: MaybeNumber;
  d: MaybeNumber;
}

/** Stochastic oscillator — raw %K over `kPeriod`, smoothed by `kSmooth`, %D = SMA(%K, dPeriod). */
export function stochastic(candles: OHLCV[], kPeriod = 14, kSmooth = 3, dPeriod = 3): StochPoint[] {
  const hi = highest(candles.map((c) => c.high), kPeriod);
  const lo = lowest(candles.map((c) => c.low), kPeriod);
  const rawK: number[] = [];
  const rawIdx: number[] = [];
  candles.forEach((c, i) => {
    if (hi[i] == null || lo[i] == null) return;
    const range = hi[i]! - lo[i]!;
    rawK.push(range === 0 ? 100 : (100 * (c.close - lo[i]!)) / range);
    rawIdx.push(i);
  });
  const kSmoothed = sma(rawK, kSmooth);
  const dSmoothed = sma(kSmoothed.map((v) => v ?? 0), dPeriod);
  const out: StochPoint[] = candles.map(() => ({ k: null, d: null }));
  rawIdx.forEach((i, j) => {
    out[i] = { k: kSmoothed[j] ?? null, d: kSmoothed[j] == null ? null : dSmoothed[j] ?? null };
  });
  return out;
}

/** Stochastic RSI — stochastic of the RSI series. */
export function stochRsi(values: number[], rsiLen = 14, stochLen = 14, kSmooth = 3, dSmooth = 3): StochPoint[] {
  const r = rsi(values, rsiLen);
  const defined: number[] = [];
  const idx: number[] = [];
  r.forEach((v, i) => {
    if (v != null) {
      defined.push(v);
      idx.push(i);
    }
  });
  const hi = highest(defined, stochLen);
  const lo = lowest(defined, stochLen);
  const rawK = defined.map((v, i) => {
    if (hi[i] == null || lo[i] == null) return null;
    const range = hi[i]! - lo[i]!;
    return range === 0 ? 0 : (100 * (v - lo[i]!)) / range;
  });
  const kSmoothed = sma(rawK.map((v) => v ?? 0), kSmooth);
  const dSmoothed = sma(kSmoothed.map((v) => v ?? 0), dSmooth);
  const out: StochPoint[] = values.map(() => ({ k: null, d: null }));
  idx.forEach((i, j) => {
    if (rawK[j] == null) return;
    out[i] = { k: kSmoothed[j] ?? null, d: dSmoothed[j] ?? null };
  });
  return out;
}

/** Commodity Channel Index. */
export function cci(candles: OHLCV[], period = 20): MaybeNumber[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const tpSma = sma(tp, period);
  return candles.map((_, i) => {
    const m = tpSma[i];
    if (m == null) return null;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j]! - m);
    const meanDev = dev / period;
    return meanDev === 0 ? 0 : (tp[i]! - m) / (0.015 * meanDev);
  });
}

/** Williams %R. */
export function williamsR(candles: OHLCV[], period = 14): MaybeNumber[] {
  const hi = highest(candles.map((c) => c.high), period);
  const lo = lowest(candles.map((c) => c.low), period);
  return candles.map((c, i) => {
    if (hi[i] == null || lo[i] == null) return null;
    const range = hi[i]! - lo[i]!;
    return range === 0 ? 0 : (-100 * (hi[i]! - c.close)) / range;
  });
}

/** Rate of Change (percent). */
export function roc(values: number[], period = 9): MaybeNumber[] {
  return values.map((v, i) => {
    if (i < period) return null;
    const past = values[i - period]!;
    return past === 0 ? null : (100 * (v - past)) / past;
  });
}

export interface AdxPoint {
  plusDI: MaybeNumber;
  minusDI: MaybeNumber;
  adx: MaybeNumber;
}

/** Average Directional Index with the full DMI (+DI / −DI / ADX), Wilder-smoothed. */
export function adx(candles: OHLCV[], diLen = 14, adxLen = 14): AdxPoint[] {
  const n = candles.length;
  const tr: number[] = new Array(n).fill(0);
  const plusDM: number[] = new Array(n).fill(0);
  const minusDM: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const c = candles[i]!;
    const p = candles[i - 1]!;
    const upMove = c.high - p.high;
    const downMove = p.low - c.low;
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }
  // Wilder-smooth from index 1 onward (index 0 has no movement).
  const trS = rma(tr.slice(1), diLen);
  const plusS = rma(plusDM.slice(1), diLen);
  const minusS = rma(minusDM.slice(1), diLen);
  const plusDI: MaybeNumber[] = new Array(n).fill(null);
  const minusDI: MaybeNumber[] = new Array(n).fill(null);
  const dx: number[] = [];
  const dxIdx: number[] = [];
  for (let j = 0; j < trS.length; j++) {
    const i = j + 1;
    if (trS[j] == null || trS[j] === 0) continue;
    const pdi = (100 * plusS[j]!) / trS[j]!;
    const mdi = (100 * minusS[j]!) / trS[j]!;
    plusDI[i] = pdi;
    minusDI[i] = mdi;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
    dxIdx.push(i);
  }
  const adxS = rma(dx, adxLen);
  const out: AdxPoint[] = candles.map((_, i) => ({ plusDI: plusDI[i] ?? null, minusDI: minusDI[i] ?? null, adx: null }));
  dxIdx.forEach((i, j) => {
    out[i] = { plusDI: plusDI[i] ?? null, minusDI: minusDI[i] ?? null, adx: adxS[j] ?? null };
  });
  return out;
}

// ── Volume ─────────────────────────────────────────────────────────────────────

/** On-Balance Volume — running cumulative. */
export function obv(candles: OHLCV[]): MaybeNumber[] {
  let acc = 0;
  return candles.map((c, i) => {
    const v = c.volume ?? 0;
    if (i > 0) {
      const pc = candles[i - 1]!.close;
      if (c.close > pc) acc += v;
      else if (c.close < pc) acc -= v;
    }
    return acc;
  });
}

/** Money Flow Index — volume-weighted RSI. */
export function mfi(candles: OHLCV[], period = 14): MaybeNumber[] {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const rawFlow = candles.map((c, i) => tp[i]! * (c.volume ?? 0));
  const out: MaybeNumber[] = new Array(candles.length).fill(null);
  for (let i = period; i < candles.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j]! > tp[j - 1]!) pos += rawFlow[j]!;
      else if (tp[j]! < tp[j - 1]!) neg += rawFlow[j]!;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

/** Chaikin Money Flow — money-flow-volume over volume across the period. */
export function cmf(candles: OHLCV[], period = 20): MaybeNumber[] {
  const mfv = candles.map((c) => {
    const range = c.high - c.low;
    if (range === 0) return 0;
    return (((c.close - c.low) - (c.high - c.close)) / range) * (c.volume ?? 0);
  });
  const out: MaybeNumber[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let flow = 0;
    let vol = 0;
    for (let j = i - period + 1; j <= i; j++) {
      flow += mfv[j]!;
      vol += candles[j]!.volume ?? 0;
    }
    out[i] = vol === 0 ? 0 : flow / vol;
  }
  return out;
}

// ── Chart transforms ────────────────────────────────────────────────────────

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
