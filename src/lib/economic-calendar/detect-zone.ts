/**
 * Works out which timezone an MT5 calendar export was written in, from the
 * export itself.
 *
 * The alternative is asking the trader, and the honest answer for most brokers
 * is "GMT+3, I think" — which is ambiguous in exactly the way that matters. A
 * server on a fixed UTC+3 and one on EET summer time both read +3 in August and
 * differ by an hour every winter, so the wrong pick silently misplaces half the
 * history.
 *
 * The trick is that statistical agencies publish at a fixed *local* time: US
 * nonfarm payrolls is 08:30 in New York whatever the season, and the clock in
 * New York and the clock on the broker's server change on different dates. So
 * for each candidate zone, convert a recurring release's wall clocks to UTC and
 * render them back in the issuing country's zone. Only the true candidate makes
 * every release land on the same local minute; the rest scatter across the DST
 * boundaries.
 */

import { formatInZone } from "@/lib/chart/timezones";
import { parseWallClock, wallClockToUtc, zoneOffsetMinutesAt, type ZoneSpec } from "./timezone";

/** Where each currency's statistics offices keep their clocks. */
const ISSUING_ZONE: Record<string, string> = {
  USD: "America/New_York",
  CAD: "America/Toronto",
  GBP: "Europe/London",
  EUR: "Europe/Berlin",
  CHF: "Europe/Zurich",
  JPY: "Asia/Tokyo",
  AUD: "Australia/Sydney",
  NZD: "Pacific/Auckland",
  CNY: "Asia/Shanghai",
};

/**
 * Zones brokers actually run, in preference order. Several keep the same clock
 * as each other — Kyiv, Athens, Helsinki and Riga are all EET — and those are
 * reported together rather than picked between, because the choice cannot be
 * made from the data and does not matter.
 */
const CANDIDATE_ZONES = [
  "Europe/Kyiv",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Riga",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Moscow",
  "America/New_York",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Asia/Dubai",
];

/** Fixed offsets, in whole and half hours across the range servers use. */
const CANDIDATE_OFFSETS = [
  -300, -240, -180, -120, -60, 0, 60, 120, 150, 180, 210, 240, 300, 330, 480, 600, 660,
];

export interface ExportRow {
  currency: string;
  name: string;
  /**
   * The provider's id for the recurring indicator. Grouping on this rather than
   * on the name is what makes an anchor trustworthy: MT5 files a dozen
   * countries' CPI under the euro with the identical name "CPI m/m", and lumped
   * together they have no single publication time to recognise.
   */
  seriesId?: string;
  /** The exporter's wall-clock string, e.g. "2026.08.05 13:00:00". */
  timeServer: string;
}

export interface ZoneScore {
  /** What to pass to `--timezone`. */
  timezone: string;
  spec: ZoneSpec;
  /** Share of the anchor's releases landing on its modal local minute, 0–1. */
  score: number;
  /** The local time they land on, in the issuing country's zone. */
  localTime: string;
}

export interface DetectOptions {
  /**
   * The server's offset from GMT when the export was taken, from the file's own
   * header. Without it the schedule test alone cannot separate zones that share
   * a daylight-saving calendar: London, Berlin and Kyiv all switch on the same
   * dates, so all three make a fixed-local-time release look perfectly
   * consistent while sitting one, two and three hours apart.
   */
  observedOffsetMinutes?: number | null;
  /** When that offset was observed, UTC epoch ms. */
  observedAt?: number | null;
}

export interface ZoneDetection {
  /** Null when the export has no release recurring across a DST boundary. */
  best: ZoneScore | null;
  runnerUp: ZoneScore | null;
  /** The recurring release the verdict rests on. */
  anchor: { currency: string; name: string; issuingZone: string; samples: number } | null;
  /** True when the winner is clear of everything not equivalent to it. */
  confident: boolean;
  /** Zone names keeping the same clock as the winner — interchangeable here. */
  equivalent: string[];
  /** True when the file's header pinned the offset, narrowing the candidates. */
  offsetPinned: boolean;
}

/** A release must recur this often before its schedule is worth trusting. */
const MIN_SAMPLES = 8;
/** How far ahead of the runner-up the winner must be to be called confident. */
const MIN_MARGIN = 0.15;

interface Anchor {
  currency: string;
  name: string;
  issuingZone: string;
  times: number[][];
}

/** How many candidate anchors to try before settling. */
const MAX_ANCHORS = 12;

/**
 * Recurring releases worth judging by, largest first: those with enough
 * occurrences, spanning both halves of the year. A release seen only in summer
 * cannot tell a fixed offset from a seasonal one, which is the whole question.
 *
 * Several are returned rather than one, because size is a poor proxy for
 * quality. The largest group in a real export turned out to be a euro-area
 * aggregate published at whatever hour each member state chose; a smaller,
 * better-behaved series beats it.
 */
