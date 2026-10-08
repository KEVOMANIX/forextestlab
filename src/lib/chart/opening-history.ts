import type { Candle } from "@/lib/market-data/types";
import type { OHLCV } from "./indicators";

/** An overlapping history fragment must not paint a second candle underneath
 * the merged replay candle (possibly with an opposite body colour). */
export function historyBeforeReplay(history: Candle[], replay: OHLCV[]): Candle[] {
  const first = replay[0]?.time;
  return first === undefined ? history : history.filter(c => c.timestamp / 1000 < first);
}

/** Join the pre-replay portion of the first bucket to its revealed portion.
 * History must have been fetched strictly before the first replay minute. */
export function mergeOpeningHistoryBucket(history: Candle[], replay: OHLCV[]): OHLCV[] {
  const first = replay[0];
  const prior = history.at(-1);
  if (!first || !prior || Math.floor(prior.timestamp / 1000) !== first.time) return replay;
  const volume = prior.volume === undefined && first.volume === undefined
    ? undefined : Number(prior.volume ?? 0) + (first.volume ?? 0);
  return [{ ...first, open: Number(prior.open), high: Math.max(Number(prior.high), first.high), low: Math.min(Number(prior.low), first.low), volume }, ...replay.slice(1)];
}
