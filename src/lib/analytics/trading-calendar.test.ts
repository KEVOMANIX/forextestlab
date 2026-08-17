import { describe, expect, it } from "vitest";

import type { ClosedTrade } from "@/lib/backtest/types";
import { createCalendar } from "./trading-calendar";

/** A closed trade that exits at a given New York wall-clock day. */
function trade(exitTime: number, pnl: string): ClosedTrade {
  return {
    id: `t${exitTime}`,
    direction: "long",
    entryPrice: "1.10000",
    exitPrice: "1.10100",
    entryTime: exitTime - 3_600_000,
    exitTime,
    entryIndex: 0,
    exitIndex: 1,
    lots: "1.00",
    stopLoss: null,
    takeProfit: null,
    commission: "0",
    pnl,
    pips: "10.0",
    exitReason: "manual",
    intrabarAmbiguous: false,
  } as ClosedTrade;
}

/** 14:00 UTC is mid-afternoon in New York on any date, so no day straddling. */
const at = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day, 14);

describe("choosing which months to draw", () => {
  it("draws the months the trades are in, not the month it happens to be now", () => {
    // The regression this file exists for. The old builder seeded its search
    // with Date.now(), so every historical trade lost the comparison and the
    // card drew an empty current month.
    const months = createCalendar([
      trade(at(2019, 3, 12), "100"),
      trade(at(2019, 4, 2), "-50"),
    ]);
    expect(months.map((month) => month.key)).toEqual(["2019-03", "2019-04"]);
    expect(months.some((month) => month.cells.some((cell) => cell.value))).toBe(true);
  });

  it("orders months oldest first and skips the ones with no trades", () => {
    const months = createCalendar([
      trade(at(2021, 11, 4), "10"),
      trade(at(2021, 2, 4), "10"),
      trade(at(2021, 6, 4), "10"),
    ]);
    expect(months.map((month) => month.key)).toEqual(["2021-02", "2021-06", "2021-11"]);
  });

  it("adds the day's trades together", () => {
    const months = createCalendar([
      trade(at(2023, 5, 9), "120.50"),
      trade(at(2023, 5, 9), "-40.50"),
      trade(at(2023, 5, 10), "-15"),
    ]);
    const [may] = months;
    const day = (n: number) => may!.cells.find((cell) => cell.day === n)?.value;
    expect(day(9)).toBeCloseTo(80, 5);
    expect(day(10)).toBeCloseTo(-15, 5);
    // A day with no trade is zero, not null — null means "outside this month".
    expect(day(11)).toBe(0);
  });

  it("still renders a month when nothing has been traded", () => {
    const months = createCalendar([]);
    expect(months).toHaveLength(1);
    expect(months[0]!.cells.every((cell) => cell.value === null || cell.value === 0)).toBe(true);
  });
});

describe("laying out a month", () => {
  it("leaves out the days the market is shut", () => {
    // Forex closes Friday evening and reopens Sunday evening, so Saturday can
    // never hold a trade and Sunday almost never does.
    const [may] = createCalendar([trade(at(2023, 5, 9), "10")]);
    expect(may!.weekdays).toEqual([1, 2, 3, 4, 5]);
    // May 2023 began on a Monday and ran 31 days: five rows of five.
    expect(may!.cells).toHaveLength(25);
  });

  it("brings the weekend back when a trade really closed in it", () => {
    // 21:00 UTC Sunday is 17:00 in New York: the week reopens, and a trade
    // closed that evening is real. Hiding it would lose money from the grid.
    const sundayEvening = Date.UTC(2023, 4, 7, 22);
    const [may] = createCalendar([trade(sundayEvening, "75"), trade(at(2023, 5, 9), "10")]);
    expect(may!.weekdays).toEqual([0, 1, 2, 3, 4, 5]);
    expect(may!.cells.find((cell) => cell.day === 7)?.value).toBeCloseTo(75, 5);
  });

  it("keeps one column set for the whole session, not one per month", () => {
    // Otherwise the grid would change width as the reader steps months.
    const months = createCalendar([
      trade(Date.UTC(2023, 4, 7, 22), "75"),
      trade(at(2023, 6, 14), "10"),
    ]);
    expect(months.map((month) => month.weekdays)).toEqual([
      [0, 1, 2, 3, 4, 5],
      [0, 1, 2, 3, 4, 5],
    ]);
  });

  it("puts each date under its real weekday", () => {
    // 1 May 2023 was a Monday, so it leads the first row.
    const [may] = createCalendar([trade(at(2023, 5, 9), "10")]);
    expect(may!.cells.slice(0, 5).map((cell) => cell.day)).toEqual([1, 2, 3, 4, 5]);
    // 1 June 2023 was a Thursday: three blanks, then the 1st.
    const [june] = createCalendar([trade(at(2023, 6, 14), "10")]);
    expect(june!.cells.slice(0, 5).map((cell) => cell.day)).toEqual([null, null, null, 1, 2]);
  });

  it("drops a week that was entirely weekend", () => {
    // February 2025 begins on a Saturday. With the weekend hidden that first
    // week holds no dates at all, and would otherwise open the grid with a
    // blank strip.
    const [february] = createCalendar([trade(at(2025, 2, 3), "10")]);
    expect(february!.cells[0]!.day).toBe(3);
  });

  it("uses only the rows the month needs", () => {
    // August 2025 ran Friday the 1st to Sunday the 31st. That last Sunday is
    // the only date in its week, so once the weekend goes the month needs five
    // rows rather than six.
    expect(createCalendar([trade(at(2025, 8, 4), "10")])[0]!.cells).toHaveLength(25);
    expect(createCalendar([trade(at(2021, 2, 3), "10")])[0]!.cells).toHaveLength(20);
  });

  it("never runs a day past the end of the month", () => {
    const [april] = createCalendar([trade(at(2024, 4, 3), "10")]);
    const days = april!.cells.filter((cell) => cell.day !== null).map((cell) => cell.day);
    expect(days).toHaveLength(22); // 30 days less eight weekend days
    expect(days.at(-1)).toBe(30);
  });

  it("labels the month it drew, not a neighbour", () => {
    // Labelling from the 1st risks the New York offset pulling the date back
    // into the previous month, which would name March's grid "February".
    expect(createCalendar([trade(at(2025, 3, 3), "10")])[0]!.label).toBe("March 2025");
    expect(createCalendar([trade(at(2025, 1, 31), "10")])[0]!.label).toBe("January 2025");
  });
});
