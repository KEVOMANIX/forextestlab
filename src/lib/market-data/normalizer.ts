/**
 * Row normalization: map an arbitrary CSV record to a canonical `Candle`.
 *
 * Timestamps are resolved to UTC epoch milliseconds. Prices are kept as their
 * original trimmed decimal STRINGS once validated numeric (never reformatted).
 * Parsing is deterministic and never depends on the host timezone: date/time
 * components are extracted with a regex and combined via `Date.UTC(...)`.
 *
 * Functions here never throw on bad data — they return `{ error }`.
 */

import { isFiniteNumeric } from "@/lib/decimal";
import type { Candle } from "@/lib/market-data/types";

export interface HeaderMapping {
  timestamp?: string;
  date?: string;
  time?: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume?: string;
  bidOpen?: string;
  bidHigh?: string;
  bidLow?: string;
  bidClose?: string;
  askOpen?: string;
  askHigh?: string;
  askLow?: string;
  askClose?: string;
}

/** Default column names (lower-case, snake_case) recognised out of the box. */
export const DEFAULT_HEADER_MAPPING: HeaderMapping = {
  timestamp: "timestamp",
  date: "date",
  time: "time",
  open: "open",
  high: "high",
  low: "low",
  close: "close",
  volume: "volume",
  bidOpen: "bid_open",
  bidHigh: "bid_high",
  bidLow: "bid_low",
  bidClose: "bid_close",
  askOpen: "ask_open",
  askHigh: "ask_high",
  askLow: "ask_low",
  askClose: "ask_close",
};

export interface NormalizeOptions {
  mapping?: Partial<HeaderMapping>;
  /** "UTC" (default) or a fixed offset like "+02:00" / "-05:00". */
  timezone?: string;
  source: string;
}

export interface NormalizeResult {
  candle?: Candle;
  error?: string;
}

