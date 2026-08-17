import type { ToolKind } from "@/lib/chart/drawing/types";

/** How far the pointer may travel and still count as a click, not a drag. */
export const CLICK_SLOP_PX = 4;

/**
 * Tools whose second point is the far end of a straight line, and so can be
 * held to a clean angle.
 *
 * Rectangles, circles and the range tools are deliberately absent: holding
 * Shift on a box conventionally means "make it square", which is a different
 * constraint from "snap the angle", and guessing between the two would make
 * the key mean two things.
 */
const STRAIGHTENABLE: ReadonlySet<ToolKind> = new Set<ToolKind>([
  "trend",
  "ray",
  "extended",
  "arrow",
  "infoLine",
  "trendAngle",
  "regression",
  "measure",
]);

export function canStraighten(kind: ToolKind): boolean {
  return STRAIGHTENABLE.has(kind);
}

/**
 * Snap a segment to the nearest 45°, in screen space.
 *
 * Screen space is the point: a trader holding Shift wants a line that *looks*
 * level, and price-per-pixel differs from time-per-pixel by orders of
 * magnitude, so constraining in chart coordinates would produce a line that is
 * mathematically tidy and visually crooked.
 *
 * Length along the new direction is preserved rather than projected, so the
 * far end stays under the cursor's reach instead of collapsing toward the
 * anchor as the angle is corrected.
 */
export function straighten(
  anchor: { x: number; y: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const length = Math.hypot(dx, dy);
  // Below a pixel there is no angle to speak of, and atan2(0, 0) is arbitrary.
  if (length < 1) return point;
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: anchor.x + Math.cos(angle) * length,
    y: anchor.y + Math.sin(angle) * length,
  };
}

/**
 * Whether releasing the button should finish the drawing.
 *
 * A press that travelled is a drag, and ends where it is released. A press
 * that did not is a click, and the drawing stays live — following the cursor
 * until a second click sets the far end. Both gestures were expected; only the
 * first used to work, so clicking once left a zero-length drawing that could
 * only be rescued by finding its handle.
 */
export function releaseEndsDrawing(travelledPx: number): boolean {
  return travelledPx > CLICK_SLOP_PX;
}
