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
  it("puts day one under its real weekday", () => {
    // 1 February 2025 was a Saturday: six blanks, then the 1st.
    const [february] = createCalendar([trade(at(2025, 2, 3), "10")]);
    expect(february!.cells.slice(0, 6).map((cell) => cell.day)).toEqual([null, null, null, null, null, null]);
    expect(february!.cells[6]!.day).toBe(1);
  });

  it("uses only the rows the month needs", () => {
    // August 2025 began on a Friday and has 31 days, so it genuinely needs six
    // rows. February 2021 began on a Monday and fits in five. The old fixed 42
    // cells left a dead strip under every month like the latter.
    expect(createCalendar([trade(at(2025, 8, 3), "10")])[0]!.cells).toHaveLength(42);
    expect(createCalendar([trade(at(2021, 2, 3), "10")])[0]!.cells).toHaveLength(35);
  });

  it("never runs a day past the end of the month", () => {
    const [april] = createCalendar([trade(at(2024, 4, 3), "10")]);
    const days = april!.cells.filter((cell) => cell.day !== null).map((cell) => cell.day);
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toBe(30);
  });

  it("labels the month it drew, not a neighbour", () => {
    // Labelling from the 1st risks the New York offset pulling the date back
    // into the previous month, which would name March's grid "February".
    expect(createCalendar([trade(at(2025, 3, 1), "10")])[0]!.label).toBe("March 2025");
    expect(createCalendar([trade(at(2025, 1, 31), "10")])[0]!.label).toBe("January 2025");
  });
});
