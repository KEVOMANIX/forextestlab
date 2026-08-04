import { describe, expect, it } from "vitest";

import {
  parseWallClock,
  parseZoneSpec,
  wallClockToUtc,
  zoneOffsetMinutesAt,
} from "./timezone";

/**
 * The whole feature turns on this file. MetaTrader hands out calendar times in
 * the broker's timezone, so getting the conversion wrong does not fail loudly —
 * it silently puts every release an hour from the candle that moved on it.
 */

describe("parseZoneSpec", () => {
  it("takes UTC by any of its names", () => {
    for (const name of ["UTC", "utc", "GMT", "Z", ""]) {
      expect(parseZoneSpec(name)).toEqual({ kind: "offset", minutes: 0 });
    }
  });

  it("takes fixed offsets in the forms a broker writes them", () => {
    expect(parseZoneSpec("+02:00")).toEqual({ kind: "offset", minutes: 120 });
    expect(parseZoneSpec("+0200")).toEqual({ kind: "offset", minutes: 120 });
    expect(parseZoneSpec("+2")).toEqual({ kind: "offset", minutes: 120 });
    expect(parseZoneSpec("-05:30")).toEqual({ kind: "offset", minutes: -330 });
    expect(parseZoneSpec("UTC+3")).toEqual({ kind: "offset", minutes: 180 });
  });

  it("takes IANA zone names", () => {
    expect(parseZoneSpec("Europe/Athens")).toEqual({
      kind: "zone",
      timeZone: "Europe/Athens",
    });
    expect(parseZoneSpec("America/New_York")).toEqual({
      kind: "zone",
      timeZone: "America/New_York",
    });
  });

  it("rejects what it cannot resolve, rather than defaulting to UTC", () => {
    // Defaulting would be the dangerous choice: the import would succeed and
    // every timestamp would be wrong by the broker's offset.
    expect(parseZoneSpec("Europe/Atlantis")).toBeNull();
    expect(parseZoneSpec("EET+2")).toBeNull();
    expect(parseZoneSpec("+25:00")).toBeNull();
  });
});

describe("zoneOffsetMinutesAt", () => {
  it("reads the offset in force at the moment asked, not today's", () => {
    // New York: winter is UTC-5, summer UTC-4.
    expect(zoneOffsetMinutesAt(Date.UTC(2026, 0, 15, 12), "America/New_York")).toBe(-300);
    expect(zoneOffsetMinutesAt(Date.UTC(2026, 6, 15, 12), "America/New_York")).toBe(-240);
  });

  it("handles a zone on a half-hour offset", () => {
    expect(zoneOffsetMinutesAt(Date.UTC(2026, 0, 15, 12), "Asia/Kolkata")).toBe(330);
  });
});

describe("wallClockToUtc", () => {
  it("subtracts a fixed offset", () => {
    const clock = { year: 2026, month: 8, day: 5, hour: 10, minute: 0, second: 0 };
    expect(wallClockToUtc(clock, { kind: "offset", minutes: 120 })).toBe(
      Date.UTC(2026, 7, 5, 8, 0, 0),
    );
  });

  it("uses each date's own daylight-saving rule", () => {
    // A broker on EET: 10:00 in January is 08:00 UTC, 10:00 in July is 07:00.
    const zone = { kind: "zone", timeZone: "Europe/Athens" } as const;
    expect(
      wallClockToUtc({ year: 2026, month: 1, day: 15, hour: 10, minute: 0, second: 0 }, zone),
    ).toBe(Date.UTC(2026, 0, 15, 8, 0, 0));
    expect(
      wallClockToUtc({ year: 2026, month: 7, day: 15, hour: 10, minute: 0, second: 0 }, zone),
    ).toBe(Date.UTC(2026, 6, 15, 7, 0, 0));
  });

  it("is an hour out for the summer half of the year if a fixed offset is used", () => {
    // The reason --timezone takes zone names. This documents the failure the
    // importer warns about rather than asserting the wrong answer is right.
    const clock = { year: 2026, month: 7, day: 15, hour: 10, minute: 0, second: 0 };
    const fixed = wallClockToUtc(clock, { kind: "offset", minutes: 120 });
    const zoned = wallClockToUtc(clock, { kind: "zone", timeZone: "Europe/Athens" });
    expect(fixed - zoned).toBe(60 * 60 * 1000);
  });

  it("resolves a clock sitting on the spring-forward discontinuity", () => {
    // 03:30 on 29 March 2026 does not exist in Athens; the clock jumps 03:00 to
    // 04:00. Any answer within the hour is defensible, but it must be a real
    // instant and not NaN.
    const at = wallClockToUtc(
      { year: 2026, month: 3, day: 29, hour: 3, minute: 30, second: 0 },
      { kind: "zone", timeZone: "Europe/Athens" },
    );
    expect(Number.isFinite(at)).toBe(true);
    expect(new Date(at).toISOString()).toMatch(/^2026-03-29T0[01]:30/);
  });
});

describe("parseWallClock", () => {
  it("reads the MQL5 TimeToString formats", () => {
    expect(parseWallClock("2026.08.05 10:00:00")).toEqual({
      year: 2026,
      month: 8,
      day: 5,
      hour: 10,
      minute: 0,
      second: 0,
    });
    expect(parseWallClock("2026.08.05")).toEqual({
      year: 2026,
      month: 8,
      day: 5,
      hour: 0,
      minute: 0,
      second: 0,
    });
  });

  it("reads ISO separators too, for a hand-edited file", () => {
    expect(parseWallClock("2026-08-05T13:30")).toMatchObject({ hour: 13, minute: 30 });
  });

  it("rejects a date that does not exist rather than rolling it forward", () => {
    // Date.UTC turns 31 February into 3 March without complaint.
    expect(parseWallClock("2026.02.31")).toBeNull();
    expect(parseWallClock("2026.13.01")).toBeNull();
    expect(parseWallClock("2026.08.05 25:00:00")).toBeNull();
    expect(parseWallClock("")).toBeNull();
    expect(parseWallClock("not a date")).toBeNull();
  });
});
