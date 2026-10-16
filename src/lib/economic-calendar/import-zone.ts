import type { ZoneDetection } from "./detect-zone";
import type { ExportHeader } from "./mt5-csv";
import { parseZoneSpec, type ZoneSpec } from "./timezone";

export interface CalendarImportZone {
  timezone: string;
  timezoneSource: "given" | "detected" | "header";
  zone: ZoneSpec;
}

/** Short rolling exports cannot prove a seasonal clock. MT5 calendar exports
 * record the offset used by that export; they must never silently become UTC. */
export function resolveCalendarImportZone(
  requested: string | undefined,
  header: ExportHeader | null,
  detection: ZoneDetection | null,
): CalendarImportZone {
  let timezone: string;
  let timezoneSource: CalendarImportZone["timezoneSource"];
  if (requested?.trim()) {
    timezone = requested.trim();
    timezoneSource = "given";
  } else if (detection?.confident && detection.best) {
    timezone = detection.best.timezone;
    timezoneSource = "detected";
  } else if (header?.offsetMinutes != null && Number.isInteger(header.offsetMinutes) &&
    Math.abs(header.offsetMinutes) <= 18 * 60 && header.exportedAt != null && Number.isFinite(header.exportedAt)) {
    const minutes = Math.abs(header.offsetMinutes);
    timezone = `${header.offsetMinutes < 0 ? "-" : "+"}${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    timezoneSource = "header";
  } else {
    throw new Error("Calendar timezone could not be verified. Export again with the ForexTestLab MT5 exporter or supply --timezone. No calendar rows were imported.");
  }
  const zone = parseZoneSpec(timezone);
  if (!zone) throw new Error(`Unrecognised --timezone "${timezone}". Use an IANA zone or a UTC offset.`);
  return { timezone, timezoneSource, zone };
}
