import { describe, expect, it } from "vitest";
import { recordedChartPeriod, returnPercent } from "./performance-display";
import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";

describe("consistent performance display", () => {
  it("rounds the screenshot's 4.885% return half-up", () => {
    expect(returnPercent("10000", "10488.50")).toBe(4.89);
    expect(returnPercent("10000", "9511.50")).toBe(-4.89);
  });

  it("does not count funding as a return", () => {
    expect(returnPercent("12000", "12488.50")).toBe(4.07);
    expect(returnPercent("0", "0")).toBe(0);
  });

  it("labels the recorded equity period rather than future session dates", () => {
    const startTime = Date.UTC(2020, 0, 1);
    const endTime = Date.UTC(2020, 2, 25);
    const equity: EquityPoint[] = [
      { time: startTime, index: 0, balance: "10000", equity: "10000" },
      { time: endTime, index: 10, balance: "10488.50", equity: "10488.50" },
    ];
    expect(recordedChartPeriod(equity, [], startTime)).toEqual({ startTime, endTime });
  });

  it("uses trade exits for a reconstructed chart, and handles no trades", () => {
    const trades = [{ exitTime: 300 }, { exitTime: 200 }] as ClosedTrade[];
    expect(recordedChartPeriod([], trades, 100)).toEqual({ startTime: 100, endTime: 300 });
    expect(recordedChartPeriod([], [], 100)).toEqual({ startTime: 100, endTime: 100 });
    expect(recordedChartPeriod([], [])).toEqual({});
  });
});
