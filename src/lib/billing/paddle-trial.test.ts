import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ profile: vi.fn(), subscriptions: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    userProfile: { findUnique: mocks.profile },
    billingSubscription: { count: mocks.subscriptions },
  },
}));
vi.mock("@/lib/lifecycle-send", () => ({ sendLifecycleEmail: vi.fn() }));

import { proTrialEligible } from "./checkout";
import { subscriptionAccess } from "./paddle-service";

const now = new Date("2026-10-23T12:00:00Z");
const trialEnd = new Date("2026-10-30T12:00:00Z");
const nextPaymentAt = new Date("2026-11-30T12:00:00Z");

describe("Paddle subscription status to access", () => {
  it("gives Pro until the trial ends exactly, with no grace", () => {
    expect(subscriptionAccess({ status: "trialing", previousStatus: null, trialEnd, nextPaymentAt: trialEnd, now }))
      .toEqual({ billingStatus: "active", proAccessUntil: trialEnd, unpaidTrial: false });
  });

  it("keeps the 5-day grace for a paying subscription", () => {
    expect(subscriptionAccess({ status: "active", previousStatus: "trialing", trialEnd, nextPaymentAt, now }).proAccessUntil)
      .toEqual(new Date("2026-12-05T12:00:00Z"));
    const renewalFailed = subscriptionAccess({ status: "past_due", previousStatus: "active", trialEnd, nextPaymentAt, now });
    expect(renewalFailed).toEqual({ billingStatus: "attention", proAccessUntil: new Date("2026-12-05T12:00:00Z"), unpaidTrial: false });
  });

  it("returns an account to Free when the first charge after a trial fails", () => {
    expect(subscriptionAccess({ status: "past_due", previousStatus: "trialing", trialEnd, nextPaymentAt: trialEnd, now }))
      .toEqual({ billingStatus: "inactive", proAccessUntil: now, unpaidTrial: true });
  });

  it("ends access when the subscription is canceled, including a trial cancelled before its end", () => {
    expect(subscriptionAccess({ status: "canceled", previousStatus: "trialing", trialEnd, nextPaymentAt: null, now }))
      .toEqual({ billingStatus: "inactive", proAccessUntil: now, unpaidTrial: false });
  });
});

describe("one Pro trial per account", () => {
  const env = { ...process.env };
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.BILLING_ENABLED = "true";
    process.env.PADDLE_MODE = "sandbox";
    process.env.PADDLE_SANDBOX_PRO_MONTH_TRIAL_PRICE_ID = "pri_month_trial";
    process.env.PADDLE_SANDBOX_PRO_YEAR_TRIAL_PRICE_ID = "pri_year_trial";
    mocks.subscriptions.mockResolvedValue(0);
  });
  afterEach(() => {
    process.env = { ...env };
  });

  it("offers the trial to a Free account that never had one or a subscription", async () => {
    mocks.profile.mockResolvedValue({ proTrialStartedAt: null, billingStatus: "inactive", proAccessUntil: null });
    expect(await proTrialEligible("u1")).toBe(true);
  });

  it("refuses a second trial, a past subscriber, and an account already on Pro", async () => {
    mocks.profile.mockResolvedValue({ proTrialStartedAt: new Date(), billingStatus: "inactive", proAccessUntil: null });
    expect(await proTrialEligible("u1")).toBe(false);
    mocks.profile.mockResolvedValue({ proTrialStartedAt: null, billingStatus: "inactive", proAccessUntil: null });
    mocks.subscriptions.mockResolvedValue(1);
    expect(await proTrialEligible("u1")).toBe(false);
    mocks.subscriptions.mockResolvedValue(0);
    mocks.profile.mockResolvedValue({ proTrialStartedAt: null, billingStatus: "active", proAccessUntil: null });
    expect(await proTrialEligible("u1")).toBe(false);
  });

  it("offers no trial while the trial prices are not configured", async () => {
    delete process.env.PADDLE_SANDBOX_PRO_YEAR_TRIAL_PRICE_ID;
    mocks.profile.mockResolvedValue({ proTrialStartedAt: null, billingStatus: "inactive", proAccessUntil: null });
    expect(await proTrialEligible("u1")).toBe(false);
  });
});
