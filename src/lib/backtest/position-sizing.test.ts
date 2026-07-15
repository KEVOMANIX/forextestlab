import { describe, expect, it } from "vitest";

import {
  calculatePositionSize,
  pipValuePerLot,
  type PositionSizingInput,
} from "@/lib/backtest/position-sizing";

const eurUsdBase: PositionSizingInput = {
  accountBalance: "10000",
  accountCurrency: "USD",
  riskPercent: "1",
  entryPrice: "1.1000",
  stopLoss: "1.0980", // 20 pips away
  pipSize: "0.0001",
  symbol: "EURUSD",
  quoteCurrency: "USD",
  baseCurrency: "EUR",
};

describe("pipValuePerLot", () => {
  it("is exact when the quote currency is the account currency (EURUSD/USD)", () => {
    const result = pipValuePerLot({
      pipSize: "0.0001",
      quoteCurrency: "USD",
      accountCurrency: "USD",
      baseCurrency: "EUR",
      price: "1.1000",
      symbol: "EURUSD",
    });
    expect(result.value).toBe("10.00");
    expect(result.approx).toBe(false);
  });

  it("divides by price when the base currency is the account currency (USDJPY/USD)", () => {
    const result = pipValuePerLot({
      pipSize: "0.01",
      quoteCurrency: "JPY",
      accountCurrency: "USD",
      baseCurrency: "USD",
      price: "150.00",
      symbol: "USDJPY",
    });
    // (0.01 * 100000) / 150 = 1000 / 150 = 6.6666... -> 6.67
    expect(result.value).toBe("6.67");
    expect(result.approx).toBe(false);
  });

  it("approximates a cross vs the account currency (EURGBP/USD)", () => {
    const result = pipValuePerLot({
      pipSize: "0.0001",
      quoteCurrency: "GBP",
      accountCurrency: "USD",
      baseCurrency: "EUR",
      price: "0.8500",
      symbol: "EURGBP",
    });
    expect(result.value).toBe("10.00");
    expect(result.approx).toBe(true);
  });

  it("returns Not available when the base-currency price is unusable", () => {
    const result = pipValuePerLot({
      pipSize: "0.01",
      quoteCurrency: "JPY",
      accountCurrency: "USD",
      baseCurrency: "USD",
      price: "0",
      symbol: "USDJPY",
    });
    expect(result.value).toBe("Not available");
    expect(result.approx).toBe(false);
  });
});

