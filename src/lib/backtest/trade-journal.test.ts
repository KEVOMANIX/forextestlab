import { describe, expect, it } from "vitest";

import { plannedRiskReward } from "./trade-journal";

describe("plannedRiskReward", () => {
  it("calculates the same ratio for long and short protection levels", () => {
    expect(plannedRiskReward("1.1000", "1.0950", "1.1100")).toBe("2.00");
    expect(plannedRiskReward("1.1000", "1.1050", "1.0900")).toBe("2.00");
  });

  it("requires both levels and a non-zero stop distance", () => {
    expect(plannedRiskReward("1.1000", null, "1.1100")).toBeNull();
    expect(plannedRiskReward("1.1000", "1.0950", null)).toBeNull();
    expect(plannedRiskReward("1.1000", "1.1000", "1.1100")).toBeNull();
  });
});
