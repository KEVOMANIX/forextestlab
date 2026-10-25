import { nextForexTimeframeTimestamp, type Timeframe } from "@/lib/market-data/types";

/** Old forward whitespace becomes real time-axis slots after a market jump.
 * Detect gaps in newly revealed bars so those placeholders can be replaced in
 * the same render. Ordinary contiguous replay retains its cached forward scale.
 * Display times are seconds, matching Lightweight Charts.
 */
export function newDisplayCrossesGap(
  display: readonly { time: number }[],
  previousLastTime: number | undefined,
  timeframe: Timeframe,
): boolean {
  if (previousLastTime == null || display.length === 0) return false;
  if (display.at(-1)!.time < previousLastTime) return true;
  let low = 0;
  let high = display.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (display[mid]!.time <= previousLastTime) low = mid + 1;
    else high = mid;
  }
  for (let index = Math.max(1, low); index < display.length; index += 1) {
    const previous = display[index - 1]!.time;
    const expected = nextForexTimeframeTimestamp(previous * 1000, timeframe) / 1000;
    if (display[index]!.time > expected) return true;
  }
  return false;
}
