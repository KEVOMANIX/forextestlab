import { describe, expect, it } from "vitest";

import {
  evaluatePropFirm,
  initialPropFirmRuntime,
  propFirmDayKey,
  propFirmProgress,
  PROP_FIRM_PRESETS,
  recordTradingDay,
  rollTradingDay,
  type PropFirmRules,
  type PropFirmRuntime,
} from "./prop-firm";

const START = "100000";
const phase1 = PROP_FIRM_PRESETS["ftmo-phase-1"];
/** 2024-03-05, 08:00 Prague. */
const AT = Date.parse("2024-03-05T07:00:00Z");

function runtime(overrides: Partial<PropFirmRuntime> = {}): PropFirmRuntime {
  return { ...initialPropFirmRuntime(START, AT, phase1), ...overrides };
}

function evaluate(
  equity: string,
  overrides: {
    rules?: PropFirmRules;
    runtime?: PropFirmRuntime;
    lowEquity?: string;
    peakEquity?: string;
  } = {},
) {
  return evaluatePropFirm({
    rules: overrides.rules ?? phase1,
    startingBalance: START,
    equity,
    lowEquity: overrides.lowEquity,
    peakEquity: overrides.peakEquity ?? START,
    runtime: overrides.runtime ?? runtime(),
    at: AT,
  });
}

describe("FTMO presets", () => {
  it("carry the published two-step numbers", () => {
    expect(phase1).toMatchObject({
      phase: 1,
      profitTargetPercent: 10,
      maxDailyLossPercent: 5,
      maxTotalLossPercent: 10,
      lossBasis: "initial",
    });
    // Verification keeps the same risk lines and halves the target.
    expect(PROP_FIRM_PRESETS["ftmo-phase-2"]).toMatchObject({
      phase: 2,
      profitTargetPercent: 5,
      maxDailyLossPercent: 5,
      maxTotalLossPercent: 10,
    });
  });
});

describe("the trading day", () => {
  it("rolls at midnight in the firm's zone, not the trader's", () => {
    // 23:30 UTC on the 5th is already 00:30 Prague on the 6th.
    expect(propFirmDayKey(Date.parse("2024-03-05T23:30:00Z"), "Europe/Prague")).toBe(
      "2024-03-06",
    );
    expect(propFirmDayKey(Date.parse("2024-03-05T23:30:00Z"), "America/New_York")).toBe(
      "2024-03-05",
    );
  });

  it("takes the day's reference from the equity carried into it", () => {
    const before = runtime({ dayStartEquity: "100000.00" });
    const rolled = rollTradingDay(
      before,
      Date.parse("2024-03-06T07:00:00Z"),
      "97000",
      phase1,
    );
    expect(rolled.dayKey).toBe("2024-03-06");
    expect(rolled.dayStartEquity).toBe("97000.00");
    // A fresh day means a fresh 5%: from 97,000 the floor is now 92,000.
    expect(evaluate("92500", { runtime: rolled }).status).toBe("active");
    expect(evaluate("91999", { runtime: rolled }).status).toBe("breached");
  });

  it("leaves the reference alone inside the same day", () => {
    const before = runtime();
    expect(rollTradingDay(before, AT + 60_000, "90000", phase1)).toBe(before);
  });

  it("counts a day once however many trades close on it", () => {
    let current = recordTradingDay(runtime(), AT, phase1);
    current = recordTradingDay(current, AT + 3_600_000, phase1);
    expect(current.tradingDays).toEqual(["2024-03-05"]);
    current = recordTradingDay(current, AT + 86_400_000, phase1);
    expect(current.tradingDays).toHaveLength(2);
  });
});

