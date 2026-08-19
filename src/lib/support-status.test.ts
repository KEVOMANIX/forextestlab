import { describe, expect, it } from "vitest";

import {
  CUSTOMER_CLOSED_STATUSES,
  CUSTOMER_SUPPORT_CHANNELS,
  isCustomerClosed,
  isCustomerSupportChannel,
} from "./support";

describe("customer conversation lock", () => {
  it("locks the conversation once support resolves or closes it", () => {
    expect(isCustomerClosed("resolved")).toBe(true);
    expect(isCustomerClosed("closed")).toBe(true);
    expect(CUSTOMER_CLOSED_STATUSES).toHaveLength(2);
  });

  it("leaves every live status writable", () => {
    for (const status of [
      "new",
      "open",
      "active",
      "waiting_customer",
      "waiting_support",
      "snoozed",
    ]) {
      expect(isCustomerClosed(status)).toBe(false);
    }
  });
});

describe("customer support channels", () => {
  it("keeps email-only conversations out of the app inbox and widget", () => {
    expect(CUSTOMER_SUPPORT_CHANNELS).toEqual(["widget", "app", "outbound"]);
    expect(isCustomerSupportChannel("widget")).toBe(true);
    expect(isCustomerSupportChannel("app")).toBe(true);
    expect(isCustomerSupportChannel("outbound")).toBe(true);
    expect(isCustomerSupportChannel("email")).toBe(false);
  });
});
