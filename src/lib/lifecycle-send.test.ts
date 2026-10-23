import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  failure: vi.fn(),
  profiles: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    adminAuditEvent: { findFirst: mocks.findFirst, create: mocks.create },
    userProfile: { findMany: mocks.profiles },
  },
}));
vi.mock("@/lib/contact-email", () => ({ sendBrandedEmail: mocks.send }));
vi.mock("@/lib/email-failures", () => ({ recordEmailFailure: mocks.failure }));

import { sendAccessEndingReminders } from "./access-reminders";
import { welcomeEmail } from "./lifecycle-email";
import { sendLifecycleEmail } from "./lifecycle-send";

describe("sendLifecycleEmail", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sends once per key and records that it did", async () => {
    mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "sent" });
    expect(await sendLifecycleEmail("welcome:u1", "a@b.co", welcomeEmail("Kelvin"))).toBe(true);
    expect(await sendLifecycleEmail("welcome:u1", "a@b.co", welcomeEmail("Kelvin"))).toBe(false);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "email.lifecycle_sent", targetType: "welcome", targetId: "welcome:u1" }) });
  });

  it("records a failed send instead of throwing, and does not mark it sent", async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.send.mockRejectedValue(new Error("Resend is down"));
    expect(await sendLifecycleEmail("pro:ref-1", "a@b.co", welcomeEmail(null))).toBe(false);
    expect(mocks.failure).toHaveBeenCalledWith("lifecycle", "pro:ref-1", expect.any(Error));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does nothing without an address", async () => {
    expect(await sendLifecycleEmail("welcome:u2", null, welcomeEmail(null))).toBe(false);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});

describe("sendAccessEndingReminders", () => {
  beforeEach(() => vi.resetAllMocks());

  it("stays quiet while billing is off, when everyone has Pro", async () => {
    delete process.env.BILLING_ENABLED;
    expect(await sendAccessEndingReminders()).toBe(0);
    expect(mocks.profiles).not.toHaveBeenCalled();
  });

  it("reminds once per end date, skipping anyone a subscription renews", async () => {
    process.env.BILLING_ENABLED = "true";
    try {
      const endsAt = new Date("2026-10-26T00:00:00Z");
      mocks.profiles.mockResolvedValue([{ id: "u1", email: "a@b.co", displayName: "Kelvin", proAccessUntil: endsAt }]);
      mocks.findFirst.mockResolvedValue(null);
      expect(await sendAccessEndingReminders(new Date("2026-10-23T12:00:00Z"))).toBe(1);
      expect(mocks.profiles).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ billingSubscriptions: { none: { status: { in: ["active", "trialing"] }, cancelAtPeriodEnd: false } } }),
      }));
      expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ targetId: "access_ending:u1:2026-10-26" }) });
    } finally {
      delete process.env.BILLING_ENABLED;
    }
  });
});