describe("breaches", () => {
  it("fails on the daily limit at the line, not a cent past it", () => {
    // 5% of 100,000 from a 100,000 day open: the floor is exactly 95,000.
    expect(evaluate("95000.01").status).toBe("active");
    expect(evaluate("95000.00").status).toBe("breached");
    expect(evaluate("95000.00").breach).toMatchObject({
      rule: "daily-loss",
      limit: "95000.00",
    });
  });

  it("fails on the wick, not the close", () => {
    // The candle recovered to 96,000 but printed 94,000 on the way — a firm
    // watching the live account would already have closed it.
    const result = evaluate("96000", { lowEquity: "94000" });
    expect(result.status).toBe("breached");
    expect(result.breach?.equity).toBe("94000.00");
  });

  it("reports the maximum loss when both lines go at once", () => {
    // Day opened at the start, so 90,000 breaks the 10% total limit and the 5%
    // daily one together; failing the challenge outright is the real verdict.
    const result = evaluate("89000");
    expect(result.breach?.rule).toBe("total-loss");
    expect(result.breach?.limit).toBe("90000.00");
  });

  it("keeps the total limit fixed to the initial balance on FTMO rules", () => {
    // Up to 110,000 at the peak, then back to 91,000: a trailing rule would
    // have failed this, a static one does not.
    const inProfit = runtime({ dayStartEquity: "110000.00" });
    expect(
      evaluate("91000", { runtime: inProfit, peakEquity: "110000" }).breach?.rule,
    ).toBe("daily-loss");
    const trailing: PropFirmRules = { ...phase1, lossBasis: "peak-equity" };
    expect(
      evaluate("98500", {
        rules: trailing,
        runtime: inProfit,
        peakEquity: "110000",
      }).breach?.rule,
    ).toBe("total-loss");
  });

  it("is final once recorded", () => {
    const breached = evaluate("80000");
    expect(breached.status).toBe("breached");
    // Recovering afterwards must not quietly un-fail the challenge.
    expect(evaluatePropFirm({
      rules: phase1,
      startingBalance: START,
      equity: "120000",
      peakEquity: "120000",
      runtime: breached,
      at: AT,
    })).toBe(breached);
  });

  it("does not fire when a limit is disabled", () => {
    const noLimits: PropFirmRules = {
      ...phase1,
      maxDailyLossPercent: 0,
      maxTotalLossPercent: 0,
    };
    expect(evaluate("1000", { rules: noLimits }).status).toBe("active");
  });
});

describe("passing", () => {
  it("passes on the target when no minimum days are required", () => {
    expect(evaluate("110000").status).toBe("passed");
    expect(evaluate("109999").status).toBe("active");
  });

  it("holds the pass back until the minimum days are traded", () => {
    const rules: PropFirmRules = { ...phase1, minTradingDays: 4 };
    const threeDays = runtime({
      tradingDays: ["2024-03-01", "2024-03-04", "2024-03-05"],
    });
    expect(evaluate("115000", { rules, runtime: threeDays }).status).toBe("active");
    const fourDays = runtime({
      tradingDays: ["2024-03-01", "2024-03-04", "2024-03-05", "2024-03-06"],
    });
    expect(evaluate("115000", { rules, runtime: fourDays }).status).toBe("passed");
  });

  it("still breaches after passing", () => {
    // The target was hit, then the account gave it all back inside one day.
    const passed = evaluate("110000");
    expect(passed.status).toBe("passed");
    const after = evaluatePropFirm({
      rules: phase1,
      startingBalance: START,
      equity: "89000",
      peakEquity: "110000",
      runtime: passed,
      at: AT,
    });
    expect(after.status).toBe("breached");
  });
});

describe("progress", () => {
  const progress = (equity: string, over: Partial<PropFirmRuntime> = {}) =>
    propFirmProgress({
      rules: phase1,
      startingBalance: START,
      equity,
      peakEquity: START,
      runtime: runtime(over),
    });

  it("reports the floors the account has to hold", () => {
    const p = progress("100000");
    expect(p.targetEquity).toBe("110000.00");
    expect(p.dailyFloor).toBe("95000.00");
    expect(p.totalFloor).toBe("90000.00");
    expect(p.dailyRemaining).toBe("5000.00");
    expect(p.totalRemaining).toBe("10000.00");
  });

  it("keeps the daily allowance the same size on a day that opened in profit", () => {
    // Up 5,000 overnight: the floor moves up with the day, the allowance does not.
    const p = progress("105000", { dayStartEquity: "105000.00" });
    expect(p.dailyFloor).toBe("100000.00");
    expect(p.dailyRemaining).toBe("5000.00");
    // But the total floor is still anchored to the initial balance.
    expect(p.totalFloor).toBe("90000.00");
  });

  it("never reports negative headroom", () => {
    expect(progress("80000").dailyRemaining).toBe("0.00");
    expect(progress("80000").totalRemaining).toBe("0.00");
  });

  it("gives the meters clamped ratios", () => {
    expect(progress("97500").dailyUsedRatio).toBeCloseTo(0.5, 5);
    expect(progress("95000").totalUsedRatio).toBeCloseTo(0.5, 5);
    expect(progress("105000").targetProgress).toBeCloseTo(0.5, 5);
    expect(progress("50000").dailyUsedRatio).toBe(1);
    expect(progress("200000").targetProgress).toBe(1);
    // Being in profit is not negative progress against the loss limits.
    expect(progress("105000").dailyUsedRatio).toBe(0);
  });
});
