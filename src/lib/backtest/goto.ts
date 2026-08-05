/**
 * Targets the "Go to" jump can aim at, and the arithmetic behind them.
 *
 * Everything here is pure: it turns a moment plus the candles the replay has
 * already revealed into either a timestamp or a price level. Actually advancing
 * the replay to that target is the engine's job — see `jumpTo` in
 * `useBacktester`.
 *
 * Two rules shape the whole file:
 *
 * - Wall clocks are always resolved through an IANA zone at the moment in
 *   question, never through a stored offset. A session replaying last January
 *   opened at the offset in force *then*, and half the world's offsets move
 *   twice a year.
 * - A price level only ever looks *backward* in data: it is derived from
 *   candles the trader has already seen, then the replay runs forward to
 *   when it is touched. A time target can look either way — ahead to the
 *   next occurrence, or behind to a moment already revealed — but never past
 *   the edge of what has actually loaded, in either direction.
 */

import { resolveZone, zoneOffsetMinutes } from "@/lib/chart/timezones";
import type { Candle } from "@/lib/market-data/types";

/** Where a jump should stop. Prices are numbers here; only the engine needs decimals. */
export type GoToTarget =
  | { kind: "time"; timestamp: number }
  | { kind: "price"; price: number }
  | { kind: "position-close" };

export interface TradingSessionDefinition {
  id: string;
  label: string;
  /** Zone the session's hours are quoted in. */
  zone: string;
  /** Minutes past local midnight. */
  openMinutes: number;
  closeMinutes: number;
  /** Shown under the name so the hours are never a mystery. */
  hint: string;
}

/**
 * The four windows traders actually name, in the zone each is quoted in.
 *
 * Hours are the cash-session conventions, not the 24-hour interbank window: the
 * point of jumping to "London" is to arrive when London's volume does. Silver
 * Bullet is the ICT morning window and is deliberately an hour long — it is a
 * setup window, not an exchange session.
 */
export const TRADING_SESSIONS: TradingSessionDefinition[] = [
  {
    id: "london",
    label: "London",
    zone: "Europe/London",
    openMinutes: 8 * 60,
    closeMinutes: 16 * 60 + 30,
    hint: "08:00–16:30 London",
  },
  {
    id: "new-york",
    label: "New York",
    zone: "America/New_York",
    openMinutes: 8 * 60,
    closeMinutes: 17 * 60,
    hint: "08:00–17:00 New York",
  },
  {
    id: "asian",
    label: "Asian",
    zone: "Asia/Tokyo",
    openMinutes: 9 * 60,
    closeMinutes: 18 * 60,
    hint: "09:00–18:00 Tokyo",
  },
  {
    id: "silver-bullet",
    label: "Silver Bullet",
    zone: "America/New_York",
    openMinutes: 10 * 60,
    closeMinutes: 11 * 60,
    hint: "10:00–11:00 New York",
  },
];

export function tradingSession(id: string): TradingSessionDefinition | null {
  return TRADING_SESSIONS.find((session) => session.id === id) ?? null;
}

/** A trader's own open/close hours for a named session, keyed by session id. */
export type SessionHourOverrides = Partial<
  Record<string, { openMinutes: number; closeMinutes: number }>
>;

