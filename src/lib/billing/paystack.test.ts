import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validPaystackSignature } from "./paystack";

afterEach(() => vi.unstubAllEnvs());

describe("Paystack webhook signatures", () => {
  it("accepts the exact SHA-512 signature and rejects altered payloads", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_webhook_secret");
    const raw = JSON.stringify({ event: "charge.success", data: { reference: "ftl-1" } });
    const signature = createHmac("sha512", "sk_test_webhook_secret").update(raw).digest("hex");
    expect(validPaystackSignature(raw, signature)).toBe(true);
    expect(validPaystackSignature(`${raw} `, signature)).toBe(false);
    expect(validPaystackSignature(raw, null)).toBe(false);
  });
});
