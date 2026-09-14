import { describe, expect, it } from "vitest";
import { feedbackDraftSchema, feedbackRecipients } from "./feedback-email";

describe("feedback audience", () => {
  it("normalizes, deduplicates, and excludes opt-outs and invalid addresses", () => {
    expect(feedbackRecipients([
      { email: " A@EXAMPLE.COM ", displayName: "A" },
      { email: "a@example.com", displayName: "Alice" },
      { email: "b@example.com", displayName: null },
      { email: "invalid", displayName: null },
    ], ["B@example.com"])).toEqual([{ email: "a@example.com", name: "Alice" }]);
  });
  it("requires a subject, message, and explicit nonempty selection", () => {
    const input = { id: "ce60ee81-b802-4f13-a4ae-f633327c7ad1", subject: "Feedback", body: "Hello", audience: "selected", userIds: [] };
    expect(feedbackDraftSchema.safeParse(input).success).toBe(false);
    expect(feedbackDraftSchema.safeParse({ ...input, audience: "all" }).success).toBe(true);
    expect(feedbackDraftSchema.safeParse({ ...input, audience: "all", subject: "Hi\r\nBCC: x@example.com" }).success).toBe(false);
  });
});
