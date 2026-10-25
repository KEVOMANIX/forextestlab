import { nextTimeframeTimestamp, type Candle, type Timeframe } from "@/lib/market-data/types";

/** Load the complete interval, rather than silently ending after 100 small
 * pages. Large internal pages reduce repeated month scans on long sessions;
 * the public pair response still applies the shared replay-clock cutoff.
 */
export async function fetchPairRunway(
  start: number,
  through: number,
  timeframe: Timeframe,
  fetchPage: (from: number, to: number, limit: number) => Promise<Candle[]>,
): Promise<Candle[]> {
  const additions: Candle[] = [];
  while (start <= through) {
    const page = await fetchPage(start, through, 50_000);
    const fresh = page.filter(candle => candle.timestamp >= start && candle.timestamp <= through);
    if (!fresh.length) break; // The market may be closed at the primary tail.
    additions.push(...fresh);
    const newest = fresh.at(-1)!.timestamp;
    if (newest >= through) break;
    const next = nextTimeframeTimestamp(newest, timeframe);
    if (next <= start) throw new Error("Market data pagination did not advance");
    start = next;
  }
  return additions;
}
