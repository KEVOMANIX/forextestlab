import type { Candle } from "./types";

/** HistData Generic ASCII M1 uses fixed EST (UTC-05:00), with no DST change. */
export function parseHistDataMinute(line: string): Candle | null {
  const parts = line.trim().split(";");
  if (parts.length !== 6) return null;
  const match = /^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})(\d{2})$/.exec(parts[0] ?? "");
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const estClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  const date = new Date(estClock);
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour) || date.getUTCMinutes() !== Number(minute) || Number(second) !== 0) return null;
  const prices = parts.slice(1, 5).map((part) => Number(part));
  const [open, high, low, close] = prices;
  if (prices.some((price) => !Number.isFinite(price) || price <= 0) || open === undefined || high === undefined || low === undefined || close === undefined
    || high < Math.max(open, close, low) || low > Math.min(open, close, high)) return null;
  const timestamp = estClock + 5 * 60 * 60_000;
  return {
    timestamp,
    open: parts[1]!.trim(),
    high: parts[2]!.trim(),
    low: parts[3]!.trim(),
    close: parts[4]!.trim(),
    // HistData M1 is bid OHLC. Its volume field is not reliable tick volume.
    source: "histdata-r2",
  };
}

export function histDataMonthKey(prefix: string, symbol: string, timestamp: number): string {
  const date = new Date(timestamp);
  return `${prefix}/${symbol}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}.parquet`;
}
