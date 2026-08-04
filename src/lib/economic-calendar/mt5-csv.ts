/**
 * Normalises one row of the MT5 calendar export into an `EconomicEventRecord`.
 *
 * The exporter has already divided the calendar's million-scaled integers and
 * blanked the LONG_MIN placeholders, so what arrives here is plain decimal text
 * in the trade server's timezone. This module's jobs are therefore narrow:
 * convert the wall clock to UTC, canonicalise the figures without touching a
 * float, and refuse anything it cannot vouch for rather than guessing.
 */

import {
  EVENT_MULTIPLIERS,
  isEventImportance,
  isEventTimeMode,
  type EconomicEventRecord,
  type EventMultiplier,
} from "./types";
import { parseWallClock, wallClockToUtc, type ZoneSpec } from "./timezone";

export const MT5_CSV_COMMENT_PREFIX = "#";

/** Columns the exporter writes. Missing ones are an error, not a default. */
const REQUIRED_COLUMNS = ["value_id", "time_server", "name", "currency"] as const;

export interface NormalizeOptions {
  zone: ZoneSpec;
  source: string;
}

export type NormalizeResult =
  | { ok: true; record: EconomicEventRecord }
  | { ok: false; error: string };

/**
 * A figure as a canonical decimal string: trailing fractional zeros dropped, so
 * "54.500000" becomes "54.5" and "54.000000" becomes "54" — which is how a
 * calendar prints them. Done with string surgery because parsing "54.5" into a
 * float and back is how a forecast becomes 54.499999999999996.
 */
export function canonicalFigure(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value === "") return null;
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return null;
  let out = value.startsWith("+") ? value.slice(1) : value;
  if (out.includes(".")) {
    out = out.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (out === "-0" || out === "") out = "0";
  return out;
}

function optionalText(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  return value === "" ? null : value;
}

function parseMultiplier(raw: string | undefined): EventMultiplier | null {
  const value = (raw ?? "").trim().toLowerCase();
  return (EVENT_MULTIPLIERS as readonly string[]).includes(value)
    ? (value as EventMultiplier)
    : null;
}

function parseCount(raw: string | undefined): number {
  const value = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function normalizeMt5Row(
  record: Record<string, string>,
  options: NormalizeOptions,
): NormalizeResult {
  for (const column of REQUIRED_COLUMNS) {
    if (!(column in record)) {
      return { ok: false, error: `Missing column "${column}".` };
    }
  }

  const externalId = (record.value_id ?? "").trim();
  if (externalId === "") return { ok: false, error: "Empty value_id." };

  const clock = parseWallClock(record.time_server ?? "");
  if (!clock) {
    return { ok: false, error: `Unreadable time_server "${record.time_server}".` };
  }
  const timestamp = wallClockToUtc(clock, options.zone);

  const name = (record.name ?? "").trim();
  if (name === "") return { ok: false, error: "Empty event name." };

  const currency = (record.currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    // Holidays and a few IMF/OPEC entries carry no currency. They cannot be
    // matched to a chart, so they are dropped rather than stored unfilterable.
    return { ok: false, error: `No currency for "${name}".` };
  }

  const importanceRaw = (record.importance ?? "none").trim().toLowerCase();
  if (!isEventImportance(importanceRaw)) {
    return { ok: false, error: `Unknown importance "${importanceRaw}".` };
  }

  const timeModeRaw = (record.time_mode ?? "exact").trim().toLowerCase();
  const timeMode = isEventTimeMode(timeModeRaw) ? timeModeRaw : "exact";

  const periodClock = parseWallClock(record.period_server ?? "");

  return {
    ok: true,
    record: {
      source: options.source,
      externalId,
      seriesId: optionalText(record.event_id),
      eventCode: optionalText(record.event_code),
      name,
      currency,
      country: optionalText(record.country),
      importance: importanceRaw,
      timestamp,
      timeMode,
      period: periodClock ? wallClockToUtc(periodClock, options.zone) : null,
      actual: canonicalFigure(record.actual),
      forecast: canonicalFigure(record.forecast),
      previous: canonicalFigure(record.previous),
      revisedPrevious: canonicalFigure(record.revised_previous),
      unit: optionalText(record.unit)?.toLowerCase() ?? null,
      multiplier: parseMultiplier(record.multiplier),
      digits: parseCount(record.digits),
      revision: parseCount(record.revision),
    },
  };
}

/**
 * Reads the provenance line the exporter writes above the header, so the
 * importer can warn when the zone it was given disagrees with the server the
 * file came from. Returns null for any other line.
 */
export interface ExportHeader {
  server: string | null;
  /** The server's offset from GMT, in minutes, when the export was taken. */
  offsetMinutes: number | null;
  /** When it was taken, UTC epoch ms — the moment that offset applies to. */
  exportedAt: number | null;
}

export function parseExportHeader(line: string): ExportHeader | null {
  if (!line.startsWith(MT5_CSV_COMMENT_PREFIX)) return null;
  if (!line.includes("forextestlab-calendar")) return null;
  const server = /server=(\S+)/.exec(line);
  const offset = /server_gmt_offset_minutes=(-?\d+)/.exec(line);
  const exported = /exported_utc=([\d.]+ [\d:]+)/.exec(line);
  const clock = exported ? parseWallClock(exported[1]!) : null;
  return {
    server: server?.[1] ?? null,
    offsetMinutes: offset ? Number(offset[1]) : null,
    exportedAt: clock ? wallClockToUtc(clock, { kind: "offset", minutes: 0 }) : null,
  };
}
