import { describe, expect, it } from "vitest";

import { NO_FIGURE, formatEventTime, formatFigure, surpriseDirection } from "./format";
import { currenciesForSymbol } from "./types";
import type { CalendarEvent } from "./types";

const ISM: CalendarEvent = {
  id: "1",
  name: "ISM Services PMI",
  currency: "USD",
  country: "United States",
  importance: "high",
  timestamp: Date.UTC(2026, 7, 5, 10, 0),
  timeMode: "exact",
  actual: null,
  forecast: "54.5",
  previous: "54",
  unit: null,
  multiplier: null,
  digits: 1,
};

describe("formatFigure", () => {
  it("prints a plain reading as published", () => {
    expect(formatFigure("54.5")).toBe("54.5");
    expect(formatFigure("54")).toBe("54");
  });

  it("marks an unpublished figure rather than leaving it blank", () => {
    // A blank cell reads as a zero reading, which for a release the replay has
    // not reached yet is the opposite of the truth.
    expect(formatFigure(null)).toBe(NO_FIGURE);
    expect(formatFigure("")).toBe(NO_FIGURE);
  });

  it("carries the unit and the scale", () => {
    expect(formatFigure("3.2", { unit: "percent" })).toBe("3.2%");
    expect(formatFigure("150", { multiplier: "thousands" })).toBe("150K");
    expect(formatFigure("1.4", { multiplier: "billions" })).toBe("1.4B");
    expect(formatFigure("-0.3", { unit: "percent" })).toBe("-0.3%");
  });

  it("prints a genuine zero as a reading, not as absent", () => {
    expect(formatFigure("0", { unit: "percent" })).toBe("0%");
  });
});

describe("formatEventTime", () => {
  it("gives the date and clock for a scheduled release, in the chart's zone", () => {
    expect(formatEventTime(ISM, "UTC")).toBe("05 Aug '26 10:00");
    expect(formatEventTime(ISM, "America/New_York")).toBe("05 Aug '26 06:00");
  });

  it("drops the clock for a release known only to the day", () => {
    // Printing 00:00 would claim a minute the calendar never gave.
    expect(formatEventTime({ ...ISM, timeMode: "date" }, "UTC")).toBe("05 Aug '26");
    expect(formatEventTime({ ...ISM, timeMode: "notime" }, "UTC")).toBe("05 Aug '26");
  });

  it("says so when the date itself is provisional", () => {
    expect(formatEventTime({ ...ISM, timeMode: "tentative" }, "UTC")).toBe(
      "05 Aug '26 (tentative)",
    );
  });
});

describe("surpriseDirection", () => {
  it("compares the actual with the forecast", () => {
    expect(surpriseDirection({ actual: "55", forecast: "54.5" })).toBe("beat");
    expect(surpriseDirection({ actual: "54", forecast: "54.5" })).toBe("miss");
    expect(surpriseDirection({ actual: "54.5", forecast: "54.5" })).toBe("met");
  });

  it("has no opinion before the release", () => {
    expect(surpriseDirection({ actual: null, forecast: "54.5" })).toBeNull();
    expect(surpriseDirection({ actual: "54.5", forecast: null })).toBeNull();
  });
});

describe("currenciesForSymbol", () => {
  it("takes both legs of a pair, and always the dollar", () => {
    expect(currenciesForSymbol("EURGBP", "EUR", "GBP")).toEqual(["EUR", "GBP", "USD"]);
    expect(currenciesForSymbol("USDJPY", "USD", "JPY")).toEqual(["JPY", "USD"]);
  });

  it("leaves gold, silver and crypto with the dollar alone", () => {
    // "XAU" and "BTC" are three capitals each and neither has a central bank.
    expect(currenciesForSymbol("XAUUSD", "XAU", "USD")).toEqual(["USD"]);
    expect(currenciesForSymbol("BTCUSD", "BTC", "USD")).toEqual(["USD"]);
    expect(currenciesForSymbol("DXY", "DXY", "USD")).toEqual(["USD"]);
  });

  it("splits a six-letter symbol when there is no definition to hand", () => {
    expect(currenciesForSymbol("AUDNZD")).toEqual(["AUD", "NZD", "USD"]);
    expect(currenciesForSymbol("SomeIndex")).toEqual(["USD"]);
  });
});
