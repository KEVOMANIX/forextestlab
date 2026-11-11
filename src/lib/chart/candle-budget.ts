/** Strategy Lab tests run on at most this many candles (the Pine runner's limit). */
export const MAX_TEST_CANDLES = 100_000;
const DAY = 86_400_000;

const isWeekday = (dayStart: number) => { const weekday = new Date(dayStart).getUTCDay(); return weekday !== 0 && weekday !== 6; };

/** Weekdays (Mon–Fri, UTC) from the day of `startMs` through the day of `endMs`, inclusive. */
export function weekdaysBetween(startMs: number, endMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  const first = Math.floor(startMs / DAY) * DAY, last = Math.floor(endMs / DAY) * DAY;
  const days = Math.round((last - first) / DAY) + 1;
  const weeks = Math.floor(days / 7);
  let count = weeks * 5;
  for (let day = first + weeks * 7 * DAY; day <= last; day += DAY) if (isWeekday(day)) count++;
  return count;
}

/** About how many candles a test from `startMs` through `endMs` uses (FX trades weekdays only). */
export function estimateCandles(startMs: number, endMs: number, timeframeMs: number): number {
  if (!(timeframeMs > 0)) return 0;
  return Math.ceil(weekdaysBetween(startMs, endMs) * Math.max(1, DAY / timeframeMs));
}

/** The earliest start (a day start, not before `earliestMs`) that keeps the test within the candle limit. */
export function earliestStartWithinLimit(endMs: number, timeframeMs: number, earliestMs = -Infinity, limit = MAX_TEST_CANDLES): number {
  const perDay = Math.max(1, DAY / timeframeMs);
  const allowedWeekdays = Math.floor(limit / perDay);
  let day = Math.floor(endMs / DAY) * DAY, counted = isWeekday(day) ? 1 : 0;
  const floor = Number.isFinite(earliestMs) ? Math.floor(earliestMs / DAY) * DAY : -Infinity;
  while (day - DAY >= floor) {
    const previous = day - DAY;
    if (isWeekday(previous) && counted + 1 > allowedWeekdays) break;
    if (isWeekday(previous)) counted++;
    day = previous;
  }
  return day;
}
