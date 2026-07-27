import { describe, expect, it } from "vitest";

import type { UTCTimestamp } from "lightweight-charts";

import { alignedFrom } from "./sync";

const ts = (seconds: number) => seconds as UTCTimestamp;

/**
 * Scrolling is shared across a multi-chart layout; zooming is not. A peer must
 * land on the source's moment in time without inheriting its zoom level.
 */
describe("alignedFrom", () => {
  const source = { from: 1_000, to: 2_000 };

  it("keeps the peer's own span and aligns the right edge", () => {
    // Peer is zoomed out to four hours; source is showing a thousand seconds.
    const from = alignedFrom({ from: ts(0), to: ts(14_400) }, source);
    expect(source.to - from).toBe(14_400);
    expect(from).toBe(2_000 - 14_400);
  });

  it("keeps a narrower peer narrow", () => {
    const from = alignedFrom({ from: ts(900), to: ts(1_000) }, source);
    expect(source.to - from).toBe(100);
  });

  it("falls back to the source range when the peer has no view yet", () => {
    expect(alignedFrom(null, source)).toBe(source.from);
  });

  it("falls back when the peer reports an empty span", () => {
    expect(alignedFrom({ from: ts(500), to: ts(500) }, source)).toBe(source.from);
  });

  it("handles business-day times from the peer", () => {
    const from = alignedFrom(
      { from: { year: 2024, month: 3, day: 4 }, to: { year: 2024, month: 3, day: 5 } },
      source,
    );
    expect(source.to - from).toBe(86_400);
  });
});
