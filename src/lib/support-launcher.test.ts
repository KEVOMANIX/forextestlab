import { describe, expect, it } from "vitest";

import { isLauncherHidden } from "./support-client";

describe("support launcher visibility", () => {
  it("stands down on routes whose own chrome it would cover", () => {
    expect(isLauncherHidden("/app/backtest")).toBe(true);
    expect(isLauncherHidden("/app/results/abc123")).toBe(true);
    expect(isLauncherHidden("/app/support")).toBe(true);
    expect(isLauncherHidden("/support-team")).toBe(true);
  });

  it("stays available everywhere else", () => {
    for (const path of ["/", "/pricing", "/app", "/app/history", "/support"]) {
      expect(isLauncherHidden(path)).toBe(false);
    }
  });

  it("treats a missing pathname as visible", () => {
    expect(isLauncherHidden(null)).toBe(false);
    expect(isLauncherHidden(undefined)).toBe(false);
  });
});
