/**
 * Provider-independent market-data types.
 *
 * Prices are represented as decimal STRINGS (never JS numbers) so that no
 * floating-point error is introduced anywhere in storage or transport. All
 * arithmetic is performed with decimal.js in the backtest engine.
 */

export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d";

export const TIMEFRAMES: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
];

/** Duration of one candle of the given timeframe, in milliseconds (UTC). */
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

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
  /** Where this candle came from, e.g. "demo", "manual-import", "twelvedata". */
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
  "Demonstration data generated for software testing. It is not live market data.";
