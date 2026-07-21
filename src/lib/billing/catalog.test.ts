import { afterEach, describe, expect, it, vi } from "vitest";

import {
  annualSavingPercent,
  checkoutProductReady,
  formatPlanPrice,
  getCheckoutProduct,
  isCheckoutProductKey,
} from "./catalog";

afterEach(() => vi.unstubAllEnvs());

describe("legacy Paystack billing catalogue", () => {
  it("keeps legacy prices in provider subunits", () => {
    vi.stubEnv("PAYSTACK_KES_MONTHLY_PRICE", "120000");
    expect(getCheckoutProduct("pro_monthly_usd").amount).toBe(120000);
    expect(formatPlanPrice(120000, "KES")).toContain("1,200");
    expect(annualSavingPercent(120000, 990000)).toBe(31);
  });

  it("accepts only known legacy product identifiers", () => {
    expect(isCheckoutProductKey("pro_annual_usd")).toBe(true);
    expect(isCheckoutProductKey("custom_price_from_browser")).toBe(false);
  });

  it("requires a valid legacy plan code and respects the pause switch", () => {
    vi.stubEnv("PAYSTACK_MODE", "test");
    vi.stubEnv("PAYSTACK_TEST_SECRET_KEY", "sk_test_example");
    vi.stubEnv("PAYSTACK_TEST_KES_MONTHLY_PLAN_CODE", "PLN_realexample");
    vi.stubEnv("PAYSTACK_CHECKOUT_PAUSED", "true");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(false);
    vi.stubEnv("PAYSTACK_CHECKOUT_PAUSED", "false");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(true);
  });
});
