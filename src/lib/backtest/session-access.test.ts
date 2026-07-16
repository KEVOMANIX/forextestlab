import { describe, expect, it } from "vitest";

import { canAccessSession } from "./session-access";

function session(
  overrides: Partial<{
    userId: string | null;
    anonymous: boolean;
    anonymousExpiresAt: Date | null;
    token: string;
  }> = {},
) {
  return {
    userId: null,
    anonymous: true,
    anonymousExpiresAt: new Date(Date.now() + 60_000),
    token: "secret-token",
    ...overrides,
  };
}

describe("session ownership", () => {
  it("allows only the owning authenticated user", () => {
    const owned = session({ userId: "user-1", anonymous: false });
    expect(canAccessSession(owned, "user-1", null)).toBe(true);
    expect(canAccessSession(owned, "user-2", "secret-token")).toBe(false);
  });

  it("allows an active anonymous demonstration with its token", () => {
    expect(canAccessSession(session(), null, "secret-token")).toBe(true);
    expect(canAccessSession(session(), null, "wrong-token")).toBe(false);
  });

  it("rejects expired anonymous demonstrations", () => {
    const expired = session({
      anonymousExpiresAt: new Date(Date.now() - 1_000),
    });
    expect(canAccessSession(expired, null, "secret-token")).toBe(false);
  });
});
