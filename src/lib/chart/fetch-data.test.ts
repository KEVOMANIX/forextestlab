import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchChartData } from "./fetch-data";

describe("fetchChartData", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  const response = (status: number, body: unknown) => ({ status, json: async () => body }) as Response;

  it("recovers from a connection failure and a temporary server error", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response(503, {})).mockResolvedValueOnce(response(200, { ok: true, candles: [1] }));
    vi.stubGlobal("fetch", fetch);
    const result = fetchChartData("/chart", { headers: { "x-session-token": "token" } });
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true, candles: [1] });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.every(([url, options]) => url === "/chart" && options.headers["x-session-token"] === "token")).toBe(true);
  });

  it.each([408, 429, 500, 502, 504])("retries HTTP %s", async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce(response(status, {})).mockResolvedValue(response(200, { ok: true }));
    vi.stubGlobal("fetch", fetch);
    const result = fetchChartData("/chart");
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([200, 400, 401, 403, 404])("does not retry a valid HTTP %s payload", async (status) => {
    const body = status === 200 ? { ok: true, candles: [], hasMore: false } : { ok: false, error: "Unavailable" };
    const fetch = vi.fn().mockResolvedValue(response(status, body));
    vi.stubGlobal("fetch", fetch);
    expect(await fetchChartData("/chart")).toEqual(body);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops after three failed attempts", async () => {
    const fetch = vi.fn().mockResolvedValue(response(503, {}));
    vi.stubGlobal("fetch", fetch);
    const result = expect(fetchChartData("/chart")).rejects.toThrow("503");
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("retries an interrupted successful payload", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ status: 200, json: async () => { throw new Error("truncated"); } })
      .mockResolvedValue(response(200, { ok: true }));
    vi.stubGlobal("fetch", fetch);
    const result = fetchChartData("/chart");
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries a timed-out request", async () => {
    const fetch = vi.fn().mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("timeout")));
    })).mockResolvedValue(response(200, { ok: true }));
    vi.stubGlobal("fetch", fetch);
    const result = fetchChartData("/chart");
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cancels retries when the user switches away", async () => {
    const fetch = vi.fn().mockResolvedValue(response(503, {}));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    const result = expect(fetchChartData("/chart", { signal: controller.signal })).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await vi.runAllTimersAsync();
    await result;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
