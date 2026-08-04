/**
 * Wall-clock-to-UTC conversion for imported calendar timestamps.
 *
 * MetaTrader reports calendar times in the *trade server's* timezone, and most
 * brokers run EET with summer time. A fixed offset therefore gets every event on
 * the far side of a DST boundary an hour wrong — which for a news release is the
 * difference between marking the candle that moved and the one before it. So a
 * named IANA zone is converted per timestamp, with the rule in force on that
 * date, and a fixed offset is accepted only because some servers really are
 * fixed.
 */

export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export type ZoneSpec =
  | { kind: "offset"; minutes: number }
  | { kind: "zone"; timeZone: string };

const OFFSET_PATTERN = /^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/i;

/**
 * Accepts "UTC", "+02:00", "-0500", or any IANA zone name the runtime knows.
 * Returns null for a name the runtime cannot resolve, so the caller can fail
 * with a message instead of silently importing an hour out.
 */
export function parseZoneSpec(timezone: string): ZoneSpec | null {
  const value = timezone.trim();
  if (value === "" || /^(?:UTC|GMT|Z)$/i.test(value)) {
    return { kind: "offset", minutes: 0 };
  }
  const offset = OFFSET_PATTERN.exec(value);
  if (offset) {
    const sign = offset[1] === "-" ? -1 : 1;
    const hours = Number(offset[2]);
    const minutes = Number(offset[3] ?? "0");
    if (hours > 18 || minutes > 59) return null;
    return { kind: "offset", minutes: sign * (hours * 60 + minutes) };
  }
  if (!/^[A-Za-z]+(?:[_/+-][A-Za-z0-9_+-]+)*$/.test(value)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
  } catch {
    return null;
  }
  return { kind: "zone", timeZone: value };
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/**
 * The zone's offset from UTC, in minutes, at a given instant. Derived by
 * rendering the instant in the zone and reading the result back as though it
 * were UTC: the gap between the two is the offset.
 */
export function zoneOffsetMinutesAt(utcMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };
  const asIfUtc = Date.UTC(
    field("year"),
    field("month") - 1,
    field("day"),
    field("hour") === 24 ? 0 : field("hour"),
    field("minute"),
    field("second"),
  );
  return Math.round((asIfUtc - utcMs) / 60000);
}

/**
 * Interpret a wall clock in `spec`'s zone and return UTC epoch milliseconds.
 *
 * The offset is looked up twice. The first lookup uses the wall clock read as
 * though it were already UTC, which is wrong by exactly the offset; applying it
 * lands within an hour of the answer, and the second lookup then reads the rule
 * actually in force there. That matters on the two nights a year when the two
 * lookups disagree.
 */
export function wallClockToUtc(clock: WallClock, spec: ZoneSpec): number {
  const naive = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  if (spec.kind === "offset") return naive - spec.minutes * 60000;

  const firstGuess = naive - zoneOffsetMinutesAt(naive, spec.timeZone) * 60000;
  const settled = naive - zoneOffsetMinutesAt(firstGuess, spec.timeZone) * 60000;
  return settled;
}

const STAMP_PATTERN =
  /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parses the `TimeToString` output the MQL5 exporter writes —
 * "2026.08.05 10:00:00", or "2026.08.05" for a date-only figure. ISO dashes and
 * slashes are accepted too, so a hand-edited CSV still imports.
 */
export function parseWallClock(value: string): WallClock | null {
  const match = STAMP_PATTERN.exec(value.trim());
  if (!match) return null;
  const clock: WallClock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
  };
  if (clock.month < 1 || clock.month > 12) return null;
  if (clock.day < 1 || clock.day > 31) return null;
  if (clock.hour > 23 || clock.minute > 59 || clock.second > 59) return null;
  // Reject 31 February rather than letting Date.UTC roll it into March.
  const rolled = new Date(Date.UTC(clock.year, clock.month - 1, clock.day));
  if (rolled.getUTCMonth() !== clock.month - 1 || rolled.getUTCDate() !== clock.day) {
    return null;
  }
  return clock;
}
