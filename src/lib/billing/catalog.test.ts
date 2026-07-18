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
    vi.stubEnv("PAYSTACK_KES_MONTHLY_PRICE", "120000");
    expect(getCheckoutProduct("pro_monthly_usd").amount).toBe(120000);
    expect(formatPlanPrice(120000, "KES")).toContain("1,200");
    expect(formatPlanPrice(150000, "KES")).toContain("1,500");
    expect(annualSavingPercent(1200, 9900)).toBe(31);
  });

  it("accepts only known server-side product identifiers", () => {
    expect(isCheckoutProductKey("pro_annual_usd")).toBe(true);
    expect(isCheckoutProductKey("custom_price_from_browser")).toBe(false);
  });

  it("requires a real plan code and respects the emergency pause switch", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
    vi.stubEnv("PAYSTACK_KES_MONTHLY_PLAN_CODE", "PLN_realexample");
    vi.stubEnv("PAYSTACK_CHECKOUT_PAUSED", "true");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(false);
    vi.stubEnv("PAYSTACK_CHECKOUT_PAUSED", "false");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(true);
  });

  it("selects isolated test credentials and plans when test mode is enabled", () => {
    vi.stubEnv("PAYSTACK_MODE", "test");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_liveexample");
    vi.stubEnv("PAYSTACK_TEST_SECRET_KEY", "sk_test_testexample");
    vi.stubEnv("PAYSTACK_KES_MONTHLY_PLAN_CODE", "PLN_liveplan");
    vi.stubEnv("PAYSTACK_TEST_KES_MONTHLY_PLAN_CODE", "PLN_testplan");
    expect(getCheckoutProduct("pro_monthly_usd").planCode).toBe("PLN_testplan");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(true);
  });
});
