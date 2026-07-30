import type { Candle } from "@/lib/market-data/types";

export interface SymbolQuote {
  /** Close of the last candle the replay clock has reached. */
  last: number;
  /** Change against the previous close, or null when there is no previous candle. */
  change: number | null;
}

/**
 * The quote a symbol shows at the replay clock.
 *
 * Every price in the app is bounded by the replay cursor — showing a symbol's
 * real latest price next to a session replaying 2024 would be a lie about what
 * the trader is looking at. Candles are ascending, so this binary-searches
 * rather than scanning a full session series for each row of the symbol list.
 */
export function symbolQuoteAt(
  candles: Candle[],
  clock: number | null,
): SymbolQuote | null {
  if (clock == null || candles.length === 0) return null;

  let low = 0;
  let high = candles.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((candles[mid]?.timestamp ?? 0) <= clock) low = mid + 1;
    else high = mid;
  }
  if (low === 0) return null;

  const current = candles[low - 1];
  if (!current) return null;
  const last = Number(current.close);
  if (!Number.isFinite(last)) return null;

  const previous = low >= 2 ? candles[low - 2] : undefined;
  const previousClose = previous ? Number(previous.close) : NaN;
  return {
    last,
    change: Number.isFinite(previousClose) ? last - previousClose : null,
  };
}
