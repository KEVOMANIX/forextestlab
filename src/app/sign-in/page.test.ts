import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ user: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: auth.user }));
vi.mock("next/navigation", () => ({ redirect: auth.redirect }));
vi.mock("@/components/auth/AuthForm", () => ({ AuthForm: () => null }));
vi.mock("@/components/auth/AuthShell", () => ({ AuthShell: () => null }));
import SignInPage from "./page";
beforeEach(() => { vi.clearAllMocks(); auth.user.mockResolvedValue({ id: "user" }); });
it("continues to the requested app page for a returning user", async () => {
  await SignInPage({ searchParams: Promise.resolve({ next: "/app/backtest/test" }) });
  expect(auth.redirect).toHaveBeenCalledWith("/app/backtest/test");
});
it.each([undefined, "//external.test", "/\\external.test", "/sign-in?next=/app"])("uses account continuation for an unsafe or absent destination %s", async (next) => {
  await SignInPage({ searchParams: Promise.resolve({ next }) });
  expect(auth.redirect).toHaveBeenCalledWith("/account/continue");
});
it("keeps the sign-in form for a signed-out user", async () => {
  auth.user.mockResolvedValue(null);
  const result = await SignInPage({ searchParams: Promise.resolve({}) });
  expect(auth.redirect).not.toHaveBeenCalled();
  expect(result).toBeTruthy();
});
