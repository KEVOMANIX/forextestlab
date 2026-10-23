import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), user: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.user }));

import { freePreviewActive } from "./plan-preview";

describe("admin 'view as Free' preview", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.ADMIN_EMAILS = "owner@example.com";
  });

  it("applies only to an admin who switched it on, for their own account", async () => {
    mocks.cookie.mockReturnValue({ value: "free" });
    mocks.user.mockResolvedValue({ id: "admin-1", email: "owner@example.com" });
    expect(await freePreviewActive("admin-1")).toBe(true);
    expect(await freePreviewActive("someone-else")).toBe(false);
  });

  it("is ignored for anyone who is not an admin, even with the cookie", async () => {
    mocks.cookie.mockReturnValue({ value: "free" });
    mocks.user.mockResolvedValue({ id: "u1", email: "trader@example.com" });
    expect(await freePreviewActive("u1")).toBe(false);
  });

  it("is off without the cookie, and outside a request", async () => {
    mocks.cookie.mockReturnValue(undefined);
    mocks.user.mockResolvedValue({ id: "admin-1", email: "owner@example.com" });
    expect(await freePreviewActive("admin-1")).toBe(false);
    mocks.cookie.mockImplementation(() => { throw new Error("no request scope"); });
    expect(await freePreviewActive("admin-1")).toBe(false);
  });
});
