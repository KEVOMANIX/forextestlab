import { DISPLAY_TIME_ZONE } from "@/lib/date-time";

/**
 * Time zones a chart can be displayed in.
 *
 * Offsets are never stored, only IANA zone ids: an offset is a property of a
 * moment, not of a place, so a session replaying last January must be labelled
 * with the offset that was in force then, not the one in force today.
 *
 * "Exchange" is the forex convention this app is built around — New York, where
 * the trading day rolls at 17:00 — and stays the default.
 */

export const EXCHANGE_ZONE = "exchange";
export const UTC_ZONE = "UTC";

export interface TimeZoneOption {
  /** Stored value: an IANA id, or the "exchange" sentinel. */
  id: string;
  label: string;
}

/** Resolve the stored value to a zone Intl understands. */
export function resolveZone(id: string): string {
  return id === EXCHANGE_ZONE ? DISPLAY_TIME_ZONE : id;
}

/**
 * Used only where the runtime cannot enumerate zones itself. Everything else
 * comes from the ICU database, so the list is complete and stays current.
 */
const FALLBACK_ZONE_IDS = [
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "Africa/Nairobi",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Moscow",
  "Europe/Zurich",
  "Pacific/Auckland",
];

/** "Africa/Nairobi" -> "Nairobi", "America/Argentina/Buenos_Aires" -> "Buenos Aires". */
function zoneLabel(id: string): string {
  const city = id.split("/").pop() ?? id;
  return city.replace(/_/g, " ");
}

function catalogue(): TimeZoneOption[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? (Intl.supportedValuesOf("timeZone") as string[])
      : FALLBACK_ZONE_IDS;
  const zones = supported
    // Region-less aliases (UTC, GMT, EST5EDT...) duplicate the pinned UTC entry.
    .filter((id) => id.includes("/"))
    .map((id) => ({ id, label: zoneLabel(id) }));
  return [
    { id: UTC_ZONE, label: "UTC" },
    { id: EXCHANGE_ZONE, label: "Exchange" },
    ...zones,
  ];
}

export const TIME_ZONES: TimeZoneOption[] = catalogue();

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function offsetFormatter(zone: string): Intl.DateTimeFormat {
  let formatter = offsetFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" });
    offsetFormatters.set(zone, formatter);
  }
  return formatter;
}

/**
 * Offset of a zone at a given moment, as "UTC+3" / "UTC-4:30".
 *
 * `longOffset` yields "GMT+03:00"; trailing ":00" is dropped so the common case
 * reads the way traders write it, while half-hour zones keep their minutes.
 */
export function zoneOffsetLabel(zone: string, at: number): string {
  const part = offsetFormatter(resolveZone(zone))
    .formatToParts(at)
    .find((item) => item.type === "timeZoneName")?.value;
  if (!part) return "UTC";
  const normalized = part.replace("GMT", "").replace(/^([+-])0?/, "$1").replace(":00", "");
  if (normalized === "" || normalized === "+0" || normalized === "-0") return "UTC";
  return `UTC${normalized}`;
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${zone}|${JSON.stringify(options)}`;
  let formatter = timeFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en", { ...options, timeZone: resolveZone(zone) });
    timeFormatters.set(key, formatter);
  }
  return formatter;
}

/** Format a moment in a chart's zone. Formatters are cached; charts call this per tick label. */
export function formatInZone(at: number, zone: string, options: Intl.DateTimeFormatOptions): string {
  return cachedFormatter(zone, options).format(at);
}

/** Minutes east of UTC for a zone at a moment; -300 for New York in winter. */
export function zoneOffsetMinutes(zone: string, at: number): number {
  const label = zoneOffsetLabel(zone, at);
  if (label === "UTC") return 0;
  const match = /^UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(label);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/**
 * Zone options with the offset each is on at `at`, ordered west to east.
 *
 * Sorted per moment rather than by a fixed list order: half the world changes
 * offset twice a year, so an order baked in for July reads as jumbled in March.
 * UTC and Exchange stay pinned at the top as the two shortcuts.
 */
export function zoneOptionsAt(at: number): { id: string; label: string; offset: string }[] {
  const pinned = TIME_ZONES.filter((zone) => zone.id === UTC_ZONE || zone.id === EXCHANGE_ZONE);
  const rest = TIME_ZONES.filter((zone) => zone.id !== UTC_ZONE && zone.id !== EXCHANGE_ZONE)
    .map((zone) => ({ zone, minutes: zoneOffsetMinutes(zone.id, at) }))
    .sort((a, b) => a.minutes - b.minutes || a.zone.label.localeCompare(b.zone.label))
    .map((item) => item.zone);
  return [...pinned, ...rest].map((zone) => ({
    ...zone,
    offset: zone.id === UTC_ZONE ? "UTC" : zoneOffsetLabel(zone.id, at),
  }));
}