describe("calculatePositionSize", () => {
  it("sizes EURUSD (USD account) by risk with exact hand-computed numbers", () => {
    const result = calculatePositionSize(eurUsdBase);
    // pipValue = 10.00; risk = 10000 * 1% = 100.00; lots = 100 / (20 * 10) = 0.50
    expect(result.pipValuePerLot).toBe("10.00");
    expect(result.riskAmount).toBe("100.00");
    expect(result.stopDistancePips).toBe("20.0");
    expect(result.lots).toBe("0.50");
    expect(result.maxExpectedLoss).toBe("100.00");
    expect(result.crossCurrencyApprox).toBe(false);
    expect(result.notes).toHaveLength(0);
  });

  it("rounds lots DOWN so the requested risk is never exceeded", () => {
    // risk 200, stop 30 pips, pipValue 10 -> 200/300 = 0.6666.. -> floored 0.66
    const result = calculatePositionSize({
      ...eurUsdBase,
      riskPercent: "2",
      entryPrice: "1.1000",
      stopLoss: "1.0970",
    });
    expect(result.riskAmount).toBe("200.00");
    expect(result.stopDistancePips).toBe("30.0");
    expect(result.lots).toBe("0.66");
    // realised worst-case loss <= risk budget
    expect(result.maxExpectedLoss).toBe("198.00");
  });

  it("handles USDJPY (USD account, base = account) via the divide-by-price path", () => {
    const result = calculatePositionSize({
      accountBalance: "10000",
      accountCurrency: "USD",
      riskPercent: "1",
      entryPrice: "150.00",
      stopLoss: "149.50", // 50 pips at 0.01
      pipSize: "0.01",
      symbol: "USDJPY",
      quoteCurrency: "JPY",
      baseCurrency: "USD",
    });
    expect(result.pipValuePerLot).toBe("6.67");
    expect(result.stopDistancePips).toBe("50.0");
    expect(result.crossCurrencyApprox).toBe(false);
    // lots = 100 / (50 * 6.666..) rounded down. Uses unrounded pip value internally.
    expect(Number(result.lots)).toBeGreaterThan(0);
    expect(Number(result.maxExpectedLoss)).toBeLessThanOrEqual(100);
  });

  it("flags a cross vs the account currency (EURGBP/USD) and adds a note", () => {
    const result = calculatePositionSize({
      accountBalance: "10000",
      accountCurrency: "USD",
      riskPercent: "1",
      entryPrice: "0.8500",
      stopLoss: "0.8480", // 20 pips
      pipSize: "0.0001",
      symbol: "EURGBP",
      quoteCurrency: "GBP",
      baseCurrency: "EUR",
    });
    expect(result.crossCurrencyApprox).toBe(true);
    expect(result.notes).toContain(
      "Cross-currency pip value approximated; provide a conversion rate for accuracy.",
    );
    expect(result.pipValuePerLot).toBe("10.00");
    expect(result.lots).toBe("0.50");
  });

  it("uses fixed-lot mode when fixedLots is provided", () => {
    const result = calculatePositionSize({
      ...eurUsdBase,
      fixedLots: "0.30",
    });
    expect(result.lots).toBe("0.30");
    expect(result.riskAmount).toBe("0.00");
    // maxExpectedLoss = 20 pips * 10.00 * 0.30 = 60.00
    expect(result.maxExpectedLoss).toBe("60.00");
    expect(result.stopDistancePips).toBe("20.0");
  });

  it("fixed-lot mode without a stop loss reports Not available for max loss", () => {
    const result = calculatePositionSize({
      accountBalance: "10000",
      accountCurrency: "USD",
      entryPrice: "1.1000",
      pipSize: "0.0001",
      symbol: "EURUSD",
      quoteCurrency: "USD",
      baseCurrency: "EUR",
      fixedLots: "0.25",
    });
    expect(result.lots).toBe("0.25");
    expect(result.riskAmount).toBe("0.00");
    expect(result.stopDistancePips).toBe("Not available");
    expect(result.maxExpectedLoss).toBe("Not available");
  });

  it("handles a zero stop distance safely (falls back to minimum lots)", () => {
    const result = calculatePositionSize({
      ...eurUsdBase,
      stopLoss: "1.1000", // identical to entry -> 0 pips
    });
    expect(result.stopDistancePips).toBe("0.0");
    expect(result.lots).toBe("0.01");
    expect(result.maxExpectedLoss).toBe("Not available");
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("handles a missing stop loss safely (falls back to minimum lots)", () => {
    const result = calculatePositionSize({
      accountBalance: "10000",
      accountCurrency: "USD",
      riskPercent: "1",
      entryPrice: "1.1000",
      pipSize: "0.0001",
      symbol: "EURUSD",
      quoteCurrency: "USD",
      baseCurrency: "EUR",
    });
    expect(result.stopDistancePips).toBe("Not available");
    expect(result.lots).toBe("0.01");
    expect(result.maxExpectedLoss).toBe("Not available");
    expect(result.riskAmount).toBe("100.00");
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("never emits NaN or Infinity when pip size is zero", () => {
    const result = calculatePositionSize({
      ...eurUsdBase,
      pipSize: "0",
    });
    expect(result.stopDistancePips).toBe("Not available");
    expect(result.pipValuePerLot).toBe("0.00");
    expect(result.lots).toBe("0.01");
    expect(result.maxExpectedLoss).toBe("Not available");
  });
});
