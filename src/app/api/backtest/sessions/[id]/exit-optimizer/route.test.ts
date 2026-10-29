import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), results: vi.fn(), entitlements: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/backtest/results", () => ({ getSessionResults: mocks.results }));
vi.mock("@/lib/billing/entitlements", () => ({ getUserEntitlements: mocks.entitlements }));
vi.mock("@/lib/backtest/exit-quality-server", () => ({ buildExitQualityReport: mocks.build }));
import { POST } from "./route";
const context = { params: Promise.resolve({ id: "session" }) };
const request = (stream = true) => new Request("https://forextestlab.com/api/backtest/sessions/session/exit-optimizer", {
  method: "POST", headers: { "Content-Type": "application/json", Accept: stream ? "application/x-ndjson" : "application/json" }, body: JSON.stringify({ ruleIds: ["target-2"] }),
});
beforeEach(() => {
  vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "owner" });
  mocks.results.mockResolvedValue({ state: { status: "finished" } });
  mocks.entitlements.mockResolvedValue({ fullAnalytics: true });
  mocks.build.mockImplementation(async (_state, options) => {
    options.onProgress?.({ stage: "replaying", message: "Testing target", completed: 1, total: 1 });
    return { optimizer: { eligibleTrades: 1 } };
  });
});
describe("optimizer progress endpoint", () => {
  it("streams progress before the report and disables proxy buffering", async () => {
    const response = await POST(request(), context);
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
    expect(events.map(event => event.type)).toEqual(["progress", "progress", "result"]);
    expect(events[1].progress.completed).toBe(1);
    expect(mocks.results).toHaveBeenCalledWith("session", "owner");
  });
  it("keeps JSON clients compatible and reports empty analyses in the stream", async () => {
    const legacy = await POST(request(false), context);
    expect(await legacy.json()).toMatchObject({ ok: true, optimizer: { eligibleTrades: 1 } });
    mocks.build.mockResolvedValue(null);
    const empty = await POST(request(), context);
    expect(await empty.text()).toContain('"type":"error"');
  });
  it("rejects unauthenticated, Free and unfinished sessions before streaming", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await POST(request(), context)).status).toBe(401);
    mocks.user.mockResolvedValue({ id: "owner" }); mocks.entitlements.mockResolvedValue({ fullAnalytics: false });
    expect((await POST(request(), context)).status).toBe(403);
    mocks.entitlements.mockResolvedValue({ fullAnalytics: true }); mocks.results.mockResolvedValue({ state: { status: "running" } });
    expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
