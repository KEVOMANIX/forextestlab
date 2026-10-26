import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), find: vi.fn(), get: vi.fn(), save: vi.fn(), remove: vi.fn(), entitlement: vi.fn(), state: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { backtestSession: { findFirst: mocks.find }, analyticsShare: { findUnique: mocks.get, upsert: mocks.save, deleteMany: mocks.remove } } }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/billing/entitlements", () => ({ getUserEntitlements: mocks.entitlement }));
vi.mock("@/lib/backtest/saved-session-state", () => ({ readSavedSessionState: mocks.state }));
vi.mock("@/lib/backtest/replay-engine", () => ({ fundedBalance: () => "100000" }));
vi.mock("@/lib/analytics/share-snapshot", () => ({ createShareSnapshot: () => ({ trades: [] }) }));
import { GET, POST, DELETE } from "./route";
const context = () => ({ params: Promise.resolve({ id: "owned-session" }) });
const request = (method: string, origin = "https://forextestlab.com") => new Request("https://forextestlab.com/api/backtest/sessions/owned-session/share", { method, headers: { origin } });
beforeEach(() => {
  vi.resetAllMocks(); mocks.user.mockResolvedValue({ id: "owner" }); mocks.find.mockResolvedValue({ id: "owned-session" }); mocks.entitlement.mockResolvedValue({ exports: true }); mocks.state.mockResolvedValue({});
});
it("requires authentication", async () => { mocks.user.mockResolvedValue(null); expect((await GET(request("GET"), context())).status).toBe(401); expect(mocks.find).not.toHaveBeenCalled(); });
it("requires ownership for every operation", async () => {
  mocks.find.mockResolvedValue(null);
  for (const method of [GET, POST, DELETE]) expect((await method(request("POST"), context())).status).toBe(404);
  expect(mocks.find).toHaveBeenCalledWith({ where: { id: "owned-session", userId: "owner", anonymous: false } });
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.remove).not.toHaveBeenCalled();
});
it("blocks cross-origin mutations", async () => { for (const method of [POST, DELETE]) expect((await method(request("POST", "https://other.test"), context())).status).toBe(403); });
it("accepts the public origin behind an internal reverse-proxy URL", async () => {
  mocks.user.mockResolvedValue(null);
  const proxied = new Request("http://localhost:3000/api/backtest/sessions/test/share", { method: "POST", headers: { origin: "https://www.forextestlab.com" } });
  expect((await POST(proxied, context())).status).toBe(401);
});
it("does not publish without export entitlement", async () => { mocks.entitlement.mockResolvedValue({ exports: false }); expect((await POST(request("POST"), context())).status).toBe(403); expect(mocks.save).not.toHaveBeenCalled(); });
it("rotates the token and gives snapshots a 30-day expiry", async () => {
  mocks.save.mockImplementation(async args => args.create);
  await POST(request("POST"), context()); await POST(request("POST"), context());
  const [first, second] = mocks.save.mock.calls.map(c => c[0].create);
  expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(second.token).not.toBe(first.token);
  expect(first.expiresAt.getTime() - first.createdAt.getTime()).toBeCloseTo(30 * 86400_000, -2);
});
it("hides expired links and permits revocation without an active subscription", async () => {
  mocks.get.mockResolvedValue({ token: "expired", expiresAt: new Date(0) });
  expect(await (await GET(request("GET"), context())).json()).toEqual({ share: null });
  expect((await DELETE(request("DELETE"), context())).status).toBe(200);
  expect(mocks.remove).toHaveBeenCalledWith({ where: { sessionId: "owned-session" } });
});
