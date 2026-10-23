import { describe, expect, it } from "vitest";

import {
  accessGrantedEmail,
  accountDeletedEmail,
  conversationResolvedEmail,
  proActivatedEmail,
  supportTeamAddedEmail,
  welcomeEmail,
} from "./lifecycle-email";

describe("lifecycle emails", () => {
  it("greets by first name and falls back politely", () => {
    expect(welcomeEmail("Kelvin Mwaniki").options.title).toBe("Hi Kelvin, you're in");
    expect(welcomeEmail(null).text).toContain("Hi there,");
  });

  it("names a subscription's renewal and a pass's end differently", () => {
    const until = new Date("2026-11-23T00:00:00Z");
    expect(proActivatedEmail({ name: "K", planName: "Pro Monthly", until, recurring: true }).text).toContain("renews on 23 November 2026");
    expect(proActivatedEmail({ name: "K", planName: "Pro 30-Day Kenya Pass", until, recurring: false }).text).toContain("until 23 November 2026");
  });

  it("describes granted access in plain lengths", () => {
    expect(accessGrantedEmail({ name: "K", until: new Date(), days: 365 }).options.title).toBe("A year of Pro, on us");
    expect(accessGrantedEmail({ name: "K", until: new Date(), days: 90 }).options.title).toBe("90 days of Pro, on us");
  });

  it("tells a new teammate their role, and a moved one their new role", () => {
    expect(supportTeamAddedEmail({ name: "K", role: "agent", changed: false }).subject).toBe("You've been added to the ForexTestLab support team");
    expect(supportTeamAddedEmail({ name: "K", role: "supervisor", changed: true }).subject).toBe("Your ForexTestLab support role is now Supervisor");
  });

  it("threads the resolved notice into the conversation with a Re: subject", () => {
    expect(conversationResolvedEmail({ name: "K", subject: "Billing question" }).subject).toBe("Re: Billing question");
  });

  it("says what happened to billing when an account is deleted", () => {
    expect(accountDeletedEmail("K").text).not.toContain("subscription");
    expect(accountDeletedEmail("K", "cancelled").text).toContain("won't be charged again");
    expect(accountDeletedEmail("K", "failed").text).toContain("couldn't cancel");
  });
});
