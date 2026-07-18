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

  it("requires the checkout kill switch and real plan code", () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
    vi.stubEnv("PAYSTACK_KES_MONTHLY_PLAN_CODE", "PLN_realexample");
    vi.stubEnv("PAYSTACK_CHECKOUT_ENABLED", "false");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(false);
    vi.stubEnv("PAYSTACK_CHECKOUT_ENABLED", "true");
    expect(checkoutProductReady("pro_monthly_usd")).toBe(true);
  });
});
