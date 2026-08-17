import { UTC_ZONE, formatInZone } from "./timezones";
import { isCalendarTimeframe, TIMEFRAME_MS, type Timeframe } from "../market-data/types";

/**
 * Mirrors lightweight-charts' `TickMarkType` so this module stays pure and
 * testable without importing the chart library.
 */
export const TICK_YEAR = 0;
export const TICK_MONTH = 1;
export const TICK_DAY_OF_MONTH = 2;
export const TICK_TIME = 3;
export const TICK_TIME_WITH_SECONDS = 4;

const YEAR: Intl.DateTimeFormatOptions = { year: "numeric" };
const MONTH: Intl.DateTimeFormatOptions = { month: "short" };
const DAY: Intl.DateTimeFormatOptions = { day: "numeric" };
const DAY_AND_MONTH: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
const TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};
const TIME_WITH_SECONDS: Intl.DateTimeFormatOptions = {
  ...TIME,
  second: "2-digit",
};

const CROSSHAIR_DATE: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "2-digit",
};
const CROSSHAIR_TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

/**
 * Which zone a bar of this timeframe should be labelled in.
 *
 * Candles are bucketed on UTC boundaries — a daily bar opens at 00:00 UTC —
 * but the labels were rendered in whatever zone the trader had chosen. West of
 * UTC that pushed the daily bar's own timestamp back into the previous
 * evening, so New York, the default, named Tuesday's daily candle "Mon Nov 04"
 * while the 4h and 1h candles inside it correctly said Tuesday. Weekly was
 * worse: a Monday bucket displayed as Sunday.
 *
 * From a day up, the bar has no meaningful time of day, so it is named by the
 * UTC date that defines it and reads the same in every zone. Intraday bars keep
 * the trader's zone, where the clock is the whole point.
 */
export function barLabelZone(timeframeMs: number, zone: string): string {
  return timeframeMs >= TIMEFRAME_MS["1d"] ? UTC_ZONE : zone;
}

/**
 * Label for the bar under the crosshair, at the precision its timeframe carries.
 *
 * A daily or weekly bar has no meaningful time of day, so printing "00:00" next
 * to it invents precision the bar does not have. Intraday bars get the clock;
 * anything from a day up gets the date alone.
 */
export function formatCrosshairLabel(
  at: number,
  zone: string,
  timeframeMs: number,
): string {
  const labelZone = barLabelZone(timeframeMs, zone);
  const date = formatInZone(at, labelZone, CROSSHAIR_DATE);
  if (timeframeMs >= TIMEFRAME_MS["1d"]) return date;
  return `${date} ${formatInZone(at, zone, CROSSHAIR_TIME)}`;
}

/**
 * Label for one tick on the time axis.
 *
 * The axis reads as a ladder rather than a list: intraday ticks are bare 24-hour
 * times, and only the tick that opens a new day, month or year spends space on
 * naming it. Repeating the date on every tick ("Mar 4, 06:00 PM", over and over)
 * costs width, pushes ticks apart, and buries the one thing a trader scans the
 * axis for — where one session ends and the next begins.
 *
 * The chart library decides each tick's granularity from the zoom level and
 * passes it in, so this only chooses how to render it.
 */
export function formatTickMark(
  at: number,
  tickMarkType: number,
  zone: string,
  timeframe: Timeframe,
): string {
  const labelZone = barLabelZone(TIMEFRAME_MS[timeframe], zone);
  if (timeframe === "1yr") return formatInZone(at, labelZone, YEAR);
  if (isCalendarTimeframe(timeframe)) {
    return formatInZone(at, labelZone, tickMarkType === TICK_YEAR ? YEAR : MONTH);
  }
  if (TIMEFRAME_MS[timeframe] >= TIMEFRAME_MS["1d"]) {
    if (tickMarkType === TICK_YEAR) return formatInZone(at, labelZone, YEAR);
    if (tickMarkType === TICK_MONTH) return formatInZone(at, labelZone, MONTH);
    return formatInZone(at, labelZone, DAY_AND_MONTH);
  }
  switch (tickMarkType) {
    case TICK_YEAR:
      return formatInZone(at, zone, YEAR);
    case TICK_MONTH:
      return formatInZone(at, zone, MONTH);
    case TICK_DAY_OF_MONTH:
      return formatInZone(at, zone, DAY);
    case TICK_TIME_WITH_SECONDS:
      return formatInZone(at, zone, TIME_WITH_SECONDS);
    case TICK_TIME:
    default:
      return formatInZone(at, zone, TIME);
  }
}

/**
 * Lightweight Charts otherwise reserves eight characters per label. Matching
 * the reservation to the labels actually used lets it place more useful ticks.
 */
export function timeframeTickMarkMaxCharacters(timeframe: Timeframe): number {
  if (isCalendarTimeframe(timeframe)) return 4;
  if (TIMEFRAME_MS[timeframe] >= TIMEFRAME_MS["1d"]) return 6;
  return 5;
}
