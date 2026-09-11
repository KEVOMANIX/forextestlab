/**
 * The keyboard interval switch.
 *
 * Typing a number on the chart opens a field and applies it as a timeframe, the
 * way every terminal does it: `5` is five minutes, `60` is an hour rather than
 * a missing sixty-minute timeframe, and a unit letter overrides the default.
 *
 * Parsing lives here, apart from the dialog, because the interesting behaviour
 * is all in the edges — 60 minutes and 1 hour are the same chart, `1w` and `1W`
 * are the same week, and `M` must mean months while `m` means minutes.
 */

import { TIMEFRAMES, type Timeframe } from "@/lib/market-data/types";

const MINUTE = 1;
const HOUR = 60;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Calendar months vary; this is only used to rank and match, never to measure. */
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const UNIT_MINUTES: Record<string, number> = {
  m: MINUTE,
  h: HOUR,
  d: DAY,
  w: WEEK,
  M: MONTH,
  y: YEAR,
};

/** Minutes in a timeframe code, for matching a typed value against the list. */
export function timeframeMinutes(timeframe: Timeframe): number {
  const match = /^(\d+)(m|h|d|w|M|yr)$/.exec(timeframe);
  if (!match) return Number.NaN;
  const size = Number(match[1]);
  const unit = match[2] === "yr" ? "y" : match[2]!;
  return size * (UNIT_MINUTES[unit] ?? Number.NaN);
}

const UNIT_NAMES: Record<string, [string, string]> = {
  m: ["minute", "minutes"],
  h: ["hour", "hours"],
  d: ["day", "days"],
  w: ["week", "weeks"],
  M: ["month", "months"],
  y: ["year", "years"],
};

export interface IntervalGuess {
  /** The timeframe this resolves to, or null when nothing matches. */
  timeframe: Timeframe | null;
  /** "5 minutes" — what the field is about to do, in words. */
  label: string;
}

/**
 * Resolve typed text to one of the timeframes this chart offers.
 *
 * @param available Timeframes the chart can actually show. A value that parses
 * cleanly but is not offered resolves to null rather than to a near miss:
 * silently loading a different chart from the one that was typed is worse than
 * saying no.
 */
export function parseIntervalInput(
  raw: string,
  available: readonly Timeframe[] = TIMEFRAMES,
): IntervalGuess {
  const text = raw.trim();
  if (!text) return { timeframe: null, label: "" };

  // A bare unit letter is a whole one of that unit — "d" is one day.
  const match = /^(\d*)\s*(m|h|d|w|M|y|yr|H|D|W|Y)?$/.exec(text);
  if (!match) return { timeframe: null, label: "Not a valid interval" };

  const size = match[1] ? Number(match[1]) : 1;
  if (!Number.isFinite(size) || size <= 0) {
    return { timeframe: null, label: "Not a valid interval" };
  }

  const typedUnit = match[2];
  /*
    Case matters for one letter only. `m` is minutes and `M` is months, which
    is the convention every charting platform uses and the one the timeframe
    codes themselves already follow; the rest are accepted either way.
  */
  const unit =
    typedUnit == null
      ? "m"
      : typedUnit === "m" || typedUnit === "M"
        ? typedUnit
        : typedUnit.toLowerCase() === "yr"
          ? "y"
          : typedUnit.toLowerCase();

  const perUnit = UNIT_MINUTES[unit];
  if (perUnit == null) return { timeframe: null, label: "Not a valid interval" };

  const minutes = size * perUnit;
  const names = UNIT_NAMES[unit]!;
  const label = `${size} ${size === 1 ? names[0] : names[1]}`;

  // Matched on duration, so 60 finds 1h and 24h finds 1d rather than failing
  // for want of a timeframe code nobody offers.
  const timeframe =
    available.find((candidate) => timeframeMinutes(candidate) === minutes) ?? null;

  return {
    timeframe,
    label: timeframe ? label : `${label} — not available`,
  };
}

/**
 * Whether a keypress should open the interval field.
 *
 * Only unmodified digits, and never while something is being typed into: the
 * chart shares its page with an order ticket, a search box and a journal.
 */
export function opensIntervalInput(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return /^[0-9]$/.test(event.key);
}
