import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

import {
  paddleBrowserEnvironment,
  paddleMode,
  requiredPaddleClientToken,
  unmarshalPaddleWebhook,
} from "./paddle";

afterEach(() => vi.unstubAllEnvs());

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
