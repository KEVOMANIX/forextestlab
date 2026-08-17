import { describe, expect, it } from "vitest";

import { formatInZone } from "@/lib/chart/timezones";

/**
 * The label a vertical-line drawing stamps on the time axis.
 *
 * Kept as a test on the format rather than on the canvas: the drawing renders
 * to a 2D context, but what broke was never the drawing — it was the zone and
 * the clock the label was built with.
 */
const VLINE: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

// 12:00 UTC on Tuesday 5 November 2019 — the moment from the bug report.
const at = Date.UTC(2019, 10, 5, 12);

describe("the vertical line's time label", () => {
  it("reads the same clock as the chart it is drawn on", () => {
    // Pinned to New York, this said 07:00 while the bar under it said 15:00.
    expect(formatInZone(at, "Africa/Nairobi", VLINE)).toContain("15:00");
    expect(formatInZone(at, "exchange", VLINE)).toContain("07:00");
    expect(formatInZone(at, "UTC", VLINE)).toContain("12:00");
  });

  it("uses the 24-hour clock the rest of the chart uses", () => {
    // The "en" locale defaults to 12-hour, which is how the line came to read
    // "07:00 AM" beside an axis and legend that never print AM or PM.
    for (const zone of ["exchange", "UTC", "Africa/Nairobi"]) {
      expect(formatInZone(at, zone, VLINE), zone).not.toMatch(/AM|PM/);
    }
  });

  it("names the weekday of the zone it is shown in, not of UTC", () => {
    // Late evening in Tokyo is still the previous day in New York.
    const evening = Date.UTC(2019, 10, 5, 23);
    expect(formatInZone(evening, "Asia/Tokyo", VLINE)).toContain("Wed");
    expect(formatInZone(evening, "exchange", VLINE)).toContain("Tue");
  });
});
