import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarRequestWindow, loadCalendarWindow } from "./load-window";

afterEach(() => vi.unstubAllGlobals());

describe("calendar history loading", () => {
  it("bounds padding on multi-decade views to avoid rejected requests", () => {
    const from = Date.UTC(2003, 0, 1);
    const to = Date.UTC(2026, 0, 1);
    const window = calendarRequestWindow(from, to);
    expect(window.to - window.from).toBeLessThan(40 * 365 * 86_400_000);
    expect(window.from).toBeLessThan(from);
    expect(window.to).toBeGreaterThan(to);
  });

  it("loads both halves when the server caps a wide window", async () => {
    const ranges: number[][] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const params = new URL(url, "https://example.com").searchParams;
      const from = Number(params.get("from"));
      const to = Number(params.get("to"));
      ranges.push([from, to]);
      expect(params.get("currencies")).toBe("EUR,USD");
      return Response.json({ ok: true, truncated: from === 0 && to === 100,
        events: [{ id: String(from), timestamp: from }] });
    }));
    const result = await loadCalendarWindow(0, 100, new URLSearchParams({ currencies: "EUR,USD" }), new AbortController().signal);
    expect(ranges).toEqual([[0, 100], [0, 50], [51, 100]]);
    expect(result.events.map(event => event.timestamp)).toEqual([0, 51]);
  });

  it("does not silently accept failed calendar responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false })));
    await expect(loadCalendarWindow(0, 100, new URLSearchParams(), new AbortController().signal)).rejects.toThrow();
  });
});
