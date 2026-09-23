import { describe, expect, it } from "vitest";

import { newDrawing } from "./objects";
import { TOOL_LABELS, TOOL_POINTS, type ToolKind } from "./types";

const STUDIES: ToolKind[] = [
  "fibChannel", "fibTimeZone", "fibSpeedResistanceFan", "trendFibTime",
  "fibCircles", "fibSpiral", "fibSpeedResistanceArcs", "fibWedge",
  "pitchfan", "gannBox", "gannSquareFixed", "gannSquare", "gannFan",
];

describe("advanced Fibonacci and Gann studies", () => {
  it.each(STUDIES)("creates and serializes %s", (kind) => {
    const drawing = newDrawing(kind, { time: 100, price: 1.1 }, 2, TOOL_POINTS[kind]);
    const saved = drawing.serialize();

    expect(saved.kind).toBe(kind);
    expect(saved.points).toHaveLength(TOOL_POINTS[kind]);
    expect(TOOL_LABELS[kind]).toBeTruthy();
  });
});
