import { afterEach, describe, expect, it, vi } from "vitest";

import { clearPaddleIpCacheForTests, isPaddleWebhookSource, requestIp } from "./paddle-webhook-ip";

afterEach(() => {
  clearPaddleIpCacheForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Paddle webhook source validation", () => {
  it("uses Vercel's non-spoofable forwarded address", () => {
    const request = new Request("https://example.com", {
      headers: { "x-vercel-forwarded-for": "34.237.3.244", "x-forwarded-for": "203.0.113.5" },
    });
    expect(requestIp(request)).toBe("34.237.3.244");
  });

  it("loads the live allowlist from Paddle and accepts only a listed address", async () => {
    vi.stubEnv("PADDLE_MODE", "live");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      data: { ipv4_cidrs: ["34.237.3.244/32"] },
    }), { status: 200 }));
    const allowed = new Request("https://example.com", { headers: { "x-vercel-forwarded-for": "34.237.3.244" } });
    const denied = new Request("https://example.com", { headers: { "x-vercel-forwarded-for": "203.0.113.5" } });

    await expect(isPaddleWebhookSource(allowed)).resolves.toBe(true);
    await expect(isPaddleWebhookSource(denied)).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("https://api.paddle.com/ips", expect.any(Object));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Paddle's IP endpoint is unavailable", async () => {
    vi.stubEnv("PADDLE_MODE", "live");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    const request = new Request("https://example.com", { headers: { "x-vercel-forwarded-for": "34.237.3.244" } });
    await expect(isPaddleWebhookSource(request)).rejects.toThrow(/503/);
  });
});
