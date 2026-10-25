import type { Candle } from "@/lib/market-data/types";

/** Merge one symbol's sorted immutable archive. A late, shorter response cannot
 * truncate newer data or overwrite a newer copy of an existing timestamp. */
export function mergePairSeries(current: Candle[], incoming: Candle[]): Candle[] {
  if (!incoming.length) return current;
  if (!current.length) return incoming;
  const merged: Candle[] = [];
  let left = 0, right = 0;
  while (left < current.length && right < incoming.length) {
    const a = current[left]!, b = incoming[right]!;
    if (a.timestamp <= b.timestamp) {
      merged.push(a); left += 1;
      if (a.timestamp === b.timestamp) right += 1;
    } else { merged.push(b); right += 1; }
  }
  while (left < current.length) merged.push(current[left++]!);
  while (right < incoming.length) merged.push(incoming[right++]!);
  return merged;
}
