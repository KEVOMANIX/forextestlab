import { describe, expect, it } from "vitest";

import { isDisposableEmail } from "./disposable-email";

describe("isDisposableEmail", () => {
  it("blocks known throwaway providers and their subdomains", () => {
    expect(isDisposableEmail("a@mailinator.com")).toBe(true);
    expect(isDisposableEmail("a@GuerrillaMail.com")).toBe(true);
    expect(isDisposableEmail("a@x.mailinator.com")).toBe(true);
  });

  it("allows real and privacy providers", () => {
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
    expect(isDisposableEmail("a@atomicmail.io")).toBe(false);
    expect(isDisposableEmail("a@proton.me")).toBe(false);
    expect(isDisposableEmail("not-an-email")).toBe(false);
  });
});
