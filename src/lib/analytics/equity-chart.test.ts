import { describe, expect, it } from "vitest";

import { cumulativePnlPoints, deepestDrawdown, pointsInRange, samplePnlPoints } from "./equity-chart";
import type { ClosedTrade, EquityPoint } from "@/lib/backtest/types";

describe("analytics equity chart", () => {
  it("labels recorded floating equity as cumulative P/L, not closed-trade balance", () => {
    const curve = [
      { index: 0, time: 1, balance: "10000", equity: "10000" },
      { index: 1, time: 2, balance: "10000", equity: "9500" },
      { index: 2, time: 3, balance: "10200", equity: "10200" },
    ] satisfies EquityPoint[];
    expect(cumulativePnlPoints(curve, [], 10000)).toEqual({
      points: [{ time: 1, value: 0 }, { time: 2, value: -500 }, { time: 3, value: 200 }],
      includesOpenTrades: true,
    });
  });

  it("uses actual trade closes when no recorded equity history exists", () => {
    const trades = [
      { entryTime: 100, exitTime: 300, pnl: "-50" },
      { entryTime: 100, exitTime: 200, pnl: "100" },
    ] as ClosedTrade[];
    expect(cumulativePnlPoints([], trades, 10000, 100)).toEqual({
      points: [{ time: 100, value: 0 }, { time: 200, value: 100 }, { time: 300, value: 50 }],
      includesOpenTrades: false,
    });
  });

  it("filters one month and interpolates the balance at its boundary", () => {
    const jan = Date.UTC(2025, 0, 1);
    const feb = Date.UTC(2025, 1, 1);
    const mar = Date.UTC(2025, 2, 1);
    const points = [{ time: jan, value: 0 }, { time: feb, value: 100 }, { time: mar, value: 200 }];
    expect(pointsInRange(points, "1M")).toEqual([{ time: feb, value: 100 }, { time: mar, value: 200 }]);
    expect(pointsInRange(points, "All")).toBe(points);
    const midMarch = Date.UTC(2025, 2, 15);
    const sparse = [{ time: jan, value: 0 }, { time: mar, value: 200 }, { time: midMarch, value: 300 }];
    const filtered = pointsInRange(sparse, "1M");
    expect(filtered[0]?.time).toBe(Date.UTC(2025, 1, 15));
    expect(filtered[0]?.value).toBeCloseTo(200 * 45 / 59);
    expect(filtered.at(-1)).toEqual({ time: midMarch, value: 300 });
  });

  it("keeps the deepest loss visible when downsampling", () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({ time: index, value: index === 573 ? -900 : index / 10 }));
    const sampled = samplePnlPoints(points, 100);
    expect(sampled.length).toBeLessThanOrEqual(102);
    expect(sampled.some((point) => point.value === -900)).toBe(true);
    expect(deepestDrawdown(points)).toEqual({ index: 573, amount: 957.2 });
  });
});