/** Look up a mapped column value, trimmed. Returns undefined when absent/blank. */
function readField(
  record: Record<string, string>,
  column: string | undefined,
): string | undefined {
  if (column === undefined) return undefined;
  const raw = record[column];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Parse a fixed offset string ("+02:00", "-0500", "+2") to minutes, or null. */
function parseOffsetMinutes(timezone: string): number | null {
  const match = /^([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(timezone.trim());
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = match[3] !== undefined ? Number(match[3]) : 0;
  if (hours > 23 || minutes > 59) return null;
  return sign * (hours * 60 + minutes);
}

/**
 * Resolve a `timestamp` column value to UTC epoch ms.
 * Accepts epoch seconds (10 digits), epoch ms (13 digits), or ISO-8601.
 */
function resolveTimestampColumn(value: string): number | null {
  if (/^\d+$/.test(value)) {
    if (value.length === 13) return Number(value);
    if (value.length === 10) return Number(value) * 1000;
    // Other pure-integer lengths: treat as ms (best effort).
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }
  return parseIsoOrWallClock(value, 0, true);
}

/**
 * Parse a date(+time) string of the form:
 *   YYYY-MM-DD, YYYY/MM/DD, optionally followed by [ T]HH:mm[:ss[.sss]]
 *   and an optional trailing Z or +hh:mm offset (used when isIso is true).
 *
 * Returns UTC epoch ms, applying `offsetMinutes` (subtracted, since the given
 * wall-clock is in that offset's local time) when no explicit offset is present.
 */
function parseIsoOrWallClock(
  value: string,
  offsetMinutes: number,
  isIso: boolean,
): number | null {
  const match =
    /^(\d{4})[-/](\d{2})[-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
      value,
    );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] !== undefined ? Number(match[4]) : 0;
  const minute = match[5] !== undefined ? Number(match[5]) : 0;
  const second = match[6] !== undefined ? Number(match[6]) : 0;
  const millis =
    match[7] !== undefined ? Number(match[7].padEnd(3, "0")) : 0;
  const explicitOffset = match[8];

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let appliedOffset = offsetMinutes;
  if (isIso && explicitOffset !== undefined) {
    if (explicitOffset === "Z") {
      appliedOffset = 0;
    } else {
      const parsed = parseOffsetMinutes(
        explicitOffset.replace(/(\d{2})(\d{2})$/, "$1:$2"),
      );
      if (parsed === null) return null;
      appliedOffset = parsed;
    }
  } else if (isIso && explicitOffset === undefined) {
    // Bare ISO string with no offset: interpret as UTC wall-clock.
    appliedOffset = 0;
  }

  const utc = Date.UTC(year, month - 1, day, hour, minute, second, millis);
  return utc - appliedOffset * 60_000;
}

/** Resolve the timestamp for a row from either a `timestamp` or `date[/time]` column. */
function resolveTimestamp(
  record: Record<string, string>,
  mapping: HeaderMapping,
  offsetMinutes: number,
): { ms?: number; error?: string } {
  const timestampValue = readField(record, mapping.timestamp);
  if (timestampValue !== undefined) {
    const ms = resolveTimestampColumn(timestampValue);
    if (ms === null || !Number.isFinite(ms)) {
      return { error: `Unparseable timestamp: "${timestampValue}"` };
    }
    return { ms };
  }

  const dateValue = readField(record, mapping.date);
  if (dateValue === undefined) {
    return { error: "Missing timestamp: no timestamp or date column value" };
  }
  const timeValue = readField(record, mapping.time);
  const combined =
    timeValue !== undefined ? `${dateValue} ${timeValue}` : dateValue;
  const ms = parseIsoOrWallClock(combined, offsetMinutes, false);
  if (ms === null || !Number.isFinite(ms)) {
    return { error: `Unparseable date: "${combined}"` };
  }
  return { ms };
}

/** Normalize one raw record into a Candle, or return an error string. */
export function normalizeRow(
  record: Record<string, string>,
  options: NormalizeOptions,
): NormalizeResult {
  const mapping: HeaderMapping = {
    ...DEFAULT_HEADER_MAPPING,
    ...options.mapping,
  };

  const timezone = options.timezone ?? "UTC";
  let offsetMinutes = 0;
  if (timezone !== "UTC") {
    const parsed = parseOffsetMinutes(timezone);
    if (parsed === null) {
      return { error: `Unsupported timezone: "${timezone}"` };
    }
    offsetMinutes = parsed;
  }

  const ts = resolveTimestamp(record, mapping, offsetMinutes);
  if (ts.error !== undefined || ts.ms === undefined) {
    return { error: ts.error ?? "Missing timestamp" };
  }

  const open = readField(record, mapping.open);
  const high = readField(record, mapping.high);
  const low = readField(record, mapping.low);
  const close = readField(record, mapping.close);

  for (const [name, value] of [
    ["open", open],
    ["high", high],
    ["low", low],
    ["close", close],
  ] as const) {
    if (value === undefined) {
      return { error: `Missing ${name} price` };
    }
    if (!isFiniteNumeric(value)) {
      return { error: `Non-numeric ${name} price: "${value}"` };
    }
  }

  // All four validated non-undefined and numeric above.
  const candle: Candle = {
    timestamp: ts.ms,
    open: open as string,
    high: high as string,
    low: low as string,
    close: close as string,
    source: options.source,
  };

  const optional: Array<[keyof Candle, string | undefined]> = [
    ["volume", mapping.volume],
    ["bidOpen", mapping.bidOpen],
    ["bidHigh", mapping.bidHigh],
    ["bidLow", mapping.bidLow],
    ["bidClose", mapping.bidClose],
    ["askOpen", mapping.askOpen],
    ["askHigh", mapping.askHigh],
    ["askLow", mapping.askLow],
    ["askClose", mapping.askClose],
  ];

  for (const [field, column] of optional) {
    const value = readField(record, column);
    if (value === undefined) continue;
    if (!isFiniteNumeric(value)) {
      return { error: `Non-numeric ${String(field)}: "${value}"` };
    }
    (candle[field] as string) = value;
  }

  return { candle };
}
