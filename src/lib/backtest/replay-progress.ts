/**
 * Replay progress expressed in trading days.
 *
 * A candle count is an implementation detail: "candle 41,900 of 5,760,000"
 * tells a trader nothing about where they are in a test, and the number changes
 * meaning with the timeframe. Days are what a session was actually chosen in.
 *
 * Days are counted on the New York calendar, the same clock the session clock,
 * the calendar panel and every report already use, so "Day 3" is the third day
 * a trader would name.
 */

import { getNewYorkDateParts } from "@/lib/date-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days since the epoch on the New York calendar. */
function newYorkDayNumber(value: number): number {
  const parts = getNewYorkDateParts(value);
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

export interface ReplayDayProgress {
  /** 1-based day the replay is currently showing. */
  day: number;
  /** Calendar days covered by the session's date range, inclusive. */
  totalDays: number;
}

export function replayDayProgress(input: {
  startTime: number;
  endTime: number;
  /** Timestamp of the currently revealed candle. */
  currentTime: number | null;
}): ReplayDayProgress {
  const start = newYorkDayNumber(input.startTime);
  const end = newYorkDayNumber(Math.max(input.startTime, input.endTime));
  const totalDays = Math.max(1, end - start + 1);
  if (input.currentTime == null) return { day: 1, totalDays };
  const current = newYorkDayNumber(input.currentTime) - start + 1;
  return {
    day: Math.min(totalDays, Math.max(1, current)),
    totalDays,
  };
}

/**
 * Percentage of the session's days replayed.
 *
 * Deliberately derived from the same day arithmetic as the label, so a progress
 * bar and the "Day 3 of 21" beneath it cannot tell a reader two different
 * stories. Candle counts must never be used for this: what a session has
 * *loaded* is not what it *covers*.
 */
export function replayDayPercent(input: {
  startTime: number;
  endTime: number;
  currentTime: number | null;
}): number {
  const { day, totalDays } = replayDayProgress(input);
  return Math.min(100, Math.max(0, (day / totalDays) * 100));
}

/** "Day 3 of 21", the label used wherever replay progress is reported. */
export function replayDayLabel(input: {
  startTime: number;
  endTime: number;
  currentTime: number | null;
}): string {
  const { day, totalDays } = replayDayProgress(input);
  return `Day ${day.toLocaleString("en-US")} of ${totalDays.toLocaleString("en-US")}`;
}
