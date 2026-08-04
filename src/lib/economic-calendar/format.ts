/**
 * Display formatting for calendar figures and release times.
 *
 * Kept out of the components so the "—" that stands for an unpublished actual is
 * decided in one place. A blank cell there would read as a zero reading, which
 * for a release the trader has not reached yet is the opposite of the truth.
 */

import { formatInZone } from "@/lib/chart/timezones";
import type { CalendarEvent, EventImportance, EventMultiplier } from "./types";

/** What the card shows where a figure does not exist. */
export const NO_FIGURE = "—";

const MULTIPLIER_SUFFIX: Record<EventMultiplier, string> = {
  thousands: "K",
  millions: "M",
  billions: "B",
  trillions: "T",
};

export interface FigureFormat {
  unit?: string | null;
  multiplier?: EventMultiplier | null;
}

/**
 * A stored figure as the calendar prints it: "54.5", "150K", "3.2%".
 *
 * The stored string is already canonical, so this only decorates it. Values are
 * never re-parsed into a number on the way through — the point of storing them
 * as text is that what the source published is what gets shown.
 */
export function formatFigure(
  value: string | null | undefined,
  format: FigureFormat = {},
): string {
  if (value == null || value === "") return NO_FIGURE;
  const suffix = format.multiplier ? MULTIPLIER_SUFFIX[format.multiplier] : "";
  const unit = format.unit === "percent" ? "%" : "";
  return `${value}${suffix}${unit}`;
}

/**
 * Release time for the hover card, in the chart's own zone so the card agrees
 * with the axis it points at. An event scheduled only to the day drops the
 * clock rather than claiming midnight.
 */
export function formatEventTime(
  event: Pick<CalendarEvent, "timestamp" | "timeMode">,
  zone: string,
): string {
  // Assembled from parts rather than handed to one formatter: a locale decides
  // whether that reads "Aug 05, 26" or "05/08/26", and the card is a fixed
  // 208px with a release name already competing for the width.
  const day = formatInZone(event.timestamp, zone, { day: "2-digit" });
  const month = formatInZone(event.timestamp, zone, { month: "short" });
  const year = formatInZone(event.timestamp, zone, { year: "2-digit" });
  const date = `${day} ${month} '${year}`;
  if (event.timeMode !== "exact") {
    return event.timeMode === "tentative" ? `${date} (tentative)` : date;
  }
  const time = formatInZone(event.timestamp, zone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} ${time}`;
}

/**
 * Whether the actual beat, missed, or matched the forecast — the one derived
 * number a trader reads off a release. Null when either side is missing, which
 * is every event ahead of the playhead.
 */
export function surpriseDirection(
  event: Pick<CalendarEvent, "actual" | "forecast">,
): "beat" | "miss" | "met" | null {
  if (event.actual == null || event.forecast == null) return null;
  const actual = Number(event.actual);
  const forecast = Number(event.forecast);
  if (!Number.isFinite(actual) || !Number.isFinite(forecast)) return null;
  if (actual > forecast) return "beat";
  if (actual < forecast) return "miss";
  return "met";
}

/** Sentence naming the impact, for the badge's accessible label. */
export function describeEvent(event: CalendarEvent, zone: string): string {
  const impact: Record<EventImportance, string> = {
    none: "no expected impact",
    low: "low impact",
    medium: "medium impact",
    high: "high impact",
  };
  const actual = event.actual == null ? "not yet released" : `actual ${formatFigure(event.actual, event)}`;
  return `${event.currency} ${event.name}, ${impact[event.importance]}, ${formatEventTime(event, zone)}, ${actual}`;
}
