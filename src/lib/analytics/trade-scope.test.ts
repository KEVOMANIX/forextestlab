import { describe, expect, it } from "vitest";

import type { ClosedTrade } from "@/lib/backtest/types";
import { analyticsTrades, isAnalyticsTrade } from "./trade-scope";

function trade(validity?: "valid" | "invalid" | "experimental"): ClosedTrade {
  return {
    id: validity ?? "legacy",
    direction: "long",
    entryPrice: "1",
    exitPrice: "2",
    entryTime: 1,
    exitTime: 2,
    entryIndex: 0,
    exitIndex: 1,
    lots: "1",
    stopLoss: null,
    takeProfit: null,
    commission: "0",
    pnl: "1",
    pips: "1",
    exitReason: "manual",
    intrabarAmbiguous: false,
    journal: validity ? { validity } as ClosedTrade["journal"] : undefined,
  };
}

describe("analytics trade scope", () => {
  it("excludes experimental trades and retains the other classifications", () => {
    const trades = [trade("valid"), trade("invalid"), trade("experimental"), trade()];
    expect(trades.map(isAnalyticsTrade)).toEqual([true, true, false, true]);
    expect(analyticsTrades(trades).map((item) => item.id)).toEqual([
      "valid",
      "invalid",
      "legacy",
    ]);
  });
});
