import { describe, expect, it } from "vitest";

import { assertSessionAllowed, planEntitlements } from "./entitlements";

const FREE_PROFILE = {
  billingStatus: "inactive",
  proAccessUntil: null,
};

describe("device trial entitlements", () => {
  it("reports the remaining allowance from device usage", () => {
    expect(planEntitlements(FREE_PROFILE, 0).trialSessionsRemaining).toBe(3);
    expect(planEntitlements(FREE_PROFILE, 2).trialSessionsRemaining).toBe(1);
    expect(planEntitlements(FREE_PROFILE, 3).freeSessionUsed).toBe(true);
  });

  it("limits each trial session to one pair and 31 days", () => {
    const trial = planEntitlements(FREE_PROFILE, 0);
    expect(() =>
      assertSessionAllowed(trial, {
        symbols: ["EURUSD", "GBPUSD"],
        startTime: 0,
        endTime: 24 * 60 * 60 * 1000,
      }),
    ).toThrow(/one pair/i);
    expect(() =>
      assertSessionAllowed(trial, {
        symbols: ["EURUSD"],
        startTime: 0,
        endTime: 32 * 24 * 60 * 60 * 1000,
      }),
    ).toThrow(/one month/i);
  });

  it("does not apply trial limits to an active paid account", () => {
    const paid = planEntitlements({
      billingStatus: "active",
      proAccessUntil: null,
    });
    expect(paid.trialSessionsRemaining).toBeNull();
    expect(() =>
      assertSessionAllowed(paid, {
        symbols: ["EURUSD", "GBPUSD"],
        startTime: 0,
        endTime: 365 * 24 * 60 * 60 * 1000,
      }),
    ).not.toThrow();
  });
});
