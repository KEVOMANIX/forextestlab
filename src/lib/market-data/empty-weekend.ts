import type { Candle } from "./types";
import { forexDailyStart, isForexDailyTradingDay } from "./forex-day";

const FX_CURRENCIES = new Set(["AUD", "CAD", "CHF", "EUR", "GBP", "JPY", "NZD", "USD"]);

/** Ignore source placeholders, never real quotes or a flat open-market candle. */
export function isEmptyForexWeekendCandle(symbol: string, candle: Candle): boolean {
  if (symbol.length !== 6 || !FX_CURRENCIES.has(symbol.slice(0, 3)) || !FX_CURRENCIES.has(symbol.slice(3))) return false;
  if (candle.volume === undefined || Number(candle.volume) !== 0) return false;
  const price = Number(candle.open);
  if (![candle.high, candle.low, candle.close].every(value => Number(value) === price)) return false;
  return !isForexDailyTradingDay(forexDailyStart(candle.timestamp));
}