/** Minutes past midnight as "HH:MM", for showing (and editing) a session's hours. */
export function minutesToClock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(normalized / 60))}:${pad(normalized % 60)}`;
}

/**
 * The four named sessions "Go to" offers, with any trader-supplied hours
 * substituted in. A trader who trades London's hours differently than the
 * cash-session convention should not have to fight the default to get there —
 * this only ever changes the hours a named session keeps, never its zone or
 * what it is called.
 */
export function tradingSessionsWithOverrides(
  overrides: SessionHourOverrides,
): TradingSessionDefinition[] {
  return TRADING_SESSIONS.map((session) => {
    const override = overrides[session.id];
    if (!override) return session;
    // The hint always reads "HH:MM–HH:MM <city>" — keep the city, replace the
    // hours, so a customised session never claims hours it no longer keeps.
    const city = session.hint.replace(/^[\d:]+–[\d:]+\s*/, "");
    return {
      ...session,
      openMinutes: override.openMinutes,
      closeMinutes: override.closeMinutes,
      hint: `${minutesToClock(override.openMinutes)}–${minutesToClock(override.closeMinutes)} ${city}`,
    };
  });
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(zone: string): Intl.DateTimeFormat {
  const resolved = resolveZone(zone);
  let formatter = partFormatters.get(resolved);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: resolved,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partFormatters.set(resolved, formatter);
  }
  return formatter;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface ZoneParts {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
  /** 0 = Sunday. */
  weekday: number;
  hour: number;
  minute: number;
}

/** Calendar and clock fields of a moment as read in a zone, DST included. */
export function zoneParts(at: number, zone: string): ZoneParts {
  const parts = Object.fromEntries(
    partFormatter(zone)
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAYS[parts.weekday ?? "Sun"] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * The UTC moment at which a zone's clocks read the given wall time.
 *
 * The offset is read twice because the first read uses a guess that can land on
 * the wrong side of a DST transition; the second read is taken at the corrected
 * instant. Times inside a spring-forward gap do not exist and resolve to the
 * moment the clocks jump to, which is the behaviour a jump wants.
 */
export function zoneWallClockToUtc(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = zoneOffsetMinutes(zone, asUtc);
  const candidate = asUtc - firstOffset * 60_000;
  const secondOffset = zoneOffsetMinutes(zone, candidate);
  if (secondOffset === firstOffset) return candidate;
  return asUtc - secondOffset * 60_000;
}

/** Midnight, in `zone`, of the zone-local day `dayOffset` days from `at`. */
function zoneMidnight(at: number, zone: string, dayOffset = 0): number {
  const parts = zoneParts(at, zone);
  const shifted = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + dayOffset),
  );
  return zoneWallClockToUtc(
    zone,
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

export type CalendarUnit = "day" | "week" | "month";

/**
 * The next day, week or month boundary strictly after `from`, in `zone`.
 *
 * A week starts Monday — the forex week does, and so does every calendar a
 * trading journal is read against. A "next day open" that lands on a Saturday is
 * left alone: the replay simply arrives at the first candle after it, which is
 * the Sunday re-open.
 */
export function nextCalendarBoundary(
  from: number,
  zone: string,
  unit: CalendarUnit,
): number {
  const parts = zoneParts(from, zone);
  if (unit === "day") {
    return zoneMidnight(from, zone, 1);
  }
  if (unit === "week") {
    // Monday is 1; Sunday (0) is six days into the week that began last Monday.
    const daysSinceMonday = (parts.weekday + 6) % 7;
    return zoneMidnight(from, zone, 7 - daysSinceMonday);
  }
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  return zoneWallClockToUtc(zone, nextYear, nextMonth, 1);
}

/**
 * The previous day, week or month boundary strictly before `from`, in `zone`.
 *
 * The mirror of `nextCalendarBoundary` — "previous day" means the start of
 * *today*, not a day-old moment, the same way "next day" means the start of
 * tomorrow rather than 24 hours ahead. If `from` already sits exactly on a
 * boundary (a session opened at a wall-clock midnight, say), that boundary is
 * `from` itself rather than strictly before it, so this steps back one more
 * unit — a jump that lands where it started would read as a broken button.
 */
export function previousCalendarBoundary(
  from: number,
  zone: string,
  unit: CalendarUnit,
): number {
  const parts = zoneParts(from, zone);
  if (unit === "day") {
    const startOfToday = zoneMidnight(from, zone, 0);
    return startOfToday < from ? startOfToday : zoneMidnight(from, zone, -1);
  }
  if (unit === "week") {
    const daysSinceMonday = (parts.weekday + 6) % 7;
    const startOfThisWeek = zoneMidnight(from, zone, -daysSinceMonday);
    return startOfThisWeek < from
      ? startOfThisWeek
      : zoneMidnight(from, zone, -daysSinceMonday - 7);
  }
  const startOfThisMonth = zoneWallClockToUtc(zone, parts.year, parts.month, 1);
  if (startOfThisMonth < from) return startOfThisMonth;
  const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
  return zoneWallClockToUtc(zone, prevYear, prevMonth, 1);
}

/** How far ahead (or behind) a session edge is searched before giving up. */
const SESSION_SEARCH_DAYS = 10;

/**
 * The next time a session opens or closes, strictly after `from`.
 *
 * Weekends are skipped: a session that only exists Monday to Friday cannot be
 * jumped to on a Saturday, and arriving at a closed market would be a jump to
 * nothing.
 */
export function nextSessionEdge(
  from: number,
  session: TradingSessionDefinition,
  edge: "open" | "close",
): number | null {
  const minutes = edge === "open" ? session.openMinutes : session.closeMinutes;
  for (let offset = 0; offset <= SESSION_SEARCH_DAYS; offset += 1) {
    const midnight = zoneMidnight(from, session.zone, offset);
    const candidate = midnight + minutes * 60_000;
    if (candidate <= from) continue;
    const weekday = zoneParts(candidate, session.zone).weekday;
    if (weekday === 0 || weekday === 6) continue;
    return candidate;
  }
  return null;
}

/**
 * The previous time a session opened or closed, strictly before `from`.
 *
 * The mirror of `nextSessionEdge`, walking backward a day at a time instead of
 * forward. Whether the destination is actually reachable — whether the replay
 * has revealed that far back — is the caller's concern, the same way it is for
 * `nextSessionEdge`'s forward search running past the end of loaded data.
 */
export function previousSessionEdge(
  from: number,
  session: TradingSessionDefinition,
  edge: "open" | "close",
): number | null {
  const minutes = edge === "open" ? session.openMinutes : session.closeMinutes;
  for (let offset = 0; offset <= SESSION_SEARCH_DAYS; offset += 1) {
    const midnight = zoneMidnight(from, session.zone, -offset);
    const candidate = midnight + minutes * 60_000;
    if (candidate >= from) continue;
    const weekday = zoneParts(candidate, session.zone).weekday;
    if (weekday === 0 || weekday === 6) continue;
    return candidate;
  }
  return null;
}

/** High and low of a span of candles, or null when the span holds none. */
export interface PriceRange {
  high: number;
  low: number;
  /** First candle in the span, for labelling. */
  from: number;
  to: number;
}

function rangeOf(candles: Candle[], startTime: number, endTime: number): PriceRange | null {
  let high = Number.NEGATIVE_INFINITY;
  let low = Number.POSITIVE_INFINITY;
  let from = 0;
  let to = 0;
  for (const candle of candles) {
    if (candle.timestamp < startTime) continue;
    if (candle.timestamp >= endTime) break;
    const candleHigh = Number(candle.high);
    const candleLow = Number(candle.low);
    if (Number.isFinite(candleHigh) && candleHigh > high) high = candleHigh;
    if (Number.isFinite(candleLow) && candleLow < low) low = candleLow;
    if (from === 0) from = candle.timestamp;
    to = candle.timestamp;
  }
  if (!Number.isFinite(high) || !Number.isFinite(low)) return null;
  return { high, low, from, to };
}

/**
 * Range of the most recent *completed* run of a session, using only candles the
 * replay has revealed.
 *
 * "Completed" matters: the current London session's high is still moving, and a
 * level that moves is not a level. The search walks back a day at a time so a
 * weekend or a holiday finds the session before it rather than returning empty.
 */
export function previousSessionRange(
  revealed: Candle[],
  session: TradingSessionDefinition,
  now: number,
): PriceRange | null {
  for (let offset = 0; offset <= SESSION_SEARCH_DAYS; offset += 1) {
    const midnight = zoneMidnight(now, session.zone, -offset);
    const open = midnight + session.openMinutes * 60_000;
    const close = midnight + session.closeMinutes * 60_000;
    if (close > now) continue;
    const range = rangeOf(revealed, open, close);
    if (range) return range;
  }
  return null;
}

/**
 * Range of the last completed zone-local day, from revealed candles.
 *
 * The daily bar the market trades against is the previous *session* day, so the
 * current day is excluded even when it is nearly over.
 */
export function previousDailyRange(
  revealed: Candle[],
  zone: string,
  now: number,
): PriceRange | null {
  for (let offset = 1; offset <= SESSION_SEARCH_DAYS; offset += 1) {
    const start = zoneMidnight(now, zone, -offset);
    const end = zoneMidnight(now, zone, -offset + 1);
    const range = rangeOf(revealed, start, end);
    if (range) return range;
  }
  return null;
}

/**
 * Round numbers either side of a price — the "00" and "50" levels.
 *
 * The step is derived from the pip size rather than the price, so it is 100 pips
 * on any instrument: 0.0100 on a 5-decimal pair, 1.00 on a JPY cross. Half-steps
 * are included because the 50 level is watched as closely as the 00.
 */
export function psychologicalLevels(
  price: number,
  pipSize: number,
  span = 3,
): number[] {
  if (!Number.isFinite(price) || !(pipSize > 0)) return [];
  const step = pipSize * 50;
  const base = Math.round(price / step) * step;
  const levels: number[] = [];
  for (let index = -span; index <= span; index += 1) {
    const level = base + index * step;
    if (level > 0) levels.push(roundToStep(level, step));
  }
  return levels.filter((level, index) => levels.indexOf(level) === index);
}

/** Snap floating-point drift out of a computed level. */
function roundToStep(value: number, step: number): number {
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  return Number(value.toFixed(decimals));
}

export interface HistoricalMoment {
  id: string;
  label: string;
  /** Calendar date, as YYYY-MM-DD. Resolved to midnight in the chart's zone. */
  date: string;
}

/**
 * Days worth replaying, for when a session happens to span one.
 *
 * A short, uncontroversial list of moments that moved major FX pairs, kept to
 * events whose date is not in dispute. It is not a market history: the point is
 * that a trader replaying, say, March 2020 can land on the day itself instead of
 * hunting for it on the axis.
 *
 * Replay only runs forward inside a session's own range, so most of this list is
 * unreachable in any given session. That is expected — the caller filters to
 * what lies ahead and says so when nothing does.
 */
export const HISTORICAL_MOMENTS: HistoricalMoment[] = [
  { id: "lehman", label: "Lehman Brothers files for bankruptcy", date: "2008-09-15" },
  { id: "flash-crash", label: "US flash crash", date: "2010-05-06" },
  { id: "tohoku", label: "Tōhoku earthquake", date: "2011-03-11" },
  { id: "snb-floor", label: "SNB abandons the EUR/CHF floor", date: "2015-01-15" },
  { id: "brexit-vote", label: "UK EU referendum", date: "2016-06-23" },
  { id: "us-election-2016", label: "US presidential election", date: "2016-11-08" },
  { id: "covid-crash", label: "COVID-19 market crash", date: "2020-03-12" },
  { id: "ukraine", label: "Russia invades Ukraine", date: "2022-02-24" },
  { id: "mini-budget", label: "UK mini-budget and the gilt crisis", date: "2022-09-23" },
  { id: "carry-unwind", label: "Yen carry-trade unwind", date: "2024-08-05" },
];

/**
 * Historical moments a session can actually reach, each resolved to midnight
 * in `zone`.
 *
 * Ahead of the replay, "reachable" means strictly after `from` and within the
 * data the session holds (`bound` is the session's end). Behind it, the same
 * word means strictly before `from` and no earlier than what has been loaded
 * (`bound` is the earliest revealed candle) — a moment before that is not on
 * this replay's tape at all, loaded or not.
 */
export function reachableMoments(
  from: number,
  bound: number,
  zone: string,
  direction: "ahead" | "behind" = "ahead",
): { moment: HistoricalMoment; timestamp: number }[] {
  const out: { moment: HistoricalMoment; timestamp: number }[] = [];
  for (const moment of HISTORICAL_MOMENTS) {
    const [year, month, day] = moment.date.split("-").map(Number);
    if (!year || !month || !day) continue;
    const timestamp = zoneWallClockToUtc(zone, year, month, day);
    const reachable =
      direction === "ahead"
        ? timestamp > from && timestamp <= bound
        : timestamp < from && timestamp >= bound;
    if (reachable) out.push({ moment, timestamp });
  }
  return out.sort((a, b) => a.timestamp - b.timestamp);
}
