import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  claims: vi.fn(),
  claim: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    userProfile: { findUnique: mocks.findUnique, upsert: mocks.upsert },
    paddleCustomerClaim: { count: mocks.claims },
  },
}));
vi.mock("@/lib/billing/paddle-service", () => ({ claimPaddleSubscriptionForUser: mocks.claim }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: vi.fn() }));

import { ensureUserProfile } from "./auth";

const user = { id: "u1", email: "Trader@Example.com", user_metadata: { full_name: "Kelvin" } } as unknown as User;

describe("ensureUserProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.claims.mockResolvedValue(0);
  });

  it("writes nothing on an ordinary visit when the profile is already current", async () => {
    mocks.findUnique.mockResolvedValue({ email: "trader@example.com", displayName: "Kelvin" });
    await ensureUserProfile(user);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("creates a missing profile and updates a changed one", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await ensureUserProfile(user);
    mocks.findUnique.mockResolvedValue({ email: "trader@example.com", displayName: "Old name" });
    await ensureUserProfile(user);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: { email: "trader@example.com", displayName: "Kelvin" } }));
  });

  it("applies a pending Paddle claim", async () => {
    mocks.findUnique.mockResolvedValue({ email: "trader@example.com", displayName: "Kelvin" });
    mocks.claims.mockResolvedValue(1);
    await ensureUserProfile(user);
    expect(mocks.claim).toHaveBeenCalledWith("u1", "trader@example.com");
  });
});
