import { TIMEFRAME_MS, type Timeframe } from "@/lib/market-data/types";
import type { ReplaySpeed } from "./types";

const MIN_BUFFER_CANDLES = 1_500;
const MIN_BUFFER_SECONDS = 30;
const LATENCY_SAFETY_MULTIPLIER = 4;
/**
 * Ceiling on the client-side lookahead buffer, and — doing double duty — how
 * far past the reveal cursor the server will ever put real OHLC values in a
 * response. A trader's own browser only ever holds enough of the future to
 * keep the fastest replay speed from stalling on a slow connection, never the
 * rest of the session.
 */
export const MAX_BUFFER_CANDLES = 6_000;

/**
 * Keep enough already-downloaded candles to survive both the fastest replay
 * speed and a slow R2/server round trip. The minimum is one complete server
 * page; the adaptive portion keeps four observed round trips in reserve.
 */
export function replayBufferTargetCandles(
  speed: ReplaySpeed,
  timeframe: Timeframe,
  observedLatencyMs: number,
): number {
  const candlesPerSecond =
    (speed * 1_000) / TIMEFRAME_MS[timeframe];
  const reserveSeconds = Math.max(
    MIN_BUFFER_SECONDS,
    (Math.max(0, observedLatencyMs) / 1_000) * LATENCY_SAFETY_MULTIPLIER,
  );
  return Math.min(
    MAX_BUFFER_CANDLES,
    Math.max(
      MIN_BUFFER_CANDLES,
      Math.ceil(candlesPerSecond * reserveSeconds),
    ),
  );
}

export function updateReplayFetchLatency(
  previousMs: number,
  sampleMs: number,
): number {
  if (!Number.isFinite(sampleMs) || sampleMs <= 0) return previousMs;
  // Bias toward a slower new sample so the reservoir expands quickly when the
  // connection degrades, then contracts gradually after it recovers.
  const sampleWeight = sampleMs > previousMs ? 0.5 : 0.2;
  return previousMs * (1 - sampleWeight) + sampleMs * sampleWeight;
}

export async function retryReplayChunk<T extends { ok: boolean }>(
  load: () => Promise<T>,
  retryDelaysMs: readonly number[] = [250, 750, 1_500],
  wait: (delayMs: number) => Promise<void> = (delayMs) =>
    new Promise((resolve) => window.setTimeout(resolve, delayMs)),
): Promise<T> {
  let result = await load();
  for (const delayMs of retryDelaysMs) {
    if (result.ok) return result;
    await wait(delayMs);
    result = await load();
  }
  return result;
}
