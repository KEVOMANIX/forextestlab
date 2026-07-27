import { describe, expect, it } from "vitest";

import {
  EXCHANGE_ZONE,
  TIME_ZONES,
  formatInZone,
  resolveZone,
  zoneOffsetLabel,
  zoneOffsetMinutes,
  zoneOptionsAt,
} from "./timezones";

const JANUARY = Date.parse("2024-01-15T12:00:00Z");
const JULY = Date.parse("2024-07-15T12:00:00Z");

describe("timezones", () => {
  it("labels whole-hour offsets the way traders write them", () => {
    expect(zoneOffsetLabel("Europe/Istanbul", JANUARY)).toBe("UTC+3");
    expect(zoneOffsetLabel("America/New_York", JANUARY)).toBe("UTC-5");
    expect(zoneOffsetLabel("Asia/Tokyo", JANUARY)).toBe("UTC+9");
  });

  it("keeps the minutes on zones that are not on a whole hour", () => {
    expect(zoneOffsetLabel("Asia/Kolkata", JANUARY)).toBe("UTC+5:30");
    expect(zoneOffsetLabel("Asia/Kathmandu", JANUARY)).toBe("UTC+5:45");
  });

  it("reports UTC without a sign", () => {
    expect(zoneOffsetLabel("UTC", JANUARY)).toBe("UTC");
  });

  it("follows daylight saving, because an offset belongs to a moment", () => {
    // A session replaying last winter must not be labelled with summer's offset.
    expect(zoneOffsetLabel("America/New_York", JANUARY)).toBe("UTC-5");
    expect(zoneOffsetLabel("America/New_York", JULY)).toBe("UTC-4");
    expect(zoneOffsetLabel("Europe/London", JANUARY)).toBe("UTC");
    expect(zoneOffsetLabel("Europe/London", JULY)).toBe("UTC+1");
  });

  it("treats the exchange sentinel as the forex convention, New York", () => {
    expect(resolveZone(EXCHANGE_ZONE)).toBe("America/New_York");
    expect(zoneOffsetLabel(EXCHANGE_ZONE, JANUARY)).toBe(zoneOffsetLabel("America/New_York", JANUARY));
  });

  it("formats the same moment differently per zone", () => {
    const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    expect(formatInZone(JANUARY, "UTC", options)).toBe("12:00");
    expect(formatInZone(JANUARY, "Europe/Istanbul", options)).toBe("15:00");
    expect(formatInZone(JANUARY, "America/New_York", options)).toBe("07:00");
  });

  it("offers every catalogue entry with an offset, and no duplicate ids", () => {
    const options = zoneOptionsAt(JANUARY);
    expect(options).toHaveLength(TIME_ZONES.length);
    expect(options.every((option) => option.offset.startsWith("UTC"))).toBe(true);
    expect(new Set(TIME_ZONES.map((zone) => zone.id)).size).toBe(TIME_ZONES.length);
  });

  it("has only zone ids the runtime accepts", () => {
    for (const zone of TIME_ZONES) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: resolveZone(zone.id) })).not.toThrow();
    }
  });
});

describe("zoneOptionsAt ordering", () => {
  it("keeps UTC and Exchange at the top", () => {
    const [first, second] = zoneOptionsAt(JANUARY);
    expect(first?.id).toBe("UTC");
    expect(second?.id).toBe(EXCHANGE_ZONE);
  });

  it("orders the cities west to east at that moment", () => {
    const minutes = zoneOptionsAt(JANUARY)
      .slice(2)
      .map((option) => zoneOffsetMinutes(option.id, JANUARY));
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it("re-orders when daylight saving moves a zone past its neighbour", () => {
    // Phoenix stays on UTC-7 all year; Denver shares it in winter and jumps to
    // UTC-6 in summer, so the two swap places between the two dates.
    const winter = zoneOptionsAt(JANUARY).map((option) => option.id);
    const summer = zoneOptionsAt(JULY).map((option) => option.id);
    expect(zoneOffsetMinutes("America/Denver", JANUARY)).toBe(zoneOffsetMinutes("America/Phoenix", JANUARY));
    expect(winter.indexOf("America/Denver")).toBeLessThan(winter.indexOf("America/Phoenix"));
    expect(summer.indexOf("America/Denver")).toBeGreaterThan(summer.indexOf("America/Phoenix"));
  });
});
