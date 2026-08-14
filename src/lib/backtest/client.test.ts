import { afterEach, describe, expect, it, vi } from "vitest";

import { getPairChart, getStateWithToken } from "./client";

/**
 * `getStateWithToken` drives the resume flow on every page load. A transient
 * server failure here — a database connection pool timeout under load, say —
 * used to cost the trader their whole session: one failed fetch and the app
 * fell back to "start a new session" with the existing chart gone. These cover
 * the retry that replaced that behaviour.
 */
describe("getStateWithToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(status: number, body: unknown): Response {
    return {
      status,
      json: async () => body,
    } as Response;
  }

  function stubImmediateTimers() {
    // The retry backoff is real time the trader would otherwise wait through;
    // the test only cares about call order and the final result.
    vi.stubGlobal("window", { setTimeout: (fn: () => void) => fn() });
  }

  it("returns the state on a clean first attempt, with no retry", async () => {
    stubImmediateTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true, state: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStateWithToken("session-1", "token");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once after a dropped connection", async () => {
    stubImmediateTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, state: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStateWithToken("session-1", "token");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient server error and recovers", async () => {
    stubImmediateTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { ok: false, error: "Request failed (500)." }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true, state: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStateWithToken("session-1", "token");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting the backoff, still on server errors", async () => {
    stubImmediateTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500, { ok: false, error: "Request failed (500)." }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStateWithToken("session-1", "token");
    expect(result.ok).toBe(false);
    // One first try plus the two backoff delays.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a client error — the token or session, not the server, is the problem", async () => {
    stubImmediateTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(403, { ok: false, error: "Unauthorised." }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStateWithToken("session-1", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Unauthorised.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getPairChart", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the browser replay clock when aligning a newly added pair", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        ok: true,
        symbol: "USDJPY",
        candles: [],
        contextCandles: [],
        pipSize: "0.01",
        pricePrecision: 3,
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await getPairChart("session-1", "token", "USDJPY", true, undefined, 123456);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/backtest/sessions/session-1/pair?symbol=USDJPY&full=1&at=123456",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
