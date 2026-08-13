import { describe, expect, it } from "vitest";

import { isProductEventName, normalizeAnalyticsPath } from "./product-analytics";

describe("product analytics input", () => {
  it("allows only the bounded event vocabulary", () => {
    expect(isProductEventName("backtest_completed")).toBe(true);
    expect(isProductEventName("arbitrary_event")).toBe(false);
  });

  it("removes query strings and identifiers from stored paths", () => {
    expect(normalizeAnalyticsPath("/pricing?from=home")).toBe("/pricing");
    expect(normalizeAnalyticsPath("/app/results/secret-session-id")).toBe("/app/results/:session");
    expect(normalizeAnalyticsPath("https://example.com/steal")).toBeNull();
  });
});
