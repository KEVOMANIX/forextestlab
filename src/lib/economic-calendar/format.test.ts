import { describe, expect, it } from "vitest";

import {
  NO_FIGURE,
  describeEvent,
  formatEventTime,
  formatFigure,
  hasReportedFigures,
  revealAt,
  surpriseDirection,
} from "./format";
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
  const name = "ISM Services PMI";

  it("compares the actual with the forecast, higher is better by default", () => {
    expect(surpriseDirection({ actual: "55", forecast: "54.5", name })).toBe("beat");
    expect(surpriseDirection({ actual: "54", forecast: "54.5", name })).toBe("miss");
    expect(surpriseDirection({ actual: "54.5", forecast: "54.5", name })).toBe("met");
  });

  it("has no opinion before the release", () => {
    expect(surpriseDirection({ actual: null, forecast: "54.5", name })).toBeNull();
    expect(surpriseDirection({ actual: "54.5", forecast: null, name })).toBeNull();
  });

  it("inverts for a lower-is-better indicator", () => {
    // 216K beating a 218K claims forecast is good news — fewer people filed —
    // and must not read the same as a miss.
    expect(
      surpriseDirection({ actual: "216", forecast: "218", name: "Initial Jobless Claims" }),
    ).toBe("beat");
    expect(
      surpriseDirection({ actual: "220", forecast: "218", name: "Initial Jobless Claims" }),
    ).toBe("miss");
    expect(
      surpriseDirection({ actual: "4.1", forecast: "4.2", name: "Unemployment Rate" }),
    ).toBe("beat");
    expect(
      surpriseDirection({ actual: "4.3", forecast: "4.2", name: "Unemployment Rate" }),
    ).toBe("miss");
  });

  it("still calls a match a match regardless of polarity", () => {
    expect(
      surpriseDirection({ actual: "218", forecast: "218", name: "Initial Jobless Claims" }),
    ).toBe("met");
  });

  it("leaves inflation at the default direction, deliberately unguessed", () => {
    // A hotter CPI print is bad for households but often bullish for the
    // currency — there is no single "good" side to assign it.
    expect(surpriseDirection({ actual: "3.5", forecast: "3.2", name: "CPI y/y" })).toBe("beat");
  });
});

const NFP: CalendarEvent = {
  id: "nfp",
  name: "Nonfarm Payrolls",
  currency: "USD",
  country: "United States",
  importance: "high",
  timestamp: Date.UTC(2024, 2, 8, 13, 30),
  timeMode: "exact",
  actual: "275",
  forecast: "220",
  previous: "353",
  unit: null,
  multiplier: "thousands",
  digits: 0,
};

const SPEECH: CalendarEvent = {
  ...NFP,
  id: "speech",
  name: "ECB President Lagarde Speech",
  actual: null,
  forecast: null,
  previous: null,
};

describe("revealAt", () => {
  it("keeps the actual once the replay has passed the release", () => {
    const boundary = NFP.timestamp; // exactly on the release
    expect(revealAt(NFP, boundary).actual).toBe("275");
    expect(revealAt(NFP, boundary + 60_000).actual).toBe("275");
  });

  it("withholds the actual for a release the replay has not reached", () => {
    // The database holds the true March 2024 print regardless of which March
    // 2024 candle a replay is on — this is the one thing standing between that
    // and a trader seeing Friday's number on Thursday.
    expect(revealAt(NFP, NFP.timestamp - 60_000).actual).toBeNull();
  });

  it("withholds everything before any candle has been revealed", () => {
    expect(revealAt(NFP, null).actual).toBeNull();
  });

  it("leaves forecast and previous alone regardless of the boundary", () => {
    // Both are genuinely public before a release in real trading; masking them
    // would remove information a live trader actually had.
    const revealed = revealAt(NFP, NFP.timestamp - 60_000);
    expect(revealed.forecast).toBe("220");
    expect(revealed.previous).toBe("353");
  });

  it("does nothing to an event with no actual to hide", () => {
    expect(revealAt(SPEECH, SPEECH.timestamp - 60_000)).toBe(SPEECH);
  });

  it("does nothing once the actual is already visible, avoiding a needless copy", () => {
    expect(revealAt(NFP, NFP.timestamp)).toBe(NFP);
  });
});

describe("hasReportedFigures", () => {
  it("is true for a release with a forecast, even pending", () => {
    expect(hasReportedFigures({ actual: null, forecast: "220", previous: "353" })).toBe(true);
  });

  it("is true for a release with only an actual, e.g. one nobody forecasts", () => {
    expect(hasReportedFigures({ actual: "82.1", forecast: null, previous: null })).toBe(true);
  });

  it("is false for something that never carries a number", () => {
    expect(hasReportedFigures({ actual: null, forecast: null, previous: null })).toBe(false);
  });

  it("is judged on the record as imported, not on what the replay has revealed", () => {
    // A pending NFP still has hasReportedFigures = true because its forecast
    // survives revealAt; this asserts the raw record is what's being checked,
    // not a masked copy that would also be true here anyway.
    const pending = revealAt(NFP, NFP.timestamp - 60_000);
    expect(hasReportedFigures(pending)).toBe(true);
  });
});

describe("describeEvent", () => {
  it("names the actual once released", () => {
    expect(describeEvent(NFP, "UTC")).toBe(
      "USD Nonfarm Payrolls, high impact, 08 Mar '24 13:30, actual 275K",
    );
  });

  it("says 'not yet released' for a pending release that does carry a number", () => {
    const pending = revealAt(NFP, NFP.timestamp - 60_000);
    expect(describeEvent(pending, "UTC")).toBe(
      "USD Nonfarm Payrolls, high impact, 08 Mar '24 13:30, not yet released",
    );
  });

  it("omits the figures clause entirely for something that never has one", () => {
    // "not yet released" would be false: a speech never gets "released" the
    // way an indicator does, so it does not get the same sentence.
    expect(describeEvent(SPEECH, "UTC")).toBe(
      "USD ECB President Lagarde Speech, high impact, 08 Mar '24 13:30",
    );
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
