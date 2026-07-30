import { formatInZone } from "./timezones";

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
const TIME: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};
const TIME_WITH_SECONDS: Intl.DateTimeFormatOptions = {
  ...TIME,
  second: "2-digit",
};

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
): string {
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
