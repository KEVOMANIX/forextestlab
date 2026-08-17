import { describe, expect, it } from "vitest";

import { fixedOffsetLabel } from "./ReportTimeZone";

const jan = (day: number) => Date.UTC(2019, 0, day, 15);
const jul = (day: number) => Date.UTC(2019, 6, day, 15);

describe("naming the offset on a report", () => {
  it("states it when one offset covers the whole period", () => {
    // Deep winter: New York was UTC−5 throughout.
    expect(fixedOffsetLabel(jan(2), jan(28))).toBe("UTC-5");
    // High summer: UTC−4 throughout.
    expect(fixedOffsetLabel(jul(2), jul(28))).toBe("UTC-4");
  });

  it("says nothing when the period crosses a daylight-saving change", () => {
    // An offset belongs to a moment, not to a place. Printing one figure over
    // a span containing the March changeover would be wrong for half the data,
    // so the badge names the zone alone and lets the (i) explain the shift.
    expect(fixedOffsetLabel(jan(2), jul(28))).toBeNull();
    expect(fixedOffsetLabel(Date.UTC(2019, 2, 1), Date.UTC(2019, 2, 31))).toBeNull();
  });

  it("says nothing when there is no period to measure", () => {
    expect(fixedOffsetLabel(undefined, undefined)).toBeNull();
    expect(fixedOffsetLabel(jan(2), undefined)).toBeNull();
  });
});
