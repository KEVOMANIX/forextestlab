import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), send: vi.fn(),
  campaign: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
  recipient: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  optOut: { findUnique: vi.fn() },
}));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.auth }));
vi.mock("@/lib/contact-email", () => ({ sendFeedbackEmail: mocks.send, feedbackEmailContent: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { feedbackCampaign: mocks.campaign, feedbackRecipient: mocks.recipient, feedbackEmailOptOut: mocks.optOut } }));
import { sendFeedbackBatch } from "./feedback-actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "admin" });
  mocks.campaign.updateMany.mockResolvedValue({ count: 1 });
  mocks.campaign.findUniqueOrThrow.mockResolvedValue({ id: "c", subject: "Feedback", body: "How was it?" });
  mocks.campaign.findUnique.mockResolvedValue({ status: "sending" });
  mocks.recipient.findMany.mockResolvedValue([{ id: "r", email: "user@example.com", name: "User", token: "token" }]);
  mocks.recipient.updateMany.mockResolvedValue({ count: 1 });
  mocks.recipient.count.mockResolvedValue(0);
  mocks.optOut.findUnique.mockResolvedValue(null);
});

describe("durable feedback sending", () => {
  it("requires admin access before touching the campaign", async () => {
    mocks.auth.mockRejectedValue(new Error("Unauthorized"));
    await expect(sendFeedbackBatch("c")).rejects.toThrow("Unauthorized");
    expect(mocks.campaign.updateMany).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send when another worker holds the lease or campaign is not sending", async () => {
    mocks.campaign.updateMany.mockResolvedValue({ count: 0 });
    await sendFeedbackBatch("c");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("never resends a recipient another request already claimed", async () => {
    mocks.recipient.updateMany.mockResolvedValue({ count: 0 });
    await sendFeedbackBatch("c");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rechecks unsubscribe status after the draft was saved", async () => {
    mocks.optOut.findUnique.mockResolvedValue({ email: "user@example.com" });
    await sendFeedbackBatch("c");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.recipient.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { status: "skipped" } });
  });
  it("stops before the next recipient when paused", async () => {
    mocks.campaign.findUnique.mockResolvedValue({ status: "paused" });
    mocks.recipient.count.mockResolvedValue(1);
    await sendFeedbackBatch("c");
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.recipient.updateMany).not.toHaveBeenCalled();
  });
  it("records provider acceptance after a successful send", async () => {
    await sendFeedbackBatch("c");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.recipient.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { status: "sent", sentAt: expect.any(Date) } });
  });
  it("records ambiguous failure without retrying", async () => {
    mocks.send.mockRejectedValue(new Error("Network timeout"));
    await sendFeedbackBatch("c");
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.recipient.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { status: "unconfirmed" } });
    expect(mocks.campaign.updateMany).toHaveBeenCalledWith({ where: { id: "c", status: "sending" }, data: { status: "paused" } });
  });
});
