/**
 * Provider-independent market-data types.
 *
 * Prices are represented as decimal STRINGS (never JS numbers) so that no
 * floating-point error is introduced anywhere in storage or transport. All
 * arithmetic is performed with decimal.js in the backtest engine.
 */

export type Timeframe =
  | "1m"
  | "3m"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "45m"
  | "1h"
  | "2h"
  | "4h"
  | "6h"
  | "12h"
  | "1d"
  | "1w"
  | "1M"
  | "3M"
  | "4M"
  | "6M"
  | "1yr";

export const TIMEFRAMES: Timeframe[] = [
  "1m",
  "3m",
  "5m",
  "10m",
  "15m",
  "30m",
  "45m",
  "1h",
  "2h",
  "4h",
  "6h",
  "12h",
  "1d",
  "1w",
  "1M",
  "3M",
  "4M",
  "6M",
  "1yr",
];

/**
 * Nominal candle duration in milliseconds. Month/year values are used only
 * for sizing and cadence estimates; their real boundaries are calendar based.
 */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "10m": 10 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "45m": 45 * 60_000,
  "1h": 60 * 60_000,
  "2h": 2 * 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
  "1M": 30 * 24 * 60 * 60_000,
  "3M": 90 * 24 * 60 * 60_000,
  "4M": 120 * 24 * 60 * 60_000,
  "6M": 180 * 24 * 60 * 60_000,
  "1yr": 365 * 24 * 60 * 60_000,
};

const CALENDAR_TIMEFRAME_MONTHS: Partial<Record<Timeframe, number>> = {
  "1M": 1,
  "3M": 3,
  "4M": 4,
  "6M": 6,
  "1yr": 12,
};

/** Number of real calendar months in a calendar-aligned timeframe. */
export function calendarMonthsForTimeframe(timeframe: Timeframe): number | null {
  return CALENDAR_TIMEFRAME_MONTHS[timeframe] ?? null;
}

export function isCalendarTimeframe(timeframe: Timeframe): boolean {
  return calendarMonthsForTimeframe(timeframe) !== null;
}

/** Whether source candles can be grouped without crossing target boundaries. */
export function canAggregateTimeframes(from: Timeframe, to: Timeframe): boolean {
  if (from === to) return true;
  const targetMonths = calendarMonthsForTimeframe(to);
  if (targetMonths !== null) {
    const sourceMonths = calendarMonthsForTimeframe(from);
    if (sourceMonths !== null) {
      return targetMonths > sourceMonths && targetMonths % sourceMonths === 0;
    }
    return TIMEFRAME_MS[from] <= TIMEFRAME_MS["1d"];
  }
  if (isCalendarTimeframe(from)) return false;
  return TIMEFRAME_MS[to] > TIMEFRAME_MS[from] && TIMEFRAME_MS[to] % TIMEFRAME_MS[from] === 0;
}

/** Move by whole candle boundaries, respecting real UTC months and years. */
export function nextTimeframeTimestamp(timestampMs: number, timeframe: Timeframe, count = 1): number {
  const calendarMonths = calendarMonthsForTimeframe(timeframe);
  if (calendarMonths !== null) {
    const date = new Date(timestampMs);
    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + calendarMonths * count,
      1,
    );
  }
  return timestampMs + TIMEFRAME_MS[timeframe] * count;
}

/**
 * Whether a candle boundary belongs to the tradable forex week.
 *
 * Intraday markets reopen Sunday evening. Because candles are UTC-aligned, the
 * first valid boundary is the bucket containing 21:00 UTC (for example 20:00
 * on 4h, 18:00 on 6h). Daily and higher charts use Monday-Friday boundaries.
 * This intentionally models the stable weekly closure rather than a broker's
 * DST-sensitive exact open minute.
 */
export function isForexSessionTimestamp(timestampMs: number, timeframe: Timeframe): boolean {
  if (timeframe === "1w" || isCalendarTimeframe(timeframe)) return true;
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  if (TIMEFRAME_MS[timeframe] >= TIMEFRAME_MS["1d"]) return day >= 1 && day <= 5;
  if (day === 6) return false;
  const step = TIMEFRAME_MS[timeframe];
  const offset = date.getUTCHours() * 3_600_000 + date.getUTCMinutes() * 60_000 + date.getUTCSeconds() * 1_000;
  const openBucket = Math.floor((21 * 3_600_000) / step) * step;
  if (day === 0) return offset >= openBucket;
  if (day === 5) return offset <= openBucket;
  return true;
}

/** Move by tradable forex candle boundaries, compressing the weekend closure. */
export function nextForexTimeframeTimestamp(timestampMs: number, timeframe: Timeframe, count = 1): number {
  let current = timestampMs;
  const direction = count < 0 ? -1 : 1;
  let remaining = Math.abs(count);
  while (remaining > 0) {
    current = nextTimeframeTimestamp(current, timeframe, direction);
    if (isForexSessionTimestamp(current, timeframe)) remaining -= 1;
  }
  return current;
}

/** Count whole timeframe intervals between two aligned candle timestamps. */
export function timeframeIntervalsBetween(fromMs: number, toMs: number, timeframe: Timeframe): number {
  const calendarMonths = calendarMonthsForTimeframe(timeframe);
  if (calendarMonths !== null) {
    const from = new Date(fromMs);
    const to = new Date(toMs);
    const months =
      (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
      to.getUTCMonth() -
      from.getUTCMonth();
    return Math.round(months / calendarMonths);
  }
  return Math.round((toMs - fromMs) / TIMEFRAME_MS[timeframe]);
}

export function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === "string" && (TIMEFRAMES as string[]).includes(value);
}

export interface MarketSymbol {
  symbol: string;
  displayName: string;
  baseCurrency: string;
  quoteCurrency: string;
  /** Value of one pip as a decimal string, e.g. "0.0001" or "0.01" for JPY. */
  pipSize: string;
  pricePrecision: number;
  enabled: boolean;
}

export interface Candle {
  /** UTC epoch milliseconds at the candle open. */
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
  bidOpen?: string;
  bidHigh?: string;
  bidLow?: string;
  bidClose?: string;
  askOpen?: string;
  askHigh?: string;
  askLow?: string;
  askClose?: string;
  /** Where this candle came from, e.g. "demo", "manual-import", "dukascopy-r2". */
  source: string;
}

export interface CandleRequest {
  symbol: string;
  timeframe: Timeframe;
  startTime: number;
  endTime: number;
  limit?: number;
}

export interface DataRange {
  startTime: number;
  endTime: number;
}

export interface MarketDataProvider {
  getAvailableSymbols(): Promise<MarketSymbol[]>;
  getAvailableRanges(
    symbol: string,
    timeframe: Timeframe,
  ): Promise<DataRange[]>;
  getCandles(request: CandleRequest): Promise<Candle[]>;
}

/** Human-readable notice attached to synthetic data. */
export const DEMO_DATA_LABEL =
  "Sample data generated for software testing. It is not live market data.";
