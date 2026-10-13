import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/backtest/session-store", () => ({ loadResumeSessionSnapshot: mocks.load }));
vi.mock("@/lib/backtest/state-snapshot-store", () => ({ deleteSessionSnapshot: vi.fn() }));
vi.mock("@/lib/backtest/session-access", () => ({ canAccessSession: mocks.access }));
vi.mock("@/lib/supabase/server", () => ({ getCurrentUser: async () => ({ id: "owner" }) }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { GET } from "./route";

describe("session response delivery", () => {
  beforeEach(() => {
    mocks.access.mockReturnValue(true);
    mocks.load.mockResolvedValue({
      stateJson: JSON.stringify({ visibleIndex: 0, status: "running", config: { name: "EURUSD ✓" } }),
      visibleIndex: 1, status: "paused", anonymous: false, notes: "Résumé",
      candles: [{ timestamp: 100, close: "1.1" }, { timestamp: 200, close: "1.2" }],
    });
  });
  const request = () => GET(new Request("https://example.test/api/backtest/sessions/test"), { params: Promise.resolve({ id: "test" }) });

  it("delivers a complete, correctly sized document with the persisted replay clock", async () => {
    const response = await request();
    const bytes = await response.arrayBuffer();
    expect(response.headers.get("content-length")).toBe(String(bytes.byteLength));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    expect(payload.state).toMatchObject({ visibleIndex: 1, status: "paused", currentTime: 200, currentPrice: "1.2" });
    expect(payload.replayCandles).toHaveLength(2);
    expect(payload.notes).toBe("Résumé");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not expose the payload when access is denied", async () => {
    mocks.access.mockReturnValue(false);
    const response = await request();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorised." });
  });
});
