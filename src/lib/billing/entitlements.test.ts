import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertSessionAllowed, monthlyQuotaMessage, planEntitlements } from "./entitlements";
import { formatQuotaReset, quotaMonth, quotaResetsAt } from "./plan-limits";

const FREE_PROFILE = { billingStatus: "inactive", proAccessUntil: null };
const DAY = 24 * 60 * 60 * 1000;
const originalBillingEnabled = process.env.BILLING_ENABLED;

beforeAll(() => {
  process.env.BILLING_ENABLED = "true";
});

afterAll(() => {
  if (originalBillingEnabled === undefined) delete process.env.BILLING_ENABLED;
  else process.env.BILLING_ENABLED = originalBillingEnabled;
});

describe("Free plan", () => {
  const now = new Date("2026-10-23T12:00:00Z");

  it("counts three new sessions per account per UTC calendar month and says when they renew", () => {
    const free = planEntitlements(FREE_PROFILE, { freeSessionsUsed: 2, now });
    expect(free.monthlySessions).toEqual({ limit: 3, used: 2, remaining: 1, resetsAt: "2026-11-01T00:00:00.000Z" });
    expect(planEntitlements(FREE_PROFILE, { freeSessionsUsed: 5, now }).monthlySessions?.remaining).toBe(0);
    expect(monthlyQuotaMessage("2026-11-01T00:00:00.000Z")).toContain("1 November");
  });

  it("uses one boundary for everyone: the 1st at 00:00 UTC", () => {
    expect(quotaMonth(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    expect(quotaMonth(new Date("2026-11-01T00:00:00Z"))).toBe("2026-11");
    expect(quotaResetsAt(new Date("2026-12-15T08:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(formatQuotaReset("2027-01-01T00:00:00.000Z")).toBe("1 January");
  });

  it("lets a Free session use any major pair for up to 31 days, from any point in history", () => {
    const free = planEntitlements(FREE_PROFILE, { now });
    for (const symbol of ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"]) {
      expect(() => assertSessionAllowed(free, { symbols: [symbol], startTime: Date.UTC(2004, 0, 5), endTime: Date.UTC(2004, 0, 5) + 31 * DAY })).not.toThrow();
    }
  });

  it("keeps every Pro capability behind the server check", () => {
    const free = planEntitlements(FREE_PROFILE, { now });
    const day = { startTime: 0, endTime: DAY };
    expect(() => assertSessionAllowed(free, { symbols: ["EURGBP"], ...day })).toThrow(/major FX pairs/);
    expect(() => assertSessionAllowed(free, { symbols: ["XAUUSD"], ...day })).toThrow(/38 markets/);
    expect(() => assertSessionAllowed(free, { symbols: ["EURUSD", "GBPUSD"], ...day })).toThrow(/Multi-pair/);
    expect(() => assertSessionAllowed(free, { symbols: ["EURUSD"], startTime: 0, endTime: 32 * DAY })).toThrow(/31 days/);
    expect(() => assertSessionAllowed(free, { symbols: ["EURUSD"], ...day, propFirm: { preset: "ftmo-phase-1" } })).toThrow(/Prop Firm Challenge/);
    expect(free).toEqual(expect.objectContaining({ maxReplaySpeed: 1200, fullAnalytics: false, exports: false, propFirmChallenges: false }));
  });
});

describe("Pro", () => {
  it("removes every limit for a paying account", () => {
    const pro = planEntitlements({ billingStatus: "active", proAccessUntil: null });
    expect(pro).toEqual(expect.objectContaining({
      plan: "pro", monthlySessions: null, allowedSymbols: null, maxSessionDays: null, maxPairsPerSession: null,
      maxReplaySpeed: 7200, fullAnalytics: true, exports: true, propFirmChallenges: true,
    }));
    expect(() => assertSessionAllowed(pro, {
      symbols: ["XAUUSD", "EURGBP"], startTime: 0, endTime: 365 * DAY, propFirm: { preset: "ftmo-phase-1" },
    })).not.toThrow();
  });

  it("unlocks everything during a trial and reports when it ends", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const trialEndsAt = new Date("2026-10-30T12:00:00Z");
    const trial = planEntitlements({ billingStatus: "active", proAccessUntil: trialEndsAt }, { trialEndsAt, now });
    expect(trial.plan).toBe("pro");
    expect(trial.trialEndsAt).toBe(trialEndsAt.toISOString());
    expect(trial.monthlySessions).toBeNull();
  });

  it("returns to Free, work intact, once the trial ends unpaid", () => {
    // The webhook sets the account inactive; nothing about the sessions changes.
    expect(planEntitlements({ billingStatus: "inactive", proAccessUntil: new Date("2026-10-30T12:00:00Z") }, { now: new Date("2026-10-31T00:00:00Z") }).plan).toBe("free");
  });

  it("grants full access to everyone while billing is switched off", () => {
    process.env.BILLING_ENABLED = "false";
    try {
      const earlyAccess = planEntitlements(FREE_PROFILE, { freeSessionsUsed: 3 });
      expect(earlyAccess.plan).toBe("pro");
      expect(earlyAccess.monthlySessions).toBeNull();
    } finally {
      process.env.BILLING_ENABLED = "true";
    }
  });
});
