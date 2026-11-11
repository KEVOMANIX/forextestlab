import type { Candle, Timeframe } from "@/lib/market-data/types";

/**
 * Where chart Pine scripts get candles for request.security() on another
 * market or a lower timeframe. The backtester registers a loader for its
 * session; without one (no session) such scripts report that the data is
 * not available here.
 */
export type PineFeedLoader = (symbol: string, timeframe: Timeframe, from: number) => Promise<Candle[]>;

let loader: PineFeedLoader | null = null;

export function setPineFeedLoader(next: PineFeedLoader | null): () => void {
  loader = next;
  return () => { if (loader === next) loader = null; };
}

export function pineFeedLoader(): PineFeedLoader | null {
  return loader;
}
