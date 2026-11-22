import { describe, expect, it } from "vitest";

import { isFullScreenPath } from "./full-screen";

describe("isFullScreenPath", () => {
  it("treats an open strategy as full screen, not the strategy list", () => {
    expect(isFullScreenPath("/app/strategies", new URLSearchParams("script=abc"))).toBe(true);
    expect(isFullScreenPath("/app/strategies", new URLSearchParams())).toBe(false);
    expect(isFullScreenPath("/app/strategies")).toBe(false);
  });
  it("keeps the AI Analyst full screen", () => {
    expect(isFullScreenPath("/app/ai")).toBe(true);
    expect(isFullScreenPath("/app/history", new URLSearchParams("script=x"))).toBe(false);
  });
});
