import { afterEach, describe, expect, it, vi } from "vitest";

import {
  annualSavingPercent,
  checkoutProductReady,
  formatPlanPrice,
  getCheckoutProduct,
  isCheckoutProductKey,
} from "./catalog";

afterEach(() => vi.unstubAllEnvs());

describe("billing catalogue", () => {
  it("keeps prices in provider subunits and formats them for users", () => {
    vi.stubEnv("PADDLE_MONTHLY_PRICE_USD", "1000");
    expect(getCheckoutProduct("pro_monthly_usd").amount).toBe(1000);
    expect(formatPlanPrice(1000, "USD")).toContain("10");
    expect(formatPlanPrice(8000, "USD")).toContain("80");
    expect(annualSavingPercent(1000, 8000)).toBe(33);
  });

  it("accepts only known server-side product identifiers", () => {
    expect(isCheckoutProductKey("pro_annual_usd")).toBe(true);
    expect(isCheckoutProductKey("custom_price_from_browser")).toBe(false);
  });

  it("requires a real plan code and respects the emergency pause switch", () => {
    vi.stubEnv("PADDLE_MODE", "sandbox");
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "test_example");
    vi.stubEnv("PADDLE_SANDBOX_MONTHLY_PRICE_ID", "pri_realexample");
    vi.stubEnv("PADDLE_CHECKOUT_PAUSED", "true");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(false);
    vi.stubEnv("PADDLE_CHECKOUT_PAUSED", "false");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(true);
  });

  it("selects isolated sandbox credentials and prices in sandbox mode", () => {
    vi.stubEnv("PADDLE_MODE", "sandbox");
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "test_sandbox-token");
    vi.stubEnv("PADDLE_LIVE_CLIENT_TOKEN", "live_live-token");
    vi.stubEnv("PADDLE_SANDBOX_MONTHLY_PRICE_ID", "pri_sandboxplan");
    vi.stubEnv("PADDLE_LIVE_MONTHLY_PRICE_ID", "pri_liveplan");
    expect(getCheckoutProduct("pro_monthly_usd").planCode).toBe("pri_sandboxplan");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(true);
  });
});
