import type { DataRange } from "@/lib/market-data/types";

export const TRIAL_SESSION_DAYS = 31;
export const TRIAL_SESSION_WINDOW_MS =
  TRIAL_SESSION_DAYS * 24 * 60 * 60 * 1000 - 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Select a uniformly random UTC-aligned start day from all ranges large enough
 * to contain a complete trial window.
 */
export function selectTrialWindow(
  ranges: DataRange[],
  random: () => number = Math.random,
): { startTime: number; endTime: number } | null {
  const candidates = ranges
    .map((range) => {
      const firstDay = Math.ceil(range.startTime / DAY_MS);
      const lastDay = Math.floor(
        (range.endTime - TRIAL_SESSION_WINDOW_MS) / DAY_MS,
      );
      return {
        firstDay,
        count: Math.max(0, lastDay - firstDay + 1),
      };
    })
    .filter((candidate) => candidate.count > 0);
  const total = candidates.reduce(
    (sum, candidate) => sum + candidate.count,
    0,
  );
  if (total === 0) return null;

  let selected = Math.min(
    total - 1,
    Math.floor(Math.max(0, random()) * total),
  );
  for (const candidate of candidates) {
    if (selected < candidate.count) {
      const startTime = (candidate.firstDay + selected) * DAY_MS;
      return {
        startTime,
        endTime: startTime + TRIAL_SESSION_WINDOW_MS,
      };
    }
    selected -= candidate.count;
  }
  return null;
}
