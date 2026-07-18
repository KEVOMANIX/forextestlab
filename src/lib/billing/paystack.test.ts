import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isPaystackSecretKey, validPaystackSignature } from "./paystack";

afterEach(() => vi.unstubAllEnvs());

describe("Paystack webhook signatures", () => {
  it("accepts the exact SHA-512 signature and rejects altered payloads", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_webhooksecret");
    const raw = JSON.stringify({ event: "charge.success", data: { reference: "ftl-1" } });
    const signature = createHmac("sha512", "sk_test_webhooksecret").update(raw).digest("hex");
    expect(validPaystackSignature(raw, signature)).toBe(true);
    expect(validPaystackSignature(`${raw} `, signature)).toBe(false);
    expect(validPaystackSignature(raw, null)).toBe(false);
  });

  it("rejects duplicated or whitespace-separated secret keys", () => {
    expect(isPaystackSecretKey("sk_live_example123")).toBe(true);
    expect(isPaystackSecretKey("sk_live_first sk_live_second")).toBe(false);
  });
});
