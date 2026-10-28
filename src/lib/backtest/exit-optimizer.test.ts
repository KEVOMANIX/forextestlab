import { describe, expect, it } from "vitest";

import type { ClosedTrade } from "@/lib/backtest/types";
import type { Candle } from "@/lib/market-data/types";
import type { PlanConfig } from "./exit-quality";
import { buildOptimizerReport, optimizerMetrics, simulateExitRule, type ExitRule } from "./exit-optimizer";

const CONFIG: PlanConfig = { spreadPips: "0", pipSize: "0.0001", quoteCurrency: "USD", accountCurrency: "USD", baseCurrency: "EUR", symbol: "EURUSD", executionPolicy: "conservative" };

function trade(patch: Partial<ClosedTrade> = {}): ClosedTrade {
  return { id: "t1", symbol: "EURUSD", direction: "long", entryPrice: "1.1000", exitPrice: "1.1010", entryTime: 0, exitTime: 120_000, entryIndex: 0, exitIndex: 2, lots: "1", stopLoss: "1.0980", takeProfit: "1.1060", initialStopLoss: "1.0980", initialTakeProfit: "1.1060", initialRiskAmount: "200", commission: "0", pnl: "100", pips: "10", exitReason: "manual", intrabarAmbiguous: false, ...patch };
}

function candle(timestamp: number, open: string, high: string, low: string, close: string): Candle {
  return { timestamp, open, high, low, close, source: "test" };
}

describe("exit optimizer simulation", () => {
  it("closes at a fixed R target", () => {
    const rule: ExitRule = { id: "target-1", label: "Fixed 1R", kind: "fixed-target", targetR: 1 };
    const result = simulateExitRule(trade(), 1, [candle(0, "1.1000", "1.1022", "1.0998", "1.1020")], CONFIG, rule)!;
    expect(result.optimizedR).toBeCloseTo(1, 5);
    expect(result.reason).toBe("take-profit");
  });

  it("activates break even only after the trigger candle closes", () => {
    const rule: ExitRule = { id: "be-1", label: "BE after 1R", kind: "break-even", triggerR: 1 };
    const result = simulateExitRule(trade({ initialTakeProfit: null }), 1, [
      // The same candle reaches +1R and dips below entry. It must not use the
      // newly learned break-even stop retroactively.
      candle(0, "1.1000", "1.1022", "1.0995", "1.1015"),
      candle(60_000, "1.1015", "1.1016", "1.0998", "1.1000"),
    ], CONFIG, rule)!;
    expect(result.optimizedR).toBeCloseTo(0, 5);
    expect(result.reason).toBe("stop-loss");
  });

  it("closes a trade when its maximum holding time is reached", () => {
    const rule: ExitRule = { id: "hold-1h", label: "Exit after 1 hour", kind: "max-hold", milliseconds: 3_600_000 };
    const result = simulateExitRule(trade({ initialTakeProfit: null }), 1, [
      candle(0, "1.1000", "1.1005", "1.0998", "1.1002"),
      candle(3_600_000, "1.1002", "1.1012", "1.1000", "1.1010"),
    ], CONFIG, rule)!;
    expect(result.optimizedR).toBeCloseTo(0.5, 5);
    expect(result.reason).toBe("maximum holding time");
  });
});

describe("exit optimizer validation", () => {
  it("computes drawdown and profit factor from R outcomes", () => {
    const metrics = optimizerMetrics([1, -0.5, -1, 2]);
    expect(metrics.netR).toBeCloseTo(1.5, 5);
    expect(metrics.profitFactor).toBeCloseTo(2, 5);
    expect(metrics.maxDrawdownR).toBeCloseTo(1.5, 5);
  });

  it("uses the final chronological 30% only for validation", () => {
    const rule: ExitRule = { id: "target-1", label: "Fixed 1R", kind: "fixed-target", targetR: 1 };
    const trades = Array.from({ length: 10 }, (_, index) => ({ tradeId: `t${index}`, tradeNumber: index + 1, entryTime: index, actualR: 0, optimizedR: index < 7 ? -1 : 1, deltaR: index < 7 ? -1 : 1, money: 0, reason: "test" }));
    const report = buildOptimizerReport([{ rule, trades }])!;
    expect(report.discoveryTrades).toBe(7);
    expect(report.validationTrades).toBe(3);
    expect(report.rules[0]!.discovery.netR).toBe(-7);
    expect(report.rules[0]!.validation.netR).toBe(3);
    expect(report.bestRuleId).toBe("target-1");
  });
});
