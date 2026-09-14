import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/feedback-actions", () => ({
  createFeedbackDraft: vi.fn(), feedbackCampaignDetails: vi.fn(), searchFeedbackUsers: vi.fn(), sendFeedbackBatch: vi.fn(), setFeedbackCampaignStatus: vi.fn(),
}));
import { FeedbackEmails } from "./FeedbackEmails";
import { sendFeedbackBatch, setFeedbackCampaignStatus } from "@/app/admin/feedback-actions";

it("opens with a feedback template and a review action, without sending", () => {
  const html = renderToStaticMarkup(createElement(FeedbackEmails, { campaigns: [], userCount: 152 }));
  expect(html).toContain("How is ForexTestLab working for you?");
  expect(html).toContain("All registered users (152)");
  expect(html).toContain("Save draft and preview");
  expect(html).toContain("unsubscribe link");
  expect(sendFeedbackBatch).not.toHaveBeenCalled();
  expect(setFeedbackCampaignStatus).not.toHaveBeenCalled();
});
