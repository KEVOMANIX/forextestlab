import { describe, expect, it } from "vitest";

import {
  CLICK_SLOP_PX,
  canStraighten,
  releaseEndsDrawing,
  straighten,
} from "./constrain";

const at = (x: number, y: number) => ({ x, y });

describe("telling a click from a drag", () => {
  it("keeps the drawing live when the press never moved", () => {
    // The bug this fixes: a plain click used to finish the drawing on the spot,
    // leaving a zero-length line that could only be rescued by finding its
    // handle and dragging that.
    expect(releaseEndsDrawing(0)).toBe(false);
    expect(releaseEndsDrawing(CLICK_SLOP_PX)).toBe(false);
  });

  it("finishes the drawing when the press was dragged", () => {
    expect(releaseEndsDrawing(CLICK_SLOP_PX + 1)).toBe(true);
    expect(releaseEndsDrawing(200)).toBe(true);
  });

  it("tolerates the hand-shake that turns a click into a one-pixel drag", () => {
    expect(releaseEndsDrawing(3)).toBe(false);
  });
});

describe("straightening with Shift", () => {
  it("levels a nearly horizontal line", () => {
    const held = straighten(at(100, 100), at(300, 112));
    expect(held.y).toBeCloseTo(100, 5);
    expect(held.x).toBeGreaterThan(200);
  });

  it("stands a nearly vertical line upright", () => {
    const held = straighten(at(100, 100), at(108, 300));
    expect(held.x).toBeCloseTo(100, 5);
    expect(held.y).toBeGreaterThan(200);
  });

  it("snaps to 45° when the drag is roughly diagonal", () => {
    const held = straighten(at(0, 0), at(100, 90));
    // Equal run and rise, and on the same side as the cursor.
    expect(held.x).toBeCloseTo(held.y, 5);
    expect(held.x).toBeGreaterThan(0);
  });

  it("keeps the far end at the distance the cursor reached", () => {
    // Projecting instead would drag the end back toward the anchor as the
    // angle is corrected, so the line would shorten while being straightened.
    const anchor = at(50, 50);
    const point = at(250, 62);
    const held = straighten(anchor, point);
    expect(Math.hypot(held.x - anchor.x, held.y - anchor.y)).toBeCloseTo(
      Math.hypot(point.x - anchor.x, point.y - anchor.y),
      5,
    );
  });

  it("works in every direction, not just down and to the right", () => {
    expect(straighten(at(100, 100), at(-100, 96)).y).toBeCloseTo(100, 5);
    expect(straighten(at(100, 100), at(96, -100)).x).toBeCloseTo(100, 5);
  });

  it("leaves a sub-pixel segment alone rather than inventing an angle", () => {
    // atan2(0, 0) is arbitrary; snapping here would make the line jump.
    expect(straighten(at(10, 10), at(10, 10))).toEqual(at(10, 10));
  });
});

describe("which tools straighten", () => {
  it("covers the straight-line tools", () => {
    for (const kind of ["trend", "ray", "extended", "arrow", "measure"] as const) {
      expect(canStraighten(kind), kind).toBe(true);
    }
  });

  it("leaves boxes and circles out", () => {
    // On a box, Shift conventionally means "make it square" — a different
    // constraint. Guessing between the two would make one key mean two things.
    for (const kind of ["rectangle", "circle", "ellipse", "priceRange"] as const) {
      expect(canStraighten(kind), kind).toBe(false);
    }
  });
});
