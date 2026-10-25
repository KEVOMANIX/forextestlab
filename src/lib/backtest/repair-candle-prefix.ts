import type { Candle } from "@/lib/market-data/types";
import type { SessionState } from "./types";

/** Insert verified missing candles without revising historical prices or
 * replaying trades. Remap saved indexes through their original timestamps so
 * progress, entries, exits, bookmarks, and deposits keep the same meaning.
 */
export function repairCandlePrefix(state: SessionState, original: Candle[], verified: Candle[]) {
  if (!original.length) throw new Error("Cannot repair an empty candle prefix");
  const byTime = new Map(original.map(candle => [candle.timestamp, candle]));
  for (const candle of verified) {
    if (candle.timestamp >= original[0]!.timestamp && candle.timestamp <= original.at(-1)!.timestamp && !byTime.has(candle.timestamp)) {
      byTime.set(candle.timestamp, candle);
    }
  }
  const candles = [...byTime.values()].sort((a, b) => a.timestamp - b.timestamp);
  const indexes = new Map(candles.map((candle, index) => [candle.timestamp, index]));
  const remap = (index: number) => {
    if (index < 0) return index;
    const candle = original[index];
    if (!candle) throw new Error(`Saved candle index ${index} is outside the original prefix`);
    return indexes.get(candle.timestamp)!;
  };
  const repaired = structuredClone(state);
  repaired.visibleIndex = remap(state.visibleIndex);
  repaired.lockedBeforeIndex = remap(state.lockedBeforeIndex);
  repaired.totalCandles = candles.length;
  for (const position of repaired.openPositions) position.entryIndex = remap(position.entryIndex);
  for (const order of repaired.pendingOrders) order.createdIndex = remap(order.createdIndex);
  for (const trade of repaired.closedTrades) {
    trade.entryIndex = remap(trade.entryIndex);
    trade.exitIndex = remap(trade.exitIndex);
  }
  for (const point of [...repaired.equityCurve, ...repaired.bookmarks, ...(repaired.topUps ?? [])]) point.index = remap(point.index);
  if (repaired.accountBlown) repaired.accountBlown.index = remap(repaired.accountBlown.index);
  return { state: repaired, candles, remap, inserted: candles.length - original.length };
}