function chooseAnchors(rows: ExportRow[]): Anchor[] {
  const groups = new Map<string, { currency: string; name: string; clocks: number[][] }>();

  for (const row of rows) {
    const currency = row.currency.trim().toUpperCase();
    if (!ISSUING_ZONE[currency]) continue;
    const clock = parseWallClock(row.timeServer);
    // A date-only release has no clock to compare, so it proves nothing here.
    if (!clock || (clock.hour === 0 && clock.minute === 0)) continue;

    const name = row.name.trim();
    const key = `${currency}|${row.seriesId?.trim() || name}`;
    const group = groups.get(key) ?? { currency, name, clocks: [] };
    group.clocks.push([clock.year, clock.month, clock.day, clock.hour, clock.minute]);
    groups.set(key, group);
  }

  return [...groups.values()]
    .filter((group) => {
      if (group.clocks.length < MIN_SAMPLES) return false;
      const months = new Set(group.clocks.map((clock) => clock[1]!));
      const winter = [...months].some((month) => month <= 2 || month === 12);
      const summer = [...months].some((month) => month >= 6 && month <= 8);
      return winter && summer;
    })
    .sort((a, b) => b.clocks.length - a.clocks.length)
    .slice(0, MAX_ANCHORS)
    .map((group) => ({
      currency: group.currency,
      name: group.name,
      issuingZone: ISSUING_ZONE[group.currency]!,
      times: group.clocks,
    }));
}

function scoreCandidate(anchor: Anchor, timezone: string, spec: ZoneSpec): ZoneScore {
  const counts = new Map<string, number>();
  for (const [year, month, day, hour, minute] of anchor.times) {
    const at = wallClockToUtc(
      { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: 0 },
      spec,
    );
    const local = formatInZone(at, anchor.issuingZone, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    counts.set(local, (counts.get(local) ?? 0) + 1);
  }

  let localTime = "";
  let modal = 0;
  for (const [time, count] of counts) {
    if (count > modal) {
      modal = count;
      localTime = time;
    }
  }
  return { timezone, spec, score: modal / anchor.times.length, localTime };
}

function offsetLabel(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

function offsetOf(spec: ZoneSpec, at: number): number {
  return spec.kind === "offset" ? spec.minutes : zoneOffsetMinutesAt(at, spec.timeZone);
}

/**
 * Whether two candidates keep the same clock across the years the export covers.
 * Probed rather than reasoned about: two zones on the same offset today can part
 * company next spring, and only one of them will still be right then.
 */
function sameClock(a: ZoneSpec, b: ZoneSpec, probes: number[]): boolean {
  return probes.every((at) => offsetOf(a, at) === offsetOf(b, at));
}

/** Mid-January and mid-July of every year the anchor spans. */
function probeInstants(anchor: Anchor): number[] {
  const years = new Set(anchor.times.map((clock) => clock[0]!));
  const probes: number[] = [];
  for (const year of years) {
    probes.push(Date.UTC(year, 0, 15, 12), Date.UTC(year, 6, 15, 12));
  }
  return probes;
}

export function detectServerZone(
  rows: ExportRow[],
  options: DetectOptions = {},
): ZoneDetection {
  const anchors = chooseAnchors(rows);
  if (anchors.length === 0) {
    return {
      best: null,
      runnerUp: null,
      anchor: null,
      confident: false,
      equivalent: [],
      offsetPinned: false,
    };
  }

  // Each anchor gets a full verdict; the one that recognises its own schedule
  // most cleanly is the one to trust. A confident verdict short-circuits the
  // rest — there is nothing to gain from a thirteenth opinion.
  let verdict: ZoneDetection | null = null;
  for (const anchor of anchors) {
    const candidate = judgeAnchor(anchor, options);
    if (verdict == null || (candidate.best?.score ?? 0) > (verdict.best?.score ?? 0)) {
      verdict = candidate;
    }
    if (verdict.confident && (verdict.best?.score ?? 0) === 1) break;
  }
  return verdict!;
}

function judgeAnchor(anchor: Anchor, options: DetectOptions): ZoneDetection {
  const candidates: { timezone: string; spec: ZoneSpec }[] = [
    ...CANDIDATE_ZONES.map((timeZone) => ({
      timezone: timeZone,
      spec: { kind: "zone", timeZone } as ZoneSpec,
    })),
    ...CANDIDATE_OFFSETS.map((minutes) => ({
      timezone: offsetLabel(minutes),
      spec: { kind: "offset", minutes } as ZoneSpec,
    })),
  ];

  // The header's offset is hard evidence about one instant. Anything that was on
  // a different offset then is simply not this server.
  const { observedOffsetMinutes, observedAt } = options;
  const pinned = observedOffsetMinutes != null && observedAt != null;
  const eligible = pinned
    ? candidates.filter((candidate) => offsetOf(candidate.spec, observedAt) === observedOffsetMinutes)
    : candidates;
  if (eligible.length === 0) {
    // An offset no candidate matches — an exotic server. Fall back to the
    // unpinned field rather than reporting nothing.
    eligible.push(...candidates);
  }

  const scores = eligible
    .map((candidate) => scoreCandidate(anchor, candidate.timezone, candidate.spec))
    // Named zones first at equal score: a broker on EET is on EET, and recording
    // that keeps next winter right without another import.
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const named = (score: ZoneScore) => (score.spec.kind === "zone" ? 0 : 1);
      return named(a) - named(b);
    });

  const best = scores[0]!;
  const probes = probeInstants(anchor);
  const equivalent = scores
    .slice(1)
    .filter((score) => sameClock(score.spec, best.spec, probes))
    .map((score) => score.timezone);
  const rivals = scores.slice(1).filter((score) => !sameClock(score.spec, best.spec, probes));
  const runnerUp = rivals[0] ?? null;

  return {
    best,
    runnerUp,
    anchor: {
      currency: anchor.currency,
      name: anchor.name,
      issuingZone: anchor.issuingZone,
      samples: anchor.times.length,
    },
    // Judged against the best rival that is a genuinely different clock, not
    // against another name for the same one.
    confident:
      best.score >= 0.9 && (runnerUp == null || best.score - runnerUp.score >= MIN_MARGIN),
    equivalent,
    offsetPinned: pinned,
  };
}
