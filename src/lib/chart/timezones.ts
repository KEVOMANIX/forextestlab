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

export const TIME_ZONES: TimeZoneOption[] = [
  { id: UTC_ZONE, label: "UTC" },
  { id: EXCHANGE_ZONE, label: "Exchange" },
  { id: "Pacific/Honolulu", label: "Honolulu" },
  { id: "America/Anchorage", label: "Anchorage" },
  { id: "America/Juneau", label: "Juneau" },
  { id: "America/Los_Angeles", label: "Los Angeles" },
  { id: "America/Phoenix", label: "Phoenix" },
  { id: "America/Vancouver", label: "Vancouver" },
  { id: "America/Denver", label: "Denver" },
  { id: "America/Mexico_City", label: "Mexico City" },
  { id: "America/El_Salvador", label: "San Salvador" },
  { id: "America/Bogota", label: "Bogota" },
  { id: "America/Chicago", label: "Chicago" },
  { id: "America/Lima", label: "Lima" },
  { id: "America/Caracas", label: "Caracas" },
  { id: "America/New_York", label: "New York" },
  { id: "America/Santiago", label: "Santiago" },
  { id: "America/Toronto", label: "Toronto" },
  { id: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { id: "America/Halifax", label: "Halifax" },
  { id: "America/Sao_Paulo", label: "Sao Paulo" },
  { id: "Atlantic/Azores", label: "Azores" },
  { id: "Atlantic/Reykjavik", label: "Reykjavik" },
  { id: "Africa/Casablanca", label: "Casablanca" },
  { id: "Europe/Dublin", label: "Dublin" },
  { id: "Africa/Lagos", label: "Lagos" },
  { id: "Europe/Lisbon", label: "Lisbon" },
  { id: "Europe/London", label: "London" },
  { id: "Africa/Tunis", label: "Tunis" },
  { id: "Europe/Amsterdam", label: "Amsterdam" },
  { id: "Europe/Belgrade", label: "Belgrade" },
  { id: "Europe/Berlin", label: "Berlin" },
  { id: "Europe/Bratislava", label: "Bratislava" },
  { id: "Europe/Brussels", label: "Brussels" },
  { id: "Europe/Budapest", label: "Budapest" },
  { id: "Europe/Copenhagen", label: "Copenhagen" },
  { id: "Europe/Madrid", label: "Madrid" },
  { id: "Europe/Malta", label: "Malta" },
  { id: "Europe/Oslo", label: "Oslo" },
  { id: "Europe/Paris", label: "Paris" },
  { id: "Europe/Rome", label: "Rome" },
  { id: "Europe/Stockholm", label: "Stockholm" },
  { id: "Europe/Warsaw", label: "Warsaw" },
  { id: "Europe/Zurich", label: "Zurich" },
  { id: "Africa/Cairo", label: "Cairo" },
  { id: "Europe/Athens", label: "Athens" },
  { id: "Asia/Beirut", label: "Beirut" },
  { id: "Europe/Bucharest", label: "Bucharest" },
  { id: "Africa/Johannesburg", label: "Johannesburg" },
  { id: "Europe/Helsinki", label: "Helsinki" },
  { id: "Asia/Jerusalem", label: "Jerusalem" },
  { id: "Europe/Kiev", label: "Kyiv" },
  { id: "Europe/Riga", label: "Riga" },
  { id: "Europe/Tallinn", label: "Tallinn" },
  { id: "Europe/Vilnius", label: "Vilnius" },
  { id: "Europe/Istanbul", label: "Istanbul" },
  { id: "Asia/Bahrain", label: "Bahrain" },
  { id: "Europe/Moscow", label: "Moscow" },
  { id: "Asia/Kuwait", label: "Kuwait" },
  { id: "Asia/Qatar", label: "Qatar" },
  { id: "Asia/Riyadh", label: "Riyadh" },
  { id: "Asia/Dubai", label: "Dubai" },
  { id: "Asia/Muscat", label: "Muscat" },
  { id: "Asia/Tehran", label: "Tehran" },
  { id: "Asia/Karachi", label: "Karachi" },
  { id: "Asia/Kolkata", label: "Kolkata" },
  { id: "Asia/Kathmandu", label: "Kathmandu" },
  { id: "Asia/Almaty", label: "Almaty" },
  { id: "Asia/Dhaka", label: "Dhaka" },
  { id: "Asia/Bangkok", label: "Bangkok" },
  { id: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh" },
  { id: "Asia/Jakarta", label: "Jakarta" },
  { id: "Asia/Chongqing", label: "Chongqing" },
  { id: "Asia/Hong_Kong", label: "Hong Kong" },
  { id: "Australia/Perth", label: "Perth" },
  { id: "Asia/Shanghai", label: "Shanghai" },
  { id: "Asia/Singapore", label: "Singapore" },
  { id: "Asia/Taipei", label: "Taipei" },
  { id: "Asia/Seoul", label: "Seoul" },
  { id: "Asia/Tokyo", label: "Tokyo" },
  { id: "Australia/Adelaide", label: "Adelaide" },
  { id: "Australia/Brisbane", label: "Brisbane" },
  { id: "Australia/Sydney", label: "Sydney" },
  { id: "Pacific/Norfolk", label: "Norfolk Island" },
  { id: "Pacific/Auckland", label: "Auckland" },
  { id: "Pacific/Chatham", label: "Chatham Islands" },
  { id: "Pacific/Fakaofo", label: "Tokelau" },
];

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
  const normalized = part.replace("GMT", "").replace(/^([+-])0?/, "$1");
  if (normalized === "" || normalized === "+0" || normalized === "-0") return "UTC";
  return `UTC${normalized.replace(":00", "")}`;
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
