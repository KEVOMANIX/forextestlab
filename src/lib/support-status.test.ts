import { describe, expect, it } from "vitest";

import { CUSTOMER_CLOSED_STATUSES, isCustomerClosed } from "./support";

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
