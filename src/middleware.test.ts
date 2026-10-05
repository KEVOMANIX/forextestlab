import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), create: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("@/lib/supabase/config", () => ({ getSupabasePublicConfig: () => ({ url: "https://example.supabase.co", publishableKey: "test" }) }));
import { middleware } from "./middleware";

describe("persistent login middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
  });
  it("passes rotated tokens to both server rendering and the browser", async () => {
    mocks.getUser.mockImplementation(async () => {
      const { cookies } = mocks.create.mock.calls[0][2];
      cookies.setAll([{ name: "sb-test-auth-token.0", value: "rotated", options: { path: "/", maxAge: 34560000, sameSite: "lax" } }]);
      return { data: { user: { id: "user" } } };
    });
    const request = new NextRequest("https://forextestlab.com/app", { headers: { cookie: "sb-test-auth-token.0=expired" } });
    const response = await middleware(request);
    expect(mocks.getUser).toHaveBeenCalledOnce();
    expect(request.cookies.get("sb-test-auth-token.0")?.value).toBe("rotated");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("rotated");
    expect(response.cookies.get("sb-test-auth-token.0")?.maxAge).toBe(34560000);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("keeps anonymous requests free of auth lookups", async () => {
    const response = await middleware(new NextRequest("https://forextestlab.com/sign-in"));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toEqual([]);
  });
  it("retains the durable backtest device cookie", async () => {
    const response = await middleware(new NextRequest("https://forextestlab.com/app/backtest/demo"));
    expect(response.cookies.get("ftl_trial_device")?.maxAge).toBe(31536000);
  });
  it("writes auth cookie removal when a session is revoked", async () => {
    mocks.getUser.mockImplementation(async () => {
      mocks.create.mock.calls[0][2].cookies.setAll([{ name: "sb-test-auth-token", value: "", options: { maxAge: 0 } }]);
      return { data: { user: null } };
    });
    const response = await middleware(new NextRequest("https://forextestlab.com/account", { headers: { cookie: "sb-test-auth-token=revoked" } }));
    expect(response.cookies.get("sb-test-auth-token")?.maxAge).toBe(0);
  });
});
