export const DISPLAY_TIME_ZONE = "America/New_York";
export const DISPLAY_TIME_ZONE_LABEL = "New York";

type DateValue = number | Date;

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface NewYorkDateParts {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
}

/** Calendar and clock fields in New York, adjusted automatically for DST. */
export function getNewYorkDateParts(value: DateValue): NewYorkDateParts {
  const parts = Object.fromEntries(
    partsFormatter.formatToParts(value).map((part) => [part.type, part.value]),
  );
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdays[parts.weekday ?? "Sun"] ?? 0,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function formatNewYorkDate(
  value: DateValue,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: DISPLAY_TIME_ZONE }).format(value);
}

export function formatNewYorkDateTime(
  value: DateValue,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  return `${new Intl.DateTimeFormat("en", { ...options, timeZone: DISPLAY_TIME_ZONE }).format(value)} ET`;
}

export function newYorkMonthKey(value: DateValue): string {
  const parts = getNewYorkDateParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function toNewYorkDateInput(value: DateValue): string {
  const parts = getNewYorkDateParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function newYorkWallClockToUtc(year: number, month: number, day: number): number {
  const initial = Date.UTC(year, month - 1, day);
  const observed = getNewYorkDateParts(initial);
  const observedAsUtc = Date.UTC(
    observed.year,
    observed.month - 1,
    observed.day,
    observed.hour,
    observed.minute,
  );
  return initial - (observedAsUtc - initial);
}

export function newYorkDateStart(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return newYorkWallClockToUtc(year!, month!, day!);
}

export function newYorkDateEnd(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year!, month! - 1, day! + 1));
  return newYorkWallClockToUtc(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth() + 1,
    nextDate.getUTCDate(),
  ) - 1;
}

export type TradingSession = "Asia" | "London" | "New York" | "Rollover";

/** Assign a trade by its New York entry hour to a non-overlapping market session. */
export function getTradingSession(value: DateValue): TradingSession {
  const { hour } = getNewYorkDateParts(value);
  if (hour >= 19 || hour < 3) return "Asia";
  if (hour < 8) return "London";
  if (hour < 17) return "New York";
  return "Rollover";
}
