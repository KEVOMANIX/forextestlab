import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

import {
  paddleBrowserEnvironment,
  paddleMode,
  requiredPaddleClientToken,
  unmarshalPaddleWebhook,
  createPaddleCheckoutTransaction,
} from "./paddle";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Paddle checkout customer recovery", () => {
  function setupFetch() {
    vi.stubEnv("PADDLE_MODE", "live");
    vi.stubEnv("PADDLE_LIVE_API_KEY", "pdl_live_fixture");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const input = { priceId: "pri_month", customerId: "ctm_old", customData: { userId: "u1", productKey: "pro_month" } };

  it("retries a confirmed missing customer without losing account or price metadata", async () => {
    const fetchMock = setupFetch();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code: "not_found", detail: "customer ctm_old not found." } }, { status: 404 }));
    fetchMock.mockResolvedValueOnce(Response.json({ data: { id: "txn_new" } }));
    await expect(createPaddleCheckoutTransaction(input)).resolves.toEqual({ id: "txn_new" });
    const first = JSON.parse(fetchMock.mock.calls[0]![1].body);
    const retry = JSON.parse(fetchMock.mock.calls[1]![1].body);
    expect(first.customer_id).toBe("ctm_old");
    expect(retry).toEqual({ items: [{ price_id: "pri_month", quantity: 1 }], custom_data: input.customData, collection_mode: "automatic" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps an existing valid customer attached", async () => {
    const fetchMock = setupFetch();
    fetchMock.mockResolvedValueOnce(Response.json({ data: { id: "txn_valid" } }));
    await createPaddleCheckoutTransaction(input);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).customer_id).toBe("ctm_old");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, "not_found", "price pri_month not found."],
    [403, "forbidden", "You aren't permitted to perform this request."],
    [500, "internal_error", "Service unavailable"],
  ])("does not retry an unrelated Paddle failure (%s)", async (status, code, detail) => {
    const fetchMock = setupFetch();
    fetchMock.mockResolvedValueOnce(Response.json({ error: { code, detail } }, { status }));
    await expect(createPaddleCheckoutTransaction(input)).rejects.toThrow(detail);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Paddle environment safety", () => {
  it("fails instead of silently choosing an environment", () => {
    vi.stubEnv("PADDLE_MODE", "");
    expect(() => paddleMode()).toThrow(/explicitly set/);
  });

  it("rejects a sandbox and browser environment mismatch", () => {
    vi.stubEnv("PADDLE_MODE", "sandbox");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(() => paddleBrowserEnvironment()).toThrow(/mismatch/);
  });

  it("requires a sandbox client token in sandbox mode", () => {
    vi.stubEnv("PADDLE_MODE", "sandbox");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "live_wrong");
    expect(() => requiredPaddleClientToken()).toThrow(/test_/);
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "test_valid");
    expect(requiredPaddleClientToken()).toBe("test_valid");
  });
});

describe("Paddle webhook verification", () => {
  it("verifies the raw body and maps Paddle event fields", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = "pdl_ntfset_test_secret";
    const body = JSON.stringify({
      event_id: "evt_123",
      event_type: "transaction.completed",
      data: { id: "txn_123" },
    });
    const signature = createHmac("sha256", secret)
      .update(`${timestamp}:${body}`)
      .digest("hex");

    await expect(
      unmarshalPaddleWebhook(body, secret, `ts=${timestamp};h1=${signature}`),
    ).resolves.toEqual({
      eventId: "evt_123",
      eventType: "transaction.completed",
      data: { id: "txn_123" },
    });
  });

  it("rejects a body that does not match the signature", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    await expect(
      unmarshalPaddleWebhook(
        '{"event_id":"changed"}',
        "secret",
        `ts=${timestamp};h1=${"0".repeat(64)}`,
      ),
    ).rejects.toThrow(/invalid/);
  });
});
