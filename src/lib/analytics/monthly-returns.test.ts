import { describe, expect, it } from "vitest";

import type { ClosedTrade } from "@/lib/backtest/types";
import { monthlyReturnSeries } from "./monthly-returns";

function trade(exitTime: number, pnl: string): ClosedTrade {
  return {
    id: `t${exitTime}${pnl}`,
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

/** Mid-afternoon UTC is the same calendar day in New York. */
const at = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day, 14);

describe("bucketing returns by month", () => {
  it("keeps two Januaries in different years apart", () => {
    // The regression this exists for. Indexing twelve slots by month number
    // folded every January of a five-year test into one bar.
    const series = monthlyReturnSeries(
      [trade(at(2019, 1, 10), "100"), trade(at(2020, 1, 10), "300")],
      10_000,
    );
    expect(series[0]!.key).toBe("2019-01");
    expect(series[0]!.profit).toBeCloseTo(100, 5);
    expect(series.at(-1)!.key).toBe("2020-01");
    expect(series.at(-1)!.profit).toBeCloseTo(300, 5);
  });

  it("covers only the months the test ran", () => {
    // A two-month session used to draw twelve bars and report "2 of 12".
    const series = monthlyReturnSeries(
      [trade(at(2024, 3, 4), "100"), trade(at(2024, 4, 4), "50")],
      10_000,
    );
    expect(series.map((month) => month.key)).toEqual(["2024-03", "2024-04"]);
  });

  it("keeps a traded-through month that made nothing", () => {
    // April is a real month of this test that returned zero. Dropping it would
    // flatter the consistency figure just as the old version deflated it.
    const series = monthlyReturnSeries(
      [trade(at(2024, 3, 4), "100"), trade(at(2024, 5, 4), "50")],
      10_000,
    );
    expect(series.map((month) => month.key)).toEqual(["2024-03", "2024-04", "2024-05"]);
    expect(series[1]!.profit).toBe(0);
  });

  it("walks across a year boundary", () => {
    const series = monthlyReturnSeries(
      [trade(at(2023, 11, 4), "100"), trade(at(2024, 2, 4), "50")],
      10_000,
    );
    expect(series.map((month) => month.key)).toEqual([
      "2023-11",
      "2023-12",
      "2024-01",
      "2024-02",
    ]);
    expect(series.map((month) => month.label)).toEqual(["Nov", "Dec", "Jan", "Feb"]);
  });

  it("adds a month's trades together and states the percentage", () => {
    const series = monthlyReturnSeries(
      [trade(at(2024, 6, 4), "300"), trade(at(2024, 6, 20), "-100")],
      10_000,
    );
    expect(series).toHaveLength(1);
    expect(series[0]!.profit).toBeCloseTo(200, 5);
    expect(series[0]!.percent).toBeCloseTo(2, 5);
  });

  it("returns nothing rather than a row of zeros when nothing was traded", () => {
    expect(monthlyReturnSeries([], 10_000)).toEqual([]);
  });

  it("refuses to divide by a zero starting balance", () => {
    const series = monthlyReturnSeries([trade(at(2024, 6, 4), "300")], 0);
    expect(series[0]!.percent).toBe(0);
    expect(series[0]!.profit).toBeCloseTo(300, 5);
  });
});
