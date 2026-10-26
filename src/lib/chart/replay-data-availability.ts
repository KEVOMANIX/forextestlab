/** Check the source interval, not the display timeframe or the historical viewport. */
export function hasCandleAtReplayTime(
  candles: readonly { timestamp: number }[] | null,
  clock: number | null,
  intervalMs: number,
): boolean {
  if (clock == null) return true;
  if (!candles?.length) return false;
  let low = 0, high = candles.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (candles[mid]!.timestamp <= clock) low = mid + 1;
    else high = mid;
  }
  const last = candles[low - 1];
  return last != null && clock < last.timestamp + intervalMs;
}
