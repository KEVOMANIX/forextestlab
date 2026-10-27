import { describe, expect, it } from "vitest";

import { quickStopLoss, riskLots } from "./LotSizePopover";
import type { PublicSessionState } from "@/lib/backtest/types";

const eurusd = {
  balance: "10000",
  currentPrice: "1.10000",
  config: { pipSize: "0.0001", quoteCurrency: "USD", accountCurrency: "USD", baseCurrency: "EUR", symbol: "EURUSD" },
} as unknown as PublicSessionState;

describe("riskLots", () => {
  it("sizes 1% of a 10,000 balance over a 20-pip stop", () => {
    expect(riskLots(eurusd, { percent: "1", stopPips: "20" })).toBe("0.50");
  });

  it("rounds down so the order never risks more than asked", () => {
    expect(riskLots(eurusd, { percent: "1", stopPips: "30" })).toBe("0.33");
  });

  it("keeps the smallest size when the risk is below one step", () => {
    expect(riskLots(eurusd, { percent: "0.01", stopPips: "500" })).toBe("0.01");
  });

  it.each([["0", "20"], ["1", "0"], ["abc", "20"], ["1", ""]])("gives nothing for percent %s and stop %s", (percent, stopPips) => {
    expect(riskLots(eurusd, { percent, stopPips })).toBeNull();
  });
});

describe("quickStopLoss", () => {
  it("puts the stop below a buy and above a sell", () => {
    expect(quickStopLoss(1.1001, "long", "20", "0.0001", 5)).toBe("1.09810");
    expect(quickStopLoss(1.0999, "short", "20", "0.0001", 5)).toBe("1.10190");
  });

  it("sends no stop without a usable distance or price", () => {
    expect(quickStopLoss(1.1, "long", "0", "0.0001", 5)).toBeUndefined();
    expect(quickStopLoss(Number.NaN, "long", "20", "0.0001", 5)).toBeUndefined();
  });
});
