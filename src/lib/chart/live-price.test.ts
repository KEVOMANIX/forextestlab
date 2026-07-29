import { describe, expect, it } from "vitest";

import { renderedLivePrice } from "./live-price";

describe("rendered live price", () => {
  it("follows the painted candle instead of a stale React snapshot", () => {
    expect(renderedLivePrice(1.1052, 1.1048)).toBe(1.1052);
  });

  it("uses the supplied price before any candle has been painted", () => {
    expect(renderedLivePrice(undefined, 1.1048)).toBe(1.1048);
  });
});
