import { describe, expect, it } from "vitest";

import { asMessageIdHeader, baseSubject, messageIdVariants, referencedMessageIds, sameThreadSubject } from "./support-email-threading";

describe("support email threading", () => {
  it("strips reply and forward prefixes, however many and in any case", () => {
    expect(baseSubject("Re: Billing question")).toBe("Billing question");
    expect(baseSubject("RE: Fwd: re[2]: AW: Billing question")).toBe("Billing question");
    expect(baseSubject("Refund request")).toBe("Refund request");
    expect(baseSubject("Re: ")).toBe("Re:");
  });

  it("treats a reply as the same thread as its original", () => {
    expect(sameThreadSubject("Re: billing QUESTION", "Billing question")).toBe(true);
    expect(sameThreadSubject("Re: Billing question", "Billing question 2")).toBe(false);
  });

  it("reads the answered message first, then the reference chain newest first", () => {
    const ids = referencedMessageIds({
      "In-Reply-To": "<reply@resend.dev>",
      References: "<first@mail.gmail.com> <second@mail.gmail.com> <reply@resend.dev>",
    });
    expect(ids).toEqual(["reply@resend.dev", "second@mail.gmail.com", "first@mail.gmail.com"]);
    expect(referencedMessageIds(null)).toEqual([]);
    expect(referencedMessageIds({ "in-reply-to": "not an id" })).toEqual([]);
  });

  it("matches stored ids with or without brackets, and only real Message-IDs go in headers", () => {
    expect(messageIdVariants(["a@b"])).toEqual(["a@b", "<a@b>"]);
    expect(asMessageIdHeader("CAF123@mail.gmail.com")).toBe("<CAF123@mail.gmail.com>");
    expect(asMessageIdHeader("<CAF123@mail.gmail.com>")).toBe("<CAF123@mail.gmail.com>");
    expect(asMessageIdHeader("3f2c1a9e-widget-id")).toBeNull();
    expect(asMessageIdHeader(null)).toBeNull();
  });
});
